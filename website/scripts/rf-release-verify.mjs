// 生产只读检查：资源内容及公开 API，不创建测试用户或消息。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const base='https://52dmeme.com', results=[]
const evidence=resolve(process.argv[2] || '.agents/tasks/road-feedback-2026-10-12/release-b1')
if(!evidence.startsWith(resolve('.')+'\\'))throw Error('证据目录必须位于项目内')
mkdirSync(evidence,{recursive:true})
const get=async path=>{const r=await fetch(base+path,{signal:AbortSignal.timeout(20000),headers:{'cache-control':'no-cache'}});assert.equal(r.status,200,path);return r}
const html=await (await get('/?release-check='+Date.now())).text()
for(const name of ['app.js','style.css','chat.css']){
  const url=html.match(new RegExp('/'+name.replace('.','\\.')+'\\?v=[a-z0-9]+'))?.[0];assert.ok(url,name+' stamp')
  const live=await (await get(url)).text(), local=readFileSync('public/'+name,'utf8')
  const sha=s=>createHash('sha1').update(s).digest('hex')
  assert.equal(sha(live),sha(local),name+' content')
  results.push({case:'live-'+name,url,sha:sha(live),result:'通过'})
}
const days=await (await get('/api/days?nsfw=0')).json();assert.ok(days.days?.length);results.push({case:'live-days',count:days.days.length,result:'通过'})
const road=await (await get('/api/road?sort=new')).json();assert.ok(Array.isArray(road.items));assert.ok(road.items.every(x=>'source_msg_id' in x));results.push({case:'live-road-source-contract',count:road.items.length,result:'通过'})
const unauth=await fetch(base+'/api/road/backfill-chat',{method:'POST',headers:{'content-type':'application/json','origin':base},body:'{}',signal:AbortSignal.timeout(20000)});assert.equal(unauth.status,401);results.push({case:'live-backfill-requires-login',status:unauth.status,result:'通过'})
writeFileSync(resolve(evidence,'live-api.json'),JSON.stringify(results,null,2))
console.log(JSON.stringify(results,null,2))
