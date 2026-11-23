import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const raw = 'data/raw/personal-decorations-v2-20261014'
if(process.env.CI)throw Error('private review is not permitted in CI')
const processed = 'data/processed/personal-decorations-v2-20261014'
mkdirSync(raw, { recursive:true }); mkdirSync(processed, { recursive:true })
const save=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2))
function query(sql) {
  if(!/^SELECT\b/i.test(sql)||/;\s*\S/.test(sql)) throw Error('one SELECT only')
  const output=execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','meme-hall','--remote','--command',sql,'--json'],{encoding:'utf8',maxBuffer:16*1024*1024,timeout:90000,env:{...process.env,WRANGLER_LOG_PATH:resolve('.build/wrangler-logs')}})
  const data=JSON.parse(output)
  if(!Array.isArray(data)||data.some(x=>x.success===false)||data.length!==1)throw Error('invalid D1 response')
  return data[0]
}
if(process.argv.includes('--fetch')) {
  if(!existsSync(`${raw}/snapshot.json`)) {
    const head=query('SELECT MAX(id) AS highwater FROM chat_messages INDEXED BY idx_chat_msg_group WHERE group_id=1')
    const members=query("SELECT u.id,u.username,u.name,cm.joined_at FROM chat_members cm JOIN users u ON u.id=cm.user_id WHERE cm.group_id=1 AND u.kind='user' AND u.disabled=0 AND NOT EXISTS(SELECT 1 FROM account_retirements ar WHERE ar.source_id=u.id) ORDER BY u.id")
    save(`${raw}/snapshot.json`,{startedAt:new Date().toISOString(),highwater:head.results[0].highwater,groupId:1,headMeta:head.meta,membersMeta:members.meta,members:members.results})
  }
  const snap=JSON.parse(readFileSync(`${raw}/snapshot.json`,'utf8'))
  let cursor=0,page=0
  while(cursor<snap.highwater) {
    const path=`${raw}/page-${String(++page).padStart(3,'0')}.json`
    let result
    if(existsSync(path)) result=JSON.parse(readFileSync(path,'utf8'))
    else {
      result=query(`SELECT id,user_id,body,reply_to,created_at,edited_at,CASE WHEN image_key IS NOT NULL OR media IS NOT NULL THEN 1 ELSE 0 END AS has_media FROM chat_messages INDEXED BY idx_chat_msg_group WHERE group_id=1 AND id>${cursor} AND id<=${snap.highwater} AND deleted=0 AND system_kind IS NULL ORDER BY id LIMIT 1000`)
      save(path,result)
    }
    if(!result.results.length)break
    for(const row of result.results) { if(row.id<=cursor||row.id>snap.highwater)throw Error('invalid cursor'); cursor=row.id }
    console.log(JSON.stringify({page,rows:result.results.length,cursor,rowsRead:result.meta?.rows_read,rowsWritten:result.meta?.rows_written}))
    if(result.results.length<1000)break
  }
  save(`${raw}/fetch-complete.json`,{completedAt:new Date().toISOString(),pages:page,lastId:cursor,highwater:snap.highwater})
}
if(existsSync(`${raw}/fetch-complete.json`)) {
  const snap=JSON.parse(readFileSync(`${raw}/snapshot.json`)),done=JSON.parse(readFileSync(`${raw}/fetch-complete.json`))
  const rows=[];let reads=(snap.headMeta?.rows_read||0)+(snap.membersMeta?.rows_read||0),writes=(snap.headMeta?.rows_written||0)+(snap.membersMeta?.rows_written||0)
  for(let i=1;i<=done.pages;i++){const r=JSON.parse(readFileSync(`${raw}/page-${String(i).padStart(3,'0')}.json`));rows.push(...r.results);reads+=r.meta?.rows_read||0;writes+=r.meta?.rows_written||0}
  const ids=new Set(rows.map(x=>x.id));if(ids.size!==rows.length||writes)throw Error('duplicate or mutation')
  for(const row of rows){if(row.body==null)row.body='';if(typeof row.body!=='string')throw Error('unexpected body type')}
  const byId=new Map(rows.map((x,i)=>[x.id,{...x,index:i}]))
  const previous=JSON.parse(readFileSync('assets/source/personal-decorations-20261014/designs.json'))
  const scope=new Set(previous.map(x=>x[0]))
  const members=snap.members.filter(x=>scope.has(x.id))
  const stats=[]
  for(const u of members){
    const own=rows.filter(x=>x.user_id===u.id),text=own.filter(x=>x.body.trim()),usable=text.filter(x=>x.body.trim().length>2)
    const days=[...new Set(text.map(x=>new Date((x.created_at+28800)*1000).toISOString().slice(0,10)))]
    const stat={id:u.id,name:u.name||u.username,username:u.username,total:own.length,text:text.length,usable:usable.length,characters:text.reduce((a,x)=>a+x.body.length,0),days,first:text[0]?.created_at||null,last:text.at(-1)?.created_at||null,replyCount:own.filter(x=>x.reply_to).length,missingReferences:own.filter(x=>x.reply_to&&!ids.has(x.reply_to)).length,oldTitle:previous.find(x=>x[0]===u.id)[1]}
    stats.push(stat)
    save(`${processed}/member-${u.id}.json`,{member:stat,messages:own.map(x=>{const i=byId.get(x.id).index;return {...x,reply:x.reply_to?byId.get(x.reply_to)||{id:x.reply_to,unavailable:true}:null,before:rows.slice(Math.max(0,i-2),i),after:rows.slice(i+1,i+3)}})})
  }
  const coverage={snapshot:snap.startedAt,completed:done.completedAt,highwater:snap.highwater,groupMessages:rows.length,groupCharacters:rows.reduce((a,x)=>a+x.body.length,0),members:stats.length,previousMembersMissing:previous.filter(x=>!members.some(u=>u.id===x[0])).map(x=>x[0]),newMemberIds:snap.members.filter(u=>!scope.has(u.id)).map(x=>x.id),memberMessages:stats.reduce((a,x)=>a+x.total,0),memberText:stats.reduce((a,x)=>a+x.text,0),memberUsable:stats.reduce((a,x)=>a+x.usable,0),zeroText:stats.filter(x=>!x.text).length,rowsRead:reads,rowsWritten:writes}
  save(`${processed}/coverage.json`,coverage);save(`${processed}/members.json`,stats)
  save(`${processed}/timeline.json`,rows)
  console.log(JSON.stringify(coverage,null,2))
}
