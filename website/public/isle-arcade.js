// 鱼鱼谷 · 游乐馆（全屏版）：弹弹乐 / 鲸鱼桌球 / 鲸鱼保龄。开局后整个浏览器窗口就是场地，背景页面模糊，Esc 随时退出。
// 大肥鱼只用站宠原有的动作视频，手感与站宠一致（空气阻力 2.2、碰边回弹 0.6）。物理与计分在 /arcade-rules.js，服务端按出手记录重放给出最终分数。
import * as A from '/arcade-rules.js?v=472f7fbf'
{if(!document.querySelector('link[data-arc]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/isle-arcade.css?v=472f7fbf';l.dataset.arc='1';document.head.append(l)}}
const el=(tag,attrs={},...kids)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs||{})){if(v==null||v===false)continue;if(k==='class')n.className=v;else if(k==='text')n.textContent=v;else if(k==='style')n.style.cssText=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else n.setAttribute(k,v===true?'':v)}for(const c of kids.flat(Infinity))if(c!=null&&c!==false)n.append(c instanceof Node?c:document.createTextNode(String(c)));return n}
const put=(n,...k)=>n.replaceChildren(...k.flat(Infinity).filter(x=>x!=null&&x!==false))
const fmt=n=>Math.round(n).toLocaleString('zh-CN')
const ART='/pets/dsh/isle/art/'
const ICON={bounce:'🫧',pool:'🎱',bowl:'🎳'}
const FACES=20
// 美术：道具框/特效/边缘机关/球台零件/界面（站长 2026-11-13 出图）；表情符号只作加载失败时的兜底
const AV='?v=d69c0fb5'
const IMGS={faces:'arc-faces.webp',boxes:'arc-boxes.webp',fx:'arc-fx.webp',sec:'arc-secrets.webp',pf:'arc-poolfx.webp',p1:'arc-ui-plate1.webp',p2:'arc-ui-plate2.webp',p3:'arc-ui-plate3.webp'}
const BOX_ROW={mystery:0,chest:1,bubble:2,ice:3,gift:4,spring:5},FX={star:0,heart:1,splash:2,coin:3,confetti:4,wave:5}
const SECRET_EMO=['🐳','🐚','🎐','💎','🧰','🏮','🌈','🦀'],BOX_EMO={mystery:'❓',chest:'🧰',bubble:'🐟',ice:'⭐',gift:'🎁',spring:'🍄'},BOX_COL={mystery:['#ffd6f0','#ff8fc8'],chest:['#ffe4a8','#d9932f'],bubble:['#d9f6ff','#7fd3ff'],ice:['#e6fbff','#8fdcf0'],gift:['#ffe0e6','#ff7f9d'],spring:['#fff0d6','#ff9f5a']}
const loadImg=src=>new Promise(ok=>{const i=new Image();i.decoding='async';i.onload=()=>ok(i);i.onerror=()=>ok(null);i.src=src})
let IM=null,manifest=null
const getManifest=async()=>manifest??=await fetch('/pets/dsh/manifest.json',{cache:'force-cache'}).then(r=>r.json()).catch(()=>({actions:[]}))

