// 鱼鱼谷游乐馆 · 规则与物理（纯函数，前端与 Worker 共用）。存档在小岛状态 JSON 的 state.arc，榜单写 state.b9Rank。
// 确定性：每一击的初速度在出手时量化到 0.001；逐帧只用加减乘除和开方，前端与服务端算出同一结果，服务端分数为准。
export const ARC_VERSION=1;
export const GAMES={
 bounce:{name:'弹弹乐',daily:10,shots:5,desc:'全屏玩：像站宠一样抓住大肥鱼一甩，整个浏览器窗口就是墙。四边藏着看不见的机关，撞到才现身；屏幕中间的道具框撞碎有惊喜。一甩里反弹越多倍率越高。每局 5 甩。'},
 pool:{name:'鲸鱼桌球',daily:10,shots:6,desc:'全屏球台：拉开弹弓把大肥鱼射出去，把群友头像球撞进窗口四角和两边的漩涡洞。一杆连进有连击加成，金色头像球 3 倍分；大肥鱼自己掉洞扣 50。每局 6 杆。'},
 bowl:{name:'鲸鱼保龄',daily:10,shots:10,desc:'全屏球道：把大肥鱼滚向 10 个头像瓶，左右拨动可以加旋转打弧线。共 5 轮，每轮 2 投；全中 30 分（连续全中每次再多 10），补中 20 分。'},
};
export const DT=1/120;
const MAX_STEPS=120*9;
const q3=v=>Math.round(v*1000)/1000;
export function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6d2b79f5)>>>0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
// ---------------- 场地 ----------------
export const POOL={W:540,H:960,x0:8,x1:532,y0:8,y1:952,R:22,r:17,pockets:[[20,20,32],[520,20,32],[20,940,32],[520,940,32],[10,480,30],[530,480,30]],start:[270,730]};
export const BOWL={W:540,H:960,lane0:125,lane1:415,wall0:93,wall1:447,R:24,r:15,start:[270,852],pinY:182.5,gapX:46,gapY:25.8};
// 弹弹乐场地 = 玩家屏幕上的游戏区（开局时上报宽高）；大肥鱼按站宠的命中框算身体，物理参数与站宠一致（空气阻力 2.2、碰边回弹 0.6、最高 2400px/s）
export const FLING={drag:2.2,bounce:.6,maxSpeed:2400,deadZone:450,stopSpeed:25};
export const SECRET_PTS=[40,50,30,60,80,40,100,30],BOX={mystery:{hp:1,e:.7},chest:{hp:2,e:.7},bubble:{hp:1,e:.9},ice:{hp:2,e:.6},gift:{hp:1,e:.7},spring:{hp:0,e:1.25}};
// 为了榜单公平，弹弹乐用固定 1280×720 的场地，前端按屏幕等比铺满（竖屏时转 90°）
export const BOUNCE_DIMS={w:1280,h:720};
export const fishSize=(W,H)=>{const VW=Math.round(Math.max(170,Math.min(300,Math.min(W,H)*.34)));return {VW,hx:VW*.1875,hy:VW*.2227,cy:VW*.3008,r:VW*.19}};
const POOL_DRAG=Math.exp(-0.55*DT),BOWL_DRAG=Math.exp(-0.12*DT),PIN_DRAG=Math.exp(-2.4*DT),BOUNCE_DRAG=Math.exp(-2.2*DT);
function body(x,y,r,m,extra){return{x,y,vx:0,vy:0,r,m,on:1,...extra}}
export function setup(g,seed,dims){
 const R=rng(seed),w={g,seed,shot:0,score:0,log:[],moving:false,events:[]};
 if(g==='pool'){const P=POOL;w.fish=body(P.start[0],P.start[1],P.R,1.5);w.balls=[];let k=0;
  for(let row=0;row<4;row++)for(let i=0;i<=row;i++)w.balls.push(body(270+(i-row/2)*35,300-row*30.5,P.r,1,{id:k++}));
  w.gold=Math.floor(R()*w.balls.length);w.balls[w.gold].gold=1;w.combo=0;w.potted=0}
 if(g==='bowl'){const B=BOWL;w.fish=body(B.start[0],B.start[1],B.R,2.2);w.streak=0;w.frame=0;w.roll=0;w.frames=[];w.pins=[];
  for(let row=0;row<4;row++)for(let i=0;i<=row;i++){const x=270+(i-row/2)*B.gapX,y=B.pinY-row*B.gapY;w.pins.push(body(x,y,B.r,.8,{sx:x,sy:y,id:w.pins.length}))}
  w.spin=0;w.gutter=0}
 if(g==='bounce'){dims=BOUNCE_DIMS;const W=dims.w,H=dims.h,F=fishSize(W,H);w.W=W;w.H=H;w.F=F;w.fish=body(W/2,H-F.hy-12,F.r,1);w.items=[];w.boxes=[];w.secrets=[];w.R=rng(seed^0x2545f491);
  // 四边的隐藏机关：每条边按长度分段，平时看不见，撞到现身，再撞升级
  for(const side of ['T','R','B','L']){const len=side==='T'||side==='B'?W:H,n=Math.max(2,Math.round(len/280));for(let i=0;i<n;i++){const seg=len/n,c=seg*(i+.25+R()*.5),kind=Math.floor(R()*8);w.secrets.push({id:w.secrets.length,side,c:Math.round(c),hl:Math.round(55+R()*35),kind,pts:SECRET_PTS[kind],st:0,last:-1})}}
  w.corners={};const kinds=Object.keys(BOX),nb=Math.max(4,Math.min(10,Math.round(W*H/110000)));for(let i=0;i<nb;i++)addBox(w,R,kinds[Math.floor(R()*kinds.length)]);
  w.bounces=0;w.flingPts=0;w.flight=0;w.bonus=0;w.wallT={x:-9,y:-9}}
 return w;
}
function addBox(w,R,kind){const F=w.F,r=34;for(let t=0;t<80;t++){const x=Math.round(r+40+R()*(w.W-2*r-80)),y=Math.round(r+40+R()*(w.H-2*r-80-F.hy));
  if(Math.hypot(x-w.fish.x,y-w.fish.y)>r+F.hy+50&&w.boxes.every(o=>!o.on||Math.hypot(o.x-x,o.y-y)>o.r+r+30)&&w.items.every(o=>!o.on||Math.hypot(o.x-x,o.y-y)>r+o.r+10)){
   w.boxes.push({id:w.boxes.length,kind,x,y,r,hp:BOX[kind].hp,on:1,prize:[30,60,90,150][Math.floor(R()*4)],last:-1});return true}}return false}
