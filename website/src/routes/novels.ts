import {Hono} from 'hono'
import type {Ctx,C} from '../types'
import {needUser} from '../services/auth'
import {boundedJson,sameOrigin,fail} from '../lib/http'
import {now} from '../lib/time'
import {loadPersonal,configPublic,modelEndpoint} from '../games/personal-ai'
import {unseal} from '../ldc/core'

import catalog from '../novels/catalog.json'

export const novels=new Hono<Ctx>()
novels.use('*',async(c,next)=>{c.header('cache-control','no-store');await next()})
const books:Record<string,number>=Object.fromEntries(catalog.books.map(b=>[b.id,b.chapters]))
function bookId(c:C){const id=c.req.param('book')||'';if(!Object.hasOwn(books,id))fail(404,'书籍不存在');return id}
function integer(v:unknown,min:number,max:number){if(typeof v!=='number'||!Number.isInteger(v)||v<min||v>max)fail(400,'编号或位置无效');return v as number}
function text(v:unknown,max:number){if(typeof v!=='string'||v.length>max)fail(400,`文字不能超过 ${max} 字`);return v as string}
function settings(v:unknown){
 const b=v as Record<string,unknown>;if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'阅读设置无效')
 if(!['paper','white','green','night'].includes(String(b.theme))||!['serif','sans','mono'].includes(String(b.font)))fail(400,'阅读样式无效')
 return {theme:b.theme,font:b.font,size:integer(b.size,16,32),width:integer(b.width,560,960),line:integer(b.line,16,26)}
}
novels.get('/api/novels/progress',async c=>{const uid=needUser(c).id;return c.json({items:(await c.env.DB.prepare('SELECT book_id,chapter,paragraph,offset,revision,updated_at FROM novel_reading_progress WHERE user_id=? LIMIT 100').bind(uid).all()).results})})
novels.get('/api/novels/:book/progress',async c=>{const uid=needUser(c).id,id=bookId(c);const p=await c.env.DB.prepare('SELECT * FROM novel_reading_progress WHERE user_id=? AND book_id=?').bind(uid,id).first();return c.json({progress:p?{...p,settings:JSON.parse(String(p.settings))}:null})})
novels.put('/api/novels/:book/progress',async c=>{
 sameOrigin(c);const uid=needUser(c).id,id=bookId(c),b=await boundedJson(c,2000),chapter=integer(b.chapter,1,books[id]),paragraph=integer(b.paragraph,0,10000),revision=integer(b.revision,0,2147483646),prefs=JSON.stringify(settings(b.settings))
 if(typeof b.offset!=='number'||!Number.isFinite(b.offset)||b.offset<0||b.offset>1)fail(400,'阅读位置无效')
 const offset=b.offset as number
 const previous=await c.env.DB.prepare('SELECT chapter,paragraph,offset,settings,revision FROM novel_reading_progress WHERE user_id=? AND book_id=?').bind(uid,id).first<{chapter:number;paragraph:number;offset:number;settings:string;revision:number}>()
 if((previous?.revision??0)!==revision)return c.json({error:'另一台设备已更新阅读位置，本机进度仍已保留',conflict:true,revision:previous?.revision??0},409)
 if(previous&&previous.chapter===chapter&&previous.paragraph===paragraph&&Math.abs(previous.offset-offset)<0.005&&previous.settings===prefs)return c.json({revision,unchanged:true})
 const result=previous?await c.env.DB.prepare('UPDATE novel_reading_progress SET chapter=?,paragraph=?,offset=?,settings=?,revision=revision+1,updated_at=? WHERE user_id=? AND book_id=? AND revision=?').bind(chapter,paragraph,b.offset,prefs,now(),uid,id,revision).run():await c.env.DB.prepare('INSERT OR IGNORE INTO novel_reading_progress(user_id,book_id,chapter,paragraph,offset,settings,updated_at) VALUES(?,?,?,?,?,?,?)').bind(uid,id,chapter,paragraph,b.offset,prefs,now()).run()
 if(!result.meta.changes)fail(409,'阅读位置已在其他设备更新，请重新读取')
 return c.json({revision:revision+1})
})
type Work={id:string;user_id:number;title:string;premise:string;characters:string;mode:string;revision:number}
async function ownWork(c:C){const uid=needUser(c).id;return await c.env.DB.prepare('SELECT * FROM novel_works WHERE id=? AND user_id=?').bind(c.req.param('id'),uid).first<Work>()??fail(404,'作品不存在')}
novels.get('/api/novel-studio',async c=>{const uid=needUser(c).id;return c.json({works:(await c.env.DB.prepare('SELECT id,title,mode,revision,updated_at FROM novel_works WHERE user_id=? ORDER BY updated_at DESC,id LIMIT 30').bind(uid).all()).results,ai:configPublic(await loadPersonal(c.env,uid))})})
novels.post('/api/novel-studio',async c=>{
 sameOrigin(c);const uid=needUser(c).id,b=await boundedJson(c,1000),title=text(b.title,80).trim();if(!title)fail(400,'请输入作品名称');const id=crypto.randomUUID(),t=now()
 const r=await c.env.DB.prepare('INSERT INTO novel_works(id,user_id,title,created_at,updated_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM novel_works WHERE user_id=?)<30').bind(id,uid,title,t,t,uid).run();if(!r.meta.changes)fail(409,'最多保存30部私有作品，请先导出或删除旧作品');return c.json({id})
})
novels.get('/api/novel-studio/:id',async c=>{const work=await ownWork(c);return c.json({work,chapters:(await c.env.DB.prepare('SELECT id,title,revision,updated_at FROM novel_draft_chapters WHERE work_id=? ORDER BY id LIMIT 200').bind(work.id).all()).results})})
novels.put('/api/novel-studio/:id',async c=>{
 sameOrigin(c);const work=await ownWork(c),b=await boundedJson(c,50000),title=text(b.title,80).trim(),premise=text(b.premise,8000),characters=text(b.characters,8000),revision=integer(b.revision,1,2147483646)
 if(!title||!['write','roleplay'].includes(String(b.mode)))fail(400,'请检查作品名称与模式')
 const r=await c.env.DB.prepare('UPDATE novel_works SET title=?,premise=?,characters=?,mode=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=?').bind(title,premise,characters,b.mode,now(),work.id,work.user_id,revision).run();if(!r.meta.changes)fail(409,'作品已在其他页面修改，请先导出本机内容再刷新');return c.json({revision:revision+1})
})
novels.delete('/api/novel-studio/:id',async c=>{sameOrigin(c);const work=await ownWork(c);await c.env.DB.prepare('DELETE FROM novel_works WHERE id=? AND user_id=?').bind(work.id,work.user_id).run();return c.json({ok:true})})
novels.get('/api/novel-studio/:id/chapters/:chapter',async c=>{const work=await ownWork(c),id=Number(c.req.param('chapter'));const chapter=await c.env.DB.prepare('SELECT id,title,body,revision FROM novel_draft_chapters WHERE work_id=? AND id=?').bind(work.id,id).first();return c.json({chapter})})
novels.put('/api/novel-studio/:id/chapters/:chapter',async c=>{
 sameOrigin(c);const work=await ownWork(c),id=integer(Number(c.req.param('chapter')),1,200),b=await boundedJson(c,180000),title=text(b.title,80).trim(),body=text(b.body,40000),revision=integer(b.revision,0,2147483646);if(!title)fail(400,'请输入章节标题')
 const r=revision?await c.env.DB.prepare('UPDATE novel_draft_chapters SET title=?,body=?,revision=revision+1,updated_at=? WHERE work_id=? AND id=? AND revision=?').bind(title,body,now(),work.id,id,revision).run():await c.env.DB.prepare('INSERT OR IGNORE INTO novel_draft_chapters(work_id,id,title,body,updated_at) VALUES(?,?,?,?,?)').bind(work.id,id,title,body,now()).run();if(!r.meta.changes)fail(409,'章节已在其他页面修改，请先导出本机内容再刷新');return c.json({revision:revision+1})
})
novels.post('/api/novel-studio/:id/generate',async c=>{
 sameOrigin(c);const work=await ownWork(c),b=await boundedJson(c,100000),operation=text(b.operation,36),direction=text(b.direction,2000),excerpt=text(b.excerpt,12000)
 if(!/^[a-f\d-]{36}$/i.test(operation)||b.authorize!==true)fail(400,'请明确授权使用个人模型')
 const cfg=await loadPersonal(c.env,work.user_id);if(!cfg?.enabled||!cfg.key_box||cfg.revision!==b.config_revision)fail(409,'个人AI已停用或变更，请重新读取配置')
 const at=now(),prior=await c.env.DB.prepare('SELECT state,result FROM novel_ai_calls WHERE id=? AND user_id=?').bind(operation,work.user_id).first<{state:string;result:string}>();if(prior)return c.json(prior)
 const r=await c.env.DB.prepare("INSERT OR IGNORE INTO novel_ai_calls(id,user_id,state,created_at,updated_at) SELECT ?,?,'pending',?,? WHERE NOT EXISTS(SELECT 1 FROM novel_ai_calls WHERE user_id=? AND state='pending' AND created_at>?) AND (SELECT count(*) FROM novel_ai_calls WHERE user_id=? AND created_at>?)<6").bind(operation,work.user_id,at,at,work.user_id,at-90,work.user_id,at-60).run();if(!r.meta.changes){const duplicate=await c.env.DB.prepare('SELECT state,result FROM novel_ai_calls WHERE id=? AND user_id=?').bind(operation,work.user_id).first();if(duplicate)return c.json(duplicate);fail(429,'已有生成进行中或操作过快，请稍后重试')}
 let output='',state='done'
 try{
  const key=await unseal(c.env.LDC_ENCRYPTION_KEY!,'personal-guess-ai:'+work.user_id,cfg!.key_box)
  const system=work.mode==='roleplay'?'你是互动小说的叙事主持人。根据人物卡和世界设定续写一个短场景，不替用户决定行动。结尾提供2至4个可选行动，用户也可以自由输入。':'你是中文小说写作助手。依据用户的世界设定、人物卡和已有正文进行续写或按要求修改。只输出小说文本，不添加解释。'
  const response=await fetch(modelEndpoint(cfg!.base),{method:'POST',redirect:'manual',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({model:cfg!.model,messages:[{role:'system',content:system+' 所有角色必须为成年人；不生成露骨色情、未成年人性内容或现实犯罪操作指南。'},{role:'user',content:JSON.stringify({preferences:cfg!.prompt,premise:work.premise,characters:work.characters,excerpt,instruction:direction})}],max_tokens:2048,stream:false}),signal:AbortSignal.timeout(60000)})
  if(!response.ok||!response.body)throw Error('upstream');const reader=response.body.getReader(),decoder=new TextDecoder();let raw='',bytes=0
  try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>131072){await reader.cancel();throw Error('size')}raw+=decoder.decode(chunk.value,{stream:true})}raw+=decoder.decode()}finally{reader.releaseLock()}
  const result=JSON.parse(raw).choices?.[0]?.message?.content;if(typeof result!=='string'||!result.trim()||result.length>16000)throw Error('format');output=result
 }catch{state='error';output='生成失败或结果不确定，本次不自动重试。正文未改动，可查看模型服务商用量。'}
 await c.env.DB.prepare('UPDATE novel_ai_calls SET state=?,result=?,updated_at=? WHERE id=? AND user_id=?').bind(state,output,now(),operation,work.user_id).run()
 c.executionCtx.waitUntil(c.env.DB.prepare('DELETE FROM novel_ai_calls WHERE id IN(SELECT id FROM novel_ai_calls WHERE user_id=? AND created_at<? ORDER BY created_at LIMIT 50)').bind(work.user_id,at-7*86400).run())
 return c.json({state,result:output})
})
