// 增量导入 NGA 客户端的 AC 娘经典包；不运行上游代码、不改写其他包的图片。
// 首次联网：node scripts/build-nga-stickers-20261015.mjs --download
// 后续离线重新生成：node scripts/build-nga-stickers-20261015.mjs
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {execFileSync,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
const dir='research/chat-stickers-20261015',out='public/stickers/nga',catalog=dir+'/nga-source.json'
mkdirSync(out,{recursive:true});mkdirSync(dir,{recursive:true})
const repo='Justwen/NGA-CLIENT-VER-OPEN-SOURCE'
if(process.argv.includes('--download')){
 const tree=JSON.parse(execFileSync('gh',['api',`repos/${repo}/git/trees/master?recursive=1`],{encoding:'utf8',maxBuffer:8*1024*1024}))
 const entries=tree.tree.filter(x=>/^lib_core\/src\/main\/assets\/ac\/ac\d+\.png$/.test(x.path))
 assert.equal(entries.length,45,'上游包条目数变化，需要人工核对')
 const result=[]
 for(let i=0;i<entries.length;i+=4)await Promise.all(entries.slice(i,i+4).map(async entry=>{
  const {stdout}=await promisify(execFile)('gh',['api',`repos/${repo}/git/blobs/${entry.sha}`],{maxBuffer:1024*1024})
  const blob=JSON.parse(stdout),data=Buffer.from(blob.content,'base64'),name=entry.path.split('/').at(-1)
  assert.ok(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));assert.ok(data.length<100000)
  writeFileSync(out+'/'+name,data)
  result.push({name,url:`https://github.com/${repo}/blob/${tree.sha}/${entry.path}`,blobSha:entry.sha,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length,width:data.readUInt32BE(16),height:data.readUInt32BE(20)})
 }))
 writeFileSync(catalog,JSON.stringify({retrievedAt:new Date().toISOString(),repository:`https://github.com/${repo}`,tree:tree.sha,rights:'AC娘角色及图片版权归原作者与 AcFun；上游客户端代码 GPL-2.0，不将代码许可证冒充素材授权。沿用站内平台表情用途。',items:result.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))},null,2)+'\n')
}
assert.ok(existsSync(catalog),'请先下载并核验来源清单')
const source=JSON.parse(readFileSync(catalog,'utf8'))
for(const item of source.items)assert.equal(createHash('sha256').update(readFileSync(out+'/'+item.name)).digest('hex'),item.sha256)
const manifest=JSON.parse(readFileSync('public/stickers/packs.json','utf8')).filter(p=>p.key!=='nga')
for(const pack of manifest)if(pack.key==='muscle')pack.label='💗'
manifest.push({key:'nga',label:'AC娘',ext:'png',items:source.items.map(x=>x.name.replace('.png',''))})
writeFileSync('public/stickers/packs.json',JSON.stringify(manifest))
const tokens=[...new Set(manifest.flatMap(p=>p.items.map(n=>`${p.key}:${n}`)))].sort()
writeFileSync('src/stickers.ts','// 由 scripts/build_stickers.py / build_custom_stickers.py / build-nga-stickers-20261015.mjs 生成，勿手改\n'+`export const STICKER_EXT: Record<string, string> = ${JSON.stringify(Object.fromEntries(manifest.map(p=>[p.key,p.ext])))}\nexport const STICKERS = new Set<string>(${JSON.stringify(tokens)})\n`)
const labels=['眨眼 blink','赞 goodjob','上','中枪','偷笑','冷','凌乱','反对','吓','吻','呆','咦','哦','哭','哭1','哭笑','哼','喘','喷','嘲笑','嘲笑1','囧','委屈','心','忧伤','怒','怕','惊','愁','抓狂','抠鼻','擦汗','无语','晕','汗','瞎','羞','羡慕','花痴','茶','衰','计划通','赞同','闪光','黑枪']
const words=JSON.parse(readFileSync('public/emoji-search.json','utf8'));labels.forEach((label,i)=>{words[`nga:ac${i}`]='AC娘 '+label});writeFileSync('public/emoji-search.json',JSON.stringify(words))
console.log(JSON.stringify({count:source.items.length,bytes:source.items.reduce((n,x)=>n+x.bytes,0),tree:source.tree}))