export async function openArcade(host,isle,{toast}={}){
 const say=(m,k)=>toast?toast(m,k):null
 if(getComputedStyle(host).position==='static')host.style.position='relative'
 const root=el('div',{class:'arc-root'}),box=el('div',{class:'arc-box'});root.append(box);host.append(root)
 let closed=false,stopGame=null
 const close=()=>{if(closed)return;closed=true;stopGame?.();root.remove();document.removeEventListener('keydown',onKey,true);isle.refresh?.()}
 const onKey=e=>{if(e.key!=='Escape')return;e.preventDefault();e.stopPropagation();if(stopGame)stopGame('esc');else close()};document.addEventListener('keydown',onKey,true)
 IM??=Object.fromEntries(await Promise.all(Object.entries(IMGS).map(async([k,f])=>[k,await loadImg(ART+f+AV)])));if(closed)return
 const faces=IM.faces
 const arc=()=>{const x=isle.state?.arc;return x&&x.d===isle.day?x:{n:{},best:x?.best||{},db:{}}}
 async function rankList(g,period,into){into.textContent='读取中…';try{const r=await fetch('/api/pet/world/rank/'+g+'/'+period+'?limit=5',{credentials:'same-origin'});const j=await r.json();if(!r.ok)throw new Error(j.error||'榜单读取失败')
  put(into,j.rows.length?el('ol',{class:'arc-rank'},j.rows.map(r=>el('li',{class:r.mine?'mine':''},el('b',{text:'#'+r.place}),el('span',{text:r.name}),el('em',{text:fmt(r.value)})))):el('p',{class:'arc-muted',text:'还没有人上榜，快来抢第一！'}),j.mine&&!j.rows.some(r=>r.mine)?el('p',{class:'arc-muted',text:'我：第 '+j.mine.place+' 名 · '+fmt(j.mine.value)}):null)}catch(e){into.textContent=e.message}}
 function lobby(){stopGame=null;const x=arc()
  const cards=Object.entries(A.GAMES).map(([g,G])=>{const left=G.daily-(x.n?.[g]||0),rk=el('div',{class:'arc-rank-box'});let period='day'
   const tabs=el('div',{class:'arc-tabs'},...[['day','今日榜'],['total','总榜']].map(([p,l])=>el('button',{type:'button','aria-pressed':String(p===period),onclick:e=>{period=p;for(const b of tabs.children)b.setAttribute('aria-pressed',String(b===e.currentTarget));rankList(g,p,rk)}},l)))
   rankList(g,period,rk)
   return el('section',{class:'arc-card arc-'+g},el('div',{class:'arc-card-head'},el('span',{class:'arc-card-icon',text:ICON[g]}),el('div',{},el('b',{text:G.name}),el('small',{text:'今日剩余 '+left+' / '+G.daily+' 次'}))),
    el('p',{class:'arc-desc',text:G.desc}),el('div',{class:'arc-stats'},el('span',{text:'今日最高 '+fmt(x.db?.[g]||0)}),el('span',{text:'个人纪录 '+fmt(x.best?.[g]||0)})),
    el('button',{class:'arc-play',type:'button',disabled:left<=0,onclick:()=>play(g)},left>0?'全屏开始（用 1 次）':'今天玩完了'),tabs,rk)})
  put(box,el('header',{class:'arc-head'},el('b',{text:'🎪 鱼鱼游乐馆'}),el('small',{text:'全屏游玩 · Esc 随时退出 · 分数由服务器复算'}),el('button',{class:'arc-x',type:'button','aria-label':'关闭',onclick:close},'✕')),el('div',{class:'arc-cards'},cards))}

 async function play(g){
  // —— 全屏层：背景页面模糊，场地 = 整个窗口 ——
  const blur=el('div',{class:'arc-blur'}),cv=el('canvas',{class:'arc-cv'}),G2=cv.getContext('2d'),hud=el('div',{class:'arc-hud'}),msg=el('div',{class:'arc-msg'}),bar=el('div',{class:'arc-bar'}),bottom=el('div',{class:'arc-bottom'})
  const full=el('div',{class:'arc-full arc-full-'+g},blur,cv,hud,bar,bottom,msg);document.body.append(full)
  let dead=false,raf=0,video=null,w=null,fast=false,spin=0
  const stop=why=>{if(dead)return;dead=true;cancelAnimationFrame(raf);removeEventListener('resize',fit);document.removeEventListener('fullscreenchange',onFs);video?.destroy();if(document.fullscreenElement===full)document.exitFullscreen?.().catch(()=>{});full.remove();stopGame=null
   if(why&&w&&w.log.length&&!A.over(w)&&!busyEnd)say('这局没打完，不计分（次数已用）','warn');if(!closed)lobby()}
  stopGame=stop
  // 场地铺满浏览器窗口；需要连浏览器边框也隐藏时可点「⛶」进入系统全屏（退出系统全屏不会结束游戏）
  const onFs=()=>{fsBtn.classList.toggle('on',!!document.fullscreenElement)};document.addEventListener('fullscreenchange',onFs)
  const fsBtn=el('button',{type:'button',class:'arc-chip',onclick:()=>{if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});else full.requestFullscreen?.().catch(()=>{})}},'⛶')
  const spinVal=el('span',{text:'直线'})
  if(g==='bowl')put(bottom,el('label',{class:'arc-spin'},'旋转',el('input',{type:'range',min:-1,max:1,step:.1,value:0,oninput:e=>{spin=+e.target.value;spinVal.textContent=spin>0?'右旋 '+spin.toFixed(1):spin<0?'左旋 '+(-spin).toFixed(1):'直线'}}),spinVal))
  put(bar,
   g!=='bounce'?el('button',{type:'button',class:'arc-chip',title:'快进',onclick:e=>{fast=!fast;e.currentTarget.classList.toggle('on',fast)}},'⏩'):null,
   full.requestFullscreen?fsBtn:null,el('button',{type:'button',class:'arc-chip arc-exit',onclick:()=>stop('btn')},'✕ 退出'))
  hud.textContent='开局中…'
  await new Promise(r=>setTimeout(r,380));if(dead||closed)return
  const vw=()=>Math.floor(visualViewport?.width||innerWidth),vh=()=>Math.floor(visualViewport?.height||innerHeight)
  let r;try{await isle.flush?.();r=await isle.actNow({a:'arcStart',g})}catch(e){say(e.message||'开局失败','err');stop();return}
  if(dead||closed)return
  w=A.setup(g,r.seed)
  if(/arcdebug/.test(location.search))window.__arc={w,get T(){return T},get video(){return video}}
  const faceOf=[];for(let i=0;i<10;i++)faceOf.push((r.seed+i*7)%FACES)
  // —— 坐标：弹弹乐是 1280×720 横场，桌球/保龄是 540×960 竖场；屏幕方向不同时转 90° 铺满 ——
  const LW=g==='bounce'?1280:540,LH=g==='bounce'?720:960
  let dpr=Math.min(2,devicePixelRatio||1),T={s:1,ox:0,oy:0,rot:false}
  function fit(){const W=vw(),H=vh();cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);cv.style.width=W+'px';cv.style.height=H+'px'
   {const rot=(LW>LH)!==(W>H),s=rot?Math.min(W/LH,H/LW):Math.min(W/LW,H/LH),cw=(rot?LH:LW)*s,ch=(rot?LW:LH)*s;T={s,ox:(W-cw)/2,oy:(H-ch)/2,rot}}video?.place()}
  const toS=(x,y)=>T.rot?[T.ox+y*T.s,T.oy+(LW-x)*T.s]:[T.ox+x*T.s,T.oy+y*T.s]
  const toL=(X,Y)=>T.rot?[LW-(Y-T.oy)/T.s,(X-T.ox)/T.s]:[(X-T.ox)/T.s,(Y-T.oy)/T.s]
  const world=G=>{const k=dpr;if(T.rot)G.setTransform(0,-T.s*k,T.s*k,0,T.ox*k,(T.oy+LW*T.s)*k);else G.setTransform(T.s*k,0,0,T.s*k,T.ox*k,T.oy*k)}
  addEventListener('resize',fit);fit()
  const VF=g==='bounce'?w.F:{VW:g==='pool'?150:170,cy:(g==='pool'?150:170)*.3008}
  video=fishVideo(full,()=>{const[X,Y]=toS(w.fish.x,w.fish.y);return{X,Y,s:T.s,F:VF,hide:!w.fish.on}})
  // —— 输入：弹弹乐抓住甩（同站宠）；桌球/保龄拉弓 ——
  let aim=null,drag=null,tip=1
  cv.addEventListener('pointerdown',e=>{if(w.moving||A.over(w)||busyEnd)return;e.preventDefault();cv.setPointerCapture?.(e.pointerId);const[x,y]=toL(e.clientX,e.clientY)
   if(g==='bounce'){const f=w.fish,F=w.F;if(Math.abs(x-f.x)>F.hx+20||Math.abs(y-f.y)>F.hy+20)return;drag={id:e.pointerId,dx:x-f.x,dy:y-f.y,samples:[{t:performance.now(),x,y}]};video.act('drag');tip=0;return}
   aim={x0:x,y0:y,x,y};video.act('drag');tip=0})
  cv.addEventListener('pointermove',e=>{const[x,y]=toL(e.clientX,e.clientY);if(aim){aim.x=x;aim.y=y}
   if(drag&&e.pointerId===drag.id){const f=w.fish,F=w.F;f.x=Math.max(F.hx,Math.min(LW-F.hx,x-drag.dx));f.y=Math.max(F.hy,Math.min(LH-F.hy,y-drag.dy));const t=performance.now();drag.samples.push({t,x,y});while(drag.samples.length>2&&t-drag.samples[0].t>100)drag.samples.shift()}})
  const release=()=>{
   if(drag){const d=drag;drag=null;const last=d.samples.at(-1),first=d.samples[0],dt=Math.max(16,last.t-first.t)/1000,vx=(last.x-first.x)/dt,vy=(last.y-first.y)/dt,sp=Math.hypot(vx,vy)
    if(performance.now()-last.t>150||sp<A.FLING.deadZone){video.act('idle');return}
    const k=sp>A.FLING.maxSpeed?A.FLING.maxSpeed/sp:1;if(A.shoot(w,[w.fish.x,w.fish.y,vx*k,vy*k]))video.act('drag');return}
   if(!aim)return;const dx=aim.x0-aim.x,dy=aim.y0-aim.y,d=Math.hypot(dx,dy);aim=null;if(d<12){video.act('idle');return}
   if(A.shoot(w,[Math.atan2(dy,dx),Math.min(1,d/220),spin])){video.act('drag');shotPots=0}}
  cv.addEventListener('pointerup',release);cv.addEventListener('pointercancel',release)
  // —— 演出 ——
  const parts=[],floats=[],rings=[],sprites=[],breaks=[],react=new Map(),reveal=new Map(),boxFx=new Map();
  const sfx=(x,y,kind,size=150)=>sprites.push({x,y,row:FX[kind],size,t:0})
  function spr(G,img,cell,r,c,x,y,size,alpha=1,rot=0){if(!img)return false;G.save();G.globalAlpha=alpha;G.translate(x,y);if(T.rot)G.rotate(Math.PI/2);if(rot)G.rotate(rot);G.drawImage(img,c*cell,r*cell,cell,cell,-size/2,-size/2,size,size);G.restore();return true}
