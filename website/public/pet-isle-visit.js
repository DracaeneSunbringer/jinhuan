import {whaleMark} from '/pet-whale-friends.js?v=472f7fbf'
// b8：完整玩家目录、留言板与守护日志。所有访客文本仅通过 textContent 渲染。
import * as R from '/pet-world-rules.js?v=472f7fbf'
import {sheet} from '/pet-isle-ui.js?v=472f7fbf'
const el=(tag,attrs={},...kids)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs||{})){if(v==null||v===false)continue;if(k==='class')n.className=v;else if(k==='text')n.textContent=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else n.setAttribute(k,v===true?'':v)}for(const c of kids.flat(Infinity))if(c!=null&&c!==false)n.append(c instanceof Node?c:document.createTextNode(String(c)));return n}
const btn=(text,onclick,cls='')=>el('button',{type:'button',class:'isle-btn '+cls,onclick},text)
const ago=t=>t?new Date(t*1000).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'尚未操作'
async function call(path,body){const r=await fetch('/api/pet/world/'+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'暂时无法读取，请重试');return d}
export function openBoard(host,id,{user,toast}={}){
 let operation=null,busy=false,closed=false,epoch=0
 const body=el('div',{class:'isle-board'}),sh=sheet(host,'小岛留言板',body,{wide:true,onClose:()=>{closed=true;epoch++}})
 const title=el('h3'),status=el('p',{class:'isle-note',role:'status','aria-live':'polite'}),list=el('div',{class:'isle-board-list'})
 const input=el('textarea',{rows:3,maxlength:400,placeholder:'留下问候或约好下次串门（最多200字）','aria-label':'小岛留言'})
 const count=el('small',{class:'isle-note',text:'0 / 200'}),form=el('form',{class:'isle-board-form'}),send=el('button',{type:'submit',class:'isle-btn'},'发表留言')
 input.addEventListener('input',()=>{operation=null;count.textContent=[...input.value].length+' / 200'})
 const render=messages=>{list.replaceChildren(...(messages.length?messages.map(m=>{
  const remove=m.canRemove?btn('删除',async e=>{const button=e.currentTarget;if(button.dataset.confirm!=='yes'){button.dataset.confirm='yes';button.textContent='确认删除';return}button.disabled=true;try{const d=await call('board/'+id,{operation:crypto.randomUUID(),remove:m.id});if(!closed)render(d.messages)}catch(error){status.textContent=error.message;button.disabled=false}},'chip ghost'):null
  return el('article',{class:'isle-board-message'},el('div',{},el('b',{text:m.name}),el('small',{text:ago(m.t)}),remove),el('p',{text:m.text}))
 }):[el('p',{class:'isle-note',text:'还没有留言，留下第一句问候。'})]))}
 const load=async()=>{if(busy)return;const token=++epoch;status.textContent='正在读取留言…';try{const d=await call('board/'+id);if(closed||token!==epoch)return;title.textContent=d.owner.name+' 的小岛';render(d.messages);status.textContent='可直接留言，无需帮忙或偷菜。保留最近20条，每分钟可发表一条。'}catch(e){if(!closed&&token===epoch)status.textContent=e.message}}
 form.append(input,el('div',{class:'isle-board-actions'},count,send));form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;const text=input.value.trim();if(!text||[...text].length>200){status.textContent='请输入1至200个字';return}busy=true;send.disabled=true;operation||=crypto.randomUUID();try{const d=await call('board/'+id,{operation,text});if(closed)return;render(d.messages);input.value='';count.textContent='0 / 200';operation=null;status.textContent='留言已发表';toast?.('留言已发表','ok')}catch(error){status.textContent=error.message}finally{busy=false;send.disabled=false}})
 body.append(title,status,form,list,btn('刷新留言',load,'ghost'))
 form.addEventListener('submit',()=>epoch++);void load();return sh
}
export function openGuardLog(host,{user,toast}={}){
 if(!document.getElementById('pet-battle-styles'))document.head.append(el('link',{id:'pet-battle-styles',rel:'stylesheet',href:'/pet-battle.css?v=472f7fbf'}))
 let cursor=null,loading=false,arena=null,closed=false,replayEpoch=0
 const body=el('div',{class:'isle-guard-log'}),sh=sheet(host,'守护对战日志',body,{wide:true,onClose:()=>{closed=true;replayEpoch++;arena?.destroy();arena=null}}),list=el('div'),status=el('p',{class:'isle-note',role:'status'})
 const more=btn('加载更多',()=>load(false),'ghost')
 const load=async(reset=true)=>{if(loading)return;loading=true;more.disabled=true;status.textContent='正在读取战报…';try{const d=await call('guard-log'+(!reset&&cursor?'?cursor='+encodeURIComponent(cursor):''));if(closed)return;if(reset)list.replaceChildren();for(const b of d.battles){const mine=b.attacker_id===user?.id,won=b.winner===-1?'平局':(b.winner===0)===mine?'获胜':'落败';list.append(btn(`${ago(b.created_at)} · ${mine?'出门遇守护':'守护家园'} · ${mine?b.defender:b.attacker} · ${won}`,()=>replay(b.id),'ghost isle-guard-row'))}cursor=d.nextCursor;more.hidden=!cursor;more.textContent='加载更多';status.textContent=list.children.length?'仅显示自己参与的守护战，点击可查看完整回放。':'还没有守护对战记录。'}catch(e){status.textContent=e.message;more.hidden=false;more.textContent='重试'}finally{loading=false;more.disabled=false}}
 const replay=async id=>{
  const token=++replayEpoch;status.textContent='正在读取完整战报…'
  try{
   const r=await fetch('/api/pet/battle/'+id),d=await r.json();if(!r.ok)throw new Error(d.error||'读取失败');if(closed||token!==replayEpoch)return
   const{createArena}=await import('/pet-arena.js?v=472f7fbf');if(closed||token!==replayEpoch)return
   arena?.destroy();arena=null;body.replaceChildren()
   const instance=await createArena(body,d,user?.id,()=>{if(closed||token!==replayEpoch)return;replayEpoch++;arena?.destroy();arena=null;body.replaceChildren(status,list,more);status.textContent='点击记录可查看完整回放。'},{backLabel:'返回守护日志'})
   if(closed||token!==replayEpoch){instance?.destroy();return}arena=instance
  }catch(e){if(closed||token!==replayEpoch)return;arena?.destroy();arena=null;body.replaceChildren(status,list,more);status.textContent=e.message;toast?.(e.message,'err')}
 }
 body.append(status,list,more);void load();return sh
}
export function openVisit(host,isle,{toast,user}={}){
 const body=el('div',{class:'isle-visit'}),sh=sheet(host,'🚤 串门',body,{wide:true,onClose:()=>isle?.refresh?.()})
 const search=el('input',{type:'search',placeholder:'搜索名字、用户名或用户编号','aria-label':'搜索小岛'}),form=el('form',{class:'isle-directory-search'}),find=el('button',{type:'submit',class:'isle-btn'},'搜索')
 const status=el('p',{class:'isle-note',role:'status','aria-live':'polite'}),list=el('div',{class:'isle-visit-list'}),more=btn('加载更多小岛',()=>load(false),'ghost'),visits=el('div')
 let cursor=null,loading=false,epoch=0,query='',markedOnly=false,stealableOnly=false
 const groups=el('div',{class:'isle-tabs'});for(const [value,label]of [[false,'全部佬友'],[true,'🐳 已标记']]){const b=btn(label,()=>{markedOnly=value;for(const x of groups.children)x.setAttribute('aria-pressed',String(x===b));load(true)},'ghost');b.setAttribute('aria-pressed',String(!value));groups.append(b)}
 const stealFilter=el('label',{class:'isle-stealable'},el('input',{type:'checkbox','aria-label':'只看可偷的小岛',onchange:e=>{stealableOnly=e.target.checked;load(true)}}),'只看可偷')
 const load=async reset=>{if(loading&&!reset)return;const n=++epoch;loading=true;more.disabled=true;if(reset){query=search.value.trim();cursor=null;list.replaceChildren()}status.textContent='正在寻找小岛…';try{const p=new URLSearchParams({limit:'20',q:query,...(stealableOnly?{stealable:'1'}:{}),...(!reset&&cursor?{cursor}:{})}),d=await call('neighbors'+(markedOnly?'/marked':'')+'?'+p);if(n!==epoch)return;
  for(const o of d.neighbors.filter(o=>!list.querySelector('[data-whale-id=\"'+o.id+'\"]')))list.append(el('div',{class:'isle-visit-row'},el('div',{},el('b',{text:o.name}),el('small',{text:`编号 ${o.id} · 大肥鱼 Lv${o.level} · ${o.newbie?'新手偷菜保护中（一天）':o.plots+o.pens?o.plots+'块地、'+o.pens+'个窝可偷':'可自由参观'} · ${ago(o.active)}`})),el('div',{class:'isle-visit-actions'},whaleMark({id:o.id,name:o.name,marked:o.marked,className:'isle-btn chip ghost',request:(id,active)=>call('favorite/'+id,{active}),onError:t=>{status.textContent=t},onChange:()=>{if(markedOnly)load(true)}}),btn('坐船过去',()=>{if(isle?.visit){sh.close();isle.visit(o.id)}},'chip'),btn('留言',()=>openBoard(host,o.id,{user,toast}),'chip ghost'))))
  cursor=d.nextCursor;more.hidden=!cursor;more.textContent='加载更多小岛';status.textContent=list.children.length?'已显示 '+list.children.length+(stealableOnly?' 座可偷小岛。按列表生成时的体力与产物状态筛选，抵达后再次核对。':' 座小岛，🐳标记优先，其次可偷或可帮、等级和最近操作。新手、无可偷产物和久未活跃的岛均可访问。'):'没有找到小岛。可以换个名字或编号搜索。';
  if(reset){visits.replaceChildren(el('h3',{text:'谁来过我家'}),...(d.visits||[]).map(v=>el('p',{class:'isle-note',text:ago(v.t)+' · '+v.n+' · '+(v.w==='help'?'来帮忙':v.w==='win'?'偷取成功':v.w==='lose'?'被守护鱼打跑':'守护战打平')+(v.b?'（完整战报见守护日志）':'')})))}
 }catch(e){if(n===epoch){if(e.message.includes('列表已更新')){cursor=null;list.replaceChildren()}status.textContent=e.message;more.hidden=false;more.textContent='重试'}}finally{if(n===epoch){loading=false;more.disabled=false}}}
 form.append(search,find);form.addEventListener('submit',e=>{e.preventDefault();load(true)})
 body.append(el('div',{class:'isle-visit-actions'},btn('我的留言板',()=>openBoard(host,user.id,{user,toast}),'ghost'),btn('守护对战日志',()=>openGuardLog(host,{user,toast}),'ghost')),el('p',{class:'isle-note',text:'参观和留言不限新手保护；新账号创建后的 24 小时内受偷菜保护，产物另有成熟保护。偷菜仍受体力、成熟保护和守护对战规则约束。'}),groups,stealFilter,form,status,list,more,visits)
 void load(true);return sh
}
