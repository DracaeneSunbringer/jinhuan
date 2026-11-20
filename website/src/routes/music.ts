import {Hono} from 'hono'
import type {C,Ctx} from '../types'
import {needUser,isOwner} from '../services/auth'
import {fail} from '../lib/http'
import {hmacHex,verifyHmac} from '../lib/crypto'
import {now} from '../lib/time'
const musicSources=['netease','kuwo','kugou','qq']
type MusicTrack={id:string;source:string;name:string;artist:string;album:string;cover:string;duration:string;extra:string}
export const music=new Hono<Ctx>()
music.use('/api/music/*',async(c,next)=>{needUser(c);c.header('cache-control','private, no-store');await next()})
function musicOrigin(c:C){if(!c.env.MUSIC_ORIGIN||!c.env.MUSIC_TOKEN)return fail(503,'音乐服务尚未连接，请稍后再试');const u=new URL(c.env.MUSIC_ORIGIN);if(u.protocol!=='https:')return fail(503,'音乐服务配置无效');return u}
async function musicFetch(c:C,path:string,query:URLSearchParams,range?:string){const u=musicOrigin(c);u.pathname='/music/'+path;u.search=query.toString();const headers=new Headers({'x-music-token':c.env.MUSIC_TOKEN!});if(range)headers.set('range',range);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);try{const r=await fetch(u,{headers,redirect:'manual',signal:controller.signal});if(r.status!==200&&r.status!==206){await r.body?.cancel();return fail(503,'音乐源暂时不可用，请稍后重试')}return r}catch{return fail(503,'音乐服务连接超时，请稍后重试')}finally{clearTimeout(timer)}}
// Music uses its own server secret with a domain-separated signature; email login is optional.
async function musicSigned(c:C,track:MusicTrack){const payload=btoa(unescape(encodeURIComponent(JSON.stringify({track,uid:needUser(c).id,expires:now()+30*86400})))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');return payload+'.'+await hmacHex(c.env.MUSIC_TOKEN!,'music-track-v1|'+payload)}
async function musicVerified(c:C,raw=c.req.query('track')??''){if(typeof raw!=='string'||raw.length>12000)return fail(400,'歌曲参数过长');const [payload,sig,...rest]=raw.split('.');if(rest.length||!payload||!sig||!c.env.MUSIC_TOKEN||!await verifyHmac(c.env.MUSIC_TOKEN,'music-track-v1|'+payload,sig))return fail(400,'歌曲链接失效，请重新搜索');let data;try{data=JSON.parse(decodeURIComponent(escape(atob(payload.replaceAll('-','+').replaceAll('_','/')))))}catch{return fail(400,'歌曲链接无效')}if(data.uid!==needUser(c).id||data.expires<now())return fail(403,'歌曲链接已过期，请重新搜索');return data.track as MusicTrack}
music.get('/api/music/config',c=>c.json({ready:!!(c.env.MUSIC_ORIGIN&&c.env.MUSIC_TOKEN),search:'aggregate'}))
music.get('/api/music/search',async c=>{
 const q=(c.req.query('q')??'').trim(),source=c.req.query('source');if(!q||q.length>100||/^https?:/i.test(q))return fail(400,'请输入100字以内的歌曲名或歌手');if(source&&!musicSources.includes(source))return fail(400,'音乐来源无效')
 const uid=needUser(c).id;if(c.env.AUTH_RL&&! (await c.env.AUTH_RL.limit({key:'music-search:'+uid})).success)return fail(429,'搜索过于频繁，请稍后再试')
 const page=Number(c.req.query('page')||1);if(!Number.isInteger(page)||page<1||page>20)return fail(400,'搜索页码无效')
 const query=new URLSearchParams({q,type:'song',page:String(page),limit:'30'});for(const s of source?[source]:musicSources)query.append('sources',s)
 const r=await musicFetch(c,'search',query),tracks:MusicTrack[]=[],counts=new Map<string,number>()
 const parser=new HTMLRewriter().on('li.song-card',{element(e){const get=(k:string,n=300)=>(e.getAttribute('data-'+k)??'').slice(0,n),id=get('id'),s=get('source');if(!id||!musicSources.includes(s)||(counts.get(s)??0)>=30)return;counts.set(s,(counts.get(s)??0)+1);let extra=get('extra',6000);try{extra=JSON.stringify(JSON.parse(extra||'{}'))}catch{extra='{}'}tracks.push({id,source:s,name:get('name'),artist:get('artist'),album:get('album'),cover:get('cover',1000),duration:get('duration'),extra})}})
 // Only bounded metadata survives parsing; equal songs keep alternate playable sources.
 await parser.transform(r).body!.pipeTo(new WritableStream({write(){}}))
 const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}]+/gu,''),term=normalize(q),groups=new Map<string,MusicTrack[]>()
 for(const track of tracks){const id=normalize(track.name)+'|'+normalize(track.artist),group=groups.get(id)??[];if(!group.some(t=>t.source===track.source&&t.id===track.id))group.push(track);groups.set(id,group)}
 const score=(t:MusicTrack)=>normalize(t.name)===term?100:normalize(t.name).includes(term)?70:normalize(t.artist).includes(term)?60:0
 const ordered=[...groups.values()].sort((a,b)=>score(b[0])-score(a[0])),signed=async(track:MusicTrack)=>({...track,extra:undefined,token:await musicSigned(c,track)})
 return c.json({tracks:await Promise.all(ordered.map(async group=>({...await signed(group[0]),alternates:await Promise.all(group.slice(1,4).map(signed))}))),page,hasMore:page<20&&tracks.length>0,partial:r.headers.get('x-music-partial')==='1'})
})
music.get('/api/music/lyrics',async c=>{const track=await musicVerified(c),r=await musicFetch(c,'lyric',new URLSearchParams({...track,format:'lrc'}));return new Response(r.body,{headers:{'content-type':'text/plain;charset=utf-8','cache-control':'private,max-age=3600','x-content-type-options':'nosniff'}})})
music.get('/api/music/audio',async c=>{
 const track=await musicVerified(c),range=c.req.header('range');if(range&&!/^bytes=\d*-\d*$/.test(range))return fail(416,'只支持单段音频请求')
 const download=c.req.query('download')==='1',r=await musicFetch(c,'download',new URLSearchParams({...track,stream:'1'}),range),headers=new Headers({'cache-control':'private,max-age=3600','x-content-type-options':'nosniff'})
 if(!/^(audio\/|application\/octet-stream)/i.test(r.headers.get('content-type')||'')){await r.body?.cancel();return fail(503,'该来源没有返回可播放音频')}
 for(const key of ['content-type','content-length','content-range','accept-ranges']){const v=r.headers.get(key);if(v)headers.set(key,v)}
 if(download){const mime=r.headers.get('content-type')??'',ext=mime.includes('flac')?'flac':mime.includes('mp4')?'m4a':mime.includes('ogg')?'ogg':mime.includes('wav')?'wav':'mp3';headers.set('content-disposition',`attachment; filename*=UTF-8''${encodeURIComponent((track.artist+' - '+track.name).replace(/[\\/:*?"<>|\r\n]/g,'_')+'.'+ext)}`)}
 return new Response(r.body,{status:r.status,headers})
})