const cornerFx=[],splashes=[];let shotPots=0,shake=0,busyEnd=false,last=performance.now(),acc=0,dizzy=0
  const burst=(x,y,emo,n=8,sp=220)=>{for(let i=0;i<n;i++){const a=Math.random()*6.283,v=sp*(.5+Math.random()*.7);parts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-80,l:.9,emo:Array.isArray(emo)?emo[i%emo.length]:emo,sz:18+Math.random()*12})}}
  const dots=(x,y,c,n=12)=>{for(let i=0;i<n;i++){const a=Math.random()*6.283,v=80+Math.random()*220;parts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,l:.6,c})}}
  const ring=(x,y,c='#fff',r=90)=>rings.push({x,y,c,r,t:0})
  const float=(x,y,t,c='#fff',big=false)=>floats.push({x,y,t,c,l:1.4,big})
  function onEvents(ev){for(const e of ev){
   if(e.t==='wall'&&g==='bounce'){sfx(e.x,e.y,'wave',110);shake=.06}
   if(e.t==='secret'){reveal.set(e.id,{t:0});sfx(e.x,e.y,'star',e.st>1?200:160);float(e.x,e.y,(e.st>1?'机关升级 ':'机关现身 ')+'+'+e.pts,'#fff27a',true);shake=.12;video.act(e.st>1?'cheer':'happy',true)}
   if(e.t==='corner'){sfx(e.x,e.y,'star',220);sfx(e.x,e.y,'wave',260);cornerFx.push({key:e.key,t:0});float(e.x,e.y,'角落暴击 +'+e.pts,'#ffe27a',true);shake=.16}
   if(e.t==='box'){boxFx.set(e.id,{t:0});if(e.broke){breaks.push({kind:e.kind,x:e.x,y:e.y,t:0});sfx(e.x,e.y,e.kind==='chest'?'coin':e.kind==='bubble'?'splash':e.kind==='ice'?'star':e.kind==='gift'?'confetti':'heart',170);float(e.x,e.y-30,'+'+e.pts+(e.bonus?' 倍率+1':''),'#fff27a',true)}else if(e.pts)float(e.x,e.y-30,'+'+e.pts,'#ffd6a8');else dots(e.x,e.y,'#fff',8)}
   if(e.t==='item'){sfx(e.x,e.y,'coin',110);float(e.x,e.y-20,'+'+e.pts,'#fff27a')}
   if(e.t==='spawn'){const b=w.boxes[e.id];if(b)ring(b.x,b.y,'#fff',60)}
   if(e.t==='pot'){sfx(e.x,e.y,'splash',150);splashes.push({x:e.x,y:e.y,t:0});float(e.x,e.y,(e.pts>0?'+':'')+e.pts+(e.combo>1?' 连击×'+e.combo:''),e.pts<0?'#ff9a9a':'#fff27a',true);shake=.12;if(e.fish){dizzy=1.6;video.act('scared',true)}else{shotPots++;react.set(e.id,{k:3,t:1})}}
   if(e.t==='hit'){if(e.k>1.2)dots(e.x,e.y,'#fff',6);if(g==='pool')for(const b of w.balls)if(Math.hypot(b.x-e.x,b.y-e.y)<b.r+5)react.set(b.id,{k:1,t:.6})}
   if(e.t==='pin'){shake=Math.max(shake,.05);for(const p of w.pins)if(Math.hypot(p.x-e.x,p.y-e.y)<30)react.set(p.id,{k:1,t:.8})}
   if(e.t==='gutter'){video.act('sad',true);float(e.x,e.y-40,'洗沟！','#ffb0b0',true)}
   if(e.t==='roll'){const t=e.kind==='strike'?'全中！+'+e.pts:e.kind==='spare'?'补中！+20':e.pts?'第 '+(e.frame+1)+' 轮 +'+e.pts:'击倒 '+e.down;float(270,480,t,e.kind?'#ffe35a':'#fff',true);if(e.kind){sfx(270,200,'confetti',260);sfx(270,200,'star',200)}video.act(e.kind?'cheer':e.down>=5?'happy':'scared',true)}
   if(e.t==='clear'){float(270,480,'全清！+'+e.pts,'#ffe35a',true);sfx(270,480,'confetti',320);sfx(270,480,'star',260)}
   if(e.t==='rest'&&g==='bounce')video.act(e.pts>=200?'cheer':e.pts>0?'happy':'scared',true)
   if(e.t==='settle'&&g==='pool'&&w.fish.on&&!dizzy)video.act(shotPots>=2?'cheer':shotPots?'happy':'idle',true)
   if(e.t==='settle'&&A.over(w))setTimeout(finish,g==='bounce'?900:500)}}
  async function finish(){if(busyEnd||dead)return;busyEnd=true;put(msg,el('div',{class:'arc-result'},el('span',{text:'正在结算…'})))
   try{const o=await isle.actNow({a:'arcEnd',g,shots:w.log});if(closed||dead)return
    put(msg,el('div',{class:'arc-result'},el('small',{text:A.GAMES[g].name}),el('b',{text:fmt(o.score)+' 分'}),el('span',{text:o.newBest?'🎉 刷新个人纪录！':o.newDay?'今日新高！':'个人纪录 '+fmt(o.best)}),
     el('div',{class:'arc-result-btns'},o.left>0?el('button',{class:'arc-play',type:'button',onclick:()=>{stop();play(g)}},'再来一局（剩 '+o.left+' 次）'):el('span',{class:'arc-muted',text:'今天的次数用完了'}),el('button',{class:'arc-ghost',type:'button',onclick:()=>stop()},'回大厅'))))
    if(o.score!==Math.max(0,Math.round(w.score)))say('以服务器复算为准：'+o.score+' 分','warn')}
   catch(e){put(msg,el('div',{class:'arc-result'},el('b',{text:'结算失败'}),el('span',{text:e.message||''}),el('button',{class:'arc-ghost',type:'button',onclick:()=>stop()},'回大厅')))}}
  function hudText(){const left=g==='bowl'?'第 '+Math.min(5,w.frame+1)+' / 5 轮 · 第 '+((w.frames[w.frame]?.length||0)+1)+' 投':'剩 '+Math.max(0,A.GAMES[g].shots-w.shot)+' / '+A.GAMES[g].shots+(g==='pool'?' 杆':' 甩')
   const mult=g==='bounce'&&w.moving?' · 倍率 ×'+(1+.5*w.bounces+w.bonus).toFixed(1):'';return ICON[g]+' '+fmt(Math.max(0,w.score))+' 分 · '+left+mult}
  function frame(now){raf=requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now
   if(w.moving){acc+=dt*(fast?4:1);let n=0;while(acc>=A.DT&&w.moving&&n<40){onEvents(A.step(w));acc-=A.DT;n++}if(!w.moving)acc=0}
   dizzy=Math.max(0,dizzy-dt);for(const [k,v] of react){v.t-=dt;if(v.t<=0)react.delete(k)}for(const m of [reveal,boxFx])for(const v of m.values())v.t+=dt
   for(const p of parts){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.emo?260*dt:0;p.vx*=.96;p.l-=dt}for(let i=parts.length-1;i>=0;i--)if(parts[i].l<=0)parts.splice(i,1)
   for(const a of [sprites,breaks,cornerFx,splashes])for(let i=a.length-1;i>=0;i--){a[i].t+=dt;if(a[i].t>.55)a.splice(i,1)}
   for(const r of rings)r.t+=dt;for(let i=rings.length-1;i>=0;i--)if(rings[i].t>.45)rings.splice(i,1)
   for(const f of floats){f.y-=40*dt;f.l-=dt}for(let i=floats.length-1;i>=0;i--)if(floats[i].l<=0)floats.splice(i,1)
   shake=Math.max(0,shake-dt);draw(now/1000);const t=hudText();if(hud.textContent!==t)hud.textContent=t;hud.classList.toggle('hot',g==='bounce'&&w.moving&&w.bounces+w.bonus>0);video?.place()}
  function face(G,x,y,r,id,state){const k=react.get(id)?.k??state,row=faceOf[id%faceOf.length];G.save();G.fillStyle='rgba(0,0,0,.25)';G.beginPath();G.ellipse(x+2,y+4,r,r*.86,0,0,7);G.fill();G.restore()
   if(faces){G.save();G.translate(x,y);if(T.rot)G.rotate(Math.PI/2);G.drawImage(faces,k*96,row*96,96,96,-r,-r,r*2,r*2);G.restore()}G.strokeStyle='rgba(255,255,255,.85)';G.lineWidth=2;G.beginPath();G.arc(x,y,r,0,7);G.stroke()}
  function emo(G,ch,x,y,size,rot=0,alpha=1){G.save();G.globalAlpha=alpha;G.translate(x,y);if(T.rot)G.rotate(Math.PI/2);if(rot)G.rotate(rot);G.font=size+'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';G.textAlign='center';G.textBaseline='middle';G.fillText(ch,0,size*.05);G.restore()}
  function draw(t){const G=G2;G.setTransform(1,0,0,1,0,0);G.clearRect(0,0,cv.width,cv.height);world(G);if(shake)G.translate((Math.random()-.5)*40*shake,(Math.random()-.5)*40*shake)
   if(g==='pool')drawPool(G,t);else if(g==='bowl')drawBowl(G,t);else drawBounce(G,t)
   if(aim){const dx=aim.x0-aim.x,dy=aim.y0-aim.y,d=Math.min(220,Math.hypot(dx,dy)),a=Math.atan2(dy,dx),f=w.fish,p=d/220
    G.strokeStyle='rgba(255,255,255,.9)';G.lineWidth=4;G.beginPath();G.moveTo(f.x,f.y);G.lineTo(f.x-Math.cos(a)*d*.45,f.y-Math.sin(a)*d*.45);G.stroke()
    G.setLineDash([10,10]);G.strokeStyle=`hsla(${120-p*120} 95% 65% / .95)`;G.lineWidth=5;G.beginPath();G.moveTo(f.x,f.y);G.lineTo(f.x+Math.cos(a)*(70+p*320),f.y+Math.sin(a)*(70+p*320));G.stroke();G.setLineDash([])
    spr(G,IM.pf,160,3,p<.5?0:1,f.x-Math.cos(a)*(f.r+34),f.y-Math.sin(a)*(f.r+34),96,1,a+Math.PI/2-(T.rot?Math.PI/2:0))
    if(!spr(G,IM.pf,160,3,4,f.x,f.y,(f.r+22)*2.4)){G.strokeStyle='rgba(255,255,255,.35)';G.lineWidth=8;G.beginPath();G.arc(f.x,f.y,f.r+16,0,7);G.stroke()}G.save();G.beginPath();G.moveTo(f.x,f.y);G.arc(f.x,f.y,(f.r+22)*1.3,-Math.PI/2,-Math.PI/2+p*6.283);G.closePath();G.clip();if(!spr(G,IM.pf,160,3,5,f.x,f.y,(f.r+22)*2.4)){G.strokeStyle=`hsl(${120-p*120} 95% 60%)`;G.lineWidth=8;G.beginPath();G.arc(f.x,f.y,f.r+16,0,7);G.stroke()}G.restore()}
   for(const b of breaks){const f=b.t<.18?4:5;if(!spr(G,IM.boxes,160,BOX_ROW[b.kind],f,b.x,b.y,110,1-Math.max(0,b.t-.3)*3))break}
   for(const sp of sprites){const f=Math.min(5,Math.floor(sp.t/.09));spr(G,IM.fx,160,sp.row,f,sp.x,sp.y,sp.size)}
   for(const r of rings){G.strokeStyle=r.c;G.globalAlpha=1-r.t/.45;G.lineWidth=4;G.beginPath();G.arc(r.x,r.y,r.r*(.3+r.t*1.6),0,7);G.stroke()}G.globalAlpha=1
   for(const p of parts){if(p.emo)emo(G,p.emo,p.x,p.y,p.sz,0,Math.min(1,p.l*1.5));else{G.globalAlpha=Math.max(0,p.l/.6);G.fillStyle=p.c;G.beginPath();G.arc(p.x,p.y,3,0,7);G.fill()}}G.globalAlpha=1
   // 文字始终正着画（屏幕坐标）
   G.setTransform(dpr,0,0,dpr,0,0);G.textAlign='center';for(const f of floats){const[X,Y]=toS(f.x,f.y);G.globalAlpha=Math.min(1,f.l*1.6);G.font=`800 ${f.big?30:22}px system-ui`;if(f.big){const pl=/全中|全清|暴击|升级/.test(f.t)?IM.p3:/连击|×/.test(f.t)?IM.p2:IM.p1;if(pl){const tw=G.measureText(f.t).width+70,ph=tw*pl.height/pl.width;G.drawImage(pl,X-tw/2,Y-ph*.62,tw,ph)}}G.lineWidth=6;G.strokeStyle='rgba(40,20,60,.65)';G.strokeText(f.t,X,Y);G.fillStyle=f.c;G.fillText(f.t,X,Y)}G.globalAlpha=1
   if(tip&&!w.moving&&!A.over(w)&&w.shot===0){const txt=g==='bounce'?'抓住大肥鱼，像站宠一样甩出去！撞墙、撞道具框都有惊喜':'按住屏幕往后拉，松手发射';G.font='700 18px system-ui';const tw=G.measureText(txt).width+44,X=vw()/2,Y=vh()-70;G.fillStyle='rgba(30,20,50,.6)';G.beginPath();G.roundRect?.(X-tw/2,Y-22,tw,44,22);G.fill();G.fillStyle='#fff';G.fillText(txt,X,Y+6)}}
  function drawBounce(G,t){const W=LW,H=LH
   const glow=G.createLinearGradient(0,0,W,H);glow.addColorStop(0,'rgba(255,170,220,.55)');glow.addColorStop(1,'rgba(140,210,255,.55)');G.strokeStyle=glow;G.lineWidth=6;G.strokeRect(3,3,W-6,H-6)
   for(const sc of w.secrets){const rv=reveal.get(sc.id),horiz=sc.side==='T'||sc.side==='B',inset=sc.st>1?44:38,px=horiz?sc.c:sc.side==='L'?inset:W-inset,py=horiz?(sc.side==='T'?inset:H-inset):sc.c
    if(!sc.st){spr(G,IM.sec,160,0,sc.kind,px,py,80,.25+.2*(.5+.5*Math.sin(t*2.4+sc.id*1.7)),horiz?0:Math.PI/2);continue}
    if(rv&&rv.t<.5){const f=Math.min(3,Math.floor(rv.t/.12));G.save();G.translate(horiz?sc.c:(sc.side==='L'?6:W-6),horiz?(sc.side==='T'?6:H-6):sc.c);if(!horiz)G.rotate(Math.PI/2);if(IM.sec)G.drawImage(IM.sec,f*160,3*160,160,160,-sc.hl*1.3,-sc.hl*.65,sc.hl*2.6,sc.hl*1.3);G.restore()}
    const pop=rv?Math.min(1,rv.t*4):1,size=(sc.st>1?96:80)*(.5+.5*pop)+Math.sin(t*3+sc.id)*2;if(!spr(G,IM.sec,160,sc.st>1?2:1,sc.kind,px,py,size))emo(G,SECRET_EMO[sc.kind],px,py,size*.5)}
   for(const c of cornerFx){const f=4+Math.min(3,Math.floor(c.t/.12)),x=c.key[0]==='L'?40:W-40,y=c.key[1]==='T'?40:H-40;spr(G,IM.sec,160,3,f,x,y,170,1,(c.key==='RT'?Math.PI/2:c.key==='RB'?Math.PI:c.key==='LB'?-Math.PI/2:0))}
   for(const b of w.boxes){if(!b.on)continue;const fx=boxFx.get(b.id),hitNow=fx&&fx.t<.22,bob=Math.sin(t*1.6+b.id)*3,cracked=b.kind!=='spring'&&b.hp<A.BOX[b.kind].hp,f=hitNow?2:cracked?3:Math.floor(t*2+b.id)%2
    if(!spr(G,IM.boxes,160,BOX_ROW[b.kind],f,b.x,b.y+bob,b.r*3.1)){const[c1,c2]=BOX_COL[b.kind];G.fillStyle=c1;G.strokeStyle=c2;G.lineWidth=3;G.beginPath();G.arc(b.x,b.y,b.r,0,7);G.fill();G.stroke();emo(G,BOX_EMO[b.kind],b.x,b.y+bob,32)}}
   for(const it of w.items){if(!it.on)continue;if(!spr(G,IM.fx,160,3,1,it.x,it.y+Math.sin(t*3+it.id)*2,64))emo(G,'🪙',it.x,it.y,28)}}
  function vortex(G,x,y,r,t){const gr=G.createRadialGradient(x,y,2,x,y,r);gr.addColorStop(0,'rgba(10,20,50,.95)');gr.addColorStop(.6,'rgba(40,90,160,.75)');gr.addColorStop(1,'rgba(120,210,255,0)');G.fillStyle=gr;G.beginPath();G.arc(x,y,r,0,7);G.fill()
   G.strokeStyle='rgba(200,240,255,.7)';G.lineWidth=2;for(let k=0;k<3;k++){G.beginPath();G.arc(x,y,r*(.35+k*.2),t*2+k*2.1,t*2+k*2.1+2.2);G.stroke()}}
  function drawPool(G,t){const P=A.POOL;G.fillStyle='rgba(40,170,190,.22)';G.strokeStyle='rgba(255,255,255,.6)';G.lineWidth=4;G.beginPath();G.roundRect?G.roundRect(P.x0,P.y0,P.x1-P.x0,P.y1-P.y0,26):G.rect(P.x0,P.y0,P.x1-P.x0,P.y1-P.y0);G.fill();G.stroke()
   G.strokeStyle='rgba(255,255,255,.18)';G.setLineDash([8,12]);G.beginPath();G.moveTo(P.x0+20,P.start[1]-40);G.lineTo(P.x1-20,P.start[1]-40);G.stroke();G.setLineDash([])
   for(const [x,y,r] of P.pockets)if(!spr(G,IM.pf,160,0,Math.floor(t*8)%6,x,y,r*2.9))vortex(G,x,y,r*1.15,t)
   for(const b of w.balls)if(b.on){const sp=Math.hypot(b.vx,b.vy);face(G,b.x,b.y,b.r+1,b.id,sp>260?2:0);spr(G,IM.pf,160,1,b.gold?5:b.id%3===0?1:0,b.x,b.y,(b.r+1)*3.3)}
   for(const sp of splashes){spr(G,IM.pf,160,2,3+Math.min(2,Math.floor(sp.t/.15)),sp.x,sp.y,90)}}
  function drawBowl(G,t){const B=A.BOWL;G.fillStyle='rgba(60,40,80,.25)';G.fillRect(B.wall0,0,B.wall1-B.wall0,960)
   const gr=G.createLinearGradient(B.lane0,0,B.lane1,0);gr.addColorStop(0,'rgba(255,210,150,.42)');gr.addColorStop(.5,'rgba(255,232,190,.55)');gr.addColorStop(1,'rgba(255,210,150,.42)');G.fillStyle=gr;G.fillRect(B.lane0,0,B.lane1-B.lane0,960)
   G.strokeStyle='rgba(255,255,255,.5)';G.lineWidth=3;G.strokeRect(B.lane0,0,B.lane1-B.lane0,960);G.strokeStyle='rgba(255,255,255,.12)';G.lineWidth=2;for(let x=B.lane0+29;x<B.lane1;x+=29){G.beginPath();G.moveTo(x,0);G.lineTo(x,960);G.stroke()}
   G.fillStyle='rgba(255,140,190,.7)';for(let i=-3;i<=3;i++){G.beginPath();G.moveTo(270+i*30,600);G.lineTo(270+i*30-8,616);G.lineTo(270+i*30+8,616);G.fill()}
   for(const p of w.pins){G.fillStyle='rgba(255,255,255,.18)';G.beginPath();G.arc(p.sx,p.sy,8,0,7);G.fill()}
   for(const p of w.pins)if(p.on){const sp=Math.hypot(p.vx,p.vy);face(G,p.x,p.y,p.r+3,p.id,sp>120?2:0)}
   const fr=w.frames;for(let i=0;i<5;i++){const x=270+(i-2)*58;G.fillStyle=i===w.frame?'rgba(255,224,140,.9)':'rgba(255,255,255,.35)';G.beginPath();G.arc(x,920,16,0,7);G.fill();if(fr[i]){G.fillStyle='#4a2a10';G.font='bold 13px system-ui';G.textAlign='center';G.save();if(T.rot){G.translate(x,920);G.rotate(Math.PI/2);G.fillText(String(fr[i].reduce((a,b)=>a+b,0)),0,5)}else G.fillText(String(fr[i].reduce((a,b)=>a+b,0)),x,925);G.restore()}}}
  raf=requestAnimationFrame(frame)
 }
 // 大肥鱼：与站宠同一套动作视频与朝向规则（素材朝左，向右移动时镜像）；两个 video 交替加载避免闪烁
 function fishVideo(layer,pos){const vs=[0,1].map(()=>{const v=el('video',{class:'arc-vid',muted:true,playsinline:true,loop:true,preload:'auto'});v.muted=true;v.playsInline=true;layer.append(v);return v});let cur=0,acts=null,mood='',ok=false,flip=false,lx=null
  const SETS={idle:['待机呼吸休闲'],drag:['被鼠标拖拽悬空反馈'],scared:['被吓一跳','点击回应-害羞惊讶'],happy:['点击回应-开心跃动','点击回应-元气挥手','原地挥手打招呼'],cheer:['工作状态-雀跃庆祝','可爱宅舞','轻快摇摆舞'],sad:['工作状态-垂头叹气冒汗','玩游戏气急败坏']}
  getManifest().then(m=>{acts=new Map((m.actions||[]).map(a=>[a.name,a]));set('idle')})
  const safari=/^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  function set(k,force){if(!acts||(k===mood&&!force))return;mood=k;const names=SETS[k].filter(n=>acts.has(n));if(!names.length)return;const a=acts.get(names[Math.floor(Math.random()*names.length)]),nx=vs[1-cur]
   nx.onerror=()=>{if(nx.src.endsWith('.mov'))nx.src=a.src};nx.loop=!['scared','happy','cheer','sad'].includes(k);nx.src=safari?a.src.replace(/\.webm$/,'.mov'):a.src;nx.currentTime=0
   nx.play().then(()=>{if(mood!==k)return;nx.style.visibility='visible';vs[cur].style.visibility='hidden';vs[cur].pause();cur=1-cur;ok=true}).catch(()=>{})
   nx.onended=()=>{if(mood===k){mood='';set('idle')}}}
  return {get ok(){return ok},act:set,place(){const p=pos(),F=p.F,wv=F.VW*p.s,hv=wv*9/16;if(lx!=null&&Math.abs(p.X-lx)>.5)flip=p.X>lx;lx=p.X
   for(const v of vs){v.style.opacity=p.hide?'0':'1';v.style.width=wv+'px';v.style.height=hv+'px';v.style.transform=`translate(${p.X-wv/2}px,${p.Y-F.cy*p.s}px)${flip?' scaleX(-1)':''}`}},destroy(){for(const v of vs){v.pause();v.removeAttribute('src');v.remove()}}}}
 lobby()
 return {close}
}
