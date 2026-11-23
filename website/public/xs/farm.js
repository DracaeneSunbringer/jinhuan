// 大肥鱼修仙记 · 灵药园：田块绘制、点选、动作特效。规则在 rules.js。
import {HERBS,plotView} from './rules.js?v=20b20a0e';
const inQuad=(x,y,q)=>{let c=false;for(let i=0,j=3;i<4;j=i++){const[xi,yi]=q[i],[xj,yj]=q[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c}return c};
export class Farm{
 constructor(map,herbsImg){this.map=map;this.img=herbsImg;this.fx=[];this.weedImg=tinted(herbsImg,0,2,'saturate(.6) brightness(.75) hue-rotate(-25deg)');this.weeds=map.plots.map(p=>Array.from({length:6},(_,k)=>{const r=Math.sin(p.i*91+k*37)*43758.5453,f=r-Math.floor(r),r2=Math.sin(p.i*13+k*71)*12345.678,f2=r2-Math.floor(r2);return[p.x+(f-.5)*76,p.y+(f2-.5)*44+8,.8+f*.6]}))}
 pick(wx,wy){for(const p of this.map.plots)if(inQuad(wx,wy,p.q))return p;return null}
 // 地面层：除草前的杂草、浇过水的深色土、悬停高亮
 drawGround(g,x,hoverPlot,t){
  for(const p of this.map.plots){const s=x.plots[p.i];
   if(s.w&&s.c&&s.g<3){g.fillStyle='rgba(40,18,6,.38)';poly(g,p.q);g.fill()}
   if(s.s==='weed')for(const[wx,wy,k]of this.weeds[p.i]){const z=34*k;g.drawImage(this.weedImg,wx-z/2,wy-z*.9,z,z)};}
  if(hoverPlot){g.save();g.strokeStyle='rgba(255,236,150,'+(0.6+Math.sin(t*6)*.3)+')';g.lineWidth=3;poly(g,hoverPlot.q);g.stroke();g.restore()}
 }
 // 作物（参与 Y 排序）
 ents(x,now,t){const out=[];for(const p of this.map.plots){const s=x.plots[p.i];if(!s.c)continue;const H=HERBS[s.c],ripe=s.g>=3;
   out.push({y:p.y+14,f:g=>{const bob=ripe?Math.sin(t*3+p.i)*2:0;this.sprite(g,H.row,s.g,p.x,p.y+14+bob,[34,42,52,62][s.g]);
    if(ripe&&Math.floor(t*2+p.i)%3===0){g.fillStyle='rgba(255,250,200,.9)';const a=t*4+p.i;g.fillRect(p.x+Math.cos(a)*22,p.y-30+Math.sin(a)*8,3,3)}
    if(!s.w&&!ripe){g.fillStyle='rgba(80,170,255,.95)';g.font='bold 14px system-ui';g.textAlign='center';g.fillText('💧',p.x+26,p.y-18+Math.sin(t*4+p.i)*2)}}})}return out}
 sprite(g,row,col,x,y,size,filter){g.save();if(filter)g.filter=filter;g.drawImage(this.img,col*64,row*64,64,64,x-size/2,y-size*.9,size,size);g.restore()}
 // 特效：土块、水滴、叶片、收获飞起
 burst(kind,x,y){const n=kind==='harvest'?14:10;for(let i=0;i<n;i++){const a=-Math.PI/2+(Math.random()-.5)*2.2,v=60+Math.random()*90;
   this.fx.push({kind,x:x+(Math.random()-.5)*16,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.6+Math.random()*.3,t:0,c:kind==='hoe'?['#6b4221','#8a5a2b','#4c2e14'][i%3]:kind==='water'?['#9fe0ff','#5cc0ff','#ffffff'][i%3]:kind==='plant'?['#8fdc5a','#5ba83a','#d8f2a0'][i%3]:['#ffe27a','#fff6c8','#9ff0b0'][i%3]})}}
 drawFx(g,dt){for(const p of this.fx){p.t+=dt;p.vy+=280*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;g.globalAlpha=Math.max(0,1-p.t/p.life);g.fillStyle=p.c;const s=p.kind==='water'?3:4;g.fillRect(p.x-s/2,p.y-s/2,s,s)}g.globalAlpha=1;this.fx=this.fx.filter(p=>p.t<p.life)}
}
export function poly(g,q){g.beginPath();g.moveTo(q[0][0],q[0][1]);for(let i=1;i<q.length;i++)g.lineTo(q[i][0],q[i][1]);g.closePath()}
export function herbIcon(img,row,col=3){return size=>{const c=document.createElement('canvas');c.width=c.height=64;c.getContext('2d').drawImage(img,col*64,row*64,64,64,0,0,64,64);c.style.width=c.style.height=size+'px';c.className='xs-icon';return c}}
export {plotView};
function tinted(img,row,col,filter){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.filter=filter;x.drawImage(img,col*64,row*64,64,64,0,0,64,64);return c}