// 出手：a 角度（弧度），p 力度 0–1，s 旋转 -1–1（只有保龄用）
export function validShot(s,g){if(!Array.isArray(s)||!s.every(v=>typeof v==='number'&&Number.isFinite(v)))return false;if(g==='bounce')return s.length===4&&Math.abs(s[2])<=2400&&Math.abs(s[3])<=2400;return s.length>=2&&s.length<=3&&s[1]>=0&&s[1]<=1&&Math.abs(s[0])<=7&&(s.length<3||Math.abs(s[2])<=1)}
export function totalShots(w){return w.g==='bowl'?null:GAMES[w.g].shots}
export function over(w){if(w.g==='bowl')return w.frame>=5;if(w.g==='pool'&&w.balls.every(b=>!b.on))return true;return w.shot>=GAMES[w.g].shots}
export function shoot(w,s){
 if(w.moving||over(w)||!validShot(s,w.g))return false;
 if(w.g==='bounce'){const F=w.F,f=w.fish;const x=q3(s[0]),y=q3(s[1]);let vx=q3(s[2]),vy=q3(s[3]);const sp=Math.hypot(vx,vy);
  if(x<F.hx-1||x>w.W-F.hx+1||y<F.hy-1||y>w.H-F.hy+1||sp<FLING.deadZone)return false;if(sp>FLING.maxSpeed){vx=q3(vx*FLING.maxSpeed/sp);vy=q3(vy*FLING.maxSpeed/sp)}
  f.x=x;f.y=y;f.vx=vx;f.vy=vy;w.bounces=0;w.flingPts=0;w.flight=0;w.bonus=0;w.wallT={x:-9,y:-9};w.corners={};w.moving=true;w.steps=0;w.shot++;w.log.push([x,y,vx,vy]);return true}
 const a=q3(s[0]),p=q3(s[1]),spin=q3(s[2]||0),f=w.fish;
 const sp=w.g==='pool'?q3(120+p*1580):w.g==='bowl'?q3(420+p*900):q3(160+p*2440);
 f.vx=q3(Math.cos(a)*sp);f.vy=q3(Math.sin(a)*sp);
 if(w.g==='bowl'){if(f.vy>-120)f.vy=-120;w.spin=spin;w.gutter=0}
 if(w.g==='pool'){w.combo=0}
 w.moving=true;w.steps=0;w.shot++;w.log.push([a,p,spin]);return true;
}
function wallBounce(o,x0,x1,y0,y1,e){let hit=0;
 if(o.x-o.r<x0){o.x=x0+o.r;o.vx=-o.vx*e;hit=1}else if(o.x+o.r>x1){o.x=x1-o.r;o.vx=-o.vx*e;hit=1}
 if(o.y-o.r<y0){o.y=y0+o.r;o.vy=-o.vy*e;hit=1}else if(o.y+o.r>y1){o.y=y1-o.r;o.vy=-o.vy*e;hit=1}
 return hit}
