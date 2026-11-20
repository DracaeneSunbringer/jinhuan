// 🌟🐟谷统一像素场景。Kenney Tiny Town/Tiny Farm + Clint Bellanger Tiny Creatures（CC0）。
// 主角图集保持原样；地形、建筑、动物、作物、道具与商店各自按需绘制。
import * as B from '/pet-isle-art.js'
export * from '/pet-isle-art.js'
const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h})
let town,farm,creatures,merchant,ready=false,promise
const objectImages=new Map(),objectURLs=new Map()
const objectIds=['chicken','duck','cow','sheep','pig','turnip','carrot','wheat','strawberry','tomato','corn','grape','pumpkin','cabbage','egg','duckegg','milk','wool','truffle','sardine','carp','bass','salmon','tuna','puffer','squid','whale','coal','copper','iron','gold','amethyst','emerald','ruby','diamond','feather','duckdown','cream','finewool','white_truffle']
function logicalSprite(img,w=18,h=18){const c=canvas(w,h);c.getContext('2d').drawImage(img,0,0,w,h);c.hiRes=img;return c}
export function blit(g,img,x,y,{flip=false,alpha=1}={}){g.save();g.imageSmoothingEnabled=!!img.hiRes;g.globalAlpha=alpha;if(flip){g.translate(x+img.width,y);g.scale(-1,1);g.drawImage(img.hiRes||img,0,0,img.width,img.height)}else g.drawImage(img.hiRes||img,x,y,img.width,img.height);g.restore()}
const cache=new Map(), icons=new Map()
export const CROP={...B.CROP}, ANIMAL={...B.ANIMAL}, TOOLS={...B.TOOLS}
export const merchantUrl='/valley-merchant.svg'
function crop(image,index,w=16,h=16){const c=canvas(w,h);c.getContext('2d').drawImage(image,index%(image.width/16)*16,Math.floor(index/(image.width/16))*16,w,h,0,0,w,h);return c}
function sprite(image,index){const c=canvas(18,18);c.getContext('2d').drawImage(crop(image,index),1,1);return c}
const image=async(path,resolveAsset)=>new Promise(async(resolve,reject)=>{try{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('场景素材加载失败'));i.src=await resolveAsset(path)}catch(e){reject(e)}})
export function loadArt(resolveAsset) { return B.loadArt(resolveAsset) }
function memo(key,build){if(!cache.has(key))cache.set(key,build());return cache.get(key)}
function mosaic(g,image,rows,x=0,y=0,size=16){g.imageSmoothingEnabled=false;rows.forEach((row,r)=>row.forEach((n,c)=>{if(n>=0)g.drawImage(crop(image,n),x+c*size,y+r*size,size,size)}))}
function shadow(g,x,y,w,h){g.fillStyle='#234d3230';g.beginPath();g.ellipse(x,y,w,h,0,0,Math.PI*2);g.fill()}
function plank(g,x,y,w,h){g.fillStyle='#513d36';g.fillRect(x,y,w,h);g.fillStyle='#bc8060';g.fillRect(x+1,y+1,w-2,h-3);g.fillStyle='#e2ac78';g.fillRect(x+1,y+1,w-2,1)}
export function bakeTerrain(map,W,H,seed,season=0){
 if(!ready)return B.bakeTerrain(map,W,H,seed,season)
 const c=canvas(W*16,H*16),g=c.getContext('2d'),r=B.rng(seed),grass=['#89bb66','#78ac60','#bdb16b','#c8d6ca'][season]
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const k=map[y][x],X=x*16,Y=y*16
  g.fillStyle=k==='~'?B.C.w1:k===','?'#e8ca94':k==='='?'#d8ad77':grass;g.fillRect(X,Y,16,16)
  if(k==='#'){g.drawImage(crop(town,109),X,Y);continue}
  if(k==='~'){
   const shore=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>map[y+dy]?.[x+dx]&&map[y+dy][x+dx]!=='~')
   if(shore){g.fillStyle='#74bfbf';g.fillRect(X,Y,16,16);g.fillStyle='#b9dcd0';if(map[y-1]?.[x]&&map[y-1][x]!=='~')g.fillRect(X,Y,16,2);if(map[y+1]?.[x]&&map[y+1][x]!=='~')g.fillRect(X,Y+14,16,2)}
   if(r()<.09){g.fillStyle='#8fced0';g.fillRect(X+3,Y+9,5,1)}
  }else if(k==='.'&&r()<.15){g.fillStyle=season===3?'#eff3dc':'#accf83';g.fillRect(X+4,Y+6,2,1);g.fillRect(X+5,Y+5,1,1)}
  else if(k==='='&&r()<.16){g.fillStyle='#efd5a2';g.fillRect(X+5,Y+9,2,1)}
 }
 return c
}
export function bakeHouse(level=0){return !ready?B.bakeHouse(level):memo('house'+level,()=>{
 const c=canvas(80,72),g=c.getContext('2d');shadow(g,40,68,36,3)
 mosaic(g,town,[[52,53,54,55],[64,65,66,67],[76,77,78,79],[88,89,90,91]],8,2)
 plank(g,29,64,25,5);g.fillStyle='#557e4f';g.fillRect(9,54,10,7);g.fillRect(62,54,10,7);g.fillStyle='#e7b76b';g.fillRect(11,52,3,3);g.fillRect(65,52,3,3)
 if(level>0){g.fillStyle='#f6dc88';for(let i=0;i<Math.min(level,5);i++)g.fillRect(25+i*6,42,3,3)}return c
})}
export function bakeBarn(){return !ready?B.bakeBarn():memo('barn',()=>{
 const c=canvas(72,64),g=c.getContext('2d');shadow(g,36,60,33,3)
 mosaic(g,farm,[[90,91,92],[102,103,104],[114,115,116]],12,10)
 g.fillStyle='#2d584d';g.beginPath();g.moveTo(7,12);g.lineTo(36,0);g.lineTo(65,12);g.fill();plank(g,22,57,28,4);return c
})}
export function bakeStall(){return !ready?B.bakeStall():memo('stall',()=>{
 const c=canvas(80,64),g=c.getContext('2d');shadow(g,40,61,37,3)
 plank(g,8,10,4,47);plank(g,68,10,4,47)
 g.fillStyle='#e9d8b3';g.fillRect(3,4,74,16)
 for(let i=0;i<6;i++){g.fillStyle=i%2?'#f6ead3':'#c97957';g.fillRect(4+i*12,5,12,14);g.fillRect(4+i*12,19,12,4)}
 mosaic(g,farm,[[98,99,110,111]],8,42)
 g.fillStyle='#785d48';g.fillRect(6,41,68,3);g.fillStyle='#f1c374';g.fillRect(7,41,66,1);return c
})}
export function bakeBoard(){return !ready?B.bakeBoard():memo('board',()=>{const c=canvas(28,30),g=c.getContext('2d');plank(g,12,16,4,14);plank(g,1,1,26,21);g.fillStyle='#f5e8c8';g.fillRect(4,4,20,14);g.fillStyle='#8b6750';g.fillRect(6,7,15,1);g.fillRect(6,11,10,1);g.fillRect(6,14,13,1);return c})}
export function bakeGate(){return !ready?B.bakeGate():memo('gate',()=>{const c=canvas(48,52),g=c.getContext('2d');mosaic(g,town,[[96,97,98],[108,111,112],[120,123,124]],0,0);g.fillStyle='#bb6758';g.fillRect(2,2,6,17);g.fillRect(40,2,6,17);return c})}
export function bakeMine(){return !ready?B.bakeMine():memo('mine',()=>{const c=canvas(64,56),g=c.getContext('2d');mosaic(g,town,[[96,97,97,98],[108,111,112,110],[120,123,124,122]],0,4);g.drawImage(crop(town,114),2,32);return c})}
export function bakeAnvil(){return !ready?B.bakeAnvil():memo('anvil',()=>{const c=canvas(28,22),g=c.getContext('2d');plank(g,7,13,15,8);g.drawImage(crop(town,127),6,0);return c})}
export function bakeDock(len){return !ready?B.bakeDock(len):memo('dock'+len,()=>{const c=canvas(len*16,40),g=c.getContext('2d');for(let x=0;x<c.width;x+=8){plank(g,x,2,8,27);if(x%32===0){g.fillStyle='#64483e';g.fillRect(x+2,27,4,11)}}g.fillStyle='#e5be89';g.fillRect(0,2,c.width,2);return c})}
export function bakeFence(w,h){return !ready?B.bakeFence(w,h):memo('fence'+w+':'+h,()=>{const c=canvas(w*16+4,h*16+8),g=c.getContext('2d');for(let x=0;x<w;x++){g.drawImage(crop(town,45+x%3),x*16,0);if(x!==Math.floor(w/2)&&x!==Math.floor(w/2)-1)g.drawImage(crop(town,45+x%3),x*16,h*16-8)}for(let y=1;y<h;y++){g.drawImage(crop(town,47),0,y*16);g.drawImage(crop(town,47),w*16-12,y*16)}return c})}
export function bakeDecor(ctx,items){if(!ready)return B.bakeDecor(ctx,items);for(const [kind,x,y,seed=0,v=0] of items){
 if(kind==='tree'){const index=v===1?3:seed%3?4:5;ctx.drawImage(crop(town,index,16,32),x,y-2)}
 else if(kind==='bush')ctx.drawImage(crop(town,16),x,y)
 else if(kind==='rock')ctx.drawImage(crop(farm,89),x,y)
 else if(kind==='flowers')ctx.drawImage(crop(town,29),x,y)
 else if(kind==='trough'){ctx.drawImage(crop(farm,110,32,16),x,y);ctx.drawImage(crop(farm,96),x+32,y-5)}
 else if(kind==='bench')ctx.drawImage(crop(farm,98,32,16),x,y)
 else if(kind==='lily')ctx.drawImage(crop(farm,16),x-8,y-3)
 else if(kind==='palm')ctx.drawImage(crop(town,3,16,32),x+2,y)
 else if(kind==='shell'){ctx.fillStyle=seed%2?'#f7e7c2':'#deb899';ctx.fillRect(x,y,3,2)}
 else B.bakeDecor(ctx,[[kind,x,y,seed,v]])
}}
export function soil(wet,seed=1){return !ready?B.soil(wet,seed):memo('soil'+wet+seed%3,()=>{const c=canvas(16,16),g=c.getContext('2d');g.fillStyle=wet?'#86604c':'#ba8256';g.fillRect(0,1,16,15);for(let y=4;y<16;y+=4){g.fillStyle=wet?'#a07958':'#d7a36e';g.fillRect(2,y,12,1)}g.fillStyle='#e2c382';g.fillRect(0,0,16,1);return c})}
export function mineRock(kind,seed){return !ready?B.mineRock(kind,seed):memo('rock'+kind,()=>{const c=canvas(18,16),g=c.getContext('2d');g.drawImage(crop(farm,89),1,0);g.fillStyle={coal:'#3c3b4b',copper:'#d58b58',iron:'#b5c9cc',gold:'#efc568',amethyst:'#a67dc8',emerald:'#76c09a',ruby:'#d5687d',diamond:'#b3e7ed'}[kind]||'#b3e7ed';g.fillRect(5,6,3,4);g.fillRect(11,9,2,3);return c})}
export function bakeCave(W,H,seed){if(!ready)return B.bakeCave(W,H,seed);const c=canvas(W*16,H*16),g=c.getContext('2d'),r=B.rng(seed);g.fillStyle='#494b63';g.fillRect(0,0,c.width,c.height);for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(y===0||x===0||x===W-1||y===H-1)g.drawImage(crop(town,109),x*16,y*16);else if(r()<.2){g.fillStyle='#62667c';g.fillRect(x*16+4,y*16+6,5,1)}}return c}
export function drawMerchant(g,x,y,tm=0){if(!merchant)return;g.imageSmoothingEnabled=true;const h=74,w=merchant.width/merchant.height*h;g.drawImage(merchant,x-w/2,y-h+Math.sin(tm/2000)*.3,w,h);g.imageSmoothingEnabled=false}
export function itemSpr(id){if(!ready)return B.itemSpr(id);return memo('item'+id,()=>{
 if(objectImages.has(id))return logicalSprite(objectImages.get(id))
 const animal={sardine:62,carp:64,bass:60,salmon:63,tuna:72,puffer:65,whale:73,squid:67}
 if(id in animal)return sprite(creatures,animal[id])
 if(['coal','copper','iron','gold','amethyst','emerald','ruby','diamond'].includes(id))return mineRock(id,0)
 if(CROP[id])return CROP[id][3]
 const goods={egg:125,duckegg:125,milk:123,wool:120,truffle:79,feed:74,bait:81,coffee:126,seed:9,trap:76}
 if(id in goods)return sprite(farm,goods[id])
 const tools={hoe:114,pick:114,rod:119,bag:96,spr:130,house:90,barn:94,coin:93,ladder:104}
 if(id in tools)return sprite(town,tools[id])
 return B.itemSpr(id)
})}
export function itemIcon(id,scale=3){if(objectURLs.has(id))return objectURLs.get(id);if(!ready)return B.itemIcon(id,scale);const key=id+':'+scale;if(!icons.has(key)){const s=itemSpr(id),c=canvas(s.width*scale,s.height*scale),g=c.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(s,0,0,c.width,c.height);icons.set(key,c.toDataURL())}return icons.get(key)}
