// 仅在 Credit 自身来源页面运行。支付口令不经过尽欢页面、postMessage 或 GM 存储。
function mountCreditCreatePage(){
 if(location.origin!=='https://credit.linux.do')return
 const operation=new URLSearchParams(location.search).get('jh-credit')
 if(!operationPattern.test(operation||''))return
 const key='credit-create:'+operation
 const host=document.createElement('div')
 host.id='jh-credit-create'
 const root=host.attachShadow({mode:'closed'})
 root.innerHTML=`<style>
  :host{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#172820b8;padding:12px;font:16px/1.5 system-ui;color:#52392f}
  *{box-sizing:border-box}.panel{width:min(440px,100%);max-height:calc(100vh - 24px);overflow:auto;background:#fff7e9;border:3px solid #e7a088;border-radius:23px;box-shadow:0 18px 50px #1d1a1680;padding:22px}
  h1{font-size:22px;margin:0 0 8px}.cat{font-size:34px;float:right}p{margin:10px 0}dl{display:grid;grid-template-columns:auto 1fr;gap:4px 18px;padding:12px;background:#fff;border-radius:14px}dd{margin:0;text-align:right;font-weight:700}
  label{display:block;margin:14px 0 7px;font-weight:700}input{width:100%;font:inherit;padding:12px;border:1px solid #c8b6a7;border-radius:11px}button{font:inherit;font-weight:700;border:0;border-radius:12px;padding:11px 16px;cursor:pointer}button:disabled{opacity:.55;cursor:wait}.pay{background:#eb9c87;color:#3c2a23}.cancel{background:#eee8dd;color:#513d32}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.state{min-height:24px;color:#8c493b}.recovery{padding:12px;background:#fff;border-radius:12px}.recovery a{color:#a64d37}.recovery input{margin-top:8px}.recovery label{font-weight:400}
  </style><section class="panel" role="dialog" aria-modal="true" aria-labelledby="title"><span class="cat" aria-hidden="true">✉️</span><h1 id="title">在 Credit 确认红包</h1><p class="intro">正在读取发包信息…</p><dl hidden></dl><form hidden><label for="pay-key">Credit 支付口令（6～10 位）</label><input id="pay-key" type="password" minlength="6" maxlength="10" required autocomplete="off"><div class="actions"><button class="pay" type="submit">确认扣款并创建</button><button class="cancel" type="button">取消</button></div></form><p class="state" role="status"></p><div class="recovery" hidden><p>先到 <a href="https://credit.linux.do/home" target="_blank" rel="noopener">Credit 已发送和交易记录</a>核对，再选择：</p><label for="known-id">已经创建：填写该红包编号</label><input id="known-id" inputmode="numeric" placeholder="红包编号"><button class="known" type="button">保存已创建编号</button><label><input class="no-charge" type="checkbox" style="width:auto"> 我已确认没有创建，也没有扣款</label><button class="unlock" type="button">解除锁定后重新尝试</button></div></section>`
 document.body.append(host)
 const intro=root.querySelector('.intro'),detail=root.querySelector('dl'),form=root.querySelector('form'),input=root.querySelector('#pay-key'),pay=root.querySelector('.pay'),cancel=root.querySelector('.cancel'),state=root.querySelector('.state'),recovery=root.querySelector('.recovery'),knownInput=root.querySelector('#known-id'),known=root.querySelector('.known'),noCharge=root.querySelector('.no-charge'),unlock=root.querySelector('.unlock')
 let record=null,configReady=false,waiting=0
 const display=(text)=>{state.textContent=text}
 const stop=(text)=>{intro.textContent=text;form.hidden=true;detail.hidden=true}
 if(new URLSearchParams(location.search).get('jh-cancel')==='1'){
  if(!navigator.locks?.request){stop('浏览器不支持安全取消，请回到原确认窗口取消。');return}
  navigator.locks.request('jh-credit-create',{mode:'exclusive'},async()=>{
   const current=GM_getValue(key,null)
   if(!current||['pending','cancelled'].includes(current.status)){
    GM_setValue(key,{...current,status:'cancelled'});stop('未提交的草稿已取消。回到群聊可重新编辑。')
   }else stop('此红包已提交或结果未确认，不能直接取消。请核对Credit已发送记录。')
  }).catch(()=>stop('无法安全取消，请在原确认窗口核对。'))
  return
 }
 const poll=setInterval(async()=>{
  if(!host.isConnected){clearInterval(poll);return}
  record=GM_getValue(key,null)
  if(!record?.params){if(++waiting>15){clearInterval(poll);stop('没有收到发包资料，请回群聊重新打开。')}return}
  clearInterval(poll)
  if(record.status==='created'){stop('这个红包已经创建，请回群聊继续发布。');display('红包编号 '+record.id);return}
  if(record.status==='sent'||record.status==='unknown'){stop('上次扣款结果尚未确认。请在 Credit 核对，避免重复扣款。');recovery.hidden=false;return}
  if(record.status!=='pending'){stop('本次发包已取消。请回群聊重新打开。');return}
  try{
   const response=await fetch('/api/v1/config/public',{credentials:'include',headers:{Accept:'application/json','X-Requested-With':'XMLHttpRequest'}})
   if(!response.ok)throw Error('无法读取 Credit 公开配置，请登录后重新打开')
   const raw=await response.json(),preview=previewCreditCreate(record.params,raw?.data)
   const params=record.params
   intro.textContent='使用当前 Credit 登录账号扣款；确认后红包会回到群聊发出。'
   detail.replaceChildren()
   for(const [label,value] of [['类型',params.kind==='fixed'?'普通红包':'拼手气红包'],['总额',params.amount+' LDC'],['份数',params.count+' 份'],['预计手续费',preview.fee+' LDC'],['预计扣款',preview.deduction+' LDC']]){
    const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;detail.append(dt,dd)
   }
   detail.hidden=false;form.hidden=false;configReady=true;input.focus()
  }catch(error){stop(error.message||'无法核对 Credit 配置，请到原站确认')}
 },1000)
 cancel.addEventListener('click',async event=>{
  if(!event.isTrusted)return
  if(!navigator.locks?.request){display('请关闭此确认窗口；浏览器暂不支持安全取消。');return}
  await navigator.locks.request('jh-credit-create',{mode:'exclusive'},async()=>{
   const current=GM_getValue(key,null)
   if(current?.status==='pending'){record={...current,status:'cancelled'};GM_setValue(key,record);stop('已取消，未发送扣款请求。')}
   else display('此红包已提交或结果未知，请核对Credit已发送记录。')
  })
 })
 known.addEventListener('click',event=>{
  if(!event.isTrusted || !['sent','unknown'].includes(record?.status))return
  const id=knownInput.value.trim()
  if(!creditIdPattern.test(id)){display('填写已发送记录中的红包编号');return}
  record={...record,status:'created',id};GM_setValue(key,record)
  const global=GM_getValue('credit-create-uncertain',null)
  if(global?.operation===operation)GM_setValue('credit-create-uncertain',null)
  recovery.hidden=true;display('已保存红包编号 '+id+'，请回群聊完成发送。')
 })
 unlock.addEventListener('click',event=>{
  if(!event.isTrusted || !noCharge.checked || !['sent','unknown'].includes(record?.status)){display('先核对已发送和交易记录，并勾选确认');return}
  record={...record,status:'pending'};GM_setValue(key,record)
  const global=GM_getValue('credit-create-uncertain',null)
  if(global?.operation===operation)GM_setValue('credit-create-uncertain',null)
  recovery.hidden=true;stop('已解除本次锁定。回到群聊重新点击，将再次尝试创建。');display('此操作由你确认，本站不会自动重复扣款。')
 })
 form.addEventListener('submit',async event=>{
  event.preventDefault()
  if(!event.isTrusted || !configReady || record?.status!=='pending')return
  const payKey=input.value;input.value=''
  if(payKey.length<6 || payKey.length>10){display('Credit 支付口令需为 6～10 位');return}
  if(!navigator.locks?.request){display('浏览器缺少跨窗口领取锁，无法安全创建。请到 Credit 原站发包。');return}
  pay.disabled=true;cancel.disabled=true;display('正在 Credit 创建，请不要重复点击…')
  try{await navigator.locks.request('jh-credit-create',{mode:'exclusive'},async()=>{
   const current=GM_getValue(key,null)
   if(GM_getValue('credit-create-uncertain',null)||current?.status!=='pending' || JSON.stringify(current.params)!==JSON.stringify(record.params)){
    pay.disabled=false;cancel.disabled=false;display('另一窗口已有发包操作，请回群聊核对');return
   }
   record=current
   const params=record.params
   GM_setValue('credit-create-uncertain',{operation,at:Date.now()})
   GM_setValue(key,{...record,status:'sent'})
   try{
   const response=await fetch('/api/v1/redenvelope/create',{
    method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
    body:JSON.stringify({type:params.kind,total_amount:params.amount,total_count:params.count,greeting:params.greeting,pay_key:payKey}),
   })
   const raw=await response.json().catch(()=>null)
   if(!response.ok){
    const message=String(raw?.error?.message||raw?.error||`Credit 返回 ${response.status}`).slice(0,150)
    throw Error(message)
   }
   const id=creditCreateId(raw)
   record={...record,status:'created',id};GM_setValue(key,record);GM_setValue('credit-create-uncertain',null)
   form.hidden=true;display('创建成功，红包编号 '+id+'。回到群聊完成发送。')
   }catch(error){record={...record,status:'unknown'};GM_setValue(key,record);form.hidden=true;recovery.hidden=false;display('扣款结果无法确认：'+(error.message||'请求中断')+'。请到 Credit 已发送和交易记录核对，勿再次扣款。')}
  })}catch{
   const current=GM_getValue(key,null)
   if(current?.status==='pending'){pay.disabled=false;cancel.disabled=false;display('无法取得跨窗口锁；本次没有发送扣款请求，请到原站确认后重试')}
   else{record={...current,status:'unknown'};GM_setValue(key,record);form.hidden=true;recovery.hidden=false;display('扣款结果无法确认，请核对 Credit 已发送和交易记录')}
  }
 })
}
