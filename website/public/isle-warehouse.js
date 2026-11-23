// 鱼鱼谷 · 囤货仓库（b26）：仓库内景里的货架 / 冷库 / 地面货位，拖拽或点选上架；行情走势、到价提醒、到价自动出售（管家巡视执行）。
// 仓位与数量仍走原有 warehouse 动作（服务端校验），等级、提醒与订单走 whUp / whAlert / whOrder。
import * as R from '/pet-world-rules.js?v=472f7fbf'
import * as A from '/pet-isle-art.js?v=472f7fbf'
const AV='?v=fb3c9b0c'
{if(!document.querySelector('link[data-wh]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/isle-warehouse.css?v=472f7fbf';l.dataset.wh='1';document.head.append(l)}}
const ART='/pets/dsh/isle/art/'
const el=(tag,attrs={},...kids)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs||{})){if(v==null||v===false)continue;if(k==='class')n.className=v;else if(k==='text')n.textContent=v;else if(k==='style')n.style.cssText=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else n.setAttribute(k,v===true?'':v)}for(const c of kids.flat(Infinity))if(c!=null&&c!==false)n.append(c instanceof Node?c:document.createTextNode(String(c)));return n}
const put=(n,...k)=>n.replaceChildren(...k.flat(Infinity).filter(x=>x!=null&&x!==false))
const fmt=n=>Math.round(n).toLocaleString('zh-CN')
const QN=['普通','银星','金星']
// wh-items.webp：6×4，每格 128
const SP={crate:[0,0],crateFull:[0,1],basket:[0,2],basketFull:[0,3],sack:[0,4],sackFull:[0,5],cold:[1,0],coldFull:[1,1],fresh:[1,2],ok:[1,3],stale:[1,4],bad:[1,5],up:[2,0],down:[2,1],flat:[2,2],bell:[2,3],gear:[2,4],hammer:[2,5],lock:[3,0],cat1:[3,1],cat2:[3,2]}
const sp=(k,size,cls='')=>{const[r,c]=SP[k];return el('i',{class:'wh-sp '+cls,style:`width:${size}px;height:${size}px;background-size:600% 400%;background-position:${c*20}% ${r*100/3}%`})}
// 内景图上的货位（百分比，x 为中心、y 为底边）：上中下三层货架各 6 格、冷库 4 格、地面 8 格
const SLOTS=[...[.39,.515,.635].flatMap(y=>[.185,.285,.385,.485,.585,.685].map(x=>({x,y,w:.085,kind:'shelf'}))),
 ...[[.795,.52],[.865,.52],[.795,.66],[.865,.66]].map(([x,y])=>({x,y,w:.06,kind:'cold'})),
 ...[.13,.235,.34,.445,.55,.655,.76,.865].map(x=>({x,y:.93,w:.09,kind:'floor'}))]
const crop=new Set(R.CROPS.map(c=>c.id)),animal=new Set(R.ANIMALS.map(a=>a.product)),fish=new Set(R.FISH.map(f=>f.id)),ore=new Set(R.ORES.map(o=>o.id)),craft=new Set(R.RECIPES.map(r=>r.id))
const box=id=>crop.has(id)?'basket':animal.has(id)||fish.has(id)?'cold':ore.has(id)||craft.has(id)?'crate':'sack'
const sum=a=>(a?.[0]||0)+(a?.[1]||0)+(a?.[2]||0)

