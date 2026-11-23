import {readFileSync} from 'node:fs'
import {redactPersonalHistory as redact} from './personal-history-redaction.mjs'
if(process.env.CI)throw Error('private review is not permitted in CI')
const base='data/processed/personal-decorations-v2-20261014'
const rows=JSON.parse(readFileSync(`${base}/timeline.json`)),members=JSON.parse(readFileSync(`${base}/members.json`))
const names=new Map(members.map(x=>[x.id,x.name])),byId=new Map(rows.map(x=>[x.id,x]))
const fmt=x=>`#${x.id} ${new Date((x.created_at+28800)*1000).toISOString().slice(0,16).replace('T',' ')} ${names.get(x.user_id)||x.user_id}${x.has_media?' [附件未分析]':''}: ${redact(x.body).replace(/\r?\n/g,' ⏎ ')}`
const ids=(process.argv[2]||'').split(',').filter(Boolean).map(Number)
const from=Number(process.argv[3]||0),size=Number(process.argv[4]||300)
if(!ids.length||ids.some(x=>!Number.isSafeInteger(x))||size<1||size>1000)throw Error('usage: ids start [size <=1000]')
const selected=rows.filter(x=>ids.includes(x.user_id)),page=selected.slice(from,from+size)
console.log(JSON.stringify({uids:ids,total:selected.length,start:from,read:page.length,next:from+page.length<selected.length?from+page.length:null}))
for(const x of page){
  if(x.reply_to){const ref=byId.get(x.reply_to);console.log(ref?'  ↳ '+fmt(ref):'  ↳ #'+x.reply_to+' [原消息不可用]')}
  console.log(fmt(x))
}
