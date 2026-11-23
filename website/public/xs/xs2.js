// 大肥鱼修仙记 2.0 · 第一批的界面：人脉（叙话/送礼/往事）、机缘弹窗、宗门（委托/俸禄/心境气运）。规则在 rules.js，文本在 content2.js。
import {h,toast} from './ui.js?v=20b20a0e';
import {npc} from './content.js?v=20b20a0e';
import {HERBS,PILLS,REALMS,NEW_NPCS,REL,REL_BONUS,FAV_NAME,FAV_TIER,favTier,CHAPTERS,EVENTS,SECT_RANK,sectRank,TASK_KINDS,PREF,xsMind,xsLuck,breakRate,OLD_NPCS,EV_DAILY} from './rules.js?v=20b20a0e';
import {NEW_NPC_INFO,STORY,EVENT_TEXT,TASK_TEXT} from './content2.js?v=20b20a0e';
import {herbIcon} from './farm.js?v=20b20a0e';
import {pillIcon,PILL_COLORS} from './alchemy.js?v=20b20a0e';
const xsDay=t=>Math.floor((t+28800)/86400);
export function setupXs2({root,getX,send,flush,dlg,panel,art,now,herbsImg,resolve,onChange}){
 const x=()=>getX(),say=(m,k)=>toast(root,m,k);
 const info=id=>npc(id)||(NEW_NPC_INFO[id]?{id,...NEW_NPC_INFO[id]}:{id,name:NEW_NPCS[id]||id,title:''});
 const row=id=>x().npc?.[id]||[0,0,0,0];
 const line=([who,face,text])=>who==='me'?{name:'大肥鱼',text}:{who,name:info(who).name,face,text};
 const heart=f=>'♥'.repeat(Math.max(0,favTier(f)))+'♡'.repeat(4-Math.max(0,favTier(f)));
 const faceIcon=id=>size=>{const s=h('span','xs2-face');s.style.cssText=`width:${size}px;height:${size}px;background-image:url("${resolve(art+'face-'+id+'.webp?v=20b20a0e')}")`;return s};
 const itemIcon=(k,size)=>PILLS[k]?pillIcon(PILL_COLORS[k])(size):herbIcon(herbsImg,HERBS[k].row,3)(size);
 const chapOf=id=>{const C=CHAPTERS[id];if(!C)return null;const v=row(id),n=v[2];if(n>=C.length)return {done:true};const c=C[n],ok=v[0]>=(c.need.fav||0)&&(x().cv?.r||0)>=(c.need.r||0);return {n,c,ok,t:STORY[id]?.[n]}};
 // ---------- 叙话里追加的选项 ----------
 function chatOptions(n,after){const id=n.id,v=row(id),d=xsDay(now()),opts=[],ch=chapOf(id)
  if(ch&&!ch.done)opts.push({label:ch.ok?'✨ 往事 · '+ch.t.title:'往事 · '+ch.t.title+'（'+(v[0]<(ch.c.need.fav||0)?'需'+FAV_NAME[favTier(ch.c.need.fav)]:'需'+REALMS[ch.c.need.r])+'）',fn:()=>after(()=>ch.ok?playChapter(id):dlg.say([line([id,0,'……（时候还没到）']),{name:'提示',text:'好感到「'+FAV_NAME[favTier(ch.c.need.fav||0)]+'」'+(ch.c.need.r?'、修为到'+REALMS[ch.c.need.r]:'')+'后，可以听'+info(id).name+'讲这段往事。'}]))})
  opts.push({label:v[3]===d?'送礼（今天送过了）':'送礼',fn:()=>after(()=>v[3]===d?dlg.say([line([id,1,'今天已经收过你的礼啦。'])]):openGift(id))})
  return opts}
 function talked(id){send({a:'talk',el:id}).catch(()=>{})}
 async function playChapter(id){const ch=chapOf(id);if(!ch?.ok)return;let pick=-1
  await dlg.say(ch.t.lines.map(line),ch.t.opts.map((label,i)=>({label,fn:()=>{pick=i}})));if(pick<0)return
  const r=await send({a:'chap',el:id,n:ch.n,i:pick});if(!r.ok){say(r.msg,'bad');return}await flush?.()
  await dlg.say([{name:'往事 · '+ch.t.title,text:ch.t.after[pick]+'\n\n'+(r.eff||[]).join('　')}]);onChange?.()}
 function openGift(id){const X=x(),p=PREF[id]||[[],[]],tier=favTier(row(id)[0]),known=tier>=2
  const cell=(k,count)=>({icon:size=>itemIcon(k,size),label:(PILLS[k]||HERBS[k]).name,sub:known?(p[0].includes(k)?'❤ 喜欢':p[1].includes(k)?'讨厌':'普通'):'送 1 个',count,on:async()=>{panel.close();const r=await send({a:'gift',el:id,herb:k});if(!r.ok){say(r.msg,'bad');return}
   await dlg.say([line([id,r.like>0?1:r.like<0?2:0,r.like>0?'哇，这个我很喜欢！':r.like<0?'……我不太需要这个。':'谢谢，我收下了。']),{name:'人脉',text:info(id).name+' '+r.msg}]);onChange?.()}})
  const herbs=Object.entries(X.bag||{}).filter(([,n])=>n>0).map(([k,n])=>cell(k,n)),pills=Object.entries(X.pills||{}).filter(([k,n])=>n>0&&PILLS[k]).map(([k,n])=>cell(k,n))
  panel.show('送礼给 '+info(id).name,[{title:'药材',cells:herbs,note:herbs.length?(known?'好友以上会告诉你喜好。':'关系到「好友」后能看出喜好。')+' 喜欢的礼物好感 +40，普通 +15，讨厌 −10；每人每天一次。':'行囊里没有药材。'},{title:'丹药',cells:pills,note:pills.length?'':'还没有丹药。'}])}
 // ---------- 人脉面板 ----------
 function openPeople(){const X=x(),met=[...OLD_NPCS,...Object.keys(NEW_NPCS)].filter(id=>X.npc?.[id])
  const cells=met.sort((a,b)=>row(b)[0]-row(a)[0]).map(id=>{const v=row(id),ch=chapOf(id);return {icon:faceIcon(id),label:info(id).name+(v[1]?' · '+REL[v[1]]:''),sub:FAV_NAME[Math.max(0,favTier(v[0]))]+' '+heart(v[0])+(CHAPTERS[id]?' · 往事 '+Math.min(v[2],CHAPTERS[id].length)+'/'+CHAPTERS[id].length+(ch&&!ch.done&&ch.ok?' ✨':''):''),on:()=>{panel.close();showPerson(id)}}})
  panel.cur=0;panel.show('人脉',[{title:'相识',cells,note:cells.length?'和人聊天每天第一次好感 +5；送礼、往事、机缘都会改变关系。好感到「熟识」「好友」会解锁往事（带 ✨ 的现在就能听）。':'还没有相识的人。去宗门广场和大家聊聊吧。'},
   {title:'关系',text:[['关系的作用',...Object.entries(REL_BONUS).map(([k,t])=>REL[k]+'：'+t)],['好感档位',FAV_TIER.map((t,i)=>FAV_NAME[i]+' '+t).join(' · ')],['你的关系',...(met.filter(id=>row(id)[1]).map(id=>info(id).name+'：'+REL[row(id)[1]])||[]),met.some(id=>row(id)[1])?'':'暂时还没有。往事的抉择可以拜师、结拜。']]}])}
 function showPerson(id){const v=row(id),p=PREF[id]||[[],[]],t=favTier(v[0]),ch=chapOf(id),i=info(id)
  dlg.say([{who:id,name:i.name+(i.title?' · '+i.title:''),face:t>=2?1:0,text:'好感：'+FAV_NAME[Math.max(0,t)]+' '+heart(v[0])+'（'+v[0]+'）'+(v[1]?'\n关系：'+REL[v[1]]+'（'+REL_BONUS[v[1]]+'）':'')+
   (t>=2&&p[0].length?'\n喜欢：'+p[0].map(k=>(PILLS[k]||HERBS[k]).name).join('、'):'')+(CHAPTERS[id]?'\n往事：'+(ch?.done?'已全部听完':ch?.ok?'「'+ch.t.title+'」可以听了':'「'+ch.t.title+'」（需'+(v[0]<(ch.c.need.fav||0)?FAV_NAME[favTier(ch.c.need.fav)]:REALMS[ch.c.need.r])+'）'):'')}])}
 // ---------- 机缘 ----------
 let evBusy=false
 async function maybeEvent(){const X=x();if(evBusy||(X.st||0)<4)return;evBusy=true;try{const d=xsDay(now());if(X.ev?.d===d&&X.ev.n>=EV_DAILY&&!X.ev.cur)return
   const r=await send({a:'evroll'});if(!r.ok)return;await flush?.();const cur=x().ev?.cur;if(cur&&now()-cur.t<1800)await showEvent(cur.id)}finally{evBusy=false}}
 function showEvent(id){const E=EVENTS.find(e=>e.id===id),T=EVENT_TEXT[id];if(!E||!T)return;return new Promise(done=>{
  const img=h('div','xs2-ev-img');img.style.backgroundImage=`url("${resolve(art+'xs-fortune.webp?v=20b20a0e')}")`;img.style.backgroundPosition=`${(E.img%4)*100/3}% ${Math.floor(E.img/4)*50}%`
  const who=E.who?h('div','xs2-ev-who',h('span','xs2-face'),h('b',null,info(E.who).name),h('small',null,info(E.who).title||'')):null;if(who)who.firstChild.style.backgroundImage=`url("${resolve(art+'face-'+E.who+'.webp?v=20b20a0e')}")`
  const body=h('div','xs2-ev-body',h('b',null,'机缘 · '+T.title),h('p',null,T.text)),acts=h('div','xs2-ev-acts')
  const wrap=h('div','xs-ui xs2-ev',h('div','xs2-ev-card',img,who,body,acts));root.append(wrap)
  const close=()=>{wrap.remove();done()}
  E.opt.forEach((o,i)=>{const need=o.need?.r?'（需'+REALMS[o.need.r]+'）':'',cost=o.cost?'（'+[...Object.entries(o.cost.pill||{}).map(([k,n])=>PILLS[k].name+'×'+n),...Object.entries(o.cost.herb||{}).map(([k,n])=>HERBS[k].name+'×'+n),o.cost.stone?o.cost.stone+' 灵石':''].filter(Boolean).join('、')+'）':''
   const b=h('button','xs-btn',T.opts[i]+cost+need);b.type='button';b.onclick=async()=>{for(const q of acts.children)q.disabled=true;const r=await send({a:'evpick',i});if(!r.ok){say(r.msg,'bad');if(!x().ev?.cur||now()-x().ev.cur.t>1800){close();return}for(const q of acts.children)q.disabled=false;return}
    await flush?.();const k=r.res??0;body.lastChild.textContent=(T.res[i]?.[k]||'')+'\n\n'+(r.eff||[]).join('　');const ok=h('button','xs-btn',('好'));ok.type='button';ok.onclick=close;acts.replaceChildren(ok);onChange?.()};acts.append(b)})
  const later=h('button','xs-btn ghost','先不管它');later.type='button';later.onclick=close;acts.append(later)})}
 // ---------- 宗门 ----------
 async function openSect(){const X0=x(),d=xsDay(now());if(X0.tk?.d!==d){const r=await send({a:'tasks'});if(r.ok)await flush?.()}panel.cur=0;renderSect()}
 function renderSect(){const X=x(),d=xsDay(now()),rk=sectRank(X),next=SECT_RANK[rk+1]
  const tasks=(X.tk?.d===d?X.tk.list:[]).map(([ti,done],n)=>{const[kind,key,cnt]=TASK_KINDS[ti],label=TASK_TEXT[kind](key,cnt,HERBS,PILLS)
   return {icon:kind==='win'?size=>{const s=h('span','xs-emoji','⚔');s.style.fontSize=size*.8+'px';return s}:size=>itemIcon(key,size),label,sub:done?'✔ 已完成':kind==='win'?(X.tw?.d===d&&X.tw.n?'可以交差':'还没赢过'):'持有 '+((kind==='pill'?X.pills?.[key]:X.bag?.[key])||0),disabled:!!done,on:async()=>{const r=await send({a:'task',n});say(r.msg,r.ok?'':'bad');if(r.ok){await flush?.();onChange?.()}panel.update(tabs())}}})
  const tabs=()=>{const X=x();return [{title:'委托',cells:tasks,note:'外门执事老周每天贴 3 条委托：交药材、交丹药或赢一场斗法。完成得贡献、声望和灵石。'},
   {title:'宗门',cells:[{icon:faceIcon('steward'),label:'执事老周',sub:'聊两句',on:()=>{panel.close();talked('steward');const L=STEWARD_LINES[Math.floor(Math.random()*STEWARD_LINES.length)];dlg.say([{who:'steward',name:'执事老周 · 外门执事',face:L[0],text:L[1]}])}},{icon:size=>{const s=h('span','xs-emoji','💰');s.style.fontSize=size*.8+'px';return s},label:'领俸禄',sub:X.sp===d?'今天领过了':SECT_RANK[rk][2]+' 灵石',disabled:X.sp===d,on:async()=>{const r=await send({a:'stipend'});say(r.msg,r.ok?'':'bad');if(r.ok){await flush?.();onChange?.()}panel.update(tabs())}}],
    note:'身份：'+SECT_RANK[rk][1]+' · 声望 '+(X.rep||0)+(next?'（到 '+next[0]+' 晋升'+next[1]+'）':'')+' · 贡献 '+(X.ctb||0)+'\n心境 '+xsMind(X)+'/100 · 气运 '+xsLuck(X)+' · 下次突破成功率约 '+Math.round(breakRate(X)*100)+'%\n今日机缘 '+(X.ev?.d===d?X.ev.n:0)+'/'+EV_DAILY+'（在各处走动时可能遇到）'}]}
  panel.show('宗门',tabs())}
 return {chatOptions,talked,maybeEvent,openPeople,openSect,showEvent}
}
const STEWARD_LINES=[[0,'委托贴在墙上，一天三条，交得越多，声望涨得越快。'],[1,'哟，又来啦？上回那批药材成色不错，长老们都夸了。'],[0,'内门、真传、长老……一步一步来，宗门的规矩就是这样。'],[2,'别在执事堂门口练剑！上个月刚修好的门！'],[1,'俸禄记得每天来领，过了今天可不补。']];
export const GUIDE2={title:'人脉机缘',text:[['人脉','和人聊天每天第一次好感 +5，也会让心境好一点。送礼每人每天一次：喜欢的 +40、普通 +15、讨厌的 −10（到「好友」能看出喜好）。好感到「熟识」「好友」会解锁这个人的往事，抉择会影响好感、心境、气运，还能拜师、结拜。'],
 ['机缘','在各处走动时可能遇到奇遇（每天最多 3 次），选项会有不同结果；气运越高越容易遇到好结果。'],
 ['心境与气运','心境影响打坐修为（±20%）和突破成功率；突破成功心境 +5，失败 −8。气运影响机缘的好坏。'],
 ['宗门','左上「🏯 宗门」：每天 3 条委托换贡献和声望，声望够了晋升（外门 → 内门 → 真传 → 长老），每天可领俸禄。']]};
