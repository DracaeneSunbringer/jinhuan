import {Hono} from 'hono'
import type {C,Ctx,User} from '../types'
import {needUser,canManage,isOwner} from '../services/auth'
import {boundedJson,sameOrigin,fail} from '../lib/http'
import {now} from '../lib/time'
import {prepareMedia,mediaKeys} from '../services/content-media'
import {commitUploadContent} from '../services/upload-operations'
import {seal,unseal} from '../ldc/core'
import {sha256} from '../lib/crypto'

export const resources=new Hono<Ctx>()
// Temporary closure: keep saved posts and configuration; block old clients too.
resources.use('/api/resources*',async c=>{c.header('cache-control','no-store');return c.json({error:'RZP 暂停开放，已有内容已保留',code:'resource_paused'},503)})
const categories=['project','film','link'],reactions=['','👍','❤️','😂','🤔','🔥']
const str=(v:unknown,max:number)=>{if(typeof v!=='string'||v.length>max)fail(400,`内容格式错误或超过 ${max} 字`);return (v as string).trim()}
const requestId=(v:unknown)=>{const id=str(v,36);if(!/^[a-f\d-]{36}$/i.test(id))fail(400,'请求编号无效');return id}
const pid=(c:C)=>{const n=Number(c.req.param('id'));if(!Number.isSafeInteger(n)||n<1)fail(400,'帖子编号无效');return n}
export function resourceUrl(v:unknown,required=false){const s=str(v??'',2048);if(!s){if(required)fail(400,'请填写分享链接');return ''}let u:URL;try{u=new URL(s)}catch{return fail(400,'链接格式不正确')}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)fail(400,'仅支持不含登录凭据的 HTTP/HTTPS 链接');return u.href}
export function filmCode(v:unknown){const code=str(v,40).normalize('NFKC').toUpperCase();if(!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code))fail(400,'番号仅支持英文字母、数字、短横线和下划线');return code}
async function actor(c:C,kind:'post'|'comment'|'react'){
 const u=needUser(c);if(u.silenced)fail(403,'账号已禁言')
 if(!u.is_admin&&await c.env.DB.prepare('SELECT 1 FROM user_limits WHERE user_id=? AND kind=? AND (until=0 OR until>?)').bind(u.id,kind,now()).first())fail(403,'当前账号暂不能进行此操作')
 if(kind==='post'&&!u.is_admin&&u.trust_level<Number(c.env.MIN_POST_TRUST_LEVEL??1))fail(403,'当前信任等级暂不能发帖')
 return u
}
async function post(c:C){return await c.env.DB.prepare('SELECT * FROM resource_posts WHERE id=? AND hidden=0').bind(pid(c)).first<{id:number;user_id:number;revision:number;media:string;[k:string]:unknown}>()??fail(404,'帖子不存在或已删除')}
const view=(p:Record<string,unknown>)=>({...p,media:JSON.parse(String(p.media||'[]'))})
async function loadConfig(c:C){const row=await c.env.DB.prepare("SELECT v FROM site_settings WHERE k='resource_scraper'").first<{v:string}>();return row?JSON.parse(row.v):{endpoint:'',scraper:'',key_box:'',enabled:false}}
resources.get('/api/resources/config',async c=>{const u=needUser(c);if(!isOwner(c,u))fail(403,'仅站长可配置');const cfg=await loadConfig(c);return c.json({endpoint:cfg.endpoint,scraper:cfg.scraper,enabled:cfg.enabled,has_key:!!cfg.key_box})})
resources.put('/api/resources/config',async c=>{
 sameOrigin(c);if(!isOwner(c,needUser(c)))fail(403,'仅站长可配置');const b=await boundedJson(c,8000),old=await loadConfig(c)
 const endpoint=resourceUrl(b.endpoint),scraper=str(b.scraper??'',100),key=str(b.key??'',4096),enabled=b.enabled===true
 if(endpoint){const u=new URL(endpoint);if(u.protocol!=='https:'||u.port&&u.port!=='443'||!u.hostname.includes('.')||/^[\d.]+$|[:\[\]]|(^|\.)(localhost|local|internal|test|invalid)$/i.test(u.hostname))fail(400,'请使用公网 HTTPS 刮削服务域名')}
 if(enabled&&(!endpoint||!scraper))fail(400,'请填写接口地址和刮削器 ID')
 if(!c.env.LDC_ENCRYPTION_KEY)fail(503,'服务端加密配置缺失')
 const key_box=key?await seal(c.env.LDC_ENCRYPTION_KEY!,'resource-scraper',key):endpoint===old.endpoint?old.key_box:''
 if(enabled&&!key_box)fail(400,'请填写 Stash API 密钥')
 const cfg={endpoint,scraper,key_box,enabled};await c.env.DB.batch([
  c.env.DB.prepare("INSERT INTO site_settings(k,v,updated_at) VALUES('resource_scraper',?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v,updated_at=excluded.updated_at").bind(JSON.stringify(cfg),now()),
  c.env.DB.prepare('DELETE FROM resource_metadata_cache'),
 ]);return c.json({ok:true})
})
resources.post('/api/resources/metadata',async c=>{
 sameOrigin(c);const u=await actor(c,'post'),b=await boundedJson(c,300),code=filmCode(b.code),t=now(),cfg=await loadConfig(c)
 if(!cfg.enabled)fail(409,'尚未配置刮削服务，可以手动填写介绍并上传封面')
 const cached=await c.env.DB.prepare('SELECT body FROM resource_metadata_cache WHERE code=? AND expires_at>?').bind(code,t).first<{body:string}>();if(cached)return c.json(JSON.parse(cached.body))
 const limit=await c.env.DB.prepare(`INSERT INTO resource_metadata_limits(user_id,minute,calls) VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET minute=excluded.minute,calls=CASE WHEN minute=excluded.minute THEN calls+1 ELSE 1 END WHERE minute!=excluded.minute OR calls<3 RETURNING calls`).bind(u.id,Math.floor(t/60)).run();if(!limit.results.length)fail(429,'每分钟最多查询3次，请稍后再试')
 let meta:{title:string;body:string;cover_url:string;code:string}
 try{
  const key=await unseal(c.env.LDC_ENCRYPTION_KEY!,'resource-scraper',cfg.key_box)
  const res=await fetch(cfg.endpoint,{method:'POST',redirect:'manual',headers:{'content-type':'application/json',ApiKey:key},body:JSON.stringify({query:'query($source:ScraperSourceInput!,$input:ScrapeSingleSceneInput!){scrapeSingleScene(source:$source,input:$input){title code details image}}',variables:{source:{scraper_id:cfg.scraper},input:{query:code}}}),signal:AbortSignal.timeout(25000)})
  if(!res.ok||!res.body)throw Error('upstream');const reader=res.body.getReader(),decoder=new TextDecoder();let raw='',size=0
  try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>1500000){await reader.cancel();throw Error('oversize')}raw+=decoder.decode(r.value,{stream:true})}raw+=decoder.decode()}finally{reader.releaseLock()}
  const json=JSON.parse(raw),all=json.data?.scrapeSingleScene;if(json.errors||!Array.isArray(all)||!all.length)throw Error('no result')
  const norm=(s:unknown)=>String(s??'').toUpperCase().replace(/[^A-Z0-9]/g,''),exact=all.filter(x=>norm(x.code)===norm(code)),hit=exact.length===1?exact[0]:all.length===1?all[0]:null
  if(!hit)throw Error('ambiguous');let cover_url=''
  // Stash returns data URLs. No arbitrary upstream image fetch / SSRF proxy.
  const image=String(hit.image||''),match=/^data:image\/(jpeg|png|webp);base64,([a-zA-Z0-9+/=]+)$/.exec(image)
  if(match){const binary=atob(match[2]);if(binary.length>1048576)throw Error('image size');const bytes=Uint8Array.from(binary,x=>x.charCodeAt(0)),mime=match[1],valid=mime==='jpeg'?bytes[0]===255&&bytes[1]===216:mime==='png'?bytes[0]===137&&bytes[1]===80:bytes[0]===82&&bytes[8]===87;if(!valid)throw Error('image format');const key='resource-covers/'+await sha256(match[2])+'.'+(mime==='jpeg'?'jpg':mime);await c.env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'image/'+mime,cacheControl:'public,max-age=31536000,immutable'}});cover_url='/img/'+key}
  meta={title:String(hit.title||'').slice(0,120),body:String(hit.details||'').slice(0,10000),cover_url,code}
 }catch(e){console.warn('resource_metadata_failed',e instanceof Error?e.name:'unknown');fail(503,'刮削未成功或返回结果无法准确匹配。已填写内容保留，可重试或手动发布')}
 await c.env.DB.prepare('INSERT INTO resource_metadata_cache(code,body,expires_at) VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET body=excluded.body,expires_at=excluded.expires_at').bind(code,JSON.stringify(meta!),t+7*86400).run()
 return c.json(meta!)
})
resources.get('/api/resources',async c=>{
 const u=c.get('user'),cat=c.req.query('category')||'',filter=c.req.query('filter')||'',before=Number(c.req.query('before')||Number.MAX_SAFE_INTEGER),q=(c.req.query('q')||'').trim()
 if(cat&&!categories.includes(cat)||!['','unread','checked','favorite','mine'].includes(filter)||!Number.isSafeInteger(before)||before<1||q.length>80)fail(400,'筛选无效')
 if(filter&&!u)fail(401,'请先登录');const args:(string|number)[]=[u?.id??0,before],where=['p.hidden=0','p.id<?']
 if(cat){where.push('p.category=?');args.push(cat)}
 if(filter==='mine'){where.push('p.user_id=?');args.push(u!.id)}
 if(filter==='favorite')where.push('s.favorite=1');if(filter==='checked')where.push('s.checked=1');if(filter==='unread')where.push('COALESCE(s.checked,0)=0')
 if(q){where.push("(p.title LIKE ? ESCAPE '\\' OR p.film_code LIKE ? ESCAPE '\\')");const search='%'+q.replace(/[\\%_]/g,'\\$&')+'%';args.push(search,search)}
 const rows=(await c.env.DB.prepare(`SELECT p.*,COALESCE(u.nick,u.name,u.username) AS author,u.avatar,s.checked,s.favorite,s.approved,s.reaction FROM resource_posts p JOIN users u ON u.id=p.user_id LEFT JOIN resource_marks s ON s.post_id=p.id AND s.user_id=? WHERE ${where.join(' AND ')} ORDER BY p.id DESC LIMIT 21`).bind(...args).all()).results
 const cfg=await loadConfig(c)
 return c.json({items:rows.slice(0,20).map(view),next:rows.length>20?rows[19].id:null,scraper_ready:!!cfg.enabled,can_configure:isOwner(c,u)})
})
resources.get('/api/resources/:id',async c=>{
 const id=pid(c),uid=c.get('user')?.id??0
 const p=await c.env.DB.prepare(`SELECT p.*,COALESCE(u.nick,u.name,u.username) AS author,u.avatar,s.checked,s.favorite,s.approved,s.reaction FROM resource_posts p JOIN users u ON u.id=p.user_id LEFT JOIN resource_marks s ON s.post_id=p.id AND s.user_id=? WHERE p.id=? AND p.hidden=0`).bind(uid,id).first()??fail(404,'帖子不存在或已删除')
 const counts=(await c.env.DB.prepare("SELECT reaction,count(*) AS n FROM resource_marks WHERE post_id=? AND reaction!='' GROUP BY reaction").bind(id).all()).results
 return c.json({post:view(p),reactions:counts})
})
resources.post('/api/resources',async c=>{
 sameOrigin(c);const u=await actor(c,'post'),b=await boundedJson(c,80000),id=requestId(b.request_id),db=c.env.DB,t=now()
 const old=await db.prepare('SELECT id FROM resource_posts WHERE user_id=? AND request_id=?').bind(u.id,id).first();if(old)return c.json(old)
 const title=str(b.title,120),body=str(b.body,10000),category=str(b.category,20),code=category==='film'?filmCode(b.film_code):'',url=resourceUrl(b.share_url,category!=='film')
 if(!categories.includes(category)||!title||!body)fail(400,'请填写分类、标题与内容介绍')
 if(!Array.isArray(b.items)||b.items.length>12)fail(400,'最多上传12个附件')
 if(!u.is_admin&&(await db.prepare('SELECT count(*) AS n FROM resource_posts WHERE user_id=? AND created_at>?').bind(u.id,t-86400).first<{n:number}>())!.n>=30)fail(429,'一天最多发布30篇资源')
 const media=await prepareMedia(c,u.id,b.items),cover=typeof b.cover_url==='string'&&/^\/img\/resource-covers\/[a-f\d]{64}\.(png|jpg|webp)$/.test(b.cover_url)?b.cover_url:''
 const result=await commitUploadContent(db,u.id,mediaKeys(media),[db.prepare('INSERT INTO resource_posts(user_id,request_id,category,title,body,share_url,film_code,media,cover_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id').bind(u.id,id,category,title,body,url,code,JSON.stringify(media),cover,t,t)])
 return c.json(result[0].results[0])
})
resources.patch('/api/resources/:id',async c=>{
 sameOrigin(c);const u=await actor(c,'post'),p=await post(c);if(!canManage(u,p.user_id))fail(403,'没有编辑权限');const b=await boundedJson(c,50000),title=str(b.title,120),body=str(b.body,10000),url=resourceUrl(b.share_url,p.category!=='film')
 if(!title||!body)fail(400,'标题和介绍不能为空');const r=await c.env.DB.prepare('UPDATE resource_posts SET title=?,body=?,share_url=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND hidden=0').bind(title,body,url,now(),p.id,b.revision).run();if(!r.meta.changes)fail(409,'帖子已更新，请刷新后编辑');return c.json({ok:true})
})
resources.delete('/api/resources/:id',async c=>{sameOrigin(c);const u=needUser(c),p=await post(c);if(!canManage(u,p.user_id))fail(403,'没有删除权限');await c.env.DB.prepare('UPDATE resource_posts SET hidden=1 WHERE id=? AND hidden=0').bind(p.id).run();return c.json({ok:true})})
resources.put('/api/resources/:id/mark',async c=>{
 sameOrigin(c);const u=await actor(c,'react'),p=await post(c),b=await boundedJson(c,300),key=String(b.key),value=b.value,t=now()
 if(!['checked','favorite','approved','reaction'].includes(key)||(key==='reaction'?!reactions.includes(String(value)):typeof value!=='boolean'))fail(400,'标记无效')
 if(key==='approved'&&p.user_id===u.id)fail(400,'不能认可自己的帖子')
 const v=key==='reaction'?String(value):value?1:0
 const sql=c.env.DB.prepare(`INSERT INTO resource_marks(user_id,post_id,${key},updated_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM resource_posts WHERE id=? AND hidden=0) ON CONFLICT(user_id,post_id) DO UPDATE SET ${key}=excluded.${key},updated_at=excluded.updated_at WHERE ${key}!=excluded.${key}`).bind(u.id,p.id,v,t,p.id)
 await c.env.DB.batch([sql,...(key==='approved'&&value===true?[c.env.DB.prepare('INSERT OR IGNORE INTO resource_recognition(post_id,user_id,author_id,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM resource_marks WHERE post_id=? AND user_id=? AND approved=1)').bind(p.id,u.id,p.user_id,t,p.id,u.id)]:[])])
 const mark=await c.env.DB.prepare('SELECT checked,favorite,approved,reaction FROM resource_marks WHERE post_id=? AND user_id=?').bind(p.id,u.id).first()
 return c.json({mark,approvals:(await c.env.DB.prepare('SELECT approvals FROM resource_posts WHERE id=?').bind(p.id).first())?.approvals})
})
resources.get('/api/resources/:id/comments',async c=>{
 const p=await post(c),after=Number(c.req.query('after')||0);if(!Number.isSafeInteger(after)||after<0)fail(400,'分页位置无效')
 const rows=(await c.env.DB.prepare('SELECT r.id,r.body,r.user_id,r.created_at,COALESCE(u.nick,u.name,u.username) AS author,u.avatar,u.deco FROM resource_comments r JOIN users u ON u.id=r.user_id WHERE r.post_id=? AND r.hidden=0 AND r.id>? ORDER BY r.id LIMIT 31').bind(p.id,after).all()).results
 return c.json({items:rows.slice(0,30),next:rows.length>30?rows[29].id:null})
})
resources.post('/api/resources/:id/comments',async c=>{
 sameOrigin(c);const u=await actor(c,'comment'),p=await post(c),b=await boundedJson(c,12000),body=str(b.body,2000),id=requestId(b.request_id),t=now();if(!body)fail(400,'评论不能为空')
 const r=await c.env.DB.prepare(`INSERT OR IGNORE INTO resource_comments(post_id,user_id,request_id,body,created_at) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM resource_comments WHERE user_id=? AND created_at>?)<10 AND EXISTS(SELECT 1 FROM resource_posts WHERE id=? AND hidden=0) RETURNING id`).bind(p.id,u.id,id,body,t,u.id,t-60,p.id).run()
 if(!r.results.length&&!await c.env.DB.prepare('SELECT 1 FROM resource_comments WHERE user_id=? AND request_id=?').bind(u.id,id).first())fail(429,'评论过于频繁，请稍后重试');return c.json({ok:true})
})
resources.delete('/api/resources/:id/comments/:comment',async c=>{sameOrigin(c);const u=needUser(c),p=await post(c),id=Number(c.req.param('comment')),row=await c.env.DB.prepare('SELECT user_id FROM resource_comments WHERE id=? AND post_id=? AND hidden=0').bind(id,p.id).first<{user_id:number}>()??fail(404,'评论不存在');if(!canManage(u,row.user_id))fail(403,'没有权限');await c.env.DB.prepare('UPDATE resource_comments SET hidden=1 WHERE id=? AND hidden=0').bind(id).run();return c.json({ok:true})})
