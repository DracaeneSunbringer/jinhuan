import {sheet} from '/pet-isle-ui.js'
import * as Art from '/pet-isle-scenery.js'
import * as Rules from '/pet-world-rules.js'
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n}
const button=(text,fn,disabled=false)=>{const b=el('button','isle-btn',text);b.type='button';b.disabled=disabled;b.addEventListener('click',fn);return b}
const fmt=n=>Number(n||0).toLocaleString('zh-CN')
async function request(path,body){const r=await fetch('/api/pet/world/'+path,{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok){const e=new Error(j.error||'暂时无法操作');e.code=j.code;throw e}return j}
async function sync(isle){await isle.flush();if(isle.busy?.())throw Error('还有操作正在保存，请稍后再试');await isle.reload?.()}
const icon=id=>{const img=el('img','valley-social-icon');img.src=Art.itemIcon(id,3);img.alt=Rules.ITEM_NAME[id]||id;return img}
export async function openSocial(host,isle,{user,toast}={}){
 const body=el('div','valley-social'),panel=sheet(host,'串门与守护兽',body,{wide:true});let busy=false,pageCursor=null,rows=[]
 const error=e=>{toast?.(e.code==='social_auto_pending'?'有管家巡视尚未结算，先完成结算再试。':e.message,'err')}
 const tabs=()=>{const nav=el('nav','isle-tabs');for(const [label,fn]of [['串门',neighbors],['守护兽',guard],['来访记录',logs],['庄园迁入',transfer]])nav.append(button(label,()=>{if(!busy)void fn()}));body.replaceChildren(nav)}
 async function neighbors(more=false){
  try{
   busy=true;if(!more){rows=[];pageCursor=null}
   const data=await request('neighbors?limit=20'+(pageCursor?'&cursor='+encodeURIComponent(pageCursor):''));if(!body.isConnected)return
   rows.push(...data.list.filter(x=>x.id!==user?.id));pageCursor=data.next
   tabs();const intro=el('p','isle-note','成熟产物由全体访客共用少量可摘份额，主人至少保留90%的保底价值；不是每件产物都能摘。')
   const list=el('div','valley-neighbors');for(const row of rows)list.append(button('谷友 #'+row.id+' · 去看看',()=>visit(row.id)))
   body.append(intro,list);if(!rows.length)body.append(el('p','isle-empty','这一页暂时没有可访问的谷友。'))
   if(pageCursor)body.append(button('查看更多',()=>neighbors(true)))
   const form=el('form','valley-visit-form'),input=el('input');input.type='number';input.min='1';input.placeholder='输入谷友编号';input.setAttribute('aria-label','谷友编号')
   form.append(input,button('前往',()=>{if(/^[1-9]\d*$/.test(input.value))visit(Number(input.value))}));form.addEventListener('submit',e=>e.preventDefault());body.append(form)
  }catch(e){error(e)}finally{busy=false}
 }
 async function visit(id){
  if(busy)return
  try{busy=true;await sync(isle);const data=await request('visit/'+id);if(body.isConnected)drawVisit(data)}catch(e){error(e)}finally{busy=false}
 }
 function drawVisit(data){
  tabs();body.append(el('h3','',`谷友 #${data.id} 的山谷`),el('p','isle-note',`今天还可尝试 ${data.attemptsLeft} 次 · 这家还可尝试 ${data.targetAttemptsLeft} 次`))
  const s=data.state
  body.append(el('p','valley-guard-state',s.guard.patrolling?'守护兽正在巡逻：有20%概率被发现。':s.guard.owned?'守护兽正在休息。':'这里还没有守护兽。'))
  if(s.pendingAuto)body.append(el('p','isle-note','主人管家有待结算的生产记录，当前不能摘取。'))
  const grid=el('div','valley-produce-grid')
  for(const g of s.production){
   const card=el('article','valley-produce'),name=Rules.ITEM_NAME[g.item]||g.item
   card.append(icon(g.item),el('b','',name),el('small','',`${g.kind==='crop'?'农田':'畜栏'} ${g.i+1} · 可见 ${g.remaining} 件`))
   card.append(button(g.stealable?'摘取一件':'留给主人',()=>act(data,{action:g.kind==='crop'?'steal-crop':'steal-animal',i:g.i,item:g.item,...(g.batch?{batch:g.batch}:{})}),!g.stealable||s.pendingAuto||data.attemptsLeft<1||data.targetAttemptsLeft<1))
   grid.append(card)
  }
  if(!s.production.length)grid.append(el('p','isle-empty','还没有成熟产物，下次再来。'))
  body.append(grid)
  const growing=el('div','valley-produce-grid')
  for(const p of s.plots.filter(p=>p.crop&&p.stage!==3)){const card=el('article','valley-produce');card.append(icon(p.crop),el('b','',(Rules.ITEM_NAME[p.crop]||p.crop)),el('small','',p.stage<0?'待清理':'生长中 · 约 '+Math.ceil(p.left/60)+' 分钟'));growing.append(card)}
  for(const a of s.animals.filter(a=>!a.ready)){const def=Rules.ANIMALS.find(x=>x.id===a.kind),card=el('article','valley-produce');card.append(icon(a.kind),el('b','',def?.name||a.kind),el('small','',a.stage==='retired'?'已退休':!a.fed?'等待喂养':a.stage==='young'?'成长中 · 约 '+Math.ceil(a.matureLeft/3600)+' 小时成熟':'生产中'));growing.append(card)}
  if(growing.children.length){body.append(el('h3','','正在成长'),growing)}
  const help=s.plots.filter(p=>p.canWater);if(help.length){body.append(el('h3','','顺手帮忙'));for(const p of help)body.append(button('给第 '+(p.i+1)+' 块地浇水',()=>act(data,{action:'help-water',i:p.i})))}
  body.append(el('p','isle-note','份额不足一整件时不能摘取；被发现也消耗尝试次数，处罚不超过余额。'),button('刷新这家',()=>visit(data.id)))
 }
 async function act(data,action,accepted=false){
  if(busy)return
  if(action.action.startsWith('steal-')&&data.notice.required&&!accepted){
   tabs();body.append(el('h3','','摘取前先了解规则'),el('p','valley-social-notice',data.notice.text),button('我知道了，尝试摘取',()=>act(data,action,true)),button('返回',()=>drawVisit(data)));return
  }
  busy=true
  try{
   const result=await request('visit/'+data.id,{op:crypto.randomUUID(),rev:data.rev,...action,...(accepted?{noticeVersion:data.notice.version}:{})})
   toast?.(result.caught?'被守护兽发现，赔付 '+fmt(result.fine)+' D币。':result.got?'带回 '+(Rules.ITEM_NAME[result.got.id]||result.got.id)+' ×'+result.got.n:'已经帮忙浇水。',result.caught?'warn':'ok')
   await isle.reload?.();const fresh=await request('visit/'+data.id);if(body.isConnected)drawVisit(fresh)
  }catch(e){error(e)}finally{busy=false}
 }
 async function guard(){
  try{
   busy=true;await sync(isle);const state=isle.state,g=state.guard;tabs()
   body.append(el('h3','','夜间守护兽'),el('p','isle-note','一次购买 20,000 D币。开启后北京时间22:00–06:00巡逻，发现率20%；被抓赔付最多200 D币，访客每日处罚上限1000。'))
   body.append(el('p','',g?.bought?(g.on?'已拥有 · 巡逻已开启':'已拥有 · 巡逻已关闭'):'尚未购买'))
   body.append(button(g?.bought?(g.on?'暂停巡逻':'开启巡逻'):'购买守护兽 · 20,000 D币',async()=>{
    if(busy)return;busy=true
    try{await request('guard',{op:crypto.randomUUID(),rev:isle.revision,action:g?.bought?(g.on?'disable':'enable'):'buy'});await isle.reload?.();busy=false;await guard()}catch(e){error(e)}finally{busy=false}
   },!g?.bought&&isle.coins<20000))
  }catch(e){error(e)}finally{busy=false}
 }
 async function logs(){
  try{busy=true;await sync(isle);tabs();const list=el('div','valley-social-logs'),names={'steal-crop':'摘取作物','steal-animal':'摘取畜产','help-water':'帮忙浇水'}
   for(const log of [...(isle.state.socialLogs||[])].reverse())list.append(el('p','',`${new Date(log.at*1000).toLocaleString('zh-CN')} · 谷友 #${log.peer} · ${names[log.action]||log.action}${log.item?' · '+(Rules.ITEM_NAME[log.item]||log.item)+' ×'+log.n:''}${log.fine?' · '+fmt(log.fine)+' D币':''}`))
   body.append(list);if(!list.children.length)body.append(el('p','isle-empty','暂时没有来访记录。'))
  }catch(e){error(e)}finally{busy=false}
 }
 async function transfer(){
  try{
   busy=true;await sync(isle);const data=await request('manor-transfer');tabs()
   if(data.done){body.append(el('p','','庄园已迁入，剩余建设额度 '+fmt(isle.state.constructionCredit)+'。'));return}
   if(!data.available||!data.quote){body.append(el('p','isle-note','没有可迁入的旧庄园资产。原有记录会保留。'));return}
   const q=data.quote;body.append(el('h3','','庄园资产迁入'),el('p','isle-note','独立庄园已停止经营。迁移保留原存档和现金账本，只折算建设额度，不发现金，不可重复领取。'))
   const list=el('dl','valley-transfer-lines');for(const line of q.lines){list.append(el('dt','',line.asset+' ×'+line.quantity),el('dd','',fmt(line.credit)))}body.append(list)
   body.append(el('p','','资产估值 '+fmt(q.assetCredit)+' · 付费来源上限 '+fmt(q.provenanceCap)),el('strong','','本次可迁入 '+fmt(q.total)+' 建设额度'),el('p','isle-note',q.explanation))
   body.append(button('确认迁入建设额度',async()=>{
    if(busy)return;busy=true
    try{const result=await request('manor-transfer',{op:crypto.randomUUID(),rev:data.rev,manorRev:data.manorRev,policyVersion:q.policyVersion,expectedCredit:q.total});await isle.reload?.();toast?.('已迁入 '+fmt(result.credit)+' 建设额度','ok');busy=false;await transfer()}catch(e){error(e)}finally{busy=false}
   }))
  }catch(e){error(e)}finally{busy=false}
 }
 await neighbors()
 return panel
}
