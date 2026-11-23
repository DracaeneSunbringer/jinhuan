import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
const source='assets/generated/bubble-v2-20261014/'
mkdirSync('public/assets/raffle/v2',{recursive:true})
// 机械提取生成素材中彼此独立的透明对象，不重绘其轮廓。
for(const file of ['whale-sheet','frames-sheet']){
 const {data,info}=await sharp(source+file+'.png').ensureAlpha().raw().toBuffer({resolveWithObject:true})
 const {width:w,height:h}=info,seen=new Uint8Array(w*h),queue=new Uint32Array(w*h),parts=[]
 for(let i=0;i<w*h;i++){
  if(seen[i]||data[i*4+3]<32)continue
  let head=0,tail=1;queue[0]=i;seen[i]=1;let left=w,right=0,top=h,bottom=0
  while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)
   for(const n of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(n>=0&&!seen[n]&&data[n*4+3]>=32){seen[n]=1;queue[tail++]=n}
  }
  if(tail>2000)parts.push({left,top,width:right-left+1,height:bottom-top+1,pixels:tail,indices:Uint32Array.from(queue.subarray(0,tail))})
 }
 parts.sort((a,b)=>b.pixels-a.pixels)
 console.log(file,parts.map(({indices,...p})=>p))
 const names=file==='whale-sheet'?['deepseek-frame','deepseek-character','deepseek-title']:['lace-frame','giant-frame']
 const groups=names.map((name,j)=>({name,parts:parts.filter((p,k)=>file==='whale-sheet'?(k===j||(j===0&&k>=3)):(j===0?p.top>=400:p.top<400))}))
 // 主体和其独立水滴/爱心饰件的抗锯齿保留两像素邻域。
 for(const group of groups){
  const mask=new Uint8Array(w*h)
  for(const p of group.parts)for(const i of p.indices){const x=i%w,y=Math.floor(i/w);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)mask[(y+dy)*w+x+dx]=1}
  const out=Buffer.from(data);for(let i=0;i<w*h;i++)if(!mask[i])out[i*4+3]=0
  const name=group.name
  const buf=await sharp(out,{raw:info}).trim().png().toBuffer()
  await sharp(buf).resize({width:name.endsWith('character')?192:960,withoutEnlargement:true}).webp({quality:88,effort:6}).toFile('public/assets/raffle/v2/'+name+'.webp')
 }
}
await sharp('public/assets/raffle/v2/giant-frame.webp').extract({left:40,top:8,width:150,height:183}).resize(80,80,{fit:'contain',background:'#0000'}).webp({quality:88}).toFile('public/assets/raffle/v2/giant-badge.webp')
await sharp('public/assets/raffle/v2/lace-frame.webp').extract({left:385,top:0,width:190,height:132}).resize(80,80,{fit:'contain',background:'#0000'}).webp({quality:88}).toFile('public/assets/raffle/v2/lace-badge.webp')
await sharp('public/assets/raffle/v2/deepseek-character.webp').extract({left:38,top:0,width:142,height:130}).resize(80,80,{fit:'contain',background:'#0000'}).webp({quality:88}).toFile('public/assets/raffle/v2/deepseek-badge.webp')

