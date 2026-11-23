// 大肥鱼修仙记 · 炼丹：守火候小游戏。点击 / 轻触 / 空格 = 添柴；指针落在青色火候带里越久，成色越好。
// 服务端只认「起炉到出炉至少 BREW_MIN 秒」和成色上限，客户端成绩只决定 0–2 档。
import {h} from './ui.js?v=20b20a0e';
export const BREW_GAME=18;
export function pillIcon(color){return size=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),gr=g.createRadialGradient(24,22,4,32,32,26);gr.addColorStop(0,'#fff');gr.addColorStop(.35,color);gr.addColorStop(1,'#3b2412');g.fillStyle=gr;g.beginPath();g.arc(32,34,22,0,7);g.fill();g.strokeStyle='#3b2412';g.lineWidth=3;g.stroke();c.style.width=c.style.height=size+'px';return c}}
export const PILL_COLORS={huiling:'#5fd4ff',peiyuan:'#ffb347'};
export function playBrew(root,{name,img}){return new Promise(done=>{
 const el=h('div','xs-ui xs-brew'),cv=h('canvas','xs-brew-cv'),tip=h('p','xs-brew-tip','点击添柴，让火候指针停在青色带里'),title=h('b',null,'炼制 · '+name);
 el.append(h('div','xs-brew-box',title,cv,tip));root.append(el);const g=cv.getContext('2d'),W=300,H=360,dpr=Math.min(2,devicePixelRatio||1);cv.width=W*dpr;cv.height=H*dpr;cv.style.width=W+'px';cv.style.height=H+'px';
 let heat=.35,vel=0,t=0,inZone=0,last=performance.now(),raf=0,flash=0,gust=0,sparks=[];
 const poke=e=>{e?.preventDefault?.();vel+=.42;flash=.25;for(let i=0;i<6;i++)sparks.push({x:150+(Math.random()-.5)*60,y:300,vx:(Math.random()-.5)*80,vy:-60-Math.random()*90,l:.6})};
 const key=e=>{if(e.key===' '||e.key==='Enter'){poke(e)}};el.addEventListener('pointerdown',poke);document.addEventListener('keydown',key,true);
 const zone=()=>{const c=.55+Math.sin(t*.55)*.18+Math.sin(t*1.3)*.05;return[c-.11,c+.11]};
 const frame=n=>{const dt=Math.min(.05,(n-last)/1000);last=n;t+=dt;
  if(Math.random()<dt*.35)gust=(Math.random()-.5)*.9;gust*=1-dt*2;
  vel-=(.55+heat*.35)*dt;vel+=gust*dt;vel*=1-dt*1.8;heat=Math.max(0,Math.min(1,heat+vel*dt));if(heat<=0||heat>=1)vel*=-.3;
  const[z0,z1]=zone(),ok=heat>=z0&&heat<=z1;if(ok)inZone+=dt;flash=Math.max(0,flash-dt);
  g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,W,H);
  // 丹炉
  if(img)g.drawImage(img,610,150,320,290,0,58,250,226);else{g.fillStyle='#c58a2c';g.beginPath();g.ellipse(150,200,85,70,0,0,7);g.fill()}
  g.fillStyle='rgba(255,140,40,'+(heat*.35)+')';g.beginPath();g.ellipse(125,268,90,28,0,0,7);g.fill();const fire=.4+heat*.9;for(let i=0;i<7;i++){const fx=70+i*18,fh=(18+Math.sin(t*9+i*2)*6)*fire;g.fillStyle=heat>.85?'rgba(255,80,48,.9)':'rgba(255,176,48,.9)';g.beginPath();g.moveTo(fx-8,280);g.quadraticCurveTo(fx,280-fh*2,fx+8,280);g.fill()}
  for(const s of sparks){s.l-=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;g.fillStyle='rgba(255,220,120,'+Math.max(0,s.l)+')';g.fillRect(s.x,s.y,3,3)}sparks=sparks.filter(s=>s.l>0);
  if(ok){g.fillStyle='rgba(140,255,230,.55)';for(let i=0;i<3;i++){const a=t*2+i*2;g.beginPath();g.arc(125+Math.cos(a)*30,108-((t*40+i*30)%60),5,0,7);g.fill()}}
  // 火候尺
  const bx=262,by=30,bh=290;g.fillStyle='#2a170a';g.fillRect(bx-4,by-4,28,bh+8);g.fillStyle='#5a3a1a';g.fillRect(bx,by,20,bh);
  g.fillStyle='rgba(80,230,200,.85)';g.fillRect(bx,by+bh*(1-z1),20,bh*(z1-z0));g.fillStyle='rgba(255,80,40,.6)';g.fillRect(bx,by,20,bh*.08);
  const ny=by+bh*(1-heat);g.fillStyle=ok?'#fff':'#ffd24a';g.beginPath();g.moveTo(bx-12,ny);g.lineTo(bx-2,ny-7);g.lineTo(bx-2,ny+7);g.fill();
  // 进度
  const left=Math.max(0,BREW_GAME-t),score=inZone/Math.max(1,t);g.fillStyle='#3b2412';g.font='bold 15px system-ui';g.textAlign='left';g.fillText('剩余 '+left.toFixed(1)+' 秒',12,24);g.fillText('火候 '+Math.round(score*100)+'%',12,46);
  {const fr=Math.min(1,inZone/BREW_GAME);g.fillStyle='#5a3a1a';g.fillRect(12,306,236,16);g.fillStyle='#6fe0c0';g.fillRect(12,306,236*fr,16);g.fillStyle='#3b2412';for(const m of[.4,.7]){g.fillRect(12+236*m-1,302,2,24)}g.font='12px system-ui';g.fillText('丹气（过 40% 良品，过 70% 上品）',12,342)}
  if(flash){g.fillStyle='rgba(255,200,80,'+flash+')';g.fillRect(0,0,W,H)}
  if(t>=BREW_GAME){cancelAnimationFrame(raf);document.removeEventListener('keydown',key,true);const frac=inZone/BREW_GAME,q=frac>=.7?2:frac>=.4?1:0;tip.textContent=['火候欠佳……','火候不错！','火候完美！'][q];setTimeout(()=>{el.remove();done({q,frac})},900);return}
  raf=requestAnimationFrame(frame)};
 raf=requestAnimationFrame(frame);
})}
