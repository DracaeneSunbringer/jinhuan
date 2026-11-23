import sharp from 'sharp'
import {readdirSync,readFileSync,mkdirSync,writeFileSync,statSync,existsSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'

// Only split/compress the four independently drawn sprites. Never redraw art,
// modify source alpha, or write to the first-generation personal asset directory.
const source=resolve('assets/generated/personal-decorations-v2-20261014/sheets')
const out=resolve('.build/personal-v2/assets'), inventory=resolve('.build/personal-v2/inventory.json'), errors=[]
const saved=existsSync(inventory)?JSON.parse(readFileSync(inventory,'utf8')):[]
const manifest=new Map(saved.map(x=>[x.id,x]))
const selected=process.argv.slice(2)
const processorVersion=2
const repairRoot=resolve('assets/generated/personal-decorations-v2-20261014/repairs')
mkdirSync(out,{recursive:true})
for(const name of readdirSync(source).filter(x=>/^p\d{3}-(doodle|ssr)\.png$/.test(x)).sort()) {
 if(selected.length&&!selected.some(x=>name.startsWith(x+'-')||name===x+'.png'))continue
 const sourcePath=join(source,name),id='pv2-'+name.replace('.png','')
 const sourceSha256=createHash('sha256').update(readFileSync(sourcePath)).digest('hex')
 const badgeRepair=join(repairRoot,name.replace('.png','-badge.png'))
 const repairSha256=existsSync(badgeRepair)?createHash('sha256').update(readFileSync(badgeRepair)).digest('hex'):null
 if(manifest.get(id)?.processorVersion===processorVersion&&manifest.get(id)?.repairSha256===repairSha256&&manifest.get(id)?.sourceSha256===sourceSha256&&Object.values(manifest.get(id).assets).every(a=>existsSync(a.file)))continue
 try {
 const {data,info}=await sharp(sourcePath).ensureAlpha().raw().toBuffer({resolveWithObject:true})
 const {width:w,height:h}=info,seen=new Uint8Array(w*h),queue=new Uint32Array(w*h),parts=[]
 for(let i=0;i<w*h;i++) {
  if(seen[i]||data[i*4+3]<32)continue
  let head=0,tail=1,left=w,right=0,top=h,bottom=0;queue[0]=i;seen[i]=1
  while(head<tail) {
   const p=queue[head++],x=p%w,y=Math.floor(p/w)
   left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)
   for(const n of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1]) {
    if(n>=0&&!seen[n]&&data[n*4+3]>=32){seen[n]=1;queue[tail++]=n}
   }
  }
  if(tail>100)parts.push({left,top,width:right-left+1,height:bottom-top+1,pixels:tail,indices:Uint32Array.from(queue.subarray(0,tail))})
 }
 const broad=parts.filter(p=>p.width>w*.25&&p.width/p.height>2).sort((a,b)=>a.top-b.top)
 assert.equal(broad.length,2,id+': expected separate frame and title')
 const [frame,title]=broad
 assert.ok(frame.top<h*.35&&title.top>h*.4,id+': sprite order')
 const right=parts.filter(p=>p.left>w*.48&&!broad.includes(p)&&p.pixels>w*h*.015).sort((a,b)=>a.top-b.top)
 assert.equal(right.length,2,id+': expected separate character and badge; components='+JSON.stringify(parts.filter(p=>p.pixels>w*h*.015).map(({left,top,width,height,pixels})=>({left,top,width,height,pixels}))))
 const objects=[{name:'frame',p:frame},{name:'title',p:title},{name:'character',p:right[0]},{name:'badge',p:right[1]}]
 const major=objects.map(x=>x.p)
 const distance=(a,b)=>Math.hypot(Math.max(0,b.left-a.left-a.width,a.left-b.left-b.width),Math.max(0,b.top-a.top-a.height,a.top-b.top-b.height))
 const assets={}
 for(const object of objects) {
  const mask=new Uint8Array(w*h)
  const group=parts.filter(p=>p===object.p||(!major.includes(p)&&objects.reduce((best,x)=>distance(p,x.p)<distance(p,best.p)?x:best,object)===object&&distance(p,object.p)<Math.min(w,h)*.14))
  for(const p of group)for(const i of p.indices) {
   const x=i%w,y=Math.floor(i/w)
   for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)mask[(y+dy)*w+x+dx]=1
  }
  const rgba=Buffer.from(data)
  for(let i=0;i<w*h;i++)if(!mask[i])rgba[i*4+3]=0
  const trimmed=await sharp(rgba,{raw:info}).trim().png().toBuffer()
  const target=join(out,id+'-'+object.name+'.webp')
  const image=sharp(object.name==='badge'&&existsSync(badgeRepair)?badgeRepair:trimmed).trim()
  if(object.name==='badge')image.resize(72,72,{fit:'contain',background:'#0000'})
  else image.resize({width:object.name==='character'?96:object.name==='title'?320:640,withoutEnlargement:true})
  await image.webp({quality:86,effort:6}).toFile(target)
  const metadata=await sharp(target).metadata(),bytes=statSync(target).size
  assert.ok(metadata.hasAlpha&&bytes<120000,id+' '+object.name+': alpha/size')
  assets[object.name]={file:target.replaceAll('\\','/'),width:metadata.width,height:metadata.height,bytes,sourceBounds:[object.p.left,object.p.top,object.p.width,object.p.height],sha256:createHash('sha256').update(readFileSync(target)).digest('hex')}
 }
 manifest.set(id,{id,source:name,sourceSha256,repairSha256,processorVersion,assets,reviewed:false})
 } catch(error) {
  manifest.delete(id);errors.push({id,error:error.message})
 }
}
const items=[...manifest.values()].sort((a,b)=>a.id.localeCompare(b.id))
writeFileSync(inventory,JSON.stringify(items,null,2)+'\n')
writeFileSync(resolve('.build/personal-v2/split-errors.json'),JSON.stringify(errors,null,2)+'\n')
console.log(JSON.stringify({sets:items.length,files:items.length*4,bytes:items.reduce((sum,x)=>sum+Object.values(x.assets).reduce((n,a)=>n+a.bytes,0),0),errors,reviewed:false}))
if(errors.length)process.exitCode=1