// Shared recommendation metadata is persisted; user-bound playback tokens are minted on read.
function musicList(c:C){const list=c.req.param('list')||'';if(!['owner','friends'].includes(list))return fail(404,'歌单不存在');return list}
music.get('/api/music/playlists/:list',async c=>{
 musicOrigin(c);const list=musicList(c),uid=needUser(c).id,before=c.req.query('before')||'',cursor=before?before.split(':'):null;
 if(cursor&&(cursor.length!==2||!/^\d+$/.test(cursor[0])||!/^[a-f0-9]{64}$/.test(cursor[1])))return fail(400,'分页参数无效');
 const rows=await c.env.DB.prepare(`SELECT t.*,
  (SELECT COUNT(*) FROM music_recommendations r WHERE r.list=t.list AND r.track_key=t.track_key) AS recommendation_count,
  EXISTS(SELECT 1 FROM music_recommendations r WHERE r.list=t.list AND r.track_key=t.track_key AND r.user_id=?) AS mine,
  (SELECT json_group_array(display_name) FROM (SELECT display_name FROM music_recommendations r WHERE r.list=t.list AND r.track_key=t.track_key ORDER BY created_at DESC,user_id LIMIT 5)) AS names
  FROM music_playlist_tracks t WHERE t.list=? ${cursor?'AND (t.updated_at<? OR (t.updated_at=? AND t.track_key<?))':''}
  ORDER BY t.updated_at DESC,t.track_key DESC LIMIT 41`).bind(uid,list,...(cursor?[Number(cursor[0]),Number(cursor[0]),cursor[1]]:[])).all<{track_key:string;metadata:string;updated_at:number;recommendation_count:number;mine:number;names:string}>();
 const page=rows.results.slice(0,40),signed=async(t:MusicTrack)=>({...t,extra:undefined,token:await musicSigned(c,t)});
 const tracks=await Promise.all(page.map(async row=>{const [track,...alternates]=JSON.parse(row.metadata) as MusicTrack[];return {...await signed(track),alternates:await Promise.all(alternates.map(signed)),recommendationKey:row.track_key,recommenders:JSON.parse(row.names||'[]'),recommendationCount:row.recommendation_count,recommendedByMe:!!row.mine}}));
 const last=page.at(-1);return c.json({tracks,next:rows.results.length>40&&last?last.updated_at+':'+last.track_key:null});
})
music.post('/api/music/playlists/:list',async c=>{
 const list=musicList(c),u=needUser(c);if(list==='owner'&&!isOwner(c,u))return fail(403,'只有站长可以加入站长推荐');
 if(c.env.AUTH_RL&&!(await c.env.AUTH_RL.limit({key:'music-recommend:'+u.id})).success)return fail(429,'推荐过于频繁，请稍后重试');
 const text=await c.req.text();if(text.length>50000)return fail(400,'推荐内容过长');let body;try{body=JSON.parse(text)}catch{return fail(400,'推荐内容无效')}
 const track=await musicVerified(c,body.track),tracks=[track];for(const raw of (Array.isArray(body.alternates)?body.alternates:[]).slice(0,3)){const alternate=await musicVerified(c,raw);if(alternate.name===track.name&&alternate.artist===track.artist)tracks.push(alternate)}
 const norm=(v:string)=>v.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]+/gu,'');const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(norm(track.name)+'|'+norm(track.artist))),id=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join(''),at=now();
 const existing=await c.env.DB.prepare('SELECT 1 AS found FROM music_recommendations WHERE list=? AND track_key=? AND user_id=?').bind(list,id,u.id).first();if(existing)return c.json({ok:true,already:true});
 const count=await c.env.DB.prepare('SELECT COUNT(*) AS n FROM music_recommendations WHERE user_id=?').bind(u.id).first<{n:number}>();if((count?.n||0)>=500)return fail(400,'已推荐500首，可撤回旧推荐后继续');
 try{await c.env.DB.batch([
  c.env.DB.prepare('INSERT INTO music_playlist_tracks(list,track_key,metadata,updated_at) VALUES(?,?,?,?) ON CONFLICT(list,track_key) DO UPDATE SET updated_at=excluded.updated_at').bind(list,id,JSON.stringify(tracks),at),
  c.env.DB.prepare('INSERT INTO music_recommendations(list,track_key,user_id,display_name,created_at) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING').bind(list,id,u.id,(u.nick||u.name||u.username).slice(0,100),at)
 ])}catch(e){if(String(e).includes('music_recommendation_quota'))return fail(400,'已推荐500首，可撤回旧推荐后继续');throw e}return c.json({ok:true});
})
music.delete('/api/music/playlists/:list/:key',async c=>{
 const list=musicList(c),id=c.req.param('key'),u=needUser(c);if(!/^[a-f0-9]{64}$/.test(id))return fail(400,'歌曲参数无效');
 await c.env.DB.batch([c.env.DB.prepare('DELETE FROM music_recommendations WHERE list=? AND track_key=? AND user_id=?').bind(list,id,u.id),c.env.DB.prepare('DELETE FROM music_playlist_tracks WHERE list=? AND track_key=? AND NOT EXISTS(SELECT 1 FROM music_recommendations WHERE list=? AND track_key=?)').bind(list,id,list,id)]);return c.json({ok:true});
})
