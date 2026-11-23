import {sheet} from '/pet-isle-ui.js?v=472f7fbf'
import * as R from '/pet-world-rules.js?v=472f7fbf'
import * as A from '/pet-isle-art.js?v=472f7fbf'
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n}
export function openFood(host,isle,reason=''){
 if(host.querySelector('.b9-food'))return
 let includeWarehouse=false,busy=false,uncertain=!!isle.busy?.(),feedback=reason,timer=0,closed=false
 const body=el('div','b9-food'),sh=sheet(host,'随身食物',body,{onClose:()=>{closed=true;clearTimeout(timer);isle.onClose?.()}})
 const watch=()=>{clearTimeout(timer);if(closed||!uncertain)return;timer=setTimeout(()=>{if(!isle.busy?.()){uncertain=false;feedback='体力状态已同步。';draw()}else watch()},500)}
 const draw=()=>{
  if(!body.isConnected)return
  const s=isle.state,max=R.energyMax(s),food=[...R.CROPS,{id:'tide_snack',name:'潮汐饭团',eat:20}].flatMap(c=>(s.inv[c.id]||[]).flatMap((total,q)=>{const n=includeWarehouse?total:R.b12Available(s,c.id,q);return n>0&&q<3?[{c,n,q}]:[]}))
  const summary=el('p','b9-food-energy',`体力 ${Math.floor(s.en)} / ${max}`),status=el('p','b9-food-status',feedback);status.setAttribute('role','status');body.replaceChildren(summary,status)
  const check=document.createElement('input');check.type='checkbox';check.checked=includeWarehouse;check.onchange=()=>{includeWarehouse=check.checked;draw()};const label=el('label');label.append(check,'包含仓库食物');body.append(label);
  const consume=async action=>{if(busy||uncertain)return;busy=true;feedback='正在补充体力…';draw();try{await isle.actNow(action);feedback='已补充体力，可关闭后继续活动。'}catch(e){uncertain=!!isle.busy?.();feedback=uncertain?(isle.syncWarning||'操作仍在同步，请稍候，避免重复消费。'):e.message||'暂时未能补充，请重试。';watch()}finally{busy=false;draw()}}
  const button=(label,action,disabled)=>{const b=el('button','isle-btn',label);b.type='button';b.disabled=busy||uncertain||disabled;b.onclick=()=>consume(action);return b}
  if(!food.length)body.append(el('p','isle-empty','背包里没有可食用的作物。收获后可随身食用，也可购买咖啡。'))
  for(const{c,n,q}of food){const row=el('div','isle-up'),desc=el('div'),pic=el('img','b9-food-icon');pic.src=A.itemIcon(c.id,2);pic.alt='';desc.append(el('b',null,`${c.name} · ${['普通','银星','金星'][q]} ×${n}`),el('small',null,`体力 +${Math.round(c.eat*R.QUALITY[q])}，最多恢复至上限`));row.append(pic,desc,button('吃一份',{a:'eat',id:c.id,q,includeWarehouse},s.en>=max||(c.id==='tide_snack'&&(s.cnt.tide_snack||0)>=R.B12_SNACK.daily)));body.append(row)}
  const used=s.cnt.coffee||0,price=R.WORLD.coffee.price,coffee=el('div','isle-up'),desc=el('div');desc.append(el('b',null,'☕ 咖啡'),el('small',null,`体力 +${R.WORLD.coffee.energy}，可超过上限；今日 ${used}/${R.WORLD.daily.coffee} 杯`));coffee.append(desc,button(`购买 · ${price.toLocaleString('zh-CN')} D币`,{a:'coffee'},used>=R.WORLD.daily.coffee||isle.coins<price));body.append(coffee)
  if(isle.coins<price)body.append(el('small',null,'当前余额不足以购买咖啡。'))
  body.append(el('small',null,`不消费也会每 ${R.WORLD.regen/60} 分钟自然恢复 1 点体力。`))
 };if(uncertain){feedback='正在同步之前的操作，请稍候。';watch()}draw();return sh
}

// 做客地图使用主人的展示状态；补给单独读取自己的世界，仍提交原act接口。
export async function openTravelFood(host,{onSync,onClose,active},reason=''){
 let world,pending=false,closed=false,blocked=false
 const sync=d=>{if(!d?.state||!Number.isInteger(d.rev))throw Error('体力状态读取失败');world=d;onSync(d)}
 const request=async(payload)=>{const r=await fetch('/api/pet/world'+(payload?'/act':''),{credentials:'same-origin',...(payload?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}:{})}),d=await r.json();if(!r.ok)throw Object.assign(Error(d.error||'同步失败'),{status:r.status,data:d});return d}
 try{sync(await request());if(!host.isConnected||!active()){onClose();return}}catch(e){onClose();throw e}
 return openFood(host,{get state(){return world.state},get coins(){return world.coins},busy:()=>pending||blocked,syncWarning:'结果尚未确认，请关闭食物栏后重新打开核对库存。',onClose:()=>{closed=true;if(!pending)onClose()},actNow:async action=>{
  if(pending||blocked)throw Error('请先重新打开食物栏同步状态');pending=true;const payload={rev:world.rev,operation:crypto.randomUUID(),actions:[action]}
  try{for(let attempt=0;attempt<3;attempt++){try{const d=await request(payload);sync(d);if(!d.out?.[0]?.ok)throw Object.assign(Error(d.out?.[0]?.msg||'未能补充体力'),{status:400});return d.out[0]}catch(e){if(e.status===409){if(e.data?.state)sync(e.data);throw Error('状态已同步，请重新选择食物。')}if(e.status&&e.status<500&&e.status!==429)throw e;if(attempt<2){await new Promise(ok=>setTimeout(ok,e.status===429?Math.min(4,Math.max(1,e.data?.retry||2))*1000:500));continue}try{sync(await request())}catch{blocked=true}throw Error('连接异常，已尝试同步库存，请核对结果后再操作。')}}}finally{pending=false;if(closed)onClose()}
 }},reason)
}
