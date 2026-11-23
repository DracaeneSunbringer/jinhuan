import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {join,resolve} from 'node:path'
import {PERSONAL_V2_TITLES} from '../public/personal-v2-catalog.js'
const records=JSON.parse(readFileSync('.build/personal-v2/inventory.json','utf8'))
const layout=JSON.parse(readFileSync('assets/generated/personal-decorations-v2-20261014/layout.json','utf8'))
const preview=process.argv.includes('--preview')
if(!preview)assert.equal(records.length,118,'Every approved set must have four validated assets')
const out=resolve('public/assets/personal-v2');mkdirSync(out,{recursive:true})
let css='/* Independent v2 art and measured title anchors. First-generation assets stay unchanged. */\n'
for(const item of records){
 assert.ok(PERSONAL_V2_TITLES[item.id]&&layout[item.id],item.id)
 assert.equal(item.processorVersion,2)
 for(const [kind,asset]of Object.entries(item.assets)){assert.ok(asset.bytes<120000&&asset.width<=640&&asset.height<=640,item.id+' asset budget');copyFileSync(asset.file,join(out,item.id+'-'+kind+'.webp'))}
 const p=layout[item.id];assert.ok(p.x>=40&&p.x<=60&&p.y>=35&&p.y<=65&&p.pad>=14&&p.pad<=22)
 css+='.'+'pt-'+item.id+'{--pv-frame:url(/assets/personal-v2/'+item.id+'-frame.webp);--pv-title:url(/assets/personal-v2/'+item.id+'-title.webp);--pv-character:url(/assets/personal-v2/'+item.id+'-character.webp);--pv-title-x:'+p.x+'%;--pv-title-y:'+p.y+'%;--pv-title-pad:'+p.pad+'px}\n'
}
writeFileSync('public/personal-v2-art.css',css)
console.log(JSON.stringify({sets:records.length,files:records.length*4,bytes:records.reduce((n,x)=>n+Object.values(x.assets).reduce((s,a)=>s+a.bytes,0),0),preview}))
