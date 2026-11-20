// 固定平台、本人登录态、按账户持久化操作。未知结果不创建第二笔。
async function platformCreate(action,ext,request){
 try{return await platformCreateAttempt(action,ext,request)}catch(error){
  if(action==='platformCreate'&&['hb','fish'].includes(ext?.provider)&&platformUuid(ext.operation)&&typeof GM_getValue==='function'){
   error.creation=platformCreationOutcome(ext.provider,ext.operation)
  }
  throw error
 }
}
function platformCreationOutcome(provider,operation){
 const record=GM_getValue('packet-create:'+provider+':'+operation,null)
 return {provider,operation,status:record?.status||'not_submitted',id:record?.id||record?.result?.id||null,
  editable:!record||['prepared','rejected','abandoned'].includes(record.status)}
}
async function platformCreateAttempt(action,ext,request){
 const provider=ext?.provider
 if(!['hb','fish'].includes(provider))throw Error('创建平台无效')
 if(typeof GM_getValue!=='function'||typeof GM_setValue!=='function')throw Error('请允许连接器存储待确认操作')
 const origin=provider==='hb'?'https://hb.unsnow.org':'https://hb.lafi.sh'
 const session=await request(origin+(provider==='hb'?'/api/me':'/api/session'))
 const account=String(provider==='hb'?session.user?.linuxdo_id??'':session.user?.id??'')
 if(!account)throw Error('请先登录 '+(provider==='hb'?'HB':'Fish')+'，再回本站检测账户')
 const globalKey='packet-create-pending:'+provider+':'+account
 let pendingOperation=GM_getValue(globalKey,null)
 let pending=pendingOperation?GM_getValue('packet-create:'+provider+':'+pendingOperation,null):null
 // 兼容1.3.0曾留下的明确拒绝记录；保留操作墓碑，解除跨操作锁。
 if(pending?.status==='rejected'){GM_setValue(globalKey,null);pendingOperation=null;pending=null}
 const headers=provider==='fish'?{'X-CSRF-Token':session.csrfToken}:{}
 let merchants=[]
 if(provider==='fish'){
  if(typeof session.csrfToken!=='string')throw Error('Fish登录状态失效，请重新登录')
  if(action==='creationOptions'&&session.user?.canUseLdc){
   const data=await request(origin+'/api/me/merchants')
   const items=[...(data.items||[])]
   if(platformUuid(data.currentMerchantId)&&!items.some(m=>m.id===data.currentMerchantId))items.push((await request(origin+'/api/me/merchants/'+data.currentMerchantId)).merchant)
   merchants=items.filter(m=>m?.mode==='real'&&platformUuid(m.id)).map(m=>({id:m.id,name:String(m.label||m.name||'LDC商户').slice(0,100),credentialVersion:m.credentialVersion,ready:m.publicationEligibility?.allowed===true,current:m.id===data.currentMerchantId}))
  }
 }
 if(action==='creationOptions')return {account,name:String(session.user?.username||session.user?.name||account).slice(0,100),ready:provider==='hb'?session.canCreate===true:session.user?.canUseLdc===true&&merchants.some(m=>m.current),merchants,
  current:platformUuid(ext.operation)?platformCreationOutcome(provider,ext.operation):null,
  pending:pending?{operation:pending.operation,form:pending.form,status:pending.status,id:pending.id||null}:null}
 if(action==='releaseCreation'){
  if(provider!=='hb'||ext.account!==account||ext.operation!==pendingOperation||!['prepared','rejected','sent','unknown'].includes(pending?.status)||ext.ack!=='checked-platform-history')throw Error('待确认操作不匹配，不能清理')
  // 用户已明确核对平台记录；只结束本机待确认流程，不重试、不撤销平台红包。
  await request(origin+'/api/hongbao/mine')
  GM_setValue('packet-create:'+provider+':'+pendingOperation,{...pending,status:'abandoned'})
  GM_setValue(globalKey,null);return {released:true}
 }
 const params=normalizePlatformCreate(ext)
 if(params.account!==account)throw Error('平台登录账户已改变，请核对原操作，未提交创建')
 const key='packet-create:'+provider+':'+params.operation
 let record=GM_getValue(key,null)
 if(record&&JSON.stringify(record.params)!==JSON.stringify(params))throw Error('待确认红包的参数已改变，请恢复原参数')
 if(record?.status==='abandoned')throw Error('原操作已结束，请使用新的红包表单')
 if(record?.status==='rejected')throw Error('原操作已拒绝，请修改表单后重新提交')
 if(record?.status==='opened')return record.result
 if(pendingOperation&&pendingOperation!==params.operation)throw Error('这个账户还有一笔创建结果待确认，请先恢复原操作')
 if(provider==='hb'&&!session.canCreate)throw Error('请先在 HB“我的配置”完成 LDC 绑定，密钥仅保留在 HB')
 if(provider==='fish'&&!session.user?.canUseLdc)throw Error('请先在 Fish 使用官方 Connect 升级登录')
 const verifyAccount=async()=>{
  const fresh=await request(origin+(provider==='hb'?'/api/me':'/api/session'))
  const identity=String(provider==='hb'?fresh.user?.linuxdo_id??'':fresh.user?.id??'')
  if(identity!==account)throw Error('平台登录账户已改变，停止提交，请切回原账户核对')
  if(provider==='fish'){if(!fresh.user?.canUseLdc||typeof fresh.csrfToken!=='string')throw Error('Fish登录权限已改变');headers['X-CSRF-Token']=fresh.csrfToken}
 }
 const verifyMerchant=async()=>{
  const list=await request(origin+'/api/me/merchants')
  if(list.currentMerchantId!==params.merchantId)throw Error('Fish当前商户已改变，请到平台核对原草稿，不会自动更换付款账户')
  const {merchant}=await request(origin+'/api/me/merchants/'+params.merchantId)
  if(merchant?.mode!=='real'||merchant.credentialVersion!==params.credentialVersion)throw Error('Fish商户或凭证版本已改变，请到商户管理核对')
  if(merchant.publicationEligibility?.allowed!==true&&merchant.publicationEligibility?.reason!=='MERCHANT_CREDENTIALS_UNVERIFIED')throw Error('Fish商户暂不能开放活动，请到商户管理完成验证后继续原操作')
 }
 if(!record){
  const form={}
  for(const field of ['kind','amount','count','greeting','target','codeType','code','distribution','drawSeconds','merchantId','credentialVersion','participation','algorithm','amounts','participantLimit','distributeFullPool'])if(ext[field]!==undefined)form[field]=ext[field]
  record={params,form,operation:params.operation,account,status:'prepared'}
 }
 const save=()=>{GM_setValue(key,record);GM_setValue(globalKey,['opened','rejected'].includes(record.status)?null:params.operation)}
 const definiteRejection=error=>[400,401,403,404,405,422].includes(error.status)
 if(provider==='hb'){
  if(record.status==='sent'||record.status==='unknown')throw Error('HB上次创建结果未确认，不能再次扣积分。请打开HB已发记录，使用“分享已有红包”发送对应红包；确认没有创建后再解除待确认状态')
  await verifyAccount();record.status='sent';save()
  let result
  try{result=await request(origin+'/api/hongbao','POST',params.payload)}
  catch(error){record.status=definiteRejection(error)?'rejected':'unknown';save();throw error}
  if(!/^[A-Za-z0-9]{1,100}$/.test(String(result.id||''))){record.status='unknown';save();throw Error('HB已接收请求但返回编号无法确认，请核对已发记录，勿重复创建')}
  const code=params.payload.code_type==='text'?params.payload.text_code:typeof result.code==='string'?result.code:null
  record.result={id:String(result.id),url:origin+'/hb/'+encodeURIComponent(result.id),code,
   shareUrl:code?origin+(params.payload.code_type==='text'?'/text-code/':'/code/')+encodeURIComponent(code):null,
   draw_at:Number.isFinite(result.draw_at)?Math.floor(result.draw_at/1000):null,kind:params.payload.type}
  record.status='opened';save();return record.result
 }
 await verifyMerchant()
 if(!record.id){
  const wasUncertain=['sent','unknown'].includes(record.status)
  await verifyAccount();record.status='sent';save()
  // Fish明确支持requestId幂等；重试保持相同账户、参数和requestId。
  let result
  try{result=await request(origin+'/api/activities','POST',{requestId:params.operation,activity:params.payload},headers)}
  catch(error){record.status=!wasUncertain&&definiteRejection(error)?'rejected':'unknown';save();throw error}
  const activity=result.activity
  if(!platformUuid(activity?.id)||!Number.isSafeInteger(activity.version)){record.status='unknown';save();throw Error('Fish创建结果未确认，请继续核对原操作')}
  record.id=activity.id;record.version=activity.version;record.status='created';save()
 }
 const readActivity=async()=>{
  const {activity}=await request(origin+'/api/me/activities/'+record.id)
  if(activity?.id!==record.id||activity.config?.merchantId!==params.merchantId||activity.config?.rewardType!=='ldc'||activity.paymentMode!=='real')throw Error('Fish活动配置与本次真实LDC红包不一致，未开放')
  if(activity.version!==(activity.openedAt?record.version+1:record.version))throw Error('Fish活动已被修改，请在平台核对，未覆盖修改')
  return activity
 }
 const complete=activity=>{
  if(!activity.openedAt)throw Error('Fish草稿已保存，尚未开放，请继续原操作')
  record.status='opened';record.result={id:record.id,url:origin+'/🧧/'+fishShareCode(record.id),
   code:params.payload.passwords?.[0]||null,kind:params.payload.money?.mode,
   draw_at:activity.deadlineAt?Math.floor(Date.parse(activity.deadlineAt)/1000):null};save();return record.result
 }
 const activity=await readActivity()
 if(activity.openedAt)return complete(activity)
 await verifyMerchant();await verifyAccount()
 try{
  await request(origin+'/api/me/activities/'+record.id+'/open','POST',{version:record.version,merchantId:params.merchantId,credentialVersion:params.credentialVersion},headers)
 }catch(error){
  try{const fresh=await readActivity();if(fresh.openedAt)return complete(fresh)}catch{}
  throw Error('Fish草稿已保存（'+record.id+'），开放未完成：'+error.message+'。继续时会使用同一红包')
 }
 return complete(await readActivity())
}

