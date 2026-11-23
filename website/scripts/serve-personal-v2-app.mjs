// Isolated local acceptance server: fictional accounts and empty in-memory D1/R2 only.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createServer} from 'node:http'
import {resolve} from 'node:path'
const config=JSON.parse(readFileSync('web/dist/meme_hall/wrangler.json','utf8')),t=Math.floor(Date.now()/1000)
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'web/dist/meme_hall/index.js',compatibilityDate:'2025-09-01',d1Databases:{DB:'pv2-ui'},r2Buckets:{BUCKET:'pv2-ui'},bindings:{ADMIN_USER_IDS:'1'},assets:{directory:resolve('web/dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:config.assets.run_worker_first,assetConfig:{not_found_handling:'single-page-application'}}}))
const db=await mf.getD1Database('DB'),local=new DatabaseSync(':memory:');local.exec(readFileSync('schema.sql','utf8'))
const schema=local.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all().map(x=>x.sql);local.close()
for(let i=0;i<schema.length;i+=40)await db.batch(schema.slice(i,i+40).map(s=>db.prepare(s)))
await db.prepare("INSERT INTO chat_groups(id,name,is_default,created_at) VALUES(1,'迷友群 · 本地测试',1,?)").bind(t).run()
const items=['p001','pv2-p001-doodle','pv2-p001-ssr','pv2-p015-ssr','pv2-p051-ssr']
for(let i=1;i<=5;i++){await db.prepare('INSERT INTO users(id,username,name,created_at,updated_at,last_seen,deco) VALUES(?,?,?,?,?,?,?)').bind(i,'fixture_'+i,'测试成员'+i,t,t,t,JSON.stringify({pt:items[i-1]})).run();await db.prepare('INSERT INTO chat_members(group_id,user_id,joined_at) VALUES(1,?,?)').bind(i,t).run();await db.prepare('INSERT INTO user_unlocks(user_id,item,at) VALUES(?,?,?)').bind(i,'personal:'+items[i-1],t).run();for(let j=0;j<3;j++)await db.prepare('INSERT INTO chat_messages(group_id,user_id,body,created_at,updated_at) VALUES(1,?,?,?,?)').bind(i,j===0?'收到，今天也开心':j===1?'一段完整的消息，用来验证阅读位置、长句换行和右侧装饰不挡文字。'.repeat(4):'再看一条短消息',t+i*3+j,t).run()}
for(const id of ['p001','pv2-p001-doodle','pv2-p001-ssr'])await db.prepare('INSERT OR IGNORE INTO user_unlocks(user_id,item,at) VALUES(2,?,?)').bind('personal:'+id,t).run()
await db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,2,?,?)').bind(createHash('sha256').update('pv2-ui-fixture').digest('hex'),t,t+7200).run()
const server=createServer(async(req,res)=>{try{if(req.url==='/__fixture/login'){res.writeHead(302,{'Set-Cookie':'sid=pv2-ui-fixture; Path=/; HttpOnly; SameSite=Lax','Location':'/chat/1'}).end();return}const chunks=[];for await(const chunk of req)chunks.push(chunk);const response=await mf.dispatchFetch('http://127.0.0.1:8799'+req.url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});const headers=Object.fromEntries(response.headers);res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()))}catch(e){console.error(e.message);res.writeHead(500).end('local fixture error')}})
server.listen(8799,'127.0.0.1',()=>console.log('Local acceptance http://127.0.0.1:8799/__fixture/login'))
async function close(){server.close();await mf.dispose();process.exit()};process.on('SIGINT',close);process.on('SIGTERM',close)
