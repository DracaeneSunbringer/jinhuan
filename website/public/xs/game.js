// 大肥鱼修仙记 · 场景：行走、NPC、对话、HUD、快捷栏、切图、灵药园种田。全部鼠标/触屏点击操作，键盘只是可选。
import {TILE,loadImage,Input,Sheet,TileMap,Actor,Camera,Loop,findPath} from './engine.js?v=20b20a0e';
import {Dialog,Hud,Hotbar,Panel,toast,floatText,h} from './ui.js?v=20b20a0e';
import {npc} from './content.js?v=20b20a0e';
import {HERBS,PILLS,QUALITY,CAN_MAX,EN_MAX,newXs,act as xsAct,tick,LV_NEED,ROOTS,FUSIONS,REALMS,rootMult,cvNeed,fuseKey,MED_MAX,TECHS,TECH_PRICE,techEff,powerOf,STAGES,FIGHT_COST,TECH_BUFF,techLayer,layerNeed,techPerks} from './rules.js?v=20b20a0e';
import {Farm,herbIcon} from './farm.js?v=20b20a0e';
import {createStory} from './story.js?v=20b20a0e';
import {playBrew,pillIcon,PILL_COLORS} from './alchemy.js?v=20b20a0e';
import {playDanmaku} from './danmaku.js?v=20b20a0e';
import {setupXs2,GUIDE2} from './xs2.js?v=20b20a0e';
import {setupXs3,GUIDE3} from './xs3.js?v=20b20a0e';
// 4×4 行走图：行 = 下 / 左 / 上 / 特写（御剑、惊讶、打坐、欢呼）；右 = 左镜像
const WALK_CLIPS={down:{start:0,n:4,fps:7},left:{start:4,n:4,fps:7},up:{start:8,n:4,fps:7},sword:{start:12,n:1,fps:1},shock:{start:13,n:1,fps:1},sit:{start:14,n:1,fps:1},cheer:{start:15,n:1,fps:1},idle:{start:0,n:1,fps:1}};
const SHICHEN=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const TOOLS=[{id:'hoe',label:'玉锄',col:0},{id:'can',label:'灵泉水壶',col:1},{id:'sickle',label:'灵镰',col:3}];
// 种田帧表 4×6：下 / 左 / 上 / 锄地 / 浇水 / 举起收获
const FARM_CLIPS={down:{start:0,n:4,fps:7},left:{start:4,n:4,fps:7},up:{start:8,n:4,fps:7},hoe:{start:12,n:4,fps:9,loop:false},water:{start:16,n:4,fps:7,loop:false},lift:{start:20,n:4,fps:7,loop:false},idle:{start:0,n:1,fps:1}};
const sheetIcon=(img,col,row=0,cell=128)=>size=>{const c=document.createElement('canvas');c.width=c.height=cell;c.getContext('2d').drawImage(img,col*cell,row*cell,cell,cell,0,0,cell,cell);c.style.width=c.style.height=size+'px';c.className='xs-icon';return c};
// store：{state, act(a)→Promise<{ok,msg,...}>}；不传则只在本页内存里玩（测试用）
export async function mountXs(host,{art,maps='/xs/maps/',onReturn,store,start='ferry'}={}){
 const now=store?.now||(()=>Math.floor(Date.now()/1000));
 let x=store?.state||newXs(now());
 const send=store?.act||(async a=>xsAct(x,a,now()));
 const root=h('div','xs');host.append(root);
 const cv=h('canvas','xs-cv'),g=cv.getContext('2d');root.append(cv);
 const input=new Input(root),dlg=new Dialog(root,{faceUrl:id=>globalThis.__xsResolve?globalThis.__xsResolve(art+'face-'+id+'.webp?v=20b20a0e'):art+'face-'+id+'.webp?v=20b20a0e'}),hud=new Hud(root),panel=new Panel(root);hud.onHelp=()=>openGuide();
 const floats=h('div','xs-floats');root.append(floats);
 const emoji=e=>size=>{const s=h('span','xs-emoji',e);s.style.fontSize=size*.8+'px';return s};
 const menu=h('div','xs-ui xs-menu');const mk=(t,fn)=>{const [ic,...rest]=t.split(' '),b=h('button','xs-btn',h('i',null,ic),h('span',null,' '+rest.join(' ')));b.type='button';b.title=rest.join(' ');b.onclick=fn;return b};
 menu.append(mk('⛵ 回小岛',()=>onReturn?.()),mk('🎒 行囊',()=>openBag()));root.append(menu);
 const fade=h('div','xs-fade');root.append(fade);
 const goalEl=h('div','xs-ui xs-goal',h('b',null,'目标'),h('span'));goalEl.onclick=()=>goalEl.classList.toggle('open');root.append(goalEl);
 const story=createStory({x,send:a=>send(a),dlg,toast:(m,k)=>toast(root,m,k),flush:()=>store?.flush?.()});
 const showGoal=()=>{goalEl.lastChild.textContent=story.goal(map?.id)};
 const [poseImg,herbsImg,farmImg,toolsImg]=await Promise.all([loadImage(art+'disciple.webp?v=20b20a0e'),loadImage(art+'herbs.webp?v=20b20a0e'),loadImage(art+'whale-farm.webp?v=20b20a0e'),loadImage(art+'tools.webp?v=20b20a0e')]);
 const xs2=setupXs2({root,getX:()=>x,send:a=>send(a),flush:()=>store?.flush?.(),dlg,panel,art,now,herbsImg,resolve:u=>globalThis.__xsResolve?globalThis.__xsResolve(u):u,onChange:()=>{}});
 const xs3=setupXs3({root,getX:()=>x,send:a=>send(a),flush:()=>store?.flush?.(),dlg,art,now,resolve:u=>globalThis.__xsResolve?globalThis.__xsResolve(u):u,onChange:()=>{},playBoss:k=>playBoss(k)});
 menu.append(mk('👥 人脉',()=>xs2.openPeople()),mk('🏯 宗门',()=>xs2.openSect()),mk('🗺 秘境',()=>xs3.openRealm()));
 const poseSheet=new Sheet(poseImg,128,128,WALK_CLIPS,{cols:4,foot:.93}),meSheet=new Sheet(farmImg,128,128,FARM_CLIPS,{cols:4,foot:.93});
 // 快捷栏：三件农具 + 已有种子（点选＝手持）
 const hot=new Hotbar(root,s=>{if(s)held=s.id});let held='hoe';
 function refreshHot(){const seeds=Object.keys(HERBS).filter(k=>x.seeds[k]>0);
  hot.slots=[...TOOLS.map(t=>({id:t.id,label:t.label,icon:sheetIcon(toolsImg,t.col),count:t.id==='can'?x.can:null})),...seeds.map(k=>({id:'seed:'+k,label:HERBS[k].name+'种子',icon:herbIcon(herbsImg,HERBS[k].row,0),count:x.seeds[k]}))];
  const i=hot.slots.findIndex(s=>s.id===held);if(i<0)held=hot.slots[0].id;hot.sel=Math.max(0,hot.slots.findIndex(s=>s.id===held));hot.render()}
 refreshHot();
 const npcSheets={};const npcSheet=async id=>npcSheets[id]||(npcSheets[id]=new Sheet(await loadImage(art+'npc-'+id+'.webp?v=20b20a0e'),128,128,{...WALK_CLIPS,special:{start:12,n:4,fps:4,loop:false}},{cols:4,foot:.95}));
 const me=new Actor({x:0,y:0,sheet:meSheet,speed:230,name:'大肥鱼'});
 let map=null,farm=null,npcs=[],cam=new Camera(),dpr=1,vw=0,vh=0,busy=false,pose=null,goal=null,marker=null,hover=null;
 async function enter(id,at){
  busy=true;fade.classList.add('on');
  const json=globalThis.__xsJSON?await globalThis.__xsJSON(maps+id+'.json?v=20b20a0e'):await (await fetch(maps+id+'.json?v=20b20a0e')).json(),bg=await loadImage(art+json.bg);map=new TileMap(json,bg);farm=json.plots?new Farm(map,herbsImg):null;
  [me.x,me.y]=at||json.spawn;hot.el.hidden=!json.plots;me.path=[];goal=null;hover=null;
  npcs=await Promise.all(Object.entries(json.npcs||{}).map(async([nid,[nx,ny]])=>{const a=new Actor({x:nx,y:ny,sheet:await npcSheet(nid),speed:45,name:npc(nid)?.name||nid,id:nid});a.home=[nx,ny];a.wait=1+Math.random()*4;a.target=null;return a}));
  cam.x=me.x-vw/cam.z/2;cam.y=me.y-vh/cam.z/2;setTimeout(()=>{fade.classList.remove('on');busy=false},150);
  showGoal();setTimeout(async()=>{await story.onEnter(id);showGoal();setTimeout(()=>xs2.maybeEvent(),900);if(x.med){const o=map.objs.find(o=>o.kind==='cultivate');if(o){me.x=o.stand[0];me.y=o.stand[1];showMed()}}},350);
 }
 function resize(){const r=root.getBoundingClientRect();dpr=Math.min(1.5,devicePixelRatio||1);vw=r.width;vh=r.height;cv.width=Math.round(vw*dpr);cv.height=Math.round(vh*dpr);cam.z=Math.max(.7,Math.min(1.25,vw/1100))}
 const ro=new ResizeObserver(resize);ro.observe(root);resize();
 const screen=(wx,wy)=>[(wx-cam.x)*cam.z,(wy-cam.y)*cam.z];
 const say=(text,wx,wy,cls)=>{const[sx,sy]=screen(wx,wy);floatText(floats,text,sx,sy,cls)};
 // ---------- 种田：点一块田，走过去，按田里的情况用对应农具 ----------
 function plotAction(p){const s=x.plots[p.i];
  if(s.c&&s.g>=3)return {a:'harvest',i:p.i,tool:'sickle'};
  if(s.s==='weed'||s.dead)return {a:'hoe',i:p.i,tool:'hoe'};
  if(!s.c){const seed=held.startsWith('seed:')?held.slice(5):Object.keys(HERBS).find(k=>x.seeds[k]>0);if(!seed)return {err:'没有种子了，去农具棚买'};return {a:'plant',i:p.i,herb:seed,tool:'seed:'+seed}}
  if(!s.w)return {a:'water',i:p.i,tool:'can'};
  const left=Math.max(0,HERBS[s.c].grow-(now()-s.w));return {err:HERBS[s.c].name+' 生长中，还要 '+fmt(left)}}
 const fmt=s=>s>=3600?Math.floor(s/3600)+' 小时 '+Math.ceil(s%3600/60)+' 分':s>=60?Math.ceil(s/60)+' 分钟':s+' 秒';
 async function doPlot(p){const a=plotAction(p);if(a.err){say(a.err,p.x,p.y-30,'bad');return}
  held=a.tool;refreshHot();me.face(p.x-me.x,p.y-me.y);busy=true;pose={name:a.a,t:0};
  const fxAt=[p.x,p.y];setTimeout(()=>farm?.burst(a.a,...fxAt),180);
  try{const r=await send({a:a.a,i:a.i,herb:a.herb});if(!r.ok)say(r.msg,p.x,p.y-30,'bad');else{
    if(a.a==='harvest'){say('+'+r.n+' '+HERBS[r.herb].name,p.x,p.y-40,'good');story.onHarvest().then(showGoal);if(r.lvUp)setTimeout(()=>{pose={name:'cheer',t:0};toast(root,'灵药园升到 '+r.lvUp+' 级，可以种新灵植了')},400)}
    else say(r.msg,p.x,p.y-30);say('灵力 −'+({hoe:3,plant:1,water:1,harvest:2}[a.a]),me.x,me.y-90,'blue')}}
  catch(e){say(e.message||'网络不稳，稍后再试',p.x,p.y-30,'bad')}
  finally{refreshHot();setTimeout(()=>{busy=false;pose=null},600)}}
 // ---------- 柜台、灵泉井、行囊 ----------
 function shopTabs(){const buy=Object.entries(HERBS).map(([k,H])=>({icon:herbIcon(herbsImg,H.row,0),label:H.name+'种子',sub:H.lv>x.lv?H.lv+' 级解锁':H.seed+' 灵石',count:x.seeds[k]||0,disabled:H.lv>x.lv||x.stone<H.seed,on:()=>trade({a:'buy',herb:k,n:1})}));
  const sell=Object.entries(x.bag).filter(([,n])=>n>0).map(([k,n])=>({icon:herbIcon(herbsImg,HERBS[k].row,3),label:HERBS[k].name,sub:HERBS[k].sell+' 灵石/株',count:n,on:()=>trade({a:'sell',herb:k,n:1})}));
  return [{title:'买种子',cells:buy,note:'点一下买一包。持有灵石 '+x.stone+'。'},{title:'卖药材',cells:sell,note:sell.length?'点一下卖一株。':'行囊里还没有药材。'}]}
 async function trade(a){const r=await send(a);toast(root,r.msg,r.ok?'':'bad');refreshHot();panel.update(shopTabs())}
 function openBag(){const herbs=Object.entries(x.bag).filter(([,n])=>n>0).map(([k,n])=>({icon:herbIcon(herbsImg,HERBS[k].row,3),label:HERBS[k].name,sub:'可卖 '+HERBS[k].sell,count:n}));
  const seeds=Object.entries(x.seeds).filter(([,n])=>n>0).map(([k,n])=>({icon:herbIcon(herbsImg,HERBS[k].row,0),label:HERBS[k].name+'种子',count:n,on:()=>{held='seed:'+k;refreshHot();panel.close()}}));
  const pills=Object.entries(x.pills||{}).filter(([,n])=>n>0).map(([k,n])=>({icon:pillIcon(PILL_COLORS[k]),label:PILLS[k].name,sub:'点击服用',count:n,on:async()=>{const r=await send({a:'use',herb:k});toast(root,r.msg,r.ok?'':'bad');openBag()}}));
  panel.show('行囊',[{title:'药材',cells:herbs,note:'药园 '+x.lv+' 级 · 经验 '+x.xp+'/'+LV_NEED(x.lv)},{title:'种子',cells:seeds,note:'点种子＝拿在手上，再点空田就种这一种。'},{title:'丹药',cells:pills,note:'回灵丹每日至多服 3 颗。'},{title:'修为',cells:[...(x.roots?[...x.roots.e.map(k=>({label:ROOTS[k]+'灵根',sub:'五行'})),...x.roots.v.map(v=>({label:Object.values(FUSIONS).find(f=>f.id===v).name+'灵根',sub:'变异'}))]:[])],note:rootName()+' · '+realmName()+' · 修为 '+x.cv.xp+'/'+cvNeed(x.cv.r,x.cv.s)+' · 修炼倍率 ×'+rootMult(x).toFixed(2)+'。根数越少前期越快，越多后期越强。'}])}
 // ---------- 打坐、突破、融合灵根（蒲团） ----------
 const rootName=()=>x.roots?[...x.roots.e.map(k=>ROOTS[k]),...x.roots.v.map(v=>Object.values(FUSIONS).find(f=>f.id===v).name)].join('')+'灵根':'未测';
 const realmName=()=>REALMS[x.cv.r]+' '+x.cv.s+' 层';
 async function cushion(o){if(!x.roots){await dlg.say([{name:'蒲团',text:'先去找风祝师姐测过灵根，才知道该怎么吐纳。'}]);return}
  const c=x.cv,full=c.s>=9&&c.xp>=cvNeed(c.r,9),pairs=x.roots.e.flatMap((a,i)=>x.roots.e.slice(i+1).map(b=>fuseKey(a,b))).filter(k=>FUSIONS[k]);
  const opts=[{label:'打坐修炼（修炼倍率 ×'+rootMult(x).toFixed(2)+'）',fn:()=>sit(o)}];
  if(full)opts.push({label:'冲击'+REALMS[c.r+1]+'（培元丹 ×'+(c.r+1)+'，六成把握）',fn:()=>doBreak()});
  if(c.r>=1)for(const k of pairs)opts.push({label:'融合 '+k.split('+').map(e=>ROOTS[e]).join('、')+' → '+FUSIONS[k].name+'灵根（培元丹×2、灵石200，五成五把握）',fn:()=>fuse(k)});
  opts.push({label:'离开',fn:()=>{}});
  await dlg.say([{name:'蒲团',text:rootName()+' · '+realmName()+'\n修为 '+c.xp+' / '+cvNeed(c.r,c.s)+'。入定至少一分钟才有收获，最多算半个时辰（30 分钟）。'}],opts)}
 let medEl=null;
 async function sit(o){const r=await send({a:'sit'});if(!r.ok){toast(root,r.msg,'bad');return}me.x=o.stand[0];me.y=o.stand[1];me.path=[];showMed()}
 function showMed(){pose={name:'sit',t:0,keep:true};medEl?.remove();medEl=h('div','xs-ui xs-med',h('b',null,'入定中'),h('span'),h('small',null,'点任意处收功'));root.append(medEl)}
 async function rise(){const r=await send({a:'rise'});medEl?.remove();medEl=null;pose=null;toast(root,r.msg,r.ok&&r.gainCv?'':'bad');if(r.lvUp2)toast(root,'晋升 '+r.lvUp2)}
 async function doBreak(){pose={name:'sit',t:0};const before=x.cv.r,r=await send({a:'break'});if(!r.ok){pose=null;toast(root,r.msg,'bad');return}await store?.flush?.();const up=x.cv.r>before;pose=up?{name:'cheer',t:0}:null;toast(root,up?'突破成功！进入'+REALMS[x.cv.r]:'突破失败，修为受损',up?'':'bad');setTimeout(()=>pose=null,1200)}
 async function fuse(k){const v0=x.roots.v.length,r=await send({a:'fuse',el:k});if(!r.ok){toast(root,r.msg,'bad');return}await store?.flush?.();const ok=x.roots.v.length>v0;toast(root,ok?'融合成功：'+rootName():'融合失败，灵根震荡（修为受损，一日后可再试）',ok?'':'bad')}
 // ---------- 功法（经卷台）与斗法（论剑台） ----------
 const elName=k=>ROOTS[k]||Object.values(FUSIONS).find(f=>f.id===k)?.name||k;
 function techCells(){const mine=x.roots?[...x.roots.e,...x.roots.v]:[];return Object.entries(TECHS).map(([k,T])=>{const ok=mine.includes(k),has=(x.techs||[]).includes(k);
  return {icon:pillIcon(PILL_COLORS[k]||({fire:'#ff7030',water:'#40c0ff',wood:'#50d060',metal:'#ffe060',earth:'#c08040',ice:'#a0f0ff',thunder:'#c070ff',wind:'#90ffc0',lava:'#ff4020',poison:'#80ff40'})[k]),label:T.name+(x.tech===k?' · 主修':''),sub:has?('第 '+techLayer(x,k)+' 层 · '+(x.tech===k?TECH_BUFF[k]:'点击主修')):(ok?TECH_PRICE+' 灵石 · ':elName(k)+'灵根可修 · ')+TECH_BUFF[k],disabled:!ok&&!has,on:async()=>{const r=await send(has?{a:'equip',el:k}:{a:'learn',el:k});toast(root,r.msg,r.ok?'':'bad');panel.update(techTabs())}}})}
 const techTabs=()=>[{title:'功法',cells:techCells(),note:(x.roots?rootName()+'：':'')+(techEff(x)>1?'单灵根只能修本属性功法，但功法效率 ×1.5。':'多灵根可修各自属性的功法。')+' 主修功法决定斗法的射击方式和符卡，还带一项日常加成（主修每天可换一次）。用主修功法每赢一场斗法 +1 熟练，层数越高战力越强：3 层多一张符卡，6 层多一条命，9 层再多一张符卡。'}];
 function openGuide(){const L=techLayer(x),T=x.tech&&TECHS[x.tech],nx=L&&L<9?layerNeed(L)-(x.tm?.[x.tech]||0):0;
  panel.show('玩法说明',[
   {title:'入门',text:[['你在做什么','你是刚拜入云梦仙门的外门弟子大肥鱼。先跟着左上角的任务指引走完序章（渡口→宗门广场测灵根→灵药园收第一株灵草→向麦穗复命），之后就是自由修行。'],
    ['怎么操作','点地面走过去，点人物对话，点田块用当前道具。底部道具栏切换锄头、水壶、种子；场景边缘的木牌是出入口。'],
    ['灵力','右侧竖条是灵力：锄地 3、种植 1、浇水 1、收获 2、炼丹 5、斗法 10。每 6 分钟回 1 点，上限 100。回灵丹可以补。']]},
   {title:'种田炼丹',text:[['种田','锄草→播种→浇水。每浇一次长一阶，共三阶，长好一阶要再浇。熟了点田收获。药材可以卖灵石，也是炼丹材料。'],
    ['药园等级','收获和炼丹给药园经验，升级后解锁金菇、铃兰、冰莲、赤芝、雷竹，越贵越慢。'],
    ['炼丹','宗门广场的丹房里起炉：回灵丹（灵草3+金菇1，回 30 灵力，每天最多 3 颗）、培元丹（灵草2+铃兰1，药园经验 +40，突破和融合也要用）。守火候小游戏决定成色：凡品 1 颗、良品 2 颗、上品 3 颗。']]},
   {title:'修炼',text:[['灵根','测灵根时随机 1–5 条。根越少前期越快，根越多后期成长越高。单灵根只能修本属性功法，但功法效率 ×1.5。'],
    ['打坐','宗门广场藏经阁的太极蒲团上打坐，1–30 分钟，修为 = 时长 × 灵根倍率。修为满 9 层后用培元丹突破大境界（炼气→筑基→金丹…），成功率 30%–90%，看心境高低（「🏯 宗门」里能看到当前成功率）。'],
    ['融合灵根','筑基后，多灵根可以在蒲团上把两条灵根融合成变异灵根（冰、雷、风、熔、毒）。需要培元丹 ×2 和 200 灵石，成功率 55%，失败损修为、一天后再试。变异灵根让后期成长再高 12%，还能修对应的变异功法。']]},
   {title:'功法',text:[['功法有什么用','① 斗法：决定你的射击方式（火是宽散射，金是高速直射，毒弹会追踪…）和两张符卡。② 主修加成：主修的那一部给一项日常加成，见下表。③ 战力：大境界、小层数、功法层数都会乘到斗法伤害上。'],
    ['功法层数','用主修功法每赢一场斗法 +1 熟练。层数 = 1 + √(熟练÷2)，最高 9 层；每层伤害 +6%，3 层多一张符卡，6 层多一条命，9 层再多一张符卡。'+(T?'\n当前：'+T.name+' 第 '+L+' 层'+(nx>0?'，再赢 '+nx+' 场升层':''):'')],
    ['各功法的主修加成',...Object.entries(TECHS).map(([k,t])=>t.name+'（'+elName(k)+'）：'+TECH_BUFF[k])],
    ['学与换','藏经阁经卷台学功法，每部 50 灵石，只能学自己灵根对应的。主修每天可换一次。']]},
   GUIDE2,
   GUIDE3,
   {title:'斗法',text:[['在哪打','宗门广场藏经阁里的论剑台：秘境竹林、魔窟（筑基）、葬剑山（金丹）。和 NPC 聊天选「切磋」是同门切磋，按对手属性出招。每天共 8 场，每场 10 灵力。'],
    ['怎么打','电脑：鼠标移动，按住左键慢速（判定点显形、射击集中），右键或双击放符卡清屏。手机：在屏幕上拖动（相对移动，手指不挡飞机），左下「慢」、右下「符」。擦弹加分，收集 P 点加火力。'],
    ['奖励','胜利得灵石和修为；每个战场首胜送一颗培元丹；收取 Boss 符卡（不被击中、不放符卡打过一个符卡阶段）额外加灵石。切磋同一位同门每天只有第一次胜利有奖励。']]}])}
 function openTechs(){if(!x.roots){dlg.say([{name:'经卷台',text:'经卷上的字在你眼前游走，却一个也认不进去——先去测过灵根吧。'}]);return}panel.show('经卷台',techTabs())}
 async function arena(){if(!x.tech){await dlg.say([{name:'论剑台',text:'守台弟子：没有功法傍身就上台？先去藏经阁经卷台学一部。'}]);return}
  const opts=Object.entries(STAGES).filter(([k])=>k!=='duel').map(([k,S])=>({label:S.name+((x.cv.r||0)<S.need?'（需'+REALMS[S.need]+'）':'')+(x.clear?.[k]?' · 已通关':' · 首胜得培元丹'),fn:()=>fight(k)}));opts.unshift({label:'🗺 秘境探索（自动对战·逐层选路）',fn:()=>xs3.openRealm()});opts.push({label:'不打了',fn:()=>{}});
  await dlg.say([{name:'论剑台',text:'主修 '+TECHS[x.tech].name+' 第 '+techLayer(x)+' 层 · 战力 ×'+powerOf(x).toFixed(2)+' · 命 '+techPerks(techLayer(x)).lives+' 符卡 '+techPerks(techLayer(x)).bombs+'\n每场耗灵力 '+FIGHT_COST+'，每日 8 场。鼠标移动、按住左键慢速、右键或双击放符卡。'}],opts)}
 async function playBoss(k){busy=true;try{const res=await playDanmaku(root,{art,stage:k,duel:null,tech:x.tech,power:powerOf(x),loadImage,spellNames:TECHS[x.tech].spells,...(({lives,bombs})=>({lives,bombs}))(techPerks(techLayer(x))),minTime:STAGES[k].min+4});
   const r2=await send(res.win?{a:'win',n:res.captures}:{a:'lose'});await store?.flush?.();if(r2.layer)setTimeout(()=>toast(root,TECHS[x.tech].name+' 突破至第 '+r2.layer+' 层！'),900);return r2}finally{busy=false}}
 async function fight(k,duel=null){const r=await send({a:'fight',herb:k,...(duel?{el:duel.id}:{})});if(!r.ok){toast(root,r.msg,'bad');return}await store?.flush?.();busy=true;
  try{const res=await playDanmaku(root,{art,stage:k,duel,tech:x.tech,power:powerOf(x),loadImage,spellNames:TECHS[x.tech].spells,...(({lives,bombs})=>({lives,bombs}))(techPerks(techLayer(x))),minTime:STAGES[k].min+4});
   const r2=await send(res.win?{a:'win',n:res.captures}:{a:'lose'});await store?.flush?.();toast(root,r2.msg,res.win&&r2.ok?'':'bad');if(r2.layer)setTimeout(()=>toast(root,TECHS[x.tech].name+' 突破至第 '+r2.layer+' 层！'),900);if(res.win&&r2.ok){pose={name:'cheer',t:0};setTimeout(()=>pose=null,1200)}}
  finally{busy=false}}
 async function brewGame(k){busy=true;try{const {q}=await playBrew(root,{name:PILLS[k].name,img:map.bgImg});const r=await send({a:'finish',n:q});toast(root,r.ok?r.msg:r.msg,r.ok?'':'bad');if(r.ok){say(QUALITY[r.q]+'！',me.x,me.y-90,'good');pose={name:'cheer',t:0};setTimeout(()=>pose=null,900)}}finally{busy=false}}
 // ---------- NPC 闲聊：每次换一句，聊聊近况会接着说，并给一句当下有用的提示 ----------
 const say1=(n,text,face=0)=>({who:n.id,name:npc(n.id).name,face,text:text==='{echo}'?'……（回声把你的话原样重复了一遍）':text});
 function tipFor(){if(!x.roots)return '宗门广场的风祝师姐会给新人测灵根。';if((x.st||0)<4)return '灵药园在广场正北，麦穗在那儿等你。';if(!x.tech)return '藏经阁的经卷台可以学功法，学了才能上论剑台。';if(!(x.pills&&Object.keys(x.pills).length))return '丹房的炉子守好火候，回灵丹能补灵力。';if(!x.clear?.secret)return '论剑台的秘境竹林，首胜有培元丹拿。';return ['灵根根数越多，越往后修炼越快。','打坐至少一炷香才有收获，最多算半个时辰。','擦弹也算本事——贴着子弹走，分数涨得快。','培元丹可以拿去冲境界，也能融合灵根。'][Math.floor(Math.random()*4)]}
 let duelWith=null;
 async function chat(n){const info=npc(n.id),L=info.lines;n.ci=(n.ci??Math.floor(Math.random()*L.length));let round=0,more=true;
  const first=L[n.ci%L.length];n.ci++;
  let extra=null;if(round===0)xs2.talked(n.id);
  while(more){more=false;const ex=xs2.chatOptions(n,f=>{extra=f});const opts=[{label:round?'再聊两句':'聊聊近况',fn:()=>{more=true}},...ex,{label:'切磋',fn:()=>{duelWith=n}},{label:'告辞',fn:()=>{}}];
   const lines=round===0?[say1(n,first)]:[say1(n,L[n.ci++%L.length],1),{who:n.id,name:info.name,face:2,text:'对了——'+tipFor()}];
   await dlg.say(lines,round<3?opts:opts.slice(1));round++}
  if(extra){const f=extra;extra=null;await f();return}
  if(duelWith===n){duelWith=null;await startDuel(n)}}
 async function startDuel(n){const info=npc(n.id);if(!x.tech){await dlg.say([say1(n,'先去藏经阁学一部功法再来找我切磋吧。')]);return}
  n.talking=false;const how=await xs3.duelPrep(n);if(how!=='danmaku')return;
  n.talking=false;busy=false;await fight('duel',{id:n.id,name:info.name,el:info.el,lv:info.lv,lines:info.lines})}
 async function interact(t){if(!t||dlg.open||panel.open)return;busy=true;try{
  if(t.kind==='npc'&&await story.onTalk(t.o.id)){showGoal();return}
  if(t.kind==='npc'){const n=t.o;n.talking=true;n.face(me.x-n.x,me.y-n.y);n.bubble=null;try{await chat(n)}finally{n.talking=false}}
  else if(t.o.kind==='boat')await dlg.say([{name:'船夫',text:'要回小岛吗？'}],[{label:'回小岛',fn:()=>onReturn?.()},{label:'再逛逛',fn:()=>{}}]);
  else if(t.o.kind==='door'){busy=false;await enter(t.o.to);return}
  else if(t.o.kind==='stairs')await dlg.say([{name:t.o.name,text:'楼梯口拦着一道禁制：内门弟子方可登楼。'}]);
  else if(t.o.kind==='cultivate')await cushion(t.o);
  else if(t.o.kind==='scroll')openTechs();
  else if(t.o.kind==='arena'||t.o.kind==='tower')await arena();
  else if(t.o.kind==='shop')panel.show('农具棚 · 种子柜',shopTabs());
  else if(t.o.kind==='cauldron'){if(x.brew){await brewGame(x.brew.p);return}panel.show('炼丹炉',[{title:'丹方',cells:Object.entries(PILLS).map(([k,P])=>{const miss=Object.entries(P.need).some(([h,n])=>(x.bag[h]||0)<n);return {icon:pillIcon(PILL_COLORS[k]),label:P.name,sub:Object.entries(P.need).map(([h,n])=>HERBS[h].name+'×'+n).join(' '),disabled:miss,on:async()=>{panel.close();const r=await send({a:'brew',herb:k});if(!r.ok){toast(root,r.msg,'bad');return}await store?.flush?.();brewGame(k)}}}),note:'每炉耗 5 点灵力。'+Object.values(PILLS).map(P=>P.name+'：'+P.desc).join('；')}])}
  else if(t.o.kind==='well'){me.face(0,-1);const r=await send({a:'refill'});say(r.msg,t.o.x,t.o.y-20,r.ok?'blue':'bad');if(r.ok)farm?.burst('water',t.o.x,t.o.y+30);refreshHot()}
  else if(t.o.kind==='sign')await dlg.say([{name:'太极稻草人',text:'木牌上写着：\n灵草十分、金菇廿分、铃兰半个时辰……每浇一次水长一截，长三截就熟。\n灵力每六分钟回一点，莫贪多。'}]);
  else await dlg.say([{name:t.o.name,text:t.o.name+'（后续开放）'}]);
 }finally{busy=false}}
 function update(dt){
  if(!map)return;me.update(dt);if(pose)pose.t+=dt;tick(x,now());
  if(!busy&&!dlg.open&&!panel.open){const a=input.axis();if(a.x||a.y){me.path=[];goal=null;me.move(map,a.x,a.y,dt)}else followPath(dt);
   for(const e of map.exits){const[ex,ey,w,hh]=e.rect;if(me.x>ex&&me.x<ex+w&&me.y>ey&&me.y<ey+hh){enter(e.to,e.at);break}}}else me.moving=false;
  for(const n of npcs){n.update(dt);if(n.bubble&&(n.bubble.t-=dt)<=0)n.bubble=null;if(!n.talking&&(n.bt=(n.bt??4+Math.random()*12)-dt)<=0){n.bt=10+Math.random()*16;const L=npc(n.id)?.lines||[];const s=L[Math.floor(Math.random()*L.length)]||'';if(s&&s!=='{echo}'&&Math.hypot(n.x-me.x,n.y-me.y)<520)n.bubble={text:s.length>16?s.slice(0,15)+'…':s,t:3.2}}
   if(n.talking){n.moving=false;continue}
   if(n.target){const dx=n.target[0]-n.x,dy=n.target[1]-n.y,d=Math.hypot(dx,dy);if(d<3||n.stuck>1.5){n.target=null;n.moving=false}else{const ox=n.x,oy=n.y;n.move(map,dx/d,dy/d,dt);n.stuck=(Math.hypot(n.x-ox,n.y-oy)<.2?(n.stuck||0)+dt:0)}}
   else if((n.wait-=dt)<=0){n.wait=3+Math.random()*5;n.stuck=0;n.target=[n.home[0]+(Math.random()-.5)*120,n.home[1]+(Math.random()-.5)*60]}}
  if(medEl&&x.med){const d=Math.min(MED_MAX,now()-x.med.t);medEl.children[1].textContent=Math.floor(d/60)+' 分 '+String(d%60).padStart(2,'0')+' 秒 · 预计修为 +'+(d<60?0:Math.floor(d/60*10*rootMult(x)))}
  cam.follow(me,vw,vh,map,dt);input.endFrame();
  const d=new Date(Date.now()+8*3600e3),hh=d.getUTCHours();
  hud.set({place:map.name+(farm?' · 药园 '+x.lv+' 级':''),clock:SHICHEN[Math.floor(((hh+1)%24)/2)]+'时 · '+String(hh).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0'),energy:x.en,energyMax:EN_MAX,stone:x.stone,coins:store?.coins??0});
 }
 function drawMe(){shadow(me.x,me.y,20);
  if(pose){const clip={hoe:'hoe',water:'water',plant:'lift',harvest:'lift'}[pose.name];if(clip){meSheet.draw(g,me.x,me.y,clip,pose.t,{flip:me.dir==='right',h:88});return}
   poseSheet.draw(g,me.x,me.y,pose.name,0,{h:pose.name==='cheer'?90:84});if(pose.name==='sit'){const T=performance.now()/1000;for(let i=0;i<6;i++){const a=T*1.5+i*1.05,rr=34+Math.sin(T*2+i)*4;g.fillStyle='rgba(150,255,230,'+(.4+.3*Math.sin(T*3+i))+')';g.beginPath();g.arc(me.x+Math.cos(a)*rr,me.y-40+Math.sin(a)*rr*.45,3,0,7);g.fill()}}return}
  const dir=me.dir==='right'?'left':me.dir;meSheet.draw(g,me.x,me.y,dir,me.moving?me.t:0,{flip:me.dir==='right',h:84})}
 let lastT=performance.now();
 function draw(){const T=performance.now()/1000,dt=Math.min(.05,T-lastT/1000);lastT=T*1000;
  g.setTransform(dpr,0,0,dpr,0,0);g.fillStyle='#10202a';g.fillRect(0,0,vw,vh);if(!map)return;cam.apply(g,dpr);g.imageSmoothingEnabled=true;map.drawBg(g);
  if(farm)farm.drawGround(g,x,hover?.kind==='plot'?hover.o:null,T);
  const ents=[...npcs.map(n=>({y:n.y,f:()=>{shadow(n.x,n.y,18);const dir=n.dir==='right'?'left':n.dir;n.sheet.draw(g,n.x,n.y,dir,n.moving?n.t:0,{flip:n.dir==='right',h:80})}})),{y:me.y,f:drawMe},...(farm?farm.ents(x,now(),T).map(e=>({y:e.y,f:()=>e.f(g)})):[])];
  ents.sort((a,b)=>a.y-b.y).forEach(e=>e.f());
  if(farm)farm.drawFx(g,dt);
  for(const n of npcs){tag(n.name,n.x,n.y-86);if(n.bubble)bubble(n.bubble.text,n.x,n.y-104,Math.min(1,n.bubble.t*3))}
  // 出口与门：常亮标签 + 跳动箭头
  const T2=performance.now()/1000;for(const e of map.exits){const[ex,ey,w,hh]=e.rect,cx=ex+w/2,cy=ey+hh/2,up=ey<map.ph/2;g.save();g.globalAlpha=.75+.25*Math.sin(T2*4);g.fillStyle='rgba(255,226,120,.28)';g.fillRect(ex,ey,w,hh);g.restore();sign((up?'▲ ':'▼ ')+e.label,cx,up?cy+30+Math.sin(T2*4)*3:cy-18+Math.sin(T2*4)*3)}
  for(const o of map.objs)if(o.kind==='door')sign('⛩ '+o.name,o.x,o.y-30+Math.sin(T2*3)*2);
  if(marker&&me.path?.length){g.strokeStyle='rgba(255,255,255,.8)';g.lineWidth=2;g.beginPath();g.ellipse(marker.x,marker.y,12,5,0,0,7);g.stroke()}
  if(hover&&hover.kind!=='plot'){g.fillStyle='#ffd24a';g.font='bold 18px system-ui';g.textAlign='center';g.fillText('▼',hover.x,hover.y-(hover.kind==='npc'?72:40)+Math.sin(T*6)*3)}
 }
 // ---------- 鼠标/触屏 ----------
 const tileCenter=([tx,ty])=>[tx*TILE+16,ty*TILE+24];
 function unstick(){let tx=Math.floor(me.x/TILE),ty=Math.floor((me.y-4)/TILE);if(!map.blocked(tx,ty))return;let best=null,bd=1e9;for(let r=1;r<12&&!best;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const x2=tx+dx,y2=ty+dy;if(!map.blocked(x2,y2)){const d=dx*dx+dy*dy;if(d<bd){bd=d;best=[x2,y2]}}}if(best){[me.x,me.y]=tileCenter(best)}}
 function walkTo(px,py,onArrive){unstick();px=Math.max(8,Math.min(map.pw-8,px));py=Math.max(8,Math.min(map.ph-8,py));const ct=[Math.floor(px/TILE),Math.floor(py/TILE)],p=findPath(map,[Math.floor(me.x/TILE),Math.floor((me.y-4)/TILE)],ct);me.path=(p||[]).map(tileCenter);if(p?.length&&!map.blocked(...ct)&&!map.blocked(Math.floor(px/TILE),Math.floor((py-4)/TILE)))me.path[me.path.length-1]=[px,py];me.onArrive=onArrive||null;marker=p?{x:px,y:py}:null;if(p&&!p.length&&onArrive){me.onArrive=null;onArrive()}}
 function followPath(dt){if(!me.path?.length){me.moving=false;return}const[tx,ty]=me.path[0],dx=tx-me.x,dy=ty-me.y,d=Math.hypot(dx,dy);if(d<3){me.path.shift();if(!me.path.length){me.moving=false;const f=me.onArrive;me.onArrive=null;f?.()}return}
  const k=Math.min(1,me.speed*dt/d);me.face(dx,dy);me.moving=true;me.x+=dx*k;me.y+=dy*k}
 function pick(sx,sy){const[wx,wy]=cam.toWorld(sx,sy);for(const n of npcs)if(Math.abs(wx-n.x)<26&&wy<n.y+8&&wy>n.y-84)return{kind:'npc',o:n,x:n.x,y:n.y-20};for(const o of map.objs)if(Math.hypot(wx-o.x,wy-o.y)<(o.r||54))return{kind:'obj',o,x:o.x,y:o.y};
  const p=farm?.pick(wx,wy);if(p)return{kind:'plot',o:p,x:p.x,y:p.y};return{kind:'ground',x:wx,y:wy}}
 cv.addEventListener('pointerdown',e=>{if(dlg.open){dlg.next?.();return}if(x.med&&!busy){busy=true;dlg.say([{name:'入定',text:'已入定 '+Math.floor((now()-x.med.t)/60)+' 分钟。'}],[{label:'收功',fn:()=>rise()},{label:'继续打坐',fn:()=>{}}]).finally(()=>busy=false);return}if(!map||busy||panel.open)return;const r=cv.getBoundingClientRect(),t=pick(e.clientX-r.left,e.clientY-r.top);goal=null;
  if(t.kind==='npc'){goal=t;if(Math.hypot(t.o.x-me.x,t.o.y-me.y)<60){goal=null;interact(t)}else walkTo(t.o.x,t.o.y+28,()=>{if(goal===t&&Math.hypot(t.o.x-me.x,t.o.y-me.y)<100){goal=null;interact(t)}})}
  else if(t.kind==='obj'){if(Math.hypot(t.o.stand[0]-me.x,t.o.stand[1]-me.y)<30)interact(t);else walkTo(t.o.stand[0],t.o.stand[1],()=>interact(t))}
  else if(t.kind==='plot'){const p=t.o,sx=p.x,sy=p.y+30;if(Math.hypot(sx-me.x,sy-me.y)<26)doPlot(p);else walkTo(sx,sy,()=>doPlot(p))}
  else walkTo(t.x,t.y)});
 cv.addEventListener('pointermove',e=>{if(!map||e.pointerType!=='mouse')return;const r=cv.getBoundingClientRect(),t=pick(e.clientX-r.left,e.clientY-r.top);hover=t.kind==='ground'?null:t;cv.style.cursor=hover?'pointer':'default'});
 const shadow=(sx,sy,r)=>{g.fillStyle='rgba(20,30,20,.28)';g.beginPath();g.ellipse(sx,sy,r,r*.35,0,0,7);g.fill()};
 const sign=(t,tx,ty)=>{g.font='700 13px system-ui';const w=g.measureText(t).width+14;g.fillStyle='rgba(91,50,20,.92)';g.beginPath();g.roundRect(tx-w/2,ty-12,w,22,6);g.fill();g.strokeStyle='#ffd27a';g.lineWidth=1.5;g.stroke();g.fillStyle='#fff3c8';g.textAlign='center';g.textBaseline='middle';g.fillText(t,tx,ty-1)};
 const bubble=(t,tx,ty,a)=>{g.save();g.globalAlpha=a;g.font='600 12px system-ui';const w=Math.min(220,g.measureText(t).width+16);g.fillStyle='#fffdf4';g.strokeStyle='#5b3214';g.lineWidth=1.5;g.beginPath();g.roundRect(tx-w/2,ty-20,w,24,8);g.fill();g.stroke();g.beginPath();g.moveTo(tx-5,ty+4);g.lineTo(tx,ty+11);g.lineTo(tx+5,ty+4);g.fill();g.fillStyle='#3b2412';g.textAlign='center';g.textBaseline='middle';g.fillText(t,tx,ty-8,w-10);g.restore()};
 const tag=(t,tx,ty)=>{g.font='600 12px system-ui';const w=g.measureText(t).width+10;g.fillStyle='rgba(255,246,223,.9)';g.fillRect(tx-w/2,ty-14,w,17);g.fillStyle='#3b2412';g.textAlign='center';g.textBaseline='middle';g.fillText(t,tx,ty-5)};
 const loop=new Loop(dt=>{update(dt);draw()});
 await enter(start);loop.start();
 if(/xsdebug/.test(location.search))window.__xs={xs2,xs3,chat,me,get map(){return map},get npcs(){return npcs},get x(){return x},cam,enter,pick,screen};
 return {async destroy(){loop.stop();ro.disconnect();input.destroy();root.remove();await store?.destroy?.()}};
}