export async function openWarehouseHall(host,isle,{toast}={}){
 const say=(m,k)=>toast?toast(m,k):null
 if(getComputedStyle(host).position==='static')host.style.position='relative'
 const root=el('div',{class:'wh-root'}),box0=el('div',{class:'wh-box'});root.append(box0);host.append(root)
 let closed=false,pick=null,drag=null
 const close=()=>{if(closed)return;closed=true;root.remove();document.removeEventListener('keydown',onKey,true);isle.refresh?.()}
 const onKey=e=>{if(e.key!=='Escape')return;e.preventDefault();e.stopPropagation();const m=root.querySelector('.wh-modal');if(m)m.remove();else close()};document.addEventListener('keydown',onKey,true)
 const S=()=>isle.state,W=()=>{const s=S(),w=s.b26||{};return {lv:Math.max(1,Math.min(4,w.lv||1)),order:w.order||{},alert:w.alert||{},sold:w.sold||[]}}
 const B=R.B26,vault=()=>S().b12?.vault||{},keep=()=>S().b12?.keep||{},inv=()=>S().inv||{}
 const price=id=>Number(isle.prices?.[id])||0,base=id=>R.BASE_PRICE[id]||0
 const trend=id=>{const p=price(id),b=base(id);if(!p||!b)return 'flat';return p>=b*1.08?'up':p<=b*.92?'down':'flat'}
 const send=async acts=>{let last=null;for(const a of acts){last=await isle.actNow(a)}return last}
 const scene=el('div',{class:'wh-scene'}),bag=el('div',{class:'wh-bag'}),head=el('header',{class:'wh-head'}),note=el('div',{class:'wh-note'}),cat=el('div',{class:'wh-cat'},sp('cat1',64,'f1'),sp('cat2',64,'f2'))
 put(box0,head,el('div',{class:'wh-scroll'},el('div',{class:'wh-stage'},scene,cat)),note,bag)
 const runCat=()=>{cat.classList.remove('run');void cat.offsetWidth;cat.classList.add('run')}
 function render(){
  const w=W(),L=w.lv-1,v=vault(),ids=Object.keys(v),cap=B.slots[L],fired=Object.entries(w.alert).filter(([id,p])=>price(id)>=p)
  put(head,el('b',{text:'📦 囤货仓库 Lv.'+w.lv}),el('small',{text:'已用 '+ids.length+' / '+cap+' 格 · 每格最多 '+fmt(B.unit[L])+' 个'}),
   w.lv<4?el('button',{class:'wh-btn up',type:'button',onclick:upgrade},sp('hammer',22),'升级'):el('span',{class:'wh-max',text:'已满级'}),
   el('button',{class:'wh-btn',type:'button',onclick:showLog},'出售记录'),el('button',{class:'wh-x',type:'button','aria-label':'关闭',onclick:close},'✕'))
  // 货位
  const nodes=SLOTS.map((p,i)=>{const id=ids[i],locked=i>=cap,n=el('button',{class:'wh-slot '+p.kind+(locked?' locked':'')+(id?' full':''),type:'button',style:`left:${(p.x-p.w/2)*100}%;top:${(p.y-p.w*1.78)*100}%;width:${p.w*100}%`,'data-i':i})
   if(locked){n.append(sp('lock',40,'lock'));n.title='升级仓库解锁';n.onclick=upgrade;return n}
   if(!id){n.append(el('span',{class:'wh-empty',text:'+'}));n.onclick=()=>{if(pick)editor(pick,true);else say('先在下方背包点选或拖动一种货物','info')};return n}
   const qs=v[id],t=trend(id),k=box(id)
   n.append(el('span',{class:'wh-cont'},sp(k+'Full',64)),el('img',{class:'wh-ico',src:A.itemIcon(id),alt:''}),el('span',{class:'wh-n',text:fmt(sum(qs))}),el('span',{class:'wh-tr'},sp(t,22)))
   if(qs[2])n.append(el('span',{class:'wh-q',text:'★'}));if(w.alert[id])n.append(el('span',{class:'wh-flag bell'+(price(id)>=w.alert[id]?' hot':'')},sp('bell',20)))
   if(Object.keys(w.order).some(k=>k.startsWith(id+':')))n.append(el('span',{class:'wh-flag gear'},sp('gear',20)))
   n.title=R.ITEM_NAME[id]+' '+fmt(sum(qs))+' 个 · 今日 '+fmt(price(id));n.onclick=()=>editor(id);return n})
  put(scene,nodes)
  put(note,fired.length?el('span',{class:'wh-hot'},sp('bell',20),fired.map(([id,p])=>R.ITEM_NAME[id]+' 今日 '+fmt(price(id))+'（≥ '+fmt(p)+'）').join('；')):el('span',{text:w.lv<2?'把货物放进仓库，自动出售和加工都不会动它们。仓库 2 级开放行情走势和到价提醒。':w.lv<3?'2 级：可设到价提醒。3 级开放「到价自动出售」（雇了管家时，管家巡视会按设定价卖出）。':'到价自动出售由管家巡视执行（每 2 小时一轮，照常有代卖抽成）。'}))
  // 背包
  const free=Object.entries(inv()).map(([id,qs])=>[id,[0,1,2].map(q=>Math.max(0,(qs[q]||0)-(v[id]?.[q]||0)))]).filter(([id,qs])=>R.ITEM_NAME[id]&&sum(qs)>0).sort((a,b)=>(base(b[0])*sum(b[1]))-(base(a[0])*sum(a[1])))
  put(bag,el('div',{class:'wh-bag-head',text:'背包 · 点选后点货位，或直接拖到货架上'}),el('div',{class:'wh-bag-list'},free.length?free.map(([id,qs])=>{const c=el('button',{class:'wh-chip'+(pick===id?' on':''),type:'button','data-id':id},el('img',{src:A.itemIcon(id),alt:'',draggable:'false'}),el('span',{text:R.ITEM_NAME[id]}),el('small',{text:fmt(sum(qs))}))
   c.onclick=()=>{if(drag?.moved)return;pick=pick===id?null:id;render()};c.onpointerdown=e=>startDrag(e,id,c);return c}):el('p',{class:'wh-muted',text:'背包里没有可以囤的货'})))
 }
 // 拖拽：按住背包里的货物拖到货位上松手
 function startDrag(e,id,chip){if(e.button>0)return;if(e.pointerType==='mouse')e.preventDefault();const ghost=el('img',{class:'wh-ghost',src:A.itemIcon(id),alt:''});drag={id,ghost,moved:false,x0:e.clientX,y0:e.clientY}
  const mv=ev=>{if(!drag)return;if(!drag.moved&&Math.hypot(ev.clientX-drag.x0,ev.clientY-drag.y0)<8)return;if(!drag.moved){drag.moved=true;document.body.append(ghost)}ghost.style.transform=`translate(${ev.clientX-24}px,${ev.clientY-24}px)`
   for(const s of scene.querySelectorAll('.wh-slot'))s.classList.toggle('over',!s.classList.contains('locked')&&hit(s,ev))}
  const up=ev=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);ghost.remove();const d=drag;setTimeout(()=>{drag=null},0);if(!d?.moved)return
   const s=[...scene.querySelectorAll('.wh-slot')].find(s=>!s.classList.contains('locked')&&hit(s,ev));for(const x of scene.querySelectorAll('.over'))x.classList.remove('over');if(s)editor(d.id,true)}
  addEventListener('pointermove',mv);addEventListener('pointerup',up);addEventListener('pointercancel',up)}
 const hit=(n,ev)=>{const r=n.getBoundingClientRect();return ev.clientX>=r.left&&ev.clientX<=r.right&&ev.clientY>=r.top&&ev.clientY<=r.bottom}
 function modal(title,...kids){root.querySelector('.wh-modal')?.remove();const m=el('div',{class:'wh-modal',onclick:e=>{if(e.target===m)m.remove()}},el('div',{class:'wh-card'},el('div',{class:'wh-card-head'},el('b',{text:title}),el('button',{class:'wh-x',type:'button','aria-label':'关闭',onclick:()=>m.remove()},'✕')),...kids));root.append(m);return m}
 // 7 日走势（按每日行情公式计算的参考值）
 function spark(id){const c=el('canvas',{class:'wh-spark',width:280,height:70}),g=c.getContext('2d'),t=isle.now?.()||Date.now()/1000,days=[...Array(7)].map((_,k)=>R.isleDay(t-(6-k)*86400)),ps=days.map((d,k)=>k===6&&price(id)?price(id):R.priceOf(id,d)),b=base(id),lo=Math.min(b,...ps)*.9,hi=Math.max(b,...ps)*1.1,Y=v=>62-(v-lo)/(hi-lo||1)*54
  g.strokeStyle='rgba(120,80,40,.35)';g.setLineDash([4,4]);g.beginPath();g.moveTo(0,Y(b));g.lineTo(280,Y(b));g.stroke();g.setLineDash([]);g.strokeStyle='#d0781e';g.lineWidth=3;g.beginPath();ps.forEach((p,k)=>{const x=10+k*43;k?g.lineTo(x,Y(p)):g.moveTo(x,Y(p))});g.stroke()
  g.fillStyle='#7a3b0c';ps.forEach((p,k)=>{g.beginPath();g.arc(10+k*43,Y(p),3.5,0,7);g.fill()});return c}
 function editor(id,adding=false){
  const w=W(),v=vault()[id]||[0,0,0],have=inv()[id]||[0,0,0],kp=keep()[id]||[0,0,0],L=w.lv-1,inputs=[],keeps=[]
  const rows=[0,1,2].filter(q=>have[q]||v[q]).map(q=>{const inp=el('input',{type:'number',min:0,max:have[q],value:adding?have[q]:v[q],inputmode:'numeric'}),rng=el('input',{type:'range',min:0,max:have[q],value:adding?have[q]:v[q]}),kb=el('input',{type:'checkbox',checked:!!kp[q]})
   rng.oninput=()=>inp.value=rng.value;inp.oninput=()=>rng.value=inp.value;inputs[q]=inp;keeps[q]=kb
   return el('div',{class:'wh-row'},el('span',{class:'wh-qn',text:QN[q]}),rng,inp,el('small',{text:'/ '+fmt(have[q])}),el('label',{class:'wh-keep',title:'管家巡视时把仓里的数量补回到这个值'},kb,'自动补足'))})
  const p=price(id),b=base(id)
  const kids=[el('div',{class:'wh-item'},el('img',{src:A.itemIcon(id),alt:''}),el('div',{},el('b',{text:R.ITEM_NAME[id]}),el('small',{text:'背包共 '+fmt(sum(have))+' · 仓里 '+fmt(sum(v))+' · 每格上限 '+fmt(B.unit[L])}))),
   el('div',{class:'wh-price'},sp(trend(id),26),el('span',{text:p?'今日 '+fmt(p)+(b?'（基础 '+fmt(b)+'，'+(p>=b?'+':'')+Math.round((p/b-1)*100)+'%）':''):'这件货没有收购价'})),
   w.lv>=2&&b?spark(id):el('p',{class:'wh-muted',text:'仓库 2 级可看近 7 日走势'}),rows.length?rows:el('p',{class:'wh-muted',text:'背包里已经没有这件货了'})]
  const alertIn=el('input',{type:'number',min:0,placeholder:'提醒价',value:w.alert[id]||''})
  if(w.lv>=2&&b)kids.push(el('div',{class:'wh-line'},sp('bell',22),el('span',{text:'到价提醒'}),alertIn,el('small',{text:'0 或留空取消'})))
  const ordIn=[0,1,2].map(q=>({p:el('input',{type:'number',min:0,placeholder:'卖价',value:w.order[id+':'+q]?.[0]||''}),n:el('input',{type:'number',min:0,placeholder:'数量',value:w.order[id+':'+q]?.[1]||''})}))
  if(w.lv>=3&&b)kids.push(el('div',{class:'wh-sub',text:'到价自动出售（管家巡视时执行；设了自动出售的品质会关闭自动补足）'}),...[0,1,2].filter(q=>v[q]||have[q]).map(q=>el('div',{class:'wh-line'},sp('gear',22),el('span',{class:'wh-qn',text:QN[q]}),ordIn[q].p,ordIn[q].n)))
  const save=el('button',{class:'wh-btn main',type:'button'},adding?'放进仓库':'保存'),out=el('button',{class:'wh-btn',type:'button'},'全部取出')
  kids.push(el('div',{class:'wh-acts'},save,sum(v)?out:null))
  const m=modal(R.ITEM_NAME[id],kids)
  const run=async(acts,ok)=>{save.disabled=out.disabled=true;try{if(acts.length){const r=await send(acts);say(r?.msg||ok,'ok');runCat()}m.remove();pick=null;render()}catch(e){say(e.message||'没成功','err');save.disabled=out.disabled=false;render()}}
  save.onclick=()=>{const acts=[];for(const q of [0,1,2]){if(!inputs[q])continue;const n=Math.max(0,Math.min(have[q],Math.floor(Number(inputs[q].value)||0))),k=keeps[q].checked;if(n!==v[q]||k!==!!kp[q])acts.push({a:'warehouse',id,q,n,keep:k})}
   if(w.lv>=2&&b){const ap=Math.max(0,Math.floor(Number(alertIn.value)||0));if(ap!==(w.alert[id]||0))acts.push({a:'whAlert',id,price:ap})}
   if(w.lv>=3&&b)for(const q of [0,1,2]){const op=Math.max(0,Math.floor(Number(ordIn[q].p.value)||0)),on=Math.max(0,Math.floor(Number(ordIn[q].n.value)||0)),cur=w.order[id+':'+q];if(op&&on&&(!cur||cur[0]!==op||cur[1]!==on))acts.push({a:'whOrder',id,q,price:op,n:on});else if(cur&&(!op||!on))acts.push({a:'whOrder',id,q,price:0})}
   run(acts,'已保存')}
  out.onclick=()=>run([0,1,2].filter(q=>v[q]).map(q=>({a:'warehouse',id,q,n:0,keep:false})),'已全部取出')
 }
 function upgrade(){const w=W();if(w.lv>=4)return;const cost=B.cost[w.lv]
  const go=el('button',{class:'wh-btn main',type:'button'},'花 '+fmt(cost)+' D币 升级')
  modal('升级仓库',el('div',{class:'wh-up'},el('img',{src:ART+'warehouse-'+w.lv+'.webp'+AV,alt:''}),el('span',{text:'→'}),el('img',{src:ART+'warehouse-'+(w.lv+1)+'.webp'+AV,alt:''})),el('p',{text:'Lv.'+(w.lv+1)+'：'+B.perks[w.lv]}),el('p',{class:'wh-muted',text:'当前 D币 '+fmt(isle.coins||0)}),el('div',{class:'wh-acts'},go))
  go.onclick=async()=>{go.disabled=true;try{const r=await send([{a:'whUp'}]);say(r?.msg||'升级成功','ok');root.querySelector('.wh-modal')?.remove();runCat();render()}catch(e){say(e.message||'升级失败','err');go.disabled=false}}}
 function showLog(){const w=W();modal('自动出售记录',w.sold.length?el('ol',{class:'wh-log'},w.sold.slice().reverse().map(([d,id,q,n,p])=>el('li',{},el('span',{text:d}),el('b',{text:R.ITEM_NAME[id]+(q?'（'+QN[q]+'）':'')}),el('span',{text:'× '+fmt(n)+' @ '+fmt(p)})))):el('p',{class:'wh-muted',text:'还没有自动出售记录。仓库 3 级后可以设置，由管家巡视时执行。'}))}
 render()
 return {close}
}
