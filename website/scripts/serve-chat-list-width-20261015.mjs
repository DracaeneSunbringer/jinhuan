// Local-only fixture using the real built application and an in-memory database.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createServer} from 'node:http'
import {resolve} from 'node:path'
const port=8796,t=Math.floor(Date.now()/1000),cfg=JSON.parse(readFileSync('web/dist/meme_hall/wrangler.json','utf8'))
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'web/dist/meme_hall/index.js',compatibilityDate:'2025-09-01',d1Databases:{DB:'chat-width-local'},r2Buckets:{BUCKET:'chat-width-local'},bindings:{ADMIN_USER_IDS:'1'},assets:{directory:resolve('web/dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:cfg.assets.run_worker_first,assetConfig:{not_found_handling:'single-page-application'}}}))
const db=await mf.getD1Database('DB'),local=new DatabaseSync(':memory:');local.exec(readFileSync('schema.sql','utf8'))
const schema=local.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all();local.close()
for(let i=0;i<schema.length;i+=40)await db.batch(schema.slice(i,i+40).map(x=>db.prepare(x.sql)))
for(const uid of [1,2]){
 await db.prepare('INSERT INTO users(id,username,name,role,is_admin,created_at,updated_at,last_seen) VALUES(?,?,?,?,?,?,?,?)').bind(uid,'width_user_'+uid,uid===1?'管理员验收':'普通成员验收',uid===1?'admin':null,uid===1?1:0,t,t,t).run()
 await db.prepare('INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update('chat-width-'+uid).digest('hex'),uid,t+14400).run()
}
await db.prepare("INSERT INTO chat_groups(id,name,is_default,created_by,created_at) VALUES(1,'迷友',1,1,?)").bind(t).run()
for(const uid of [1,2])await db.prepare('INSERT INTO chat_members(group_id,user_id,joined_at,last_read) VALUES(1,?,?,0)').bind(uid,t).run()
for(let i=0;i<105;i++)await db.prepare('INSERT INTO chat_messages(group_id,user_id,body,created_at,updated_at) VALUES(1,2,?,?,?)').bind(i===104?'因为标签页切后台就没活动了，还得是接 push 吗，有倒计时的红包也要能正常显示。'+('LongPreviewWithoutBreak'.repeat(8)):'本地消息 '+i,t-105+i,t-105+i).run()
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:'+port)
 if(url.pathname==='/__fixture/login'){
  const uid=url.searchParams.get('user')==='2'?2:1
  res.writeHead(302,{'set-cookie':`sid=chat-width-${uid}; Path=/; HttpOnly; SameSite=Lax`,location:'/chat'}).end();return
 }
 if(url.pathname==='/__fixture/scenario'){
  const s=url.searchParams.get('case')
  await db.prepare('UPDATE chat_groups SET name=? WHERE id=1').bind(s==='long-name'?'迷友群名很长时也应保留时间与未读数量'.repeat(4):'迷友').run()
  await db.prepare('UPDATE chat_members SET muted=?,last_read=0 WHERE group_id=1').bind(s==='muted'?1:0).run()
  if(s==='empty')await db.prepare('DELETE FROM chat_messages WHERE group_id=1').run()
  if(s==='offline')await db.prepare('UPDATE users SET last_seen=? WHERE id=2').bind(t-900).run()
  if(s!=='empty')await db.prepare('UPDATE chat_messages SET body=? WHERE id=(SELECT MAX(id) FROM chat_messages WHERE group_id=1)').bind(s==='short'?'你好':s==='muted'?'@width_user_1 这是静音群的长消息提醒。'.repeat(14):'长中文预览不能把列表撑开。'+('LongPreviewWithoutBreak'.repeat(12))).run()
  res.writeHead(302,{location:'/chat'}).end();return
 }
 // Serve CSS directly from the checked-out source to reproduce before/after
 // without another Worker or browser instance; the final pass uses rebuilt assets.
 if(url.pathname==='/chat.css'&&process.env.CHAT_WIDTH_RELEASE!=='1'){
  res.writeHead(200,{'content-type':'text/css; charset=utf-8','cache-control':'no-store'}).end(readFileSync('public/chat.css'));return
 }
 const chunks=[];for await(const chunk of req)chunks.push(chunk)
 const headers={...req.headers};delete headers['if-none-match'];delete headers['if-modified-since']
 const response=await mf.dispatchFetch('http://127.0.0.1:'+port+req.url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})})
 const out=Object.fromEntries(response.headers);out['cache-control']='no-store';delete out.etag
 res.writeHead(response.status,out).end(Buffer.from(await response.arrayBuffer()))
}catch(e){console.error(e.message);res.writeHead(500).end('local fixture error')}})
server.listen(port,'127.0.0.1',()=>console.log(`Local chat width fixture http://127.0.0.1:${port}/__fixture/login`))
async function close(){server.close();await mf.dispose();process.exit()};process.on('SIGINT',close);process.on('SIGTERM',close)
