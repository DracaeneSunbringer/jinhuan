// Unicode CLDR 固定版本；只打包当前站点已有表情的中英文关键词。
import { readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { UNICODE_GROUPS } from '../src/emoji.ts'
const version='48.2.0',root='research/emoji-search'
mkdirSync(root+'/source',{recursive:true})
const records=[],maps={}
async function download(url) {
  if(process.argv.includes('--proxy-curl')) return execFileSync('curl.exe',['--fail','--silent','--show-error','--max-time','45','--proxy','http://127.0.0.1:7897',url],{encoding:'utf8',maxBuffer:8*1024*1024})
  const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(r.status+' '+url)
  return r.text()
}
for(const lang of ['zh','en']) {
  maps[lang]={}
  for(const kind of ['annotations','annotations-derived']) {
    const folder=kind==='annotations-derived'?'annotationsDerived':'annotations'
    const url=`https://raw.githubusercontent.com/unicode-org/cldr-json/${version}/cldr-json/cldr-${kind}-full/${folder}/${lang}/annotations.json`
    const path=`${root}/source/${lang}-${kind}.json`
    let text
    if(process.argv.includes('--download') && !existsSync(path)) {
      text=await download(url);JSON.parse(text);writeFileSync(path,text)
    } else text=readFileSync(path,'utf8')
    const data=JSON.parse(text)
    const rows=(data.annotations || data.annotationsDerived)?.annotations
    if(!rows)throw Error('未知 CLDR 结构 '+path)
    for(const [k,v] of Object.entries(rows))maps[lang][k.replaceAll('\ufe0f','')]=v
    records.push({url,path,sha256:createHash('sha256').update(text).digest('hex')})
  }
}
const keywords={}
for(const g of UNICODE_GROUPS)for(const k of g.items) {
  const norm=k.replaceAll('\ufe0f','')
  const zh=maps.zh[norm],en=maps.en[norm]
  keywords[k]=[g.label,...(zh?.tts||[]),...(zh?.default||[]),...(en?.tts||[]),...(en?.default||[])].join(' ')
}
if(process.argv.includes('--download')) {
  if(!existsSync(root+'/UNICODE-LICENSE.txt'))writeFileSync(root+'/UNICODE-LICENSE.txt',await download(`https://raw.githubusercontent.com/unicode-org/cldr-json/${version}/LICENSE`))
}
writeFileSync('public/emoji-search.json',JSON.stringify(keywords))
writeFileSync('public/emoji-search-LICENSE.txt',readFileSync(root+'/UNICODE-LICENSE.txt'))
writeFileSync(root+'/manifest.json',JSON.stringify({version,generatedAt:new Date().toISOString(),records,count:Object.keys(keywords).length,bytes:Buffer.byteLength(JSON.stringify(keywords))},null,2))
console.log(JSON.stringify({version,count:Object.keys(keywords).length,bytes:Buffer.byteLength(JSON.stringify(keywords))}))
