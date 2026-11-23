// Disposable local-only chat fixture. No production data, credentials or writes.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createServer} from 'node:http'
import {resolve} from 'node:path'
const config=JSON.parse(readFileSync('web/dist/meme_hall/wrangler.json','utf8')),port=8799,t=Math.floor(Date.now()/1000)
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'web/dist/meme_hall/index.js',compatibilityDate:'2025-09-01',d1Databases:{DB:'chat-resume-fixture'},r2Buckets:{BUCKET:'chat-resume-fixture'},assets:{directory:resolve('web/dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:config.assets.run_worker_first,assetConfig:{not_found_handling:'single-page-application'}}}))
const db=await mf.getD1Database('DB'),local=new DatabaseSync(':memory:');local.exec(readFileSync('schema.sql','utf8'))
const schema=local.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all().map(x=>x.sql);local.close()
for(let i=0;i<schema.length;i+=40)await db.batch(schema.slice(i,i+40).map(s=>db.prepare(s)))
await db.prepare("INSERT INTO chat_groups(id,name,is_default,created_at) VALUES(1,'迷友 · 阅读验收',1,?)").bind(t).run()
for(let uid=1;uid<=2;uid++){
 await db.prepare('INSERT INTO users(id,username,name,created_at,updated_at,last_seen) VALUES(?,?,?,?,?,?)').bind(uid,'reader_fixture_'+uid,'测试成员'+uid,t,t,t).run()
 await db.prepare('INSERT INTO chat_members(group_id,user_id,joined_at,last_read) VALUES(1,?,?,100)').bind(uid,t).run()
 await db.prepare('INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update('chat-resume-'+uid).digest('hex'),uid,t+14400).run()
}
let sequence=0,failMessages=false,delayMessages=false,failFavorites=false;const requests=[]
async function add(n){for(let i=0;i<n;i++){sequence++;await db.prepare('INSERT INTO chat_messages(group_id,user_id,body,created_at,updated_at) VALUES(1,2,?,?,?)').bind(`阅读测试 ${sequence}：这条消息用于确认上次看到的位置，向上阅读时不要跳回底部。`,t-320+sequence,t).run()}}
await add(320)
const bucket=await mf.getR2Bucket('BUCKET')
await bucket.put('c/fixture/ac.png',readFileSync('public/stickers/nga/ac0.png'),{httpMetadata:{contentType:'image/png'}})
await bucket.put('c/fixture/animated.gif',readFileSync('public/stickers/qq/1.gif'),{httpMetadata:{contentType:'image/gif'}})
await db.prepare("UPDATE chat_messages SET body='筋肉首次渲染 [muscle:muscle_001] AC娘 [nga:ac0]' WHERE id=110").run()
await db.prepare('UPDATE chat_messages SET body=?,image_key=?,width=80,height=80,media=? WHERE id=111').bind('多图收藏验收','c/fixture/ac.png',JSON.stringify([{k:'c/fixture/ac.png',w:80,h:80},{k:'c/fixture/animated.gif',kind:'g',w:60,h:60}])).run()
await db.prepare('UPDATE chat_members SET last_read=100 WHERE group_id=1').run()
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:'+port)
 if(url.pathname==='/__fixture/packet'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}).end(readFileSync('tests/cases/redpacket-flow-20261015.fixture.html'));return}
 if(url.pathname==='/__fixture/login'){const uid=url.searchParams.get('user')==='2'?2:1;res.writeHead(302,{'Set-Cookie':`sid=chat-resume-${uid}; Path=/; HttpOnly; SameSite=Lax`,'Location':'/chat/1'}).end();return}
 if(url.pathname==='/__fixture/add'){await add(Math.min(500,Math.max(1,Number(url.searchParams.get('n'))||1)));res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end('<p>本地新消息已加入</p><a href="/chat/1">返回群聊</a>');return}
 if(url.pathname==='/__fixture/state'){const state=await db.prepare('SELECT user_id,last_read FROM chat_members WHERE group_id=1').all();res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({sequence,members:state.results,requests}));return}
 if(url.pathname==='/__fixture/reset'){await db.prepare('UPDATE chat_members SET last_read=100 WHERE group_id=1').run();requests.length=0;res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end('<script>localStorage.removeItem("chatReading:v1");location.replace("/chat/1")</script>');return}
 if(url.pathname==='/__fixture/scenario'){
  const kind=url.searchParams.get('case');let dest='/chat/1'
  if(kind==='read')await db.prepare('UPDATE chat_members SET last_read=(SELECT MAX(id) FROM chat_messages WHERE group_id=1) WHERE group_id=1').run()
  if(kind==='short'){
   await db.prepare("INSERT OR IGNORE INTO chat_groups(id,name,is_default,created_at) VALUES(2,'短群测试',0,?)").bind(t).run()
   await db.prepare('INSERT OR IGNORE INTO chat_members(group_id,user_id,joined_at,last_read) VALUES(2,1,?,0)').bind(t).run()
   if(!(await db.prepare('SELECT 1 FROM chat_messages WHERE group_id=2').first()))for(let i=0;i<3;i++)await db.prepare("INSERT INTO chat_messages(group_id,user_id,body,created_at,updated_at) VALUES(2,2,'短消息',?,?)").bind(t,t).run()
   dest='/chat/2'
  }
  if(kind==='fail')failMessages=true
  if(kind==='delay')delayMessages=true
  if(kind==='favorites'){
   for(let id=120;id<134;id++){
    await db.prepare('UPDATE chat_messages SET image_key=?,width=150,height=130 WHERE id=?').bind('c/fixture/ac.png',id).run()
    await db.prepare('INSERT OR IGNORE INTO chat_sticker_favorites VALUES(1,?,0,?)').bind(id,t).run()
   }
  }
  if(kind==='favorite-error')failFavorites=true
  requests.length=0;res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end('<script>localStorage.removeItem("chatReading:v1");location.replace('+JSON.stringify(dest)+')</script>');return
 }
 if(url.pathname==='/__fixture/pending-draft'||url.pathname==='/__fixture/created-draft'){
  const draft={nonce:'12345678-1234-4234-8234-123456789012',status:'pending',params:{kind:'random',amount:'200',count:10,greeting:'测试祝福'},...(url.pathname.includes('created')?{id:'9876543210123456789'}:{})}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end('<script>localStorage.setItem("creditPacketDraft:1:1",'+JSON.stringify(JSON.stringify(draft))+');location.replace("/chat/1")</script>');return
 }
 if(url.pathname.startsWith('/api/chat/'))requests.push({method:req.method,path:req.url,at:Date.now()})
 if(req.method==='GET'&&/^\/api\/chat\/groups\/\d+\/messages$/.test(url.pathname)){
  if(failMessages){failMessages=false;res.writeHead(503,{'content-type':'application/json'}).end(JSON.stringify({error:'初始消息加载测试错误'}));return}
  if(delayMessages){delayMessages=false;await new Promise(r=>setTimeout(r,1500))}
 }
 if(req.method==='GET'&&url.pathname==='/api/chat/stickers'&&failFavorites){failFavorites=false;res.writeHead(503,{'content-type':'application/json'}).end(JSON.stringify({error:'收藏加载测试错误'}));return}
 // Verify the stamped release assets, including dependency cache keys.
 const chunks=[];for await(const chunk of req)chunks.push(chunk)
 const headers={...req.headers};delete headers['if-none-match'];delete headers['if-modified-since']
 const response=await mf.dispatchFetch('http://127.0.0.1:'+port+req.url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})})
 const out=Object.fromEntries(response.headers);out['cache-control']='no-store';delete out.etag
 res.writeHead(response.status,out).end(Buffer.from(await response.arrayBuffer()))
}catch(e){console.error(e.message);res.writeHead(500).end('local fixture error')}})
server.listen(port,'127.0.0.1',()=>console.log(`Local chat fixture http://127.0.0.1:${port}/__fixture/login`))
async function close(){server.close();await mf.dispose();process.exit()};process.on('SIGINT',close);process.on('SIGTERM',close)
