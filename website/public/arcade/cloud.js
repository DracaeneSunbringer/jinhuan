import {validArcadeSave} from './save-validation.js'
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n}
export async function startCloud(game){
 const title=game==='mole'?'鼹途':'无尽裂隙',bar=el('nav'),status=el('span','正在读取云端进度…'),gate=el('dialog'),back=el('a','‹ 游戏大厅'),save=el('button','保存'),download=el('button','备份')
 bar.className='arcade-hostbar';bar.setAttribute('aria-label','游戏与云存档');status.setAttribute('role','status');back.href='/arcade';bar.append(back,status,save,download);document.body.prepend(bar);gate.className='arcade-gate';gate.setAttribute('aria-label','进度同步');document.body.append(gate)
 let uid,name,key,revision=0,confirmed=null,current=null,pending=null,lastSent=0,timer=0,inflight=null,locked=false,leaving=false,capture=()=>{},block=()=>{}
 const say=t=>status.textContent=t
 const persist=()=>localStorage.setItem(key+':sync',JSON.stringify({revision,confirmed,current,pending}))
 const exportSave=()=>{const a=el('a'),url=URL.createObjectURL(new Blob([current||'null'],{type:'application/json'}));a.href=url;a.download=title+'-'+uid+'-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 const request=async(method,body)=>{const r=await fetch('/api/arcade/'+game+'/state',{method,credentials:'same-origin',cache:'no-store',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)}),d=await r.json().catch(()=>({error:'服务器返回异常响应'}));if(!r.ok)throw Object.assign(Error(d.error||'云端暂时无法连接'),{status:r.status,retryAfter:Number(r.headers.get('retry-after'))||5});return d}
 function show(title,text){gate.replaceChildren(el('h2',title),el('p',text));if(!gate.open)gate.showModal()}
 function conflict(text){
  locked=true;clearTimeout(timer);block();say('同步已暂停 · 副本保留');show('进度需要确认',text)
  const copy=el('button','下载本机副本'),reload=el('button','载入云端进度');copy.onclick=exportSave;reload.onclick=()=>{if(current)localStorage.setItem(key+':recovery',current);localStorage.removeItem(key+':sync');location.reload()};gate.append(copy,reload);gate.oncancel=e=>e.preventDefault()
 }
 function commit(raw){
  if(locked||raw===current)return
  const value=JSON.parse(raw);if(!validArcadeSave(game,value))throw Error('存档未通过完整性校验')
  // Rift's savedAt is envelope metadata; advancing it alone is not a game change.
  if(game==='rift'&&current){const before=JSON.parse(current);if(JSON.stringify(value.state)===JSON.stringify(before.state))return}
  current=raw;localStorage.setItem(key,raw);persist();say('本机已保存 · 等待同步');schedule()
 }
 function schedule(){if(timer||locked||leaving||document.hidden||current===confirmed)return;timer=setTimeout(()=>{timer=0;void flush()},Math.max(60000-(Date.now()-lastSent),1000))}
 async function flush(){
  clearTimeout(timer);timer=0;if(locked)return false;if(inflight)return inflight
  try{capture()}catch(e){say(e.message);return false}
  if(current===confirmed||!current){say('云端已同步');return true}
  if(!pending){pending={revision,operation:crypto.randomUUID(),raw:current};persist()}
  const sent=pending;lastSent=Date.now();say('正在同步…');let retryDelay=0
  inflight=(async()=>{
   try{const d=await request('POST',{user_id:uid,revision:sent.revision,operation:sent.operation,state:JSON.parse(sent.raw)});if(d.revision!==sent.revision+1||d.operation!==sent.operation)throw Error('保存确认异常');revision=d.revision;confirmed=sent.raw;pending=null;persist();say(current===confirmed?'云端已同步':'本机已保存 · 等待同步');return true}
   catch(e){if([401,403,409,410].includes(e.status))conflict(e.message);else if([400,413,415].includes(e.status))conflict(e.message+'，请先下载副本。');else{if(e.status===429)retryDelay=Math.min(30000,Math.max(1000,(e.retryAfter||5)*1000));say(retryDelay?'保存较频繁，稍后自动重试':'本机已保存 · 云端待同步')}return false}
   finally{inflight=null;if(retryDelay&&!locked&&!leaving&&!document.hidden){clearTimeout(timer);timer=setTimeout(()=>{timer=0;void flush()},retryDelay)}else schedule()}
  })();return inflight
 }
 async function leave(){if(leaving)return;try{capture()}catch{};leaving=true;block();const ok=await flush();if(ok&&current===confirmed){location.assign('/arcade');return}show('尚有进度未同步','可以重试保存，或保留本机副本后离开。');const retry=el('button','重试保存'),copy=el('button','下载副本'),exit=el('a','保留本机进度并离开');retry.onclick=()=>{leaving=false;void leave()};copy.onclick=exportSave;exit.href='/arcade';gate.append(retry,copy,exit)}
 back.onclick=e=>{e.preventDefault();void leave()};save.onclick=()=>void flush();download.onclick=exportSave
 try{
  const d=await request('GET');if(!Number.isSafeInteger(d.user_id)||!Number.isSafeInteger(d.revision)||d.revision<0||(d.revision===0?d.state!==null:!validArcadeSave(game,d.state)))throw Error('云存档响应无效，没有启动空进度')
  uid=d.user_id;name=d.name;revision=d.revision;key='jinhuan.arcade.'+game+':'+uid;confirmed=d.state?JSON.stringify(d.state):null;current=confirmed
  const cached=JSON.parse(localStorage.getItem(key+':sync')||'null')
  if(cached){
   if(!Number.isSafeInteger(cached.revision)||![cached.current,cached.confirmed].every(x=>x===null||typeof x==='string')||(cached.current&&!validArcadeSave(game,JSON.parse(cached.current))))throw Error('本机恢复记录损坏，请保留浏览器数据')
   if(cached.pending?.operation===d.operation&&d.operation){if(cached.pending.raw!==confirmed)throw Error('保存确认与本机副本不一致');cached.confirmed=confirmed;cached.revision=revision;cached.pending=null}
   if(cached.current!==cached.confirmed){current=cached.current;if(cached.revision!==revision){conflict('另一设备已有新进度，本机未同步副本已保留。');return {locked:true}};confirmed=cached.confirmed;pending=cached.pending}
  }
  persist();if(current)localStorage.setItem(key,current);else localStorage.removeItem(key);say(current===confirmed?'云端已同步':'已恢复本机进度');schedule()
 }catch(e){say('云存档未连接');show('暂时无法进入游戏',e.message);const retry=el('button','重新连接'),exit=el('a','返回大厅');retry.onclick=()=>location.reload();exit.href='/arcade';gate.append(retry,exit);gate.oncancel=e=>e.preventDefault();throw e}
 document.addEventListener('visibilitychange',()=>{if(document.hidden){try{capture()}catch{};clearTimeout(timer);timer=0;if(Date.now()-lastSent>=5000)void flush()}else schedule()})
 window.addEventListener('online',()=>{if(!locked)void flush()});window.addEventListener('storage',e=>{if(e.key===key+':sync'&&!locked)conflict('另一个标签页正在保存此游戏，请只保留一个游戏窗口。')})
 window.addEventListener('beforeunload',e=>{try{capture()}catch{};if(!leaving&&current!==confirmed){e.preventDefault();e.returnValue=''}})
 return {key,uid,name,get locked(){return locked||leaving},commit,flush,read:()=>current,setCapture(fn){capture=fn},setBlocker(fn){block=fn},exportSave}
}
