import {Hono} from 'hono'
import type {Ctx,C} from '../types'
import {needUser,isOwner} from '../services/auth'
import {assertCurrentAccess} from '../services/chat-access'
import {boundedJson,sameOrigin,fail} from '../lib/http'
import {getSetting,setSetting} from '../services/settings'
import {now} from '../lib/time'
export const randomImage=new Hono<Ctx>()
const KEY='chat.random-image',MAX_BYTES=8*1024*1024
type Config={enabled:boolean;blockedTags:string[]}
const defaultConfig:Config={enabled:false,blockedTags:['Uncensored','Explicit']}
const tagPattern=/^[\p{L}\p{N} _.-]{1,64}$/u
function normalizeTag(x:string){return x.normalize('NFKC').trim()}
async function config(c:C):Promise<Config>{const raw=await getSetting(c.env.DB,KEY,JSON.stringify(defaultConfig));try{const x=JSON.parse(raw);if(typeof x.enabled!=='boolean'||!Array.isArray(x.blockedTags)||x.blockedTags.some((t:unknown)=>typeof t!=='string'||!tagPattern.test(t)))throw Error();return x}catch{return fail(503,'随机图片配置异常，请站长重新保存设置')}}
function owner(c:C){const u=needUser(c);if(!isOwner(c,u))fail(403,'只有站长能设置随机图片来源');return u}
randomImage.get('/api/random-image/config',async c=>{needUser(c);c.header('cache-control','no-store');const s=await config(c);return c.json({...s,max_bytes:MAX_BYTES})})
randomImage.get('/api/admin/random-image',async c=>{owner(c);c.header('cache-control','no-store');return c.json({...await config(c),gate:await c.env.DB.prepare('SELECT requests,window_start,next_at,paused_until FROM random_image_gate WHERE id=1').first()})})
randomImage.put('/api/admin/random-image',async c=>{owner(c);sameOrigin(c);const x=await boundedJson(c,12000) as Partial<Config>;if(typeof x.enabled!=='boolean'||!Array.isArray(x.blockedTags)||x.blockedTags.length>80||x.blockedTags.some(t=>typeof t!=='string'||!tagPattern.test(normalizeTag(t))))fail(400,'禁用标签最多80个，每个1至64字，可用中英文、数字、空格、点、横线和下划线');const blockedTags=[...new Set(x.blockedTags!.map(normalizeTag))];await setSetting(c.env.DB,KEY,JSON.stringify({enabled:x.enabled,blockedTags}));return c.json({ok:true,enabled:x.enabled,blockedTags})})
randomImage.post('/api/chat/groups/:id/random-image',async c=>{
 sameOrigin(c);const u=needUser(c),gid=Number(c.req.param('id')),t=now();if(!Number.isSafeInteger(gid)||gid<1)fail(400,'群编号不正确')
 await assertCurrentAccess(c,u.id,gid)
 if(u.silenced||(!u.is_admin&&await c.env.DB.prepare("SELECT 1 FROM user_limits WHERE user_id=? AND kind='chat' AND (until=0 OR until>?)").bind(u.id,t).first()))fail(403,'当前账号不可在群内发图')
 const input=await boundedJson(c,2048) as {tag?:unknown},tag=normalizeTag(String(input.tag??''));if(tag&&!tagPattern.test(tag))fail(400,'标签格式不正确')
 const s=await config(c);if(!s.enabled)fail(503,'随机摇图已由站长暂停')
 if(s.blockedTags.some(x=>x.toLocaleLowerCase()===tag.toLocaleLowerCase()))fail(403,'该标签已被站长禁用')
 const userLimit=await c.env.DB.prepare("INSERT INTO quota_usage(day,scope,key,n) VALUES(?1,'random-image:user',?2,1) ON CONFLICT(day,scope,key) DO UPDATE SET n=n+1 WHERE n<6 RETURNING n").bind(new Date((t+28800)*1000).toISOString().slice(0,10)+':'+Math.floor(t/300),u.id).first();if(!userLimit){c.header('retry-after',String(300-t%300));fail(429,'本轮摇图次数已用完，请稍后再试')}
 // 40 per fixed 300s window means at most 80 in any rolling 300s;
 // all users/regions share this one atomic row. Also space requests by 5s.
 const permit=await c.env.DB.prepare(`UPDATE random_image_gate SET window_start=?1,requests=CASE WHEN window_start=?1 THEN requests+1 ELSE 1 END,next_at=?2+5
  WHERE id=1 AND paused_until<=?2 AND next_at<=?2 AND (window_start<>?1 OR requests<40) RETURNING requests`).bind(Math.floor(t/300)*300,t).first()
 if(!permit){const gate=await c.env.DB.prepare('SELECT window_start,requests,next_at,paused_until FROM random_image_gate WHERE id=1').first<{window_start:number;requests:number;next_at:number;paused_until:number}>();const wait=Math.max(5,(gate?.paused_until||0)-t,(gate?.next_at||0)-t,gate?.requests===40?gate.window_start+300-t:0);c.header('retry-after',String(wait));fail(429,wait>300?'图片来源正在冷却，请稍后再试':'摇图较频繁，请稍后再试')}
 if(!c.env.RANDOM_IMAGE_ENDPOINT) return fail(503,'尚未配置随机图片服务');
 const url=new URL(c.env.RANDOM_IMAGE_ENDPOINT);if(tag)url.searchParams.set('tag',tag);if(s.blockedTags.length)url.searchParams.set('exclude_tag',s.blockedTags.join(','))
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000)
 try{
  const response=await fetch(url,{redirect:'manual',signal:controller.signal,headers:{accept:'image/jpeg,image/png,image/webp,image/gif'}})
  if([403,429,503].includes(response.status)){await response.body?.cancel();const seconds=response.status===503?60:Math.max(1860,Math.min(86400,Number(response.headers.get('retry-after'))||0));await c.env.DB.prepare('UPDATE random_image_gate SET paused_until=MAX(paused_until,?) WHERE id=1').bind(t+seconds).run();c.header('retry-after',String(seconds));fail(503,'图片来源暂不可用，已停止请求并进入冷却')}
  if(!response.ok||response.status>=300){await response.body?.cancel();fail(503,'图片来源暂未返回图片，请稍后重试')}
  const type=(response.headers.get('content-type')||'').split(';')[0].trim();if(!/^image\/(jpeg|png|webp|gif)$/.test(type)||Number(response.headers.get('content-length'))>MAX_BYTES){await response.body?.cancel();fail(503,'图片格式或大小不符合要求')}
  const reader=response.body?.getReader();if(!reader)fail(503,'图片内容为空');const chunks:Uint8Array[]=[];let length=0
  while(true){const part=await reader!.read();if(part.done)break;length+=part.value.byteLength;if(length>MAX_BYTES){await reader!.cancel();fail(503,'图片超过8MB，请重新摇图')}chunks.push(part.value)}
  if(!length)fail(503,'图片内容为空');const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  return new Response(bytes,{headers:{'content-type':type,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-disposition':'inline'}})
 }catch(error){if((error as {status?:number}).status)throw error;fail(503,'图片来源连接超时或不可用，请稍后重试')}finally{clearTimeout(timer);controller.abort()}
})
