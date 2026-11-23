// 大肥鱼修仙记 2.0（二）：同门切磋自动对战（技能槽、五行克制、观气）+ 秘境节点探索。
// 结果全部由 rules.js 的确定性模拟算出：前端按同一个种子重放战报，服务端照算一遍。
import {h,toast} from './ui.js?v=20b20a0e';
import {npc} from './content.js?v=20b20a0e';
import {TECHS,REALMS,HERBS,PILLS,EN_MAX,FIGHT_COST,FIGHT_DAILY,WHEEL,EL_NAME,skill,skillsOf,mySlots,npcFighter,meFighter,sim,MOBS,AREAS,MATS,NODES,RLM_DAILY,RLM_EN,rlmMap,rlmNext,SHOP,NEW_NPCS,techLayer} from './rules.js?v=20b20a0e';
import {NEW_NPC_INFO} from './content2.js?v=20b20a0e';

const xsDay=t=>Math.floor((t+28800)/86400);
const EV_TEXT=['一阵阴风吹过，暗处有什么东西咬了你一口。','石壁上刻着前人留下的感悟，你看了一会儿，心境通透了些。','石缝里长着几株灵药。','你踢开一块松动的石板，下面压着一个旧包裹。','一缕残存的灵气钻进经脉，修为精进了。'];
const NODE_NAME={fight:'妖物',elite:'精英',boss:'首领',chest:'宝箱',spring:'灵泉',event:'奇遇',shop:'行商',trap:'陷阱',camp:'篝火',herb:'灵药',amb:'仇人截杀'};
const MOB_IMG={bat:['en-bat.webp?v=20b20a0e',6,4,96],spider:['en-spider.webp?v=20b20a0e',6,4,96],fox:['en-fox.webp?v=20b20a0e',6,4,96],golem:['en-golem.webp?v=20b20a0e',6,4,96],puppet:['en-puppet.webp?v=20b20a0e',6,4,96],cultist:['en-cultist.webp?v=20b20a0e',6,4,96],swordghost:['en-swordghost.webp?v=20b20a0e',6,4,96],
 foxking:['en-fox.webp?v=20b20a0e',6,4,96],demonlord:['boss-demonlord.webp?v=20b20a0e',6,6,128],swordtomb:['boss-swordtomb.webp?v=20b20a0e',6,6,128],thunderlord:['boss-demonlord.webp?v=20b20a0e',6,6,128]};
const tag=S=>S.dmg&&S.pierce?'穿透':S.intr?'打断':S.stun?'定身':S.slow?'减速':S.burn&&!S.dmg?'持续伤害':S.burn?'灼烧':S.heal?'回复':S.shield?'护盾':'伤害';
const short=n=>{const m=/「(.+)」/.exec(n);return m?m[1]:n};

