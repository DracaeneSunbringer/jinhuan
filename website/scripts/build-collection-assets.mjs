import sharp from 'sharp'
import {mkdirSync,writeFileSync,statSync} from 'node:fs'
import assert from 'node:assert/strict'
const source='assets/generated/collection-20261014/',out='public/assets/raffle/collection/'
mkdirSync(out,{recursive:true})
const inventory=[]
for(const id of ['whalebuddy','maid','whalepunch','nightdevil','gpt','claude','gemini','whitedragon']){
 const {data,info}=await sharp(source+id+'.png').ensureAlpha().raw().toBuffer({resolveWithObject:true})
 const {width:w,height:h}=info,seen=new Uint8Array(w*h),queue=new Uint32Array(w*h),parts=[]
 for(let i=0;i<w*h;i++){
  if(seen[i]||data[i*4+3]<32)continue
  let head=0,tail=1;queue[0]=i;seen[i]=1;let left=w,right=0,top=h,bottom=0
  while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)
   for(const n of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(n>=0&&!seen[n]&&data[n*4+3]>=32){seen[n]=1;queue[tail++]=n}
  }
  if(tail>100)parts.push({left,top,width:right-left+1,height:bottom-top+1,pixels:tail,indices:Uint32Array.from(queue.subarray(0,tail))})
 }
 const large=parts.filter(p=>p.pixels>30000).sort((a,b)=>a.top-b.top)
 const frame=large.find(p=>p.width>w*.7&&p.top<h*.25)
 assert.ok(frame,id+' frame')
 const title=large.find(p=>p!==frame&&p.width>w*.4&&p.width/p.height>2)
 assert.ok(title,id+' title')
 const rest=large.filter(p=>p!==frame&&p!==title).sort((a,b)=>a.left-b.left)
 assert.ok(rest.length===1||rest.length===2,id+' badge/character')
 const objects=[{name:'frame',p:frame},{name:'title',p:title},{name:'badge',p:rest[0]},...(rest.length===2?[{name:'character',p:rest[1]}]:[])]
 const distance=(p,q)=>Math.hypot(Math.max(0,q.left-p.left-p.width,p.left-q.left-q.width),Math.max(0,q.top-p.top-p.height,p.top-q.top-q.height))
 for(const obj of objects){
  const mask=new Uint8Array(w*h)
  const group=parts.filter(p=>p===obj.p||(!large.includes(p)&&objects.reduce((best,x)=>distance(p,x.p)<distance(p,best.p)?x:best,obj)===obj&&distance(p,obj.p)<120))
  for(const p of group)for(const i of p.indices){const x=i%w,y=Math.floor(i/w);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)mask[(y+dy)*w+x+dx]=1}
  const rgba=Buffer.from(data);for(let i=0;i<w*h;i++)if(!mask[i])rgba[i*4+3]=0
  const png=await sharp(rgba,{raw:info}).trim().png().toBuffer()
  const file=out+id+'-'+obj.name+'.webp'
  const image=sharp(png)
  if(obj.name==='badge')image.resize(80,80,{fit:'contain',background:'#0000'})
  else image.resize({width:obj.name==='character'?144:obj.name==='title'?480:id==='gemini'?768:960,withoutEnlargement:true})
  await image.webp({quality:86,effort:6}).toFile(file)
  const m=await sharp(file).metadata();assert.ok(m.hasAlpha);assert.ok(statSync(file).size<120000,file+' budget')
  inventory.push({file,bytes:statSync(file).size,width:m.width,height:m.height,source:obj.p.left+','+obj.p.top+','+obj.p.width+','+obj.p.height})
 }
}
const gif='assets/source/collection-20261014/whalepunch.gif'
for(const animated of [true,false]){
 const file=out+'whalepunch-'+(animated?'tail':'tail-still')+'.webp'
 await sharp(gif,animated?{animated:true}:{page:0}).resize(72,72,{fit:'contain',background:'#0000'}).webp({quality:76,effort:6,loop:0}).toFile(file)
 const m=await sharp(file,{animated}).metadata();assert.ok(statSync(file).size<160000)
 inventory.push({file,bytes:statSync(file).size,width:m.width,height:m.pageHeight||m.height,pages:m.pages||1})
}
writeFileSync(source+'inventory.json',JSON.stringify(inventory,null,2)+'\n')
console.log(JSON.stringify({files:inventory.length,bytes:inventory.reduce((s,x)=>s+x.bytes,0),inventory}))
