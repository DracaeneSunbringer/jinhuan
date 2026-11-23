// b16 云梦仙途：前端。所有动作发给服务端结算（同一 operation 重试），界面只读存档。
import * as C from '/b16-xian-content.js?v=472f7fbf';
import * as R from '/b16-xian-rules.js?v=472f7fbf';
const ART='/pets/dsh/xian-020755ac46d4/';
const fmt=n=>Math.round(n||0).toLocaleString('zh-CN');
const pct=v=>Math.round(v*1000)/10+'%';
const EFF={hp:'生命',atk:'攻击',def:'防御',spd:'速度',crit:'暴击率',critDmg:'暴击伤害',dodge:'闪避',lifesteal:'吸血',double:'连击',thorns:'反弹伤害',herbQ:'仙草品质',cult:'修炼速度',pillRate:'成丹率',pillQ:'丹药品质',petGrow:'灵宠成长',drop:'掉宝率',elem:'五行克制伤害',shield:'开战护盾',late:'第5回合起攻击',lowAtk:'残血攻击'};
const effText=e=>Object.entries(e).filter(([k])=>EFF[k]).map(([k,v])=>EFF[k]+' +'+(k==='pillQ'?v:pct(v))).join('，');
function el(tag,attrs={},...kids){const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs||{})){if(v===false||v==null)continue;if(k==='class')n.className=v;else if(k==='text')n.textContent=v;else if(k==='style')n.style.cssText=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else n.setAttribute(k,v===true?'':String(v))}for(const c of kids.flat(Infinity))if(c!=null&&c!==false)n.append(c instanceof Node?c:document.createTextNode(String(c)));return n}
const btn=(text,fn,attrs={})=>el('button',{type:'button',class:'xb',onclick:fn,...attrs},text);
function icon([r,c],size=40,hue=0){return el('span',{class:'xi',style:`width:${size}px;height:${size}px;background-image:url(${ART}items.webp);background-size:${size*6}px ${size*6}px;background-position:${-c*size}px ${-r*size}px;${hue?`filter:hue-rotate(${hue}deg)`:''}`})}
const herbIcon=(id,s)=>icon(R.xianHerb(id).icon,s),pillIcon=(id,s)=>{const p=R.xianPill(id);return icon(p.icon,s,p.hue||0)},itemIcon=(it,s)=>icon(R.xianBase(it.b).icon,s);
const qTag=q=>el('i',{class:'xq q'+q,text:C.XIAN_Q[q]});
function sprite(id,{row=0,size=96,cls=''}={}){const src=id==='hero'?ART+'hero.webp':ART+'npc-'+id+'.webp';return el('span',{class:'xs '+cls,style:`--s:${size}px;--r:${row};background-image:url(${src})`})}
async function connect(){
 let state,rev,coins,skew=0,closed=false,pending=null;
 const accept=j=>{if(j.state){state=j.state;rev=j.rev}if(j.coins!=null)coins=j.coins;if(j.now)skew=j.now-Date.now()/1000};
 const read=async()=>{const r=await fetch('/api/pet/world',{credentials:'same-origin',signal:AbortSignal.timeout(20000)}),j=await r.json();if(!r.ok)throw Error(j.error||'存档加载失败');accept(j)};
 await read();
 async function send(action){
  const operation=crypto.randomUUID();let last;
  for(let attempt=0;attempt<4;attempt++){
   const body=JSON.stringify({rev,operation,actions:[action]});let r,j;
   try{r=await fetch('/api/pet/world/act',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body,signal:AbortSignal.timeout(15000)});j=await r.json()}catch(e){last=e;await new Promise(ok=>setTimeout(ok,700*(attempt+1)));continue}
   if(r.status===429){await new Promise(ok=>setTimeout(ok,Math.min(5,j.retry||1)*1000+200));continue}
   if(r.status===409&&attempt===0&&j.state){accept(j);continue}
   accept(j);if(!r.ok)throw Error(j.error||'本次操作未能保存');
   const row=j.out?.[0];if(j.duplicate)return {ok:true,msg:'已确认上次操作结果'};if(row&&!row.ok)throw Error(row.msg||'条件未满足');return row||{ok:true,msg:'已保存'};
  }
  throw Error(last?'网络不稳，请稍后核对结果':'操作较快，请稍后重试');
 }
 return {get x(){return state?.xian},get s(){return state},get coins(){return coins||0},now:()=>Math.floor(Date.now()/1000+skew),
  async act(a){if(closed)throw Error('已离开仙途');if(pending)throw Error('上一项操作还在保存');pending=send(a);try{return await pending}finally{pending=null}},
  reload:read,close(){closed=true}};
}
export async function mountXian(host,{toast=()=>{},onReturn}={}){
 const css=document.getElementById('b16-xian-css')||document.head.appendChild(el('link',{id:'b16-xian-css',rel:'stylesheet',href:'/b16-xian.css?v=472f7fbf'}));
 const root=el('div',{class:'xian',role:'region','aria-label':'云梦仙途'});host.append(root);
 let conn;try{conn=await connect()}catch(e){root.remove();throw e}
 let map='ferry',sheetClose=null,lastLine='',timer=0,destroyed=false;
 const say=(m,k='ok')=>toast(m,k);
 const confirmD=async(text)=>window.siteConfirm?await window.siteConfirm(text):true;
 const run=async(a,{busy}={})=>{try{if(busy)busy.disabled=true;const r=await conn.act(a);if(r.msg)say(r.msg,'ok');render();return r}catch(e){say(e.message||'操作失败','err');render();return null}finally{if(busy)busy.disabled=false}};
 const top=el('div',{class:'xian-top'}),scene=el('div',{class:'xian-scene'}),tabs=el('nav',{class:'xian-tabs'});root.append(top,scene,tabs);
 function sheet(title,build,{wide=false}={}){
  sheetClose?.();const body=el('div',{class:'xian-sheet-body'});let closed=false;
  const close=()=>{if(closed)return;closed=true;wrap.remove();sheetClose=null;document.removeEventListener('keydown',key,true)};
  const key=e=>{if(e.key==='Escape'){e.stopPropagation();close()}};
  const wrap=el('div',{class:'xian-overlay',onclick:e=>{if(e.target===wrap)close()}},el('section',{class:'xian-sheet'+(wide?' wide':''),role:'dialog','aria-modal':'true','aria-label':title},el('header',{},el('h2',{text:title}),btn('×',close,{class:'xb x-close','aria-label':'关闭'})),body));
  root.append(wrap);document.addEventListener('keydown',key,true);sheetClose=close;
  const draw=()=>{if(closed)return;body.replaceChildren(...[build(draw,close)].flat(Infinity).filter(v=>v!=null&&v!==false))};draw();
  return {close,draw};
 }
 let sheetDraw=null;const openSheet=(title,build,o)=>{const s=sheet(title,build,o);sheetDraw=s.draw;return s};
 function render(){
  if(destroyed)return;const x=conn.x;
  top.replaceChildren(...[
   btn('⛵ 回小岛',()=>onReturn?.(),{class:'xb ghost'}),
   x?el('b',{class:'xian-rank',text:R.xianStageOf(x.lv).name}):el('b',{text:'未入道'}),
   x?el('span',{class:'xian-chip'},icon([0,0],18),' 灵石 '+fmt(x.stone)):null,
   el('span',{class:'xian-chip',text:'D币 '+fmt(conn.coins)}),
   x?btn('📜 修炼',()=>openLibrary(),{class:'xb ghost'}):null].filter(Boolean));
  drawScene();tabs.replaceChildren(...Object.entries(C.XIAN_MAPS).map(([id,m])=>btn(m.name,()=>{map=id;render()},{class:'xb tab'+(id===map?' on':''),'aria-pressed':String(id===map)})));
  sheetDraw?.();
 }
 function drawScene(){
  const x=conn.x,m=C.XIAN_MAPS[map];
  const stage=el('div',{class:'xian-stage',style:`background-image:url(${ART}map-${map}.webp)`});
  for(const s of m.spots)stage.append(btn(s.label,()=>spot(s.id),{class:'xian-spot',style:`left:${s.x*100}%;top:${s.y*100}%`}));
  for(const n of C.XIAN_NPCS.filter(n=>n.map===map)){
   const talked=x?.dy?.d===R.xianDay(conn.now())&&x.dy.talk.includes(n.id);
   stage.append(el('button',{type:'button',class:'xian-npc'+(talked?'':' fresh'),style:`left:${n.x*100}%;top:${n.y*100}%`,'aria-label':n.name+' · '+n.title,onclick:()=>openNpc(n)},sprite(n.id,{size:84,cls:'idle'}),el('small',{text:n.name})));
  }
  if(x)stage.append(el('div',{class:'xian-hero',style:`left:${({ferry:38,sect:62,secret:44})[map]}%`},sprite('hero',{size:96,cls:'idle'})));
  scene.replaceChildren(stage);if(scene.scrollWidth>scene.clientWidth)scene.scrollLeft=(scene.scrollWidth-scene.clientWidth)/2;
  if(!x)scene.append(el('div',{class:'xian-enter'},el('h2',{text:'云梦仙途'}),el('p',{text:'在仙渡种仙草、养灵宠、炼丹药，抽灵根、悟天赋、洗法宝词条，闯秘境塔。修仙战力独立计算，不影响大肥鱼擂台。'}),el('p',{class:'muted',text:'灵石只能用 D币单向兑换，不能换回 D币。入道免费，会随机抽取灵根与三条天赋。'}),btn('入道',e=>run({a:'xianEnter'},{busy:e.currentTarget}).then(r=>r&&openLibrary()),{class:'xb primary big'})));
 }
 function spot(id){
  if(!conn.x&&!['boat','gate','path','back'].includes(id))return say('先在渡口入道','err');
  if(id==='boat')return onReturn?.();
  if(id==='gate'){map='sect';return render()}if(id==='path'){map='secret';return render()}if(id==='back'){map='ferry';return render()}
  ({market:openMarket,library:openLibrary,alchemy:openAlchemy,envelope:()=>openNpc(R.xianNpc('meow')),bombs:openForge,arena:openArena,tower:openTower,spring:openField,field:openField,nest:openNest})[id]?.();
 }
 const NPC_GO={egg:['去丹房',()=>openAlchemy()],iron:['去炼器',()=>openForge()],lafish:['去炸药坊',()=>openForge()],ant:['进秘境塔',()=>openTower()],melon:['逛仙市',()=>openMarket()],fas:['兑灵石',()=>openMarket()],blessing:['去灵兽巢',()=>openNest()],wheat:['去灵田',()=>openField()],'52d':['看修炼',()=>openLibrary()]};
 function openNpc(n){
  let face=0,line=n.lines[0]==='{echo}'?(lastLine||'……'):n.lines[Math.floor(Math.random()*n.lines.length)];if(n.id!=='echo')lastLine=line;
  openSheet(n.name+' · '+n.title,()=>{
   const x=conn.x,today=x?.dy?.d===R.xianDay(conn.now())?x.dy:null;
   return [el('div',{class:'xian-talk'},el('span',{class:'xian-face',style:`background-image:url(${ART}face-${n.id}.webp);background-position:${face*50}% 0`}),el('p',{class:'xian-line',text:line})),
    el('div',{class:'xian-row'},el('span',{class:'muted',text:'Lv'+n.lv+' · '+C.XIAN_EL[n.el]+'系'+(today?.won.includes(n.id)?' · 今日已切磋获胜':'')})),
    x?el('div',{class:'xian-actions'},
     btn(today?.talk.includes(n.id)?'再聊聊':'聊天（每日礼物）',async e=>{const r=await run({a:'xianTalk',id:n.id},{busy:e.currentTarget});if(r?.line){line=n.id==='echo'?(lastLine||r.line):r.line;if(n.id!=='echo')lastLine=line;face=1;sheetDraw?.()}}),
     btn('切磋',async e=>{const r=await run({a:'xianDuel',id:n.id},{busy:e.currentTarget});if(r?.battle){face=r.win?0:2;showBattle(r,'cloud')}},{class:'xb primary'}),
     NPC_GO[n.id]?btn(NPC_GO[n.id][0],NPC_GO[n.id][1],{class:'xb ghost'}):null):el('p',{class:'muted',text:'先入道，再来找我。'})];
  });
 }
 function openLibrary(){
  openSheet('藏经阁 · 修炼',()=>{
   const x=conn.x;if(!x)return el('p',{text:'尚未入道'});const t=conn.now(),info=R.xianRootInfo(x.root),st=R.xianStats(x),need=R.xianNeed(x.lv),acc=R.xianAccrued(x,t),brk=R.xianBreakNeed(x);
   const stat=(k,v)=>el('div',{class:'xian-stat'},el('small',{text:k}),el('b',{text:v}));
   const pend=x.pend&&(x.pend.k==='t'||x.pend.k==='r')?el('div',{class:'xian-pend'},el('b',{text:x.pend.k==='t'?'新天赋：'+R.xianTalent(x.pend.v).name+'（替换「'+R.xianTalent(x.talents[x.pend.i]).name+'」）':'新灵根：'+R.xianRootInfo(x.pend.v).label}),btn('采用新的',e=>run({a:'xianPending',keep:'new'},{busy:e.currentTarget}),{class:'xb primary'}),btn('保留原来',e=>run({a:'xianPending',keep:'old'},{busy:e.currentTarget}))):null;
   return [el('div',{class:'xian-hero-card'},sprite('hero',{size:112,cls:'idle'}),el('div',{},el('h3',{text:R.xianStageOf(x.lv).name}),el('p',{text:'灵根：'+info.label+' · 修炼速度 ×'+info.speed}),
     el('div',{class:'xian-bar'},el('i',{style:`width:${Math.min(100,x.xp/need*100)}%`})),el('small',{text:'修为 '+fmt(x.xp)+' / '+fmt(need)+(brk&&x.xp>=need?' · 已到瓶颈':'')}))),
    el('div',{class:'xian-actions'},btn('打坐收功（+'+fmt(acc)+'）',e=>run({a:'xianCultivate'},{busy:e.currentTarget}),{class:'xb primary',disabled:!acc}),
     brk?btn('突破（'+R.xianPill(brk).name+'，'+Math.round(Math.min(.95,.6+(x.bb||0))*100)+'%起）',e=>run({a:'xianBreak'},{busy:e.currentTarget}),{class:'xb',disabled:x.xp<need}):null),
    el('p',{class:'muted',text:'每小时修为 '+fmt(R.xianRate(x))+'，离线最多积累 16 小时。聚气丹可立即增加修为。'}),
    el('h3',{text:'天赋'}),el('div',{class:'xian-talents'},x.talents.map((id,i)=>{const tl=R.xianTalent(id);return el('div',{class:'xian-talent r'+tl.r},el('b',{text:tl.name}),el('small',{text:tl.desc||effText(tl.e)}),btn('悟道重修',async e=>{if(await confirmD('消耗悟道丹 1 颗与 50 万 D币，重悟「'+tl.name+'」？'))run({a:'xianTalentReroll',i},{busy:e.currentTarget})},{class:'xb ghost small'}))})),
    el('div',{class:'xian-actions'},btn('洗髓换灵根（洗髓丹 + 100 万 D币）',async e=>{if(await confirmD('消耗洗髓丹 1 颗与 100 万 D币重洗灵根？洗完可以选择保留原灵根。'))run({a:'xianRootReroll'},{busy:e.currentTarget})},{class:'xb ghost'})),pend,
    el('h3',{text:'战斗属性 · 战力 '+fmt(st.power)}),el('div',{class:'xian-stats'},stat('生命',fmt(st.hp)),stat('攻击',fmt(st.atk)),stat('防御',fmt(st.def)),stat('速度',fmt(st.spd)),stat('暴击',pct(st.crit)),stat('暴伤',pct(st.critDmg)),stat('闪避',pct(st.dodge)),stat('五行',C.XIAN_EL[st.el])),
    x.buff?el('p',{text:'丹药加持：'+Object.entries(x.buff).map(([k,b])=>(k==='atk'?'攻击':'防御')+'+'+pct(b.v)+'（剩'+b.n+'场）').join('，')}):null,
    el('label',{class:'xian-check'},el('input',{type:'checkbox',checked:!!x.carry,onchange:e=>run({a:'xianCarry',on:e.target.checked})}),' 战斗中自动服用回春丹（持有 '+R.xianQtyTotal(x.pills,'heal')+' 颗）'),
    x.log?.length?el('details',{},el('summary',{text:'最近战绩'}),el('ul',{},x.log.map(l=>el('li',{text:new Date(l.t*1000).toLocaleString('zh-CN',{hour12:false})+' · '+(l.k==='tower'?'秘境第'+l.f+'层':l.k==='duel'?'切磋 '+(R.xianNpc(l.npc)?.name||''):'突破')+' · '+((l.win??l.ok)?'胜':'败')})))):null];
  },{wide:true});
 }
 const numIn=(v=1,max=999)=>el('input',{type:'number',min:1,max,value:v,class:'xian-num',inputmode:'numeric'});
 function openMarket(){
  let tab='stone';
  openSheet('茶寮 · 仙市',()=>{
   const x=conn.x,today=x.dy?.d===R.xianDay(conn.now())?x.dy.stone:0,left=R.xianStoneDailyMax-today;
   const head=el('div',{class:'xian-subtabs'},[['stone','兑灵石'],['seed','种子'],['sell','出售'],['egg','灵兽蛋']].map(([k,l])=>btn(l,()=>{tab=k;sheetDraw()},{class:'xb tab'+(tab===k?' on':'')})));
   if(tab==='stone'){const n=numIn(Math.min(100,left),left),cost=el('b'),upd=()=>{const c=R.xianStoneCost(today,Number(n.value)||0);cost.textContent=c==null?'超出今日额度':fmt(c)+' D币'};n.oninput=upd;upd();
    return [head,el('p',{text:'今日已兑 '+today+' / '+R.xianStoneDailyMax+' 枚。前 300 枚 1000 D币/枚，接着 700 枚 2000，再 1000 枚 4000。灵石不能换回 D币。'}),el('div',{class:'xian-row'},n,' 枚 → ',cost,btn('兑换',async e=>{const k=Number(n.value);const c=R.xianStoneCost(today,k);if(c==null)return say('超出今日额度','err');if(await confirmD('花 '+fmt(c)+' D币兑换 '+k+' 枚灵石？灵石不能换回 D币。'))run({a:'xianStoneBuy',n:k},{busy:e.currentTarget})},{class:'xb primary',disabled:!left}))]}
   if(tab==='seed')return [head,el('div',{class:'xian-list'},C.XIAN_HERBS.map(h=>{const n=numIn(6);return el('div',{class:'xian-item'},herbIcon(h.id,40),el('div',{},el('b',{text:h.name}),el('small',{text:C.XIAN_EL[h.el]+'系 · '+h.hours+' 小时成熟 · 持有种子 '+(x.seeds[h.id]||0)})),el('span',{text:h.seed+' 灵石'}),n,btn('买',e=>run({a:'xianSeedBuy',id:h.id,n:Number(n.value)},{busy:e.currentTarget})))}))];
   if(tab==='sell'){const rows=[];
    for(const h of C.XIAN_HERBS)(x.herbs[h.id]||[]).forEach((c,q)=>{if(c)rows.push({kind:'herb',id:h.id,q,c,name:h.name,price:Math.floor(h.price*C.XIAN_QMUL[q]),ic:herbIcon(h.id,36)})});
    for(const p of C.XIAN_PILLS)(x.pills[p.id]||[]).forEach((c,q)=>{if(c)rows.push({kind:'pill',id:p.id,q,c,name:p.name,price:Math.floor(p.price*C.XIAN_QMUL[q]),ic:pillIcon(p.id,36)})});
    if(x.mats.feather)rows.push({kind:'mat',id:'feather',q:0,c:x.mats.feather,name:'灵羽',price:30,ic:el('span',{class:'xi emoji',text:'🪶'})});
    return [head,rows.length?el('div',{class:'xian-list'},rows.map(o=>{const n=numIn(o.c,o.c);return el('div',{class:'xian-item'},o.ic,el('div',{},el('b',{text:o.name}),qTag(o.q),el('small',{text:' 持有 '+o.c})),el('span',{text:o.price+' 灵石/个'}),n,btn('卖',e=>run({a:'xianSell',kind:o.kind,id:o.id,q:o.q,n:Number(n.value)},{busy:e.currentTarget})))})):el('p',{class:'muted',text:'还没有可以出售的东西'})]}
   return [head,el('div',{class:'xian-item'},icon([5,1],56),el('div',{},el('b',{text:'灵兽蛋'}),el('small',{text:'6 小时孵化，随机灵鹿、玄龟、青鸟、火狐、雷貂之一。灵兽巢最多 3 只。'})),el('span',{text:C.XIAN_ECON.egg+' 灵石'}),btn('买一枚',e=>run({a:'xianEggBuy'},{busy:e.currentTarget}),{class:'xb primary'}))];
  },{wide:true});
 }
 function openAlchemy(){
  let fire='soft',best=false;
  openSheet('丹房',()=>{
   const x=conn.x,t=conn.now(),j=x.job,lv=x.furnace||1,cost=C.XIAN_ECON.furnacePrice[lv];
   const jobBox=j?el('div',{class:'xian-job'},pillIcon(j.p,48),el('div',{},el('b',{text:R.xianPill(j.p).name+' ×'+j.n+'（'+(j.f==='hard'?'武火':'文火')+'）'}),el('div',{class:'xian-bar'},el('i',{style:`width:${Math.min(100,(t-j.t)/(j.done-j.t)*100)}%`})),el('small',{text:t>=j.done?'已经炼成':'约 '+Math.ceil((j.done-t)/60)+' 分钟后出炉'})),btn('出炉',e=>run({a:'xianCollect'},{busy:e.currentTarget}),{class:'xb primary',disabled:t<j.done})):el('p',{class:'muted',text:'丹炉空着。选一张丹方开炉。'});
   return [el('div',{class:'xian-row'},el('b',{text:'丹炉 '+lv+' 级'}),el('small',{class:'muted',text:' 一炉最多 '+R.xianFurnaceBatch(x)+' 颗，炼制时间 -'+((lv-1)*8)+'%，成丹率 +'+((lv-1)*5)+'%'}),lv<5?btn('升级（'+fmt(cost)+' D币）',async e=>{if(await confirmD('花 '+fmt(cost)+' D币把丹炉升到 '+(lv+1)+' 级？'))run({a:'xianFurnaceUp'},{busy:e.currentTarget})},{class:'xb ghost small'}):null),jobBox,
    el('div',{class:'xian-row'},el('label',{},el('input',{type:'radio',name:'fire',checked:fire==='soft',onchange:()=>{fire='soft'}}),' 文火（成丹率 +10%）'),el('label',{},el('input',{type:'radio',name:'fire',checked:fire==='hard',onchange:()=>{fire='hard'}}),' 武火（-10%，品质更高）'),el('label',{},el('input',{type:'checkbox',checked:best,onchange:e=>{best=e.target.checked}}),' 优先用高品质仙草')),
    el('div',{class:'xian-list'},C.XIAN_PILLS.map(p=>{const n=numIn(1,R.xianFurnaceBatch(x)),have=Object.entries(p.in).map(([h,k])=>R.xianHerb(h).name+' '+R.xianQtyTotal(x.herbs,h)+'/'+k);
     const eat=['qi','rage','stone'].includes(p.id)&&R.xianQtyTotal(x.pills,p.id)?btn('服用',e=>run({a:'xianEat',id:p.id,best:true},{busy:e.currentTarget}),{class:'xb ghost small'}):null;
     return el('div',{class:'xian-item'},pillIcon(p.id,40),el('div',{},el('b',{text:p.name+' · 持有 '+R.xianQtyTotal(x.pills,p.id)}),el('small',{text:p.desc}),el('small',{class:'muted',text:'每颗：'+have.join('、')+' · '+p.hours+' 小时'})),eat,n,btn('开炉',e=>run({a:'xianBrew',id:p.id,n:Number(n.value),fire,best},{busy:e.currentTarget}),{disabled:!!j}))}))];
  },{wide:true});
 }
 function openField(){
  let seed='dew';
  openSheet('灵田 · 灵泉',()=>{
   const x=conn.x,t=conn.now(),today=x.dy?.d===R.xianDay(t)?x.dy:{water:0},charges=R.xianSpringCharges(x)-today.water,slv=x.spring||1;
   const ready=x.plots.filter(p=>R.xianPlotReady(p,t)).length,empty=x.plots.filter(p=>!p).length;
   const select=el('select',{class:'xian-num wide',onchange:e=>{seed=e.target.value}},C.XIAN_HERBS.map(h=>el('option',{value:h.id,selected:h.id===seed},h.name+'（种子 '+(x.seeds[h.id]||0)+'）')));
   const plotCost=x.plots.length<C.XIAN_ECON.plotMax?C.xianPlotPrice(x.plots.length):0,springCost=C.XIAN_ECON.springPrice[slv];
   return [el('div',{class:'xian-actions'},select,btn('空地全种（'+empty+'）',e=>run({a:'xianPlant',i:'all',id:seed},{busy:e.currentTarget}),{disabled:!empty}),btn('灵泉浇灌（剩 '+Math.max(0,charges)+' 次）',e=>run({a:'xianWater',i:'all'},{busy:e.currentTarget}),{disabled:charges<=0}),btn('采收（'+ready+'）',e=>run({a:'xianHarvest'},{busy:e.currentTarget}),{class:'xb primary',disabled:!ready})),
    el('div',{class:'xian-plots'},x.plots.map((p,i)=>{if(!p)return btn('空地',e=>run({a:'xianPlant',i,id:seed},{busy:e.currentTarget}),{class:'xian-plot empty'});const h=R.xianHerb(p.h),rd=R.xianPlotReady(p,t),pr=Math.min(1,(t-p.t)/(h.hours*3600));
     return el('div',{class:'xian-plot'+(rd?' ready':'')},herbIcon(h.id,36),el('small',{text:h.name}),el('div',{class:'xian-bar thin'},el('i',{style:`width:${pr*100}%`})),el('small',{text:rd?'可采收':(p.w?'💧 ':'')+Math.ceil((p.t+h.hours*3600-t)/60)+' 分'}))})),
    el('p',{class:'muted',text:'浇灌过的灵田、与灵根同属性的仙草更容易出高品质；玄品及以上每块多收 1 株。'}),
    el('div',{class:'xian-actions'},plotCost?btn('开垦第 '+(x.plots.length+1)+' 块（'+fmt(plotCost)+' D币）',async e=>{if(await confirmD('花 '+fmt(plotCost)+' D币开垦一块灵田？'))run({a:'xianPlot'},{busy:e.currentTarget})},{class:'xb ghost'}):el('span',{class:'muted',text:'灵田已开满'}),
     slv<5?btn('灵泉升到 '+(slv+1)+' 级（'+fmt(springCost)+' D币）',async e=>{if(await confirmD('花 '+fmt(springCost)+' D币升级灵泉？每级每日多 2 次浇灌，浇灌品质加成更高。'))run({a:'xianSpringUp'},{busy:e.currentTarget})},{class:'xb ghost'}):el('span',{class:'muted',text:'灵泉已满级'})),
    el('h3',{text:'仙草库存'}),el('div',{class:'xian-bag'},C.XIAN_HERBS.filter(h=>R.xianQtyTotal(x.herbs,h.id)).map(h=>el('span',{class:'xian-bagi'},herbIcon(h.id,28),h.name,(x.herbs[h.id]||[]).map((c,q)=>c?el('i',{class:'xq q'+q,text:C.XIAN_Q[q][0]+c}):null))))];
  },{wide:true});
 }
 function openNest(){
  let feed='dew';
  openSheet('灵兽巢',()=>{
   const x=conn.x,t=conn.now();
   const sel=el('select',{class:'xian-num wide',onchange:e=>{feed=e.target.value}},C.XIAN_HERBS.map(h=>el('option',{value:h.id,selected:h.id===feed},h.name+'（'+R.xianQtyTotal(x.herbs,h.id)+'）')));
   const pend=x.pend?.k==='p'?el('div',{class:'xian-pend'},el('b',{text:'新词条：'+x.pend.v.map(([id,v])=>R.xianAffixText(id,v)).join('；')}),btn('采用新的',e=>run({a:'xianPending',keep:'new'},{busy:e.currentTarget}),{class:'xb primary'}),btn('保留原来',e=>run({a:'xianPending',keep:'old'},{busy:e.currentTarget}))):null;
   return [el('div',{class:'xian-actions'},el('span',{text:'喂食：'}),sel,btn('收集今日灵羽',e=>run({a:'xianPetClaim'},{busy:e.currentTarget})),btn('去仙市买蛋',()=>openMarket(),{class:'xb ghost'})),pend,
    x.pets.length?el('div',{class:'xian-list'},x.pets.map((p,i)=>{const k=R.xianPetKind(p.k);if(t<p.h)return el('div',{class:'xian-item'},icon([5,1],48),el('div',{},el('b',{text:'灵兽蛋'}),el('small',{text:'约 '+Math.ceil((p.h-t)/60)+' 分钟后孵化'})));
     const st=R.xianPetStage(p.gr||0),nx=C.XIAN_PET_STAGE[st+1];
     return el('div',{class:'xian-item pet'+(x.pet===i?' on':'')},el('span',{class:'xi emoji big',text:k.emoji}),el('div',{},el('b',{text:k.name+' · '+C.XIAN_PET_STAGE[st].name+(x.pet===i?' · 出战中':'')}),el('small',{text:k.desc+' · 成长 '+(p.gr||0)+(nx?' / '+nx.at:'')}),el('small',{class:'muted',text:(p.a||[]).map(([id,v])=>R.xianAffixText(id,v)).join('；')})),
      el('div',{class:'xian-actions col'},btn(x.pet===i?'休息':'出战',e=>run({a:'xianPetActive',i:x.pet===i?-1:i},{busy:e.currentTarget})),btn('喂 5 份',e=>run({a:'xianPetFeed',i,id:feed,n:5},{busy:e.currentTarget})),
       R.xianQtyTotal(x.pills,'beast')?btn('兽元丹',e=>run({a:'xianEat',id:'beast',i,best:true},{busy:e.currentTarget}),{class:'xb ghost small'}):null,
       btn('洗灵',async e=>{if(await confirmD('消耗洗灵露 1 份与 300 灵石重洗词条？'))run({a:'xianPetWash',i},{busy:e.currentTarget})},{class:'xb ghost small'}),
       btn('放生',async e=>{if(await confirmD('放生'+k.name+'？成长和词条都会消失。'))run({a:'xianPetRelease',i},{busy:e.currentTarget})},{class:'xb ghost small'})))})):el('p',{class:'muted',text:'还没有灵宠。去仙市买一枚灵兽蛋吧。'}),
    el('p',{class:'muted',text:'每只每天最多喂 10 份仙草，喂过的灵宠第二天前可收灵羽。成年、灵化时各领悟一条新词条。'})];
  },{wide:true});
 }
 function itemCard(x,it,{actions=true}={}){
  const b=R.xianBase(it.b),on=x.eq[b.k]===it.id;
  return el('div',{class:'xian-item g'+it.g+(on?' on':'')},itemIcon(it,44),el('div',{},el('b',{text:C.XIAN_GRADE[it.g]+'·'+b.name+(it.el?' · '+C.XIAN_EL[it.el]:'')+' · Lv'+it.lv+(on?' · 已装备':'')}),b.desc?el('small',{text:b.desc}):null,el('ul',{class:'xian-affix'},it.a.map(([id,v])=>el('li',{text:R.xianAffixText(id,v)})))),
   actions?el('div',{class:'xian-actions col'},on?btn('卸下',e=>run({a:'xianUnequip',slot:b.k},{busy:e.currentTarget})):btn('装备',e=>run({a:'xianEquip',id:it.id},{busy:e.currentTarget}),{class:'xb primary'}),btn('洗练',()=>openReforge(it.id),{class:'xb ghost small'}),on?null:btn('分解',async e=>{if(await confirmD('分解'+b.name+'换 '+20*(it.g+1)*(it.g+1)+' 灵石？'))run({a:'xianSalvage',id:it.id},{busy:e.currentTarget})},{class:'xb ghost small'})):null);
 }
 function openForge(){
  openSheet('炸药坊 · 炼器',()=>{
   const x=conn.x,iron=R.xianIsleCount(conn.s,'iron'),bomb=R.xianIsleCount(conn.s,'bomb');
   return [el('div',{class:'xian-forge'},
     el('div',{class:'xian-forge-npc'},sprite('iron',{size:72,cls:'idle'}),el('div',{},el('b',{text:'铁衣锻器'}),el('small',{text:'200 灵石 + 小岛铁矿×3（持有 '+iron+'）'}),el('div',{class:'xian-actions'},Object.entries(C.XIAN_SLOTS).map(([k,l])=>btn('锻'+l,e=>run({a:'xianForge',slot:k},{busy:e.currentTarget})))))),
     el('div',{class:'xian-forge-npc'},sprite('lafish',{size:72,cls:'idle'}),el('div',{},el('b',{text:'辣鱼的炸药坊'}),el('small',{text:'300 灵石 + 小岛炸药×5（持有 '+bomb+'）'}),el('div',{class:'xian-actions'},btn('做鸡关枪',e=>run({a:'xianBombForge',base:'gun'},{busy:e.currentTarget}),{class:'xb primary'}),btn('做汝知炮',e=>run({a:'xianBombForge',base:'cannon'},{busy:e.currentTarget}),{class:'xb primary'}))))),
    el('h3',{text:'法宝囊 '+x.items.length+'/'+C.XIAN_ECON.bagMax}),el('div',{class:'xian-list'},[...x.items].sort((a,b)=>(Object.values(x.eq).includes(b.id)-Object.values(x.eq).includes(a.id))||b.g-a.g).map(it=>itemCard(x,it)))];
  },{wide:true});
 }
 function openReforge(id){
  const lock=new Set();
  openSheet('洗练法宝',()=>{
   const x=conn.x,it=x.items.find(z=>z.id===id);if(!it)return el('p',{text:'法宝已不在'});const sc=100*(it.g+1),dc=lock.size*C.XIAN_ECON.lockPerAffix;
   const pend=x.pend?.k==='i'&&x.pend.i===id?el('div',{class:'xian-pend'},el('b',{text:'新词条'}),el('ul',{class:'xian-affix'},x.pend.v.map(([a,v])=>el('li',{text:R.xianAffixText(a,v)}))),btn('采用新的',e=>run({a:'xianPending',keep:'new'},{busy:e.currentTarget}),{class:'xb primary'}),btn('保留原来',e=>run({a:'xianPending',keep:'old'},{busy:e.currentTarget}))):null;
   return [itemCard(x,it,{actions:false}),el('p',{text:'勾选要锁定的词条（每条 50 万 D币），其余重新随机。洗完可以选择保留原词条。'}),
    el('div',{class:'xian-locks'},it.a.map(([a,v],i)=>el('label',{},el('input',{type:'checkbox',checked:lock.has(i),onchange:e=>{e.target.checked?lock.add(i):lock.delete(i);sheetDraw()}}),' 锁定 '+R.xianAffixText(a,v)))),
    el('div',{class:'xian-actions'},btn('洗练（'+sc+' 灵石'+(dc?' + '+fmt(dc)+' D币':'')+'）',async e=>{if(dc&&!await confirmD('锁定 '+lock.size+' 条词条需要 '+fmt(dc)+' D币，确定洗练？'))return;run({a:'xianReforge',id,lock:[...lock]},{busy:e.currentTarget})},{class:'xb primary',disabled:!!x.pend||lock.size>=it.a.length})),pend];
  });
 }
 function openArena(){
  openSheet('论剑台 · 佬友切磋',()=>{
   const x=conn.x,today=x.dy?.d===R.xianDay(conn.now())?x.dy:{duel:0,won:[]};
   return [el('p',{text:'每天最多切磋 10 次；每位佬友每天首胜有礼物和修为。我方战力 '+fmt(R.xianStats(x).power)+'。'}),
    el('div',{class:'xian-grid'},[...C.XIAN_NPCS].sort((a,b)=>a.lv-b.lv).map(n=>el('button',{type:'button',class:'xian-duel'+(today.won.includes(n.id)?' won':''),onclick:()=>openNpc(n)},sprite(n.id,{size:64,cls:'idle'}),el('b',{text:n.name}),el('small',{text:'Lv'+n.lv+' · '+C.XIAN_EL[n.el]+(today.won.includes(n.id)?' · ✓':'')}))))];
  },{wide:true});
 }
 function openTower(){
  openSheet('妖兽洞 · 秘境塔',()=>{
   const x=conn.x,today=x.dy?.d===R.xianDay(conn.now())?x.dy:{tower:0,extra:0},f=(x.tw.f||0)+1,e=R.xianTowerEnemy(f),free=Math.max(0,C.XIAN_ECON.towerFree-today.tower),cost=C.XIAN_ECON.towerExtraBase*Math.pow(2,today.extra);
   return [el('div',{class:'xian-tower'},sprite(e.npc,{size:96,row:3,cls:'idle'+(e.boss?' boss':'')}),el('div',{},el('h3',{text:'第 '+f+' 层 · '+e.name+(e.boss?'（首领）':'')}),el('small',{text:'Lv'+e.lv+' · '+C.XIAN_EL[e.el]+'系 · 生命 '+fmt(e.hp)+' · 攻击 '+fmt(e.atk)}),el('p',{text:'最高第 '+(x.tw.best||0)+' 层 · 今日免费 '+free+' 次'}))),
    el('p',{class:'muted',text:'塔里都是佬友的心魔幻影。每 10 层有首领，必掉法宝；普通层也有机会掉宝、得种子。'}),
    el('div',{class:'xian-actions'},free?btn('挑战',async ev=>{const r=await run({a:'xianTower'},{busy:ev.currentTarget});if(r?.battle)showBattle(r,'bamboo')},{class:'xb primary big'}):
     today.extra<C.XIAN_ECON.towerExtraMax?btn('开传送阵再战（'+fmt(cost)+' D币）',async ev=>{if(!await confirmD('花 '+fmt(cost)+' D币再挑战一次？'))return;const r=await run({a:'xianTower',pay:true},{busy:ev.currentTarget});if(r?.battle)showBattle(r,'bamboo')},{class:'xb primary'}):el('span',{class:'muted',text:'今天已经到上限了'}))];
  });
 }
 function showBattle(r,bg){
  const b=r.battle,en=r.enemy,me=R.xianStats(conn.x);let i=0,skip=false;
  const hpA=el('i'),hpB=el('i'),txt=el('p',{class:'xian-bt-text',text:'开战！'}),fx=el('span',{class:'xian-fx'});
  const A=el('div',{class:'xian-ft a'},sprite('hero',{size:128,row:1,cls:'fight flip'}),el('div',{class:'xian-hp'},hpA),el('b',{text:'我 · '+R.xianStageOf(conn.x.lv).name}));
  const B=el('div',{class:'xian-ft b'},sprite(en.npc||'52d',{size:128,row:1,cls:'fight'}),el('div',{class:'xian-hp'},hpB),el('b',{text:en.name+' · Lv'+en.lv}));
  const wrap=el('div',{class:'xian-battle',style:`background-image:url(${ART}bg-${bg}.webp)`},A,B,fx,txt,btn('跳过',()=>{skip=true},{class:'xb ghost x-skip'}));
  root.append(wrap);const max=b.max;
  const setHp=(a,bb)=>{hpA.style.width=Math.max(0,a/max[0]*100)+'%';hpB.style.width=Math.max(0,bb/max[1]*100)+'%'};setHp(max[0],max[1]);
  const NAMES={hit:'攻击',crit:'暴击！',miss:'闪避',gun:'鸡关枪',cannon:'汝知炮！',burn:'灼烧',regen:'回元',pill:'服下回春丹',thorn:'反震',freeze:'冰封！',frozen:'被冰封',double:'连击！'};
  const FXROW={crit:0,cannon:1,gun:2,regen:3,pill:3};
  const pop=(side,k,v)=>{const tgt=(['regen','pill','double','frozen'].includes(k)?side:1-side)===0?A:B;const n=el('span',{class:'xian-pop '+k,text:(['regen','pill'].includes(k)?'+':v?'-':'')+(v?fmt(v):NAMES[k]||'')});tgt.append(n);setTimeout(()=>n.remove(),900);
   if(FXROW[k]!=null){fx.style.setProperty('--row',FXROW[k]);fx.className='xian-fx play '+(tgt===A?'on-a':'on-b');void fx.offsetWidth;fx.className='xian-fx play '+(tgt===A?'on-a':'on-b')}
   (side===0?A:B).classList.add('lunge');setTimeout(()=>(side===0?A:B).classList.remove('lunge'),220)};
  const finish=()=>{setHp(b.hp[0],b.hp[1]);txt.textContent=(r.win?'胜利！':'败北……')+(r.gains?.length?' 获得：'+r.gains.join('、'):'');wrap.append(btn('收起',()=>wrap.remove(),{class:'xb primary x-done'}))};
  const step=()=>{if(destroyed)return;if(skip||i>=b.log.length)return finish();const[side,k,v,ha,hb]=b.log[i++];setHp(ha,hb);txt.textContent=(side===0?'我':en.name)+'：'+(NAMES[k]||k)+(v?' '+fmt(v):'');pop(side,k,v);timer=setTimeout(step,k==='double'?180:420)};
  timer=setTimeout(step,500);
 }
 render();
 const tick=setInterval(()=>{if(sheetDraw&&root.querySelector('.xian-job,.xian-plots,.xian-hero-card'))sheetDraw()},30000);
 return {async destroy(){destroyed=true;clearInterval(tick);clearTimeout(timer);conn.close();sheetClose?.();root.remove()}};
}