export function setupXs3({root,getX,send,flush,dlg,art,now,resolve,onChange,playBoss}){
 const x=getX,say=(m,k)=>toast(root,m,k),url=f=>resolve(art+f);
 const info=id=>{const o=npc(id);if(o?.name)return o;const n=NEW_NPC_INFO[id];return {id,name:n?.name||id,title:n?.title||NEW_NPCS[id]||''}};
 const elBadge=el=>h('span','xs3-el el-'+(el||'none'),el?EL_NAME[el]:'无');
 function card(id,{hidden=false,cls=''}={}){const S=skill(id),c=h('div','xs3-card '+cls+(hidden?' back':' el-'+(S?.el||'none')));
  if(hidden){c.append(h('b',null,'？'),h('small',null,'未揭示'));return c}
  c.append(h('b',null,short(S.n)),h('small',null,tag(S)+(S.dmg?' '+S.dmg:S.heal?' '+S.heal:S.shield?' '+S.shield:'')),h('i',null,'读条 '+S.cast+'s · 冷却 '+S.cd+'s'),h('span','xs3-cd'));c.dataset.id=id;return c}
 function overlay(cls){const w=h('div','xs-ui xs3-ov '+cls);root.append(w);return w}
 function btn(t,fn,cls=''){const b=h('button','xs-btn '+cls,t);b.type='button';b.onclick=fn;return b}
 function counterNote(me,op){return WHEEL[op.el]===me.el?'⚠ 对方克你：你的伤害 −25%、读条 +20%':WHEEL[me.el]===op.el?'✔ 你克对方：对方伤害 −25%、读条 +20%':'五行不相克'}

 // ---------- 精灵图（站桩待机 / 出手 / 受击） ----------
 function sprite(f,names){const s=h('div','xs3-spr');let sheet,cols,rows,cell;
  if(f.k==='me'){sheet='disciple.webp?v=20b20a0e';cols=4;rows=4;cell=128}
  else if(f.k==='npc'){s.classList.add('face');s.style.backgroundImage=`url("${url('face-'+f.id+'.webp?v=20b20a0e')}")`;s.set=st=>{s.style.backgroundPosition=(st==='hit'?100:st==='cast'?50:0)+'% 0'};s.set('idle');return s}
  else [sheet,cols,rows,cell]=MOB_IMG[f.id]||MOB_IMG.bat;
  s.style.backgroundImage=`url("${url(sheet)}")`;s.style.backgroundSize=`${cols*100}% ${rows*100}%`;if(f.id==='thunderlord')s.style.filter='hue-rotate(200deg) saturate(1.3)';
  let st='idle',t0=performance.now();const rowOf={idle:0,cast:f.k==='me'?3:2,hit:f.k==='me'?0:3};
  s.set=v=>{st=v;t0=performance.now()};s.tick=()=>{const fr=Math.floor((performance.now()-t0)/140)%(st==='idle'?(f.k==='me'?1:cols):cols),r=rowOf[st];const c=f.k==='me'?(st==='cast'?Math.min(3,fr):0):fr;
   s.style.backgroundPosition=`${c*100/(cols-1)}% ${r*100/(rows-1)}%`};s.tick();if(f.k==='me')s.classList.add('me');return s}

 // ---------- 战报回放 ----------
 function playFight(F,{opName,meName='大肥鱼',bg=null,reveal=0,title='切磋'}={}){return new Promise(done=>{
  const R=sim(F.me,F.op,F.sd,true),trace=R.trace,log=R.log,w=overlay('xs3-fight');if(bg)w.style.setProperty('--bg',`url("${url(bg)}")`);
  const side=(f,name,i)=>{const hp=h('div','xs3-hp',h('i'),h('u'),h('span')),cast=h('div','xs3-cast',h('i'),h('span')),cards=h('div','xs3-cards',...f.sl.map((id,j)=>card(id,{hidden:i===1&&j>=reveal,cls:'sm'})));
   const spr=sprite(f);return {el:h('div','xs3-side s'+i,h('div','xs3-name',elBadge(f.el),h('b',null,name),h('small',null,'战力 ×'+f.pw.toFixed(2))),hp,h('div','xs3-stage',spr),cast,cards),hp,cast,cards,spr,f}};
  const S=[side(F.me,meName,0),side(F.op,opName,1)],flo=h('div','xs3-floats'),top=h('div','xs3-top',h('b',null,title),h('span','xs3-note',counterNote(F.me,F.op)),h('span','xs3-time','0.0s'));
  const ctl=h('div','xs3-ctl');const sp=[1,3];let speed=3;const spb=btn('×3 速',()=>{speed=speed===3?1:3;spb.textContent='×'+speed+' 速'});ctl.append(spb,btn('跳过 ▶▶',()=>{k=R.end+1}));
  w.append(h('div','xs3-fwrap',top,h('div','xs3-arena',S[0].el,h('div','xs3-vs','VS'),S[1].el,flo),ctl));
  let k=0,li=0,last=performance.now(),acc=0;const casting=[null,null],cdEnd=[[0,0,0,0],[0,0,0,0]];
  const float=(i,t,cls)=>{const n=h('i',cls,t);n.style.left=(i?72:22)+(Math.random()*10-5)+'%';flo.append(n);setTimeout(()=>n.remove(),1100)};
  function show(k){const tr=trace[Math.min(k,trace.length-1)];for(let i=0;i<2;i++){const s=S[i],f=s.f,v=tr[i],sh=tr[2+i];s.hp.firstChild.style.width=(100*v/f.mx)+'%';s.hp.children[1].style.width=Math.min(100,100*sh/f.mx)+'%';s.hp.lastChild.textContent=v+' / '+f.mx+(sh?'（盾 '+sh+'）':'');
    const c=casting[i];if(c){const p=Math.min(1,(k-c.k)/Math.max(1,c.d));s.cast.firstChild.style.width=p*100+'%'}else s.cast.firstChild.style.width='0';
    [...s.cards.children].forEach((cd,j)=>{const left=Math.max(0,cdEnd[i][j]-k);cd.lastChild&&(cd.querySelector('.xs3-cd')?.style.setProperty('height',left>0?Math.min(100,100*left/(skill(f.sl[j]).cd*10))+'%':'0'))})}
   top.lastChild.textContent=(k/10).toFixed(1)+'s'}
  function step(){while(li<log.length&&log[li][0]<=k){const [t,i,j,d,fl]=log[li++],s=S[i],o=S[1-i],Sk=skill(s.f.sl[j]);
    if(d===-1){casting[i]={k:t,d:fl,j};s.cast.lastChild.textContent=Sk.n;s.spr.set('cast');const cd=s.cards.children[j];if(cd.classList.contains('back')){const nc=card(s.f.sl[j],{cls:'sm flip'});cd.replaceWith(nc)}[...s.cards.children].forEach((c,q)=>c.classList.toggle('on',q===j))}
    else{casting[i]=null;s.cast.lastChild.textContent='';cdEnd[i][j]=t+Sk.cd*10;s.spr.set('idle');if(fl&2)float(1-i,'打断！','intr');
     if(d>0){float(1-i,(fl&1?'暴击 ':'')+'-'+d,fl&1?'crit':'dmg');o.spr.set('hit');setTimeout(()=>o.spr.set('idle'),280)}else if(d<0)float(i,'+'+(-d),'heal');
     else if(Sk.shield)float(i,'护盾','heal');else if(fl&4)float(1-i,'挡住','dmg');if(Sk.stun)float(1-i,'定身','intr');if(Sk.slow)float(1-i,'减速','intr');if(Sk.burn&&!d)float(1-i,'中毒','intr')}}}
  function frame(t){const dt=Math.min(.1,(t-last)/1000);last=t;acc+=dt*10*speed;while(acc>=1&&k<=R.end){step();k++;acc--}if(k>R.end){step();show(R.end);return finish()}
   show(k);S.forEach(s=>s.spr.tick?.());requestAnimationFrame(frame)}
  function finish(){S.forEach(s=>s.spr.tick?.());const res=h('div','xs3-result '+(R.w?'win':'lose'),h('b',null,R.w?'胜':'败'),h('p',null,R.w?(R.hp[1]<=0?'击倒对手':'时间到，你占上风'):(R.hp[0]<=0?'你被击倒了':'时间到，对方占上风')));
   const ok=btn('好',()=>{w.remove();done(R)});res.append(ok);ctl.replaceChildren();w.querySelector('.xs3-fwrap').append(res)}
  requestAnimationFrame(frame)})}

 // ---------- 同门切磋：配招与观气 ----------
 async function duelPrep(n){const X=x();if(!X.tech){await dlg.say([{who:n.id,name:info(n.id).name,text:'先去藏经阁学一部功法再来找我切磋吧。'}]);return null}
  const I=info(n.id),op=npcFighter(n.id);if(!op)return 'danmaku';
  return new Promise(done=>{const w=overlay('xs3-prep');let mine=mySlots(X),sel=-1;const d=xsDay(now());
   const close=v=>{w.remove();done(v)};
   const render=()=>{const X=x(),pk=X.pk?.d===d&&X.pk.o===n.id?X.pk.n:0,me=meFighter(X),fd=X.df?.d===d?X.df.n:0,won=X.dd?.d===d&&X.dd.w?.includes(n.id);
    const myCards=h('div','xs3-cards',...mine.map((id,j)=>{const c=card(id,{cls:j===sel?'sel':''});c.onclick=()=>{sel=sel===j?-1:j;render()};return c}));
    const pool=sel<0?null:h('div','xs3-pool',h('p',null,'换成：'),...skillsOf(X).filter(id=>!mine.includes(id)).map(id=>{const c=card(id,{cls:'sm'});c.onclick=()=>{mine[sel]=id;sel=-1;render()};return c}),
     h('p','xs3-tip',skillsOf(X).length<=4?'学会更多功法（藏经阁）就有更多技能可换。':''));
    const face=h('span','xs2-face');face.style.cssText=`width:64px;height:64px;background-image:url("${url('face-'+n.id+'.webp?v=20b20a0e')}")`;
    w.replaceChildren(h('div','xs3-prep-card',
     h('div','xs3-prep-head',face,h('div',null,h('b',null,I.name+' '),elBadge(op.el),h('small',null,(I.title||'')+' · 战力 ×'+op.pw.toFixed(2)+' · 气血 '+op.mx),h('small','xs3-note',counterNote(me,op)))),
     h('p','xs3-sub','对方的招式（观气可看穿）'),h('div','xs3-cards',...op.sl.map((id,j)=>card(id,{hidden:j>=pk}))),
     h('p','xs3-sub','你的技能槽 · 从左到右优先出手（点一张可以换）'),myCards,pool,
     h('p','xs3-info','你：'+EL_NAME[X.tech]+'属性 · 战力 ×'+me.pw.toFixed(2)+' · 气血 '+me.mx+'\n今日斗法 '+fd+'/'+FIGHT_DAILY+' · '+(won?'今天赢过这位了（再赢没有灵石）':'首胜得灵石')+' · 每场好感 +3'),
     h('div','xs3-acts',btn('⚔ 自动对战（灵力 '+FIGHT_COST+'）',fightNow,'go'),btn('👁 观气（20 灵石）',peek),btn('🎯 亲自出手（弹幕）',()=>close('danmaku')),btn('算了',()=>close(null),'ghost'))))};
   async function peek(){const r=await send({a:'peek',el:n.id});say(r.msg,r.ok?'':'bad');render()}
   async function fightNow(){const X=x(),cur=mySlots(X);if(mine.join()!==(cur||[]).join()){const r=await send({a:'slots',herb:mine.join(',')});if(!r.ok){say(r.msg,'bad');return}}
    await flush?.();const pk=x().pk?.d===d&&x().pk.o===n.id?x().pk.n:0;const r=await send({a:'ab',el:n.id});if(!r.ok){say(r.msg,'bad');return}flush?.();w.hidden=true;
    await playFight(r.fight,{opName:I.name,reveal:pk,title:'同门切磋 · '+I.name});say(r.msg,r.fight.w?'':'bad');onChange?.();w.remove();done('auto')}
   render()})}

 // ---------- 秘境 ----------
 const POS_X=[22,50,78],POS_Y=[80,60,40,18];
 const nodeIcon=(k,cls='')=>{const i=h('i','xs3-node '+cls);const n=NODES.indexOf(k==='amb'?'fight':k);i.style.backgroundImage=`url("${url('xs-realm-nodes.webp?v=20b20a0e')}")`;i.style.backgroundPosition=`${(n%6)*20}% ${Math.floor(n/6)*100/3}%`;return i};
 function lootText(lt){const a=[];if(lt?.st)a.push('灵石 '+lt.st);for(const[k,n]of Object.entries(lt?.h||{}))a.push(HERBS[k].name+' '+n);for(const[k,n]of Object.entries(lt?.p||{}))a.push(PILLS[k].name+' '+n);for(const[k,n]of Object.entries(lt?.m||{}))a.push(MATS[k]+' '+n);return a.join(' · ')||'还没有收获'}
 async function openRealm(){const X=x();if(X.rlm&&now()-X.rlm.t<6*3600)return realmMap();
  const w=overlay('xs3-pick'),d=xsDay(now()),n=X.rd?.d===d?X.rd.n:0,r=X.cv?.r||0;
  const cards=Object.entries(AREAS).map(([id,A])=>{const lock=r<A.need,c=h('button','xs3-area'+(lock?' lock':''));c.type='button';c.style.backgroundImage=`url("${url('realm-'+id+'.webp?v=20b20a0e')}")`;
   c.append(h('b',null,A.n),h('small',null,lock?'需'+REALMS[A.need]+'修为':(X.rc?.[id]?'已通关':'首通：培元丹×2 回灵丹×2')+(A.stage?' · 首领可亲自出手':'')));c.onclick=async()=>{if(lock){say('需要'+REALMS[A.need]+'修为','bad');return}
    const res=await send({a:'rin',herb:id});if(!res.ok){say(res.msg,'bad');return}await flush?.();w.remove();realmMap()};return c});
  const mats=Object.entries(x().mat||{}).map(([k,v])=>MATS[k]+' ×'+v).join('、');
  w.append(h('div','xs3-pick-card',h('div','xs3-pick-head',h('b',null,'🗺 秘境探索'),btn('✕',()=>w.remove(),'ghost')),
   h('p','xs3-info','每次进入耗灵力 '+RLM_EN+'，每天 '+RLM_DAILY+' 次（今天 '+n+'/'+RLM_DAILY+'）。三层地图逐层选路，最上面是精英和首领；遇到妖物自动对战，气血在秘境里不会自己回满。\n中途撤出或战败带回一半收获；通关全部带回。'+(mats?'\n材料：'+mats+'（法宝炼器开放后使用）':'')),
   h('div','xs3-areas',...cards),h('p','xs3-tip','技能槽在同门切磋的配招界面里设置，秘境战斗也用同一套。')))}
 function realmMap(){const w=overlay('xs3-realm');let busy=false;
  const close=()=>{w.remove()};
  function render(){const z=x().rlm;if(!z){close();return}const A=AREAS[z.a],m=rlmMap(z.sd),rows=m[z.L],nx=rlmNext(m,z).map(n=>n.c),vis=(z.v||'').slice(z.L*4);
   w.style.setProperty('--bg',`url("${url('realm-'+z.a+'.webp?v=20b20a0e')}")`);
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');svg.classList.add('xs3-lines');
   const line=(x1,y1,x2,y2,on)=>{const l=document.createElementNS(svg.namespaceURI,'line');Object.entries({x1,y1,x2,y2}).forEach(([k,v])=>l.setAttribute(k,v));l.setAttribute('class',on?'on':'');svg.append(l)};
   const pos=(r,c)=>[POS_X[c],r<0?95:POS_Y[r]];
   for(const n of rows[0])line(...pos(-1,1),...pos(0,n.c),vis[0]==n.c);
   for(let r=0;r<3;r++)for(const a of rows[r])for(const b of rows[r+1])if(r===2||Math.abs(a.c-b.c)<=1)line(...pos(r,a.c),...pos(r+1,b.c),vis[r]==a.c&&vis[r+1]==b.c);
   const map=h('div','xs3-map');map.append(svg);
   const start=nodeIcon('start','start');start.style.cssText+=`;left:50%;top:95%;background-image:none`;start.textContent='🚩';map.append(start);
   rows.forEach((row,r)=>row.forEach(n=>{const done=r<=z.R&&vis[r]==n.c,can=r===z.R+1&&nx.includes(n.c),el=nodeIcon(n.k,(done?'done':'')+(can?' can':'')+(r<=z.R&&!done?' skip':''));
    const [lx,ly]=pos(r,n.c);el.style.left=lx+'%';el.style.top=ly+'%';el.title=NODE_NAME[n.k];el.append(h('em',null,NODE_NAME[n.k]));if(can)el.onclick=()=>go(n);map.append(el)}));
   const me=h('i','xs3-me');const [mx,my]=pos(z.R,z.R<0?1:z.c);me.style.left=mx+'%';me.style.top=my+'%';me.style.backgroundImage=`url("${url('disciple.webp?v=20b20a0e')}")`;map.append(me);
   const hpP=Math.round(100*z.hp/z.mx);
   w.replaceChildren(h('div','xs3-rtop',h('b',null,A.n+' · 第 '+(z.L+1)+'/3 层'),h('div','xs3-hp big',h('i'),h('span',null,'气血 '+z.hp+' / '+z.mx)),h('small','xs3-loot',lootText(z.lt)),
     h('div','xs3-racts',btn('撤出（带回一半）',leave,'ghost'),btn('✕ 暂离',close,'ghost'))),map,h('p','xs3-rtip',z.R<0?'选一条路出发。':'点发光的节点继续前进；最上面是'+(z.L<2?'精英':'首领')+'。'));
   w.querySelector('.xs3-hp i').style.width=hpP+'%';if(hpP<35)w.querySelector('.xs3-hp').classList.add('low')}
  async function leave(){if(busy)return;await dlg.say([{name:'秘境',text:'现在撤出，只能带回一半收获：\n'+lootText(x().rlm?.lt)}],[{label:'撤出',fn:async()=>{const r=await send({a:'rout'});await flush?.();say(r.msg,r.ok?'':'bad');onChange?.();close()}},{label:'再走走',fn:()=>{}}])}
  async function go(n){if(busy)return;busy=true;try{const z=x().rlm,A=AREAS[z.a];let dm=0;
   if(n.k==='boss'&&A.stage){let pick=null;await dlg.say([{name:MOBS[A.boss].n,text:'首领就在前面。自动对战用技能槽；亲自出手是弹幕战（算一场斗法、奖励按'+A.n.slice(0,2)+'关卡另算）。'}],[{label:'⚔ 自动对战',fn:()=>{pick=0}},{label:'🎯 亲自出手（弹幕）',fn:()=>{pick=1}},{label:'再想想',fn:()=>{}}]);if(pick==null)return;dm=pick}
   const bg='realm-'+z.a+'.webp?v=20b20a0e';
   if(dm){const r=await send({a:'rgo',i:n.c,n:1});if(!r.ok){say(r.msg,'bad');return}await flush?.();w.hidden=true;try{const r2=await playBoss(r.danmaku);if(r2?.msg)say(r2.msg,r2.ok&&!/败/.test(r2.msg)?'':'bad');if(r2?.end)await endScreen(r2)}finally{w.hidden=false}onChange?.();render();return}
   const r=await send({a:'rgo',i:n.c});if(!r.ok){say(r.msg,'bad');return}
   if(r.fight){const F=r.fight,name=F.kind==='amb'?info(F.op.id).name:MOBS[F.op.id].n;if(F.kind==='amb')await dlg.say([{who:F.op.id,name,face:2,text:'冤家路窄。把东西留下！'}]);
    await playFight(F,{opName:name,bg,title:NODE_NAME[F.kind]+' · '+name})}
   if(r.ev!=null)await dlg.say([{name:'奇遇',text:EV_TEXT[r.ev]+(r.hurt?'\n气血 −'+r.hurt:'')+(r.loot?.length?'\n得到 '+r.loot.join('、'):'')+(r.cv?'\n修为 +'+r.cv:'')+(r.ev===1?'\n心境 +4':'')}]);
   else if(r.loot?.length&&!r.end)say('得到 '+r.loot.join('、'));
   if(r.heal)say((r.node==='camp'?'篝火边歇了歇':'灵泉')+'：气血 +'+r.heal+(r.node==='camp'?'，心境 +2':''));if(r.hurt&&r.ev==null)say('踩中陷阱：气血 −'+r.hurt,'bad');
   if(r.shop)await shop();
   if(r.end){await flush?.();await endScreen(r);onChange?.();close();return}
   render()}finally{busy=false}}
  async function shop(){let again=true;while(again){again=false;const z=x().rlm;if(!z)return;const key=i=>z.L+'.'+z.R+'.'+i;
    await dlg.say([{name:'行商',text:'荒山野岭的，难得碰上个活人。看看？（你有灵石 '+x().stone+'）'}],[...SHOP.map((S,i)=>({label:S.n+' · '+S.st+' 灵石'+((z.bought||[]).includes(key(i))?'（已买）':''),fn:async()=>{const r=await send({a:'rbuy',i});say(r.msg,r.ok?'':'bad');again=true}})),{label:'走了',fn:()=>{}}])}}
  render()}
 function endScreen(r){return new Promise(done=>{const w=overlay('xs3-end');w.append(h('div','xs3-end-card '+(r.end==='win'?'win':'lose'),h('b',null,r.end==='win'?'秘境通关':'离开秘境'),h('p',null,r.msg),btn('好',()=>{w.remove();done()})))})}
 return {duelPrep,openRealm,playFight}
}
export const GUIDE3={title:'秘境与对战',text:[
 ['同门切磋','和人聊天选「切磋」：先看配招界面。你有 4 个技能槽，战斗时从左到右找第一个冷却好的技能读条出手。对方的招式是「？」，花 20 灵石「观气」能看穿一张。点「自动对战」看战报；想自己打就选「亲自出手（弹幕）」。'],
 ['技能','每学一部功法多两个技能：大招（读条长、伤害高）和一个特色技能（灼烧、回复、定身、穿透、护盾、减速、打断等）。另有通用的灵弹和护体金光。'],
 ['五行克制','金克木、木克土、土克水、水克火、火克金。被克的一方伤害 −25%、读条 +20%。冰雷风熔毒不参与相克，但特色技能更强。'],
 ['秘境','左上「🗺 秘境」或论剑台进入。每次耗灵力 15，每天 3 次。三层地图逐层选路：妖物、精英、首领自动对战；灵泉和篝火回气血；宝箱、灵药、奇遇给收获；行商卖回春散和材料。'],
 ['秘境规则','气血在秘境里一路带着走，打赢一场回 10%。战败或撤出带回一半收获，通关全部带回，首通另有丹药。有仇人的话，可能在秘境里被截杀，输了这趟收获全丢。'],
 ['材料','秘境掉落玄铁、灵玉、妖丹，下一批「法宝」开放后用来炼器。']]};
