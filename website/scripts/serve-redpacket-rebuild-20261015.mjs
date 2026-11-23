// Local, fictional users; in-memory D1/R2, no production or external transactions.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createServer} from 'node:http'
import {resolve} from 'node:path'
import {deflateSync} from 'node:zlib'
const config=JSON.parse(readFileSync('web/dist/meme_hall/wrangler.json','utf8')),t=Math.floor(Date.now()/1000),port=8799
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'web/dist/meme_hall/index.js',compatibilityDate:'2025-09-01',d1Databases:{DB:'redpacket-ui'},r2Buckets:{BUCKET:'redpacket-ui'},bindings:{ADMIN_USER_IDS:'1'},assets:{directory:resolve('web/dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:config.assets.run_worker_first,assetConfig:{not_found_handling:'single-page-application'}}}))
const db=await mf.getD1Database('DB'),local=new DatabaseSync(':memory:');local.exec(readFileSync('schema.sql','utf8'))
const schema=local.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all().map(x=>x.sql);local.close()
for(let i=0;i<schema.length;i+=40)await db.batch(schema.slice(i,i+40).map(s=>db.prepare(s)))
await db.prepare("INSERT INTO chat_groups(id,name,is_default,created_at) VALUES(1,'红包 · 本地验收',1,?)").bind(t).run()
for(let uid=1;uid<=2;uid++){
 await db.prepare('INSERT INTO users(id,username,name,created_at,updated_at,last_seen) VALUES(?,?,?,?,?,?)').bind(uid,'packet_fixture_'+uid,'测试成员'+uid,t,t,t).run()
 await db.prepare('INSERT INTO chat_members(group_id,user_id,joined_at) VALUES(1,?,?)').bind(uid,t).run()
 await db.prepare('INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update('redpacket-ui-'+uid).digest('hex'),uid,t+7200).run()
}
for(const [i,game] of ['rails','stairs','radio','tiles','reverse','pairs'].entries()){
 const id='fixture-packet-'+game
 await db.prepare("INSERT INTO chat_messages(group_id,user_id,body,created_at,updated_at,redpack_id) VALUES(1,2,'[红包]',?,?,?)").bind(t+i,t,id).run()
 await db.prepare("INSERT INTO chat_redpacks(id,message_id,secret,mode,game,prompt) SELECT ?,id,'今天好运来敲门','cipher',?,? FROM chat_messages WHERE redpack_id=?").bind(id,game,'本地玩法 '+game,id).run()
}
for(const [i,ref] of ['fixtureLottery','fixturePending','fixtureUnknown'].entries()){
 const id='fixture-hb-'+ref
 await db.prepare("INSERT INTO chat_messages(group_id,user_id,body,created_at,updated_at,redpack_id) VALUES(1,2,'[红包]',?,?,?)").bind(t+10+i,t+10+i,id).run()
 await db.prepare("INSERT INTO chat_redpacks(id,message_id,secret,mode,provider,external_ref,external_kind,prompt) SELECT ?,id,'平台红包已解锁','open','hb',?,'id',? FROM chat_messages WHERE redpack_id=?").bind(id,ref,({fixtureLottery:'HB 报名流程验收',fixturePending:'HB 待发放验收',fixtureUnknown:'HB 结果待核对验收'})[ref],id).run()
}
// Reproducible upload test pattern, not production artwork. PNG using only Node built-ins.
function crc(b){let c=0xffffffff;for(const v of b){c^=v;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1}return (c^0xffffffff)>>>0}
function chunk(type,data){const name=Buffer.from(type),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([size,name,data,sum])}
const width=900,height=1200,raw=Buffer.alloc((width*3+1)*height)
for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=y*(width*3+1)+1+x*3;raw[p]=Math.round(x/width*255);raw[p+1]=Math.round(y/height*255);raw[p+2]=((Math.floor(x/100)+Math.floor(y/100))%2)*160+40}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])
mkdirSync('.build/redpacket-fixture',{recursive:true});writeFileSync('.build/redpacket-fixture/cover.png',png)
let uploadFailures=0,uploads=0
const server=createServer(async(req,res)=>{try{
 if(req.url==='/__fixture/login'){res.writeHead(302,{'Set-Cookie':'sid=redpacket-ui-1; Path=/; HttpOnly; SameSite=Lax','Location':'/chat/1'}).end();return}
 if(req.url==='/__fixture/cover.png'){res.writeHead(200,{'content-type':'image/png'}).end(png);return}
 if(req.url==='/__fixture/cover-picker.js'){
  // Test-only picker replacement. The browser extension cannot read local files without extra permission.
  // This serves a generated image from the fixture, then exercises the real change/crop/upload handlers.
  res.writeHead(200,{'content-type':'text/javascript'}).end(`document.addEventListener('click',async e=>{
   const input=e.target;if(!input.matches('input[type="file"][aria-label="选择红包封面"]'))return;
   e.preventDefault();const blob=await(await fetch('/__fixture/cover.png')).blob(),files=new DataTransfer();
   files.items.add(new File([blob],'fixture-cover.png',{type:'image/png'}));input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  },true);`);return
 }
 if(req.url==='/__fixture/connector.js'){
  // UI-only protocol fixture; unit tests exercise the actual userscript. No platform traffic.
  res.writeHead(200,{'content-type':'text/javascript'}).end(`const joined=new Set();window.addEventListener('message',e=>{
   if(e.source!==window||e.origin!==location.origin||e.data?.type!=='meme-redpacket-request')return;
   const {id,action,external}=e.data;let result;
   if(action==='ping')result={version:'1.2.0-test',creditCreate:true,participationV2:true};
   else if(['query','claim'].includes(action)){
    if(action==='claim')joined.add(external.ref);
    result={id:external.ref,kind:'lottery',state:external.ref==='fixturePending'?'payment_pending':external.ref==='fixtureUnknown'?'unconfirmed':joined.has(external.ref)?'registered':'active',claimed:false,amount:null,total:5,remaining:5,expires_at:Math.floor(Date.now()/1000)+60};
   }else return;
   window.postMessage({type:'meme-redpacket-result',id,result},location.origin);
  });`);return
 }
 if(req.url==='/__fixture/fail-upload'){uploadFailures=1;res.writeHead(200,{'content-type':'text/html'}).end('<a href="/chat/1">返回红包测试：下次上传失败一次</a>');return}
 if(req.url==='/__fixture/stats'){res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({uploads,uploadFailures}));return}
 const chunks=[];for await(const chunk of req)chunks.push(chunk)
 if(req.url==='/api/uploads'){uploads++;if(uploadFailures){uploadFailures--;res.writeHead(503,{'content-type':'application/json'}).end(JSON.stringify({error:'夹具：上传暂时不可用，请重试'}));return}}
 const requestHeaders={...req.headers};delete requestHeaders['if-none-match'];delete requestHeaders['if-modified-since']
 const response=await mf.dispatchFetch('http://127.0.0.1:'+port+req.url,{method:req.method,headers:requestHeaders,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})})
 const headers=Object.fromEntries(response.headers)
 headers['cache-control']='no-store';delete headers.etag
 if(response.headers.get('content-type')?.includes('text/html')){
  delete headers['content-length'];res.writeHead(response.status,headers);res.end((await response.text()).replace('</body>','<script type="module" src="/__fixture/cover-picker.js"></script>'+(req.url.includes('connector=fixture')?'<script type="module" src="/__fixture/connector.js"></script>':'')+'</body>'))
 }else{res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()))}
}catch(e){console.error(e.message);res.writeHead(500).end('local fixture error')}})
server.listen(port,'127.0.0.1',()=>console.log('Local acceptance http://127.0.0.1:'+port+'/__fixture/login'))
async function close(){server.close();await mf.dispose();process.exit()};process.on('SIGINT',close);process.on('SIGTERM',close)