function packetRequestError(provider,url,r){
 const platform=({hb:'HB',credit:'Credit',fish:'Fish'})[provider]||'红包平台'
 if(provider==='fish'&&r.status===403){
  const path=new URL(url).pathname,stage=path==='/api/session'?'登录状态':path.startsWith('/api/me/merchants')?'商户权限':'红包操作'
  const code=typeof r.response?.error?.code==='string'&&/^[A-Z0-9_]{1,64}$/.test(r.response.error.code)?r.response.error.code:''
  const json=r.response&&typeof r.response==='object'
  const error=Error(`Fish 拒绝${stage}请求（403${code?' · '+code:''}）。${json?'请到 Fish 核对当前账号的登录与操作权限。':'原站返回非接口页面，请在同一浏览器打开 Fish 完成访问验证后重试。'}`)
  error.status=403;return error
 }
 const error=Error(r.status===401?'请先登录 '+platform:String(r.response?.error?.message||r.response?.error||platform+' 返回 '+r.status).slice(0,180));error.status=r.status;return error
}
function packetPlatformRequest(provider){
 const platform=({hb:'HB',credit:'Credit',fish:'Fish'})[provider],origin=({hb:'https://hb.unsnow.org',credit:'https://credit.linux.do',fish:'https://hb.lafi.sh'})[provider]
 return (url,method='GET',body,extraHeaders={})=>new Promise((resolve,reject)=>{
  if(!origin||!url.startsWith(origin+'/api/')||!['GET','POST'].includes(method)){reject(Error('红包请求目标无效'));return}
  GM_xmlhttpRequest({url,method,responseType:'json',timeout:20000,anonymous:false,
   headers:{Accept:'application/json',...(provider==='credit'?{'X-Requested-With':'XMLHttpRequest'}:{}),...(method==='POST'?{'Content-Type':'application/json'}:{}),...extraHeaders},...(body?{data:JSON.stringify(body)}:{}),
   onload:r=>{
    if(r.status<200||r.status>=300){reject(packetRequestError(provider,url,r));return}
    if(!r.response||typeof r.response!=='object'){reject(Error(platform+'需要验证或返回格式变化，请打开平台核对'));return}
    resolve(r.response)
   },onerror:()=>reject(Error(platform+'连接失败，请核对原操作')),ontimeout:()=>reject(Error(platform+'请求超时，请核对原操作'))
  })
 })
}