function collide(a,b,e){const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy,rr=a.r+b.r;if(d2>=rr*rr||d2===0)return 0;
 const d=Math.sqrt(d2),nx=dx/d,ny=dy/d,ov=rr-d,im=1/a.m+1/b.m;a.x-=nx*ov*(1/a.m)/im;a.y-=ny*ov*(1/a.m)/im;b.x+=nx*ov*(1/b.m)/im;b.y+=ny*ov*(1/b.m)/im;
 const rv=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(rv>0)return 1;const j=-(1+e)*rv/im;a.vx-=j*nx/a.m;a.vy-=j*ny/a.m;b.vx+=j*nx/b.m;b.vy+=j*ny/b.m;return 1+Math.min(3,-rv/400)}
function slow(o,k,lin){o.vx*=k;o.vy*=k;const s2=o.vx*o.vx+o.vy*o.vy;if(s2<=lin*lin){o.vx=0;o.vy=0}else if(lin){const s=Math.sqrt(s2),f=(s-lin)/s;o.vx*=f;o.vy*=f}}
const speed2=o=>o.vx*o.vx+o.vy*o.vy;
// 走一步；返回本步事件 [{t:'wall'|'hit'|'pot'|'item'|'bump'|'pin'|'gutter', ...}]
export function step(w){
 if(!w.moving)return [];const ev=[],f=w.fish;w.steps++;
 if(w.g==='pool'){const P=POOL,all=[f,...w.balls].filter(o=>o.on);
  for(const o of all){o.x+=o.vx*DT;o.y+=o.vy*DT}
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){const h=collide(all[i],all[j],.95);if(h)ev.push({t:'hit',x:(all[i].x+all[j].x)/2,y:(all[i].y+all[j].y)/2,k:h})}
  for(const o of all){let pot=null;for(const [px,py,pr] of P.pockets){const dx=o.x-px,dy=o.y-py;if(dx*dx+dy*dy<pr*pr){pot=[px,py];break}}
   if(pot){o.on=0;o.vx=0;o.vy=0;o.x=pot[0];o.y=pot[1];
    if(o===f){w.score-=50;ev.push({t:'pot',fish:1,x:pot[0],y:pot[1],pts:-50})}
    else{w.combo++;w.potted++;const pts=(o.gold?300:100)*w.combo;w.score+=pts;ev.push({t:'pot',id:o.id,gold:o.gold||0,combo:w.combo,x:pot[0],y:pot[1],pts})}continue}
   if(wallBounce(o,P.x0,P.x1,P.y0,P.y1,.8)&&speed2(o)>900)ev.push({t:'wall',x:o.x,y:o.y,fish:o===f?1:0});
   slow(o,POOL_DRAG,150*DT)}
  if(all.every(o=>!o.on||speed2(o)===0)||w.steps>=MAX_STEPS)settle(w,ev)}
 if(w.g==='bowl'){const B=BOWL,pins=w.pins.filter(p=>p.on);
  if(!w.gutter&&f.y>B.pinY+30&&f.y<B.start[1]-40)f.vx+=w.spin*240*DT;
  f.x+=f.vx*DT;f.y+=f.vy*DT;for(const p of pins){p.x+=p.vx*DT;p.y+=p.vy*DT}
  if(!w.gutter&&(f.x<B.lane0||f.x>B.lane1)){w.gutter=f.x<B.lane0?-1:1;f.x=w.gutter<0?B.wall0+f.r-2:B.wall1-f.r+2;f.vx=0;ev.push({t:'gutter',x:f.x,y:f.y})}
  if(!w.gutter)for(const p of pins){const h=collide(f,p,.7);if(h)ev.push({t:'pin',x:p.x,y:p.y,k:h})}
  for(let i=0;i<pins.length;i++)for(let j=i+1;j<pins.length;j++){const h=collide(pins[i],pins[j],.6);if(h)ev.push({t:'pin',x:pins[i].x,y:pins[i].y,k:h*.6})}
  for(const p of pins){if(p.x<B.wall0||p.x>B.wall1||p.y<0){p.vx=0;p.vy=0}slow(p,PIN_DRAG,220*DT)}
  slow(f,BOWL_DRAG,30*DT);
  const fishDone=f.y<-40||speed2(f)===0||(f.y<B.pinY-140);
  if((fishDone&&pins.every(p=>speed2(p)===0))||w.steps>=MAX_STEPS)settle(w,ev)}
 if(w.g==='bounce'){const F=w.F,e=FLING.bounce,mult=()=>1+.5*w.bounces+w.bonus,gain=(pts,o)=>{const v=Math.floor(pts*mult());w.score+=v;w.flingPts+=v;return v};
  f.vx*=BOUNCE_DRAG;f.vy*=BOUNCE_DRAG;f.x+=f.vx*DT;f.y+=f.vy*DT;w.flight+=DT;const hits=[];
  if(f.x<F.hx){f.x=F.hx;f.vx=Math.abs(f.vx)*e;hits.push('L')}else if(f.x>w.W-F.hx){f.x=w.W-F.hx;f.vx=-Math.abs(f.vx)*e;hits.push('R')}
  if(f.y<F.hy){f.y=F.hy;f.vy=Math.abs(f.vy)*e;hits.push('T')}else if(f.y>w.H-F.hy){f.y=w.H-F.hy;f.vy=-Math.abs(f.vy)*e;hits.push('B')}
  for(const side of hits){w.bounces++;const along=side==='T'||side==='B'?f.x:f.y,ax=side==='L'||side==='R'?'x':'y';w.wallT[ax]=w.flight;ev.push({t:'wall',side,x:f.x,y:f.y,n:w.bounces})
   for(const sc of w.secrets){if(sc.side!==side||sc.last===w.shot||Math.abs(along-sc.c)>sc.hl+F.hx*.5)continue;if(sc.st>=2){continue}sc.st++;sc.last=w.shot;const v=gain(sc.pts*sc.st,sc);ev.push({t:'secret',id:sc.id,side,kind:sc.kind,st:sc.st,x:f.x,y:f.y,pts:v,mult:mult()})}}
  if(hits.length&&Math.abs(w.wallT.x-w.wallT.y)<.15){const key=(f.x<w.W/2?'L':'R')+(f.y<w.H/2?'T':'B');if(!w.corners[key]){w.corners[key]=1;const v=gain(60);ev.push({t:'corner',key,x:f.x,y:f.y,pts:v})}}
  for(const b of w.boxes){if(!b.on)continue;const dx=f.x-b.x,dy=f.y-b.y,rr=f.r+b.r,d2=dx*dx+dy*dy;if(d2>=rr*rr||d2===0)continue;const d=Math.sqrt(d2),nx=dx/d,ny=dy/d,vn=f.vx*nx+f.vy*ny;f.x=b.x+nx*rr;f.y=b.y+ny*rr;if(vn>=0)continue
   const be=BOX[b.kind].e;f.vx-=(1+be)*vn*nx;f.vy-=(1+be)*vn*ny;w.bounces++;const o={t:'box',id:b.id,kind:b.kind,x:b.x,y:b.y,n:w.bounces,pts:0,broke:0}
   if(b.kind==='spring'){o.pts=gain(5)}else{b.hp--;if(b.hp<=0){b.on=0;o.broke=1;
    if(b.kind==='mystery')o.pts=gain(b.prize);else if(b.kind==='chest'){o.pts=gain(60);o.coins=[];for(let k=0;k<4;k++){const a=k*Math.PI/2+.4,cx=Math.round(b.x+Math.cos(a)*70),cy=Math.round(b.y+Math.sin(a)*70);if(cx>20&&cx<w.W-20&&cy>20&&cy<w.H-20){const it={id:w.items.length,kind:'coin',x:cx,y:cy,r:16,pts:15,on:1};w.items.push(it);o.coins.push(it.id)}}}
    else if(b.kind==='bubble'){o.pts=gain(40);w.bonus+=1;o.bonus=1}else if(b.kind==='ice')o.pts=gain(100);else if(b.kind==='gift')o.pts=gain(120)}else o.crack=1}
   ev.push(o)}
  for(const it of w.items){if(!it.on)continue;const dx=f.x-it.x,dy=f.y-it.y,rr=f.r+it.r;if(dx*dx+dy*dy<rr*rr){it.on=0;const v=gain(it.pts);ev.push({t:'item',kind:it.kind,id:it.id,x:it.x,y:it.y,pts:v,mult:mult()})}}
  if(f.vx*f.vx+f.vy*f.vy<FLING.stopSpeed*FLING.stopSpeed||w.steps>=MAX_STEPS)settle(w,ev)}
 return ev;
}
function settle(w,ev){
 w.moving=false;const f=w.fish;f.vx=0;f.vy=0;
 if(w.g==='pool'){
  if(!f.on){f.on=1;let [x,y]=POOL.start;for(let k=0;k<20&&w.balls.some(b=>b.on&&Math.hypot(b.x-x,b.y-y)<b.r+f.r+2);k++)y-=40;f.x=x;f.y=y;ev.push({t:'respawn'})}
  for(const b of w.balls){b.vx=0;b.vy=0}
  if(w.balls.every(b=>!b.on)){const bonus=500+150*(GAMES.pool.shots-w.shot);w.score+=bonus;ev.push({t:'clear',pts:bonus})}}
 if(w.g==='bowl'){const B=BOWL;let down=0;
  for(const p of w.pins){if(!p.on)continue;p.vx=0;p.vy=0;if(Math.hypot(p.x-p.sx,p.y-p.sy)>13||p.x<B.lane0-4||p.x>B.lane1+4){p.on=0;down++}}
  const fr=w.frames[w.frame]||(w.frames[w.frame]=[]);fr.push(down);const left=w.pins.filter(p=>p.on).length;let end=false,pts=0,kind='';
  if(fr.length===1&&left===0){pts=30+10*w.streak;w.streak++;kind='strike';end=true}else if(fr.length===2){end=true;w.streak=0;if(left===0){pts=20;kind='spare'}else pts=fr[0]+fr[1]}
  ev.push({t:'roll',down,frame:w.frame,roll:fr.length,kind,pts:end?pts:0});
  if(end){w.score+=pts;w.frame++;for(const p of w.pins){p.on=1;p.x=p.sx;p.y=p.sy;p.vx=0;p.vy=0}}
  f.x=B.start[0];f.y=B.start[1];w.gutter=0}
 if(w.g==='bounce'){ev.push({t:'rest',pts:w.flingPts,n:w.bounces});const broken=w.boxes.filter(b=>!b.on).length,live=w.boxes.length-broken;if(broken&&live<Math.max(4,Math.min(10,Math.round(w.W*w.H/110000)))){const kinds=Object.keys(BOX);if(addBox(w,w.R,kinds[Math.floor(w.R()*kinds.length)]))ev.push({t:'spawn',id:w.boxes.length-1})}}
 ev.push({t:'settle'});
}
// 服务端：整局重放
export function replay(g,seed,shots,dims){
 if(!GAMES[g]||!Array.isArray(shots)||shots.length>GAMES[g].shots+2)return null;
 const w=setup(g,seed,dims);for(const s of shots){if(over(w))break;if(!shoot(w,s))return null;while(w.moving)step(w)}
 if(!over(w))return null;return {score:Math.max(0,Math.round(w.score)),w};
}
// ---------------- 存档动作 ----------------
const MIN_PLAY={bounce:5,pool:6,bowl:8};
export const validDims=d=>d&&Number.isInteger(d.w)&&Number.isInteger(d.h)&&d.w>=320&&d.w<=2560&&d.h>=320&&d.h<=1600;
export function arcAct(s,a,ctx){
 const fail=msg=>({a:a.a,ok:false,msg});const g=a.g,G=GAMES[g];if(!G)return fail('没有这个游戏');
 let x=s.arc;if(!x||typeof x!=='object'||x.v!==ARC_VERSION)x=s.arc={v:ARC_VERSION,d:'',n:{},best:{},cur:null,plays:0};
 if(x.d!==ctx.day){x.d=ctx.day;x.n={};x.db={}}x.db||={};
 if(a.a==='arcStart'){
  if((x.n[g]||0)>=G.daily)return fail('今天的 '+G.daily+' 次'+G.name+'已经玩完了，明天再来');
  x.n[g]=(x.n[g]||0)+1;x.plays=(x.plays||0)+1;const seed=Math.floor((ctx.rand?ctx.rand():Math.random())*2147483647)>>>0;x.cur={g,seed,t:ctx.t};
  return {a:a.a,ok:true,g,seed,left:G.daily-x.n[g],msg:G.name+'开局'};
 }
 if(a.a==='arcEnd'){
  const c=x.cur;if(!c||c.g!==g)return fail('没有进行中的'+G.name);
  if(!Array.isArray(a.shots)||!a.shots.every(s=>validShot(s,g)))return fail('出手数据无效');
  if(ctx.t-c.t<MIN_PLAY[g])return fail('太快了，这局不计分');
  const r=replay(g,c.seed,a.shots,BOUNCE_DIMS);x.cur=null;if(!r)return fail('这局没有打完，不计分');
  const sc=r.score,prevBest=x.best[g]||0,prevDay=x.db[g]||0;x.best[g]=Math.max(prevBest,sc);x.db[g]=Math.max(prevDay,sc);
  const rk=s.b9Rank&&typeof s.b9Rank==='object'?s.b9Rank:(s.b9Rank={since:ctx.t,total:{},daily:{},day:ctx.day});if(rk.day!==ctx.day){rk.day=ctx.day;rk.daily={}}rk.total||={};rk.daily||={};
  rk.daily[g]=Math.max(rk.daily[g]||0,sc);rk.total[g]=Math.max(rk.total[g]||0,sc);
  return {a:a.a,ok:true,g,score:sc,best:x.best[g],dayBest:x.db[g],newBest:sc>prevBest,newDay:sc>prevDay,left:G.daily-(x.n[g]||0),msg:G.name+' '+sc+' 分'+(sc>prevBest?'，刷新个人纪录！':'')};
 }
 return null;
}
export function arcAction(s,act,ctx){
 const a=String(act?.a||'');if(a!=='arcStart'&&a!=='arcEnd')return null;
 if(ctx.ownerId!=null||ctx.visit)return {a,ok:false,msg:'只能在自己的小岛玩'};
 return arcAct(s,{a,g:typeof act.g==='string'?act.g:'',shots:act.shots,dims:act.dims&&typeof act.dims==='object'?{w:act.dims.w,h:act.dims.h}:null},ctx);
}
