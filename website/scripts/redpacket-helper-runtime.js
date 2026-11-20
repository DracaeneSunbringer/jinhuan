// 与官方页面的公开请求契约一致；不读取Cookie，不接受任意请求URL。
mountCreditCreatePage()
const fishUuid = value => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
const fishCode = value => [...value].length>=6 && [...value].length<=18 && /^[\p{Script=Han}A-Za-z0-9]+$/u.test(value)
async function fishPacket(action,ext,request) {
  const origin='https://hb.lafi.sh',session=await request(origin+'/api/session')
  if(!session.user || typeof session.csrfToken!=='string')throw Error('请先在 fish 登录自己的账号，再回群里继续')
  const accountKey='memeFish:'+String(session.user.id)+':'
  const key=accountKey+ext.ref, discoveryKey=key+':discovery'
  let id=ext.ref_kind==='id'?ext.ref:localStorage.getItem(key)
  let discoveredClaim=false
  const read=async (activityId,includeRoster=action==='query')=>{
    if(!fishUuid(activityId))throw Error('fish 活动标识无效')
    const data=await request(origin+'/api/activities/'+activityId)
    const own=data.activity?.rewardType==='ldc'?await request(origin+'/api/activities/'+activityId+'/participation'):{}
    let roster,roster_error=false
    if(includeRoster&&data.activity?.rewardType==='ldc'&&data.activity.showRecipientList!==false){
      const kind=data.activity.draw&&!['completed','empty'].includes(data.activity.draw.state)?'registrations':'recipients'
      try{
        const url=origin+'/api/activities/'+activityId+'/'+kind,deadline=Date.now()+5000,seen=new Set()
        roster=await request(url)
        if(roster.enabled!==false&&!Array.isArray(roster.items))throw Error('名单格式变化')
        // 仅主动查询补齐分页，最多100人/5页；领取前不为名单增加请求，失败保留已读部分。
        for(let page=1;action==='query'&&roster.enabled!==false&&roster.nextCursor&&roster.items.length<100&&page<5&&Date.now()<deadline;page++){
          const cursor=roster.nextCursor
          if(typeof cursor!=='string'||cursor.length>2048||seen.has(cursor))throw Error('名单分页异常')
          seen.add(cursor)
          const next=await request(url+'?cursor='+encodeURIComponent(cursor))
          if(next.enabled===false){roster={enabled:false,items:[]};break}
          if(!Array.isArray(next.items))throw Error('名单格式变化')
          const ids=new Set(roster.items.map(row=>row?.id).filter(id=>typeof id==='string'))
          const rows=next.items.filter(row=>{if(!row||typeof row!=='object'||row.id&&ids.has(row.id))return false;if(typeof row.id==='string')ids.add(row.id);return true})
          const items=[...roster.items,...rows]
          roster={...roster,...next,items:items.slice(0,100),titles:next.titles||roster.titles,truncated:roster.truncated||items.length>100}
        }
      }catch{roster_error=true}
    }
    return {data,snapshot:packetSnapshot('fish',{...data,...own,roster,roster_error})}
  }
  if(!id && action==='query')return {state:'unmatched',kind:'password',claimed:false,remaining:null,total:null,amount:null}
  if(!id) {
    // discover 本身可能直接兑奖，只允许用户点击领取后执行，原 submissionId 保留到结果确定。
    let submission
    try{submission=JSON.parse(localStorage.getItem(discoveryKey)||'null')}catch{}
    if(!submission)submission={submissionId:crypto.randomUUID(),password:ext.ref}
    localStorage.setItem(discoveryKey,JSON.stringify(submission))
    let result
    try{result=await request(origin+'/api/redemptions/discover','POST',submission,{'X-CSRF-Token':session.csrfToken})}
    catch(e){if(e.status>=400&&e.status<500&&e.status!==429)localStorage.setItem(discoveryKey,'');throw e}
    if(result.result==='none'){localStorage.setItem(discoveryKey,'');throw Error('没有匹配的 fish 活动，请核对口令')}
    if(result.result!=='single' || !fishUuid(result.selectedActivityId || result.items?.[0]?.id || ''))throw Error('此口令匹配多个活动，请到 fish 选择要参加的活动')
    id=result.selectedActivityId || result.items[0].id
    if(!fishUuid(result.claimSubmissionId || '') || !fishUuid(result.id || ''))throw Error('fish 返回的兑奖标识无法确认，请到原站核对')
    localStorage.setItem(key,id)
    localStorage.setItem(accountKey+id+':submission',JSON.stringify({submissionId:result.claimSubmissionId,password:ext.ref,discoveryId:result.id,participationMode:'password'}))
    discoveredClaim=!!result.claimResult
    localStorage.setItem(discoveryKey,'')
  }
  const pendingKey=accountKey+id+':submission'
  const {data,snapshot}=await read(id)
  if(discoveredClaim)return snapshot
  if(action==='query' || snapshot.claimed || snapshot.state!=='active' || !['fixed','random','custom','timed_draw'].includes(snapshot.kind))return snapshot
  let submission
  try{submission=JSON.parse(localStorage.getItem(pendingKey)||'null')}catch{}
  if(!submission) {
    if(data.activity.participationMode==='direct')submission={submissionId:crypto.randomUUID(),participationMode:'direct'}
    else {
      const password=ext.ref_kind==='text'?ext.ref:String(ext.password || '')
      if(!password)return {...snapshot,requires_password:true}
      if(!fishCode(password))throw Error('这个 fish 活动需要6–18字原站口令，请填写后再领取')
      submission={submissionId:crypto.randomUUID(),password,participationMode:'password'}
    }
  }
  if(!fishUuid(submission.submissionId || ''))throw Error('fish 返回的兑奖标识无法确认，请到原站核对')
  localStorage.setItem(pendingKey,JSON.stringify(submission))
  let result
  try{result=await request(origin+'/api/activities/'+id+'/claim','POST',submission,{'X-CSRF-Token':session.csrfToken})}
  catch(e){if(e.status>=400&&e.status<500&&e.status!==429)localStorage.setItem(pendingKey,'');throw e}
  if(result.result==='incorrect'){localStorage.setItem(pendingKey,'');throw Error('fish 原站口令不正确')}
  const refreshed=await read(id,true)
  if(refreshed.snapshot.claimed || ['registered','drawing','not_won','payment_pending','simulation','expired','exhausted'].includes(refreshed.snapshot.state))localStorage.setItem(pendingKey,'')
  return refreshed.snapshot
}
window.addEventListener('message', async event => {
  // Tampermonkey 的 window 是沙箱代理；MessageEvent.source 指向文档所属的真实窗口。
  // 仍严格校验同一窗口和本站来源，不能仅删除 source 检查。
  const pageWindow=window.document?.defaultView || window
  if(event.source!==pageWindow || event.origin!==location.origin || location.origin!=='https://jinhuan.example')return
  const data=event.data
  if(data?.type!=='meme-redpacket-request' || !/^[a-f0-9-]{36}$/i.test(data.id))return
  const reply=(result,error,creation)=>pageWindow.postMessage({type:'meme-redpacket-result',id:data.id,result,error,creation},location.origin)
  if(data.action==='ping'){reply({version:'1.5.2',creditCreate:true,participationV2:true,platformCreateV1:true,creationRecoveryV1:true,packetDetailsV1:true,fishV2:true,fishRosterV2:true,fishErrorsV1:true});return}
  if(['creationOptions','platformCreate','releaseCreation'].includes(data.action)){
    try{
      if(!['hb','fish'].includes(data.external?.provider))throw Error('创建平台无效')
      if(!navigator.locks?.request)throw Error('浏览器不支持创建锁，请打开平台操作')
      await navigator.locks.request('meme-redpacket-create-'+data.external.provider,{ifAvailable:true},async lock=>{
        if(!lock)throw Error('另一窗口正在处理创建，请稍后核对原操作')
        reply(await platformCreate(data.action,data.external,packetPlatformRequest(data.external.provider)))
      })
    }catch(error){reply(null,error.message,error.creation)}
    return
  }
  if(['prepareCreate','awaitCreate','awaitCancel'].includes(data.action)){
    try{
      if(typeof GM_getValue!=='function'||typeof GM_setValue!=='function')throw Error('请更新红包连接器并允许脚本存储')
      const ext=data.external
      if(ext?.provider!=='credit'||!operationPattern.test(String(ext.operation||'')))throw Error('Credit 创建操作无效')
      const key='credit-create:'+ext.operation
      if(data.action==='awaitCancel'){
        for(let i=0;i<30;i++){
          const current=GM_getValue(key,null)
          if(current?.status==='cancelled'){reply({cancelled:true});return}
          if(['sent','unknown','created'].includes(current?.status))throw Error('红包已提交或结果未知，不能取消，请核对Credit已发送记录')
          await new Promise(resolve=>setTimeout(resolve,1000))
        }
        throw Error('尚未收到取消结果，请查看Credit确认窗口')
      }
      if(data.action==='prepareCreate'){
        const params=normalizeCreditCreate(ext),cached=GM_getValue(key,null),global=GM_getValue('credit-create-uncertain',null)
        if(global)throw Error('上次扣款结果未确认，请先核对 Credit 已发送记录')
        if(cached?.status==='cancelled')throw Error('这个草稿已取消，请重新填写')
        if(['sent','unknown','created'].includes(cached?.status) && JSON.stringify(cached.params)!==JSON.stringify(params))throw Error('创建参数已改变，请核对上次操作')
        if(cached?.status==='created'){reply({id:cached.id});return}
        if(cached?.status==='sent'||cached?.status==='unknown')throw Error('上次扣款结果未确认，请到 Credit 核对')
        GM_setValue(key,{status:'pending',params});reply({ready:true});return
      }
      for(let i=0;i<180;i++){
        const state=GM_getValue(key,null)
        if(state?.status==='created'){reply({id:state.id});return}
        if(state?.status==='unknown')throw Error('扣款结果尚未确认，请到 Credit 已发送记录核对，勿重复创建')
        if(state?.status==='cancelled')throw Error('已取消，未创建红包')
        await new Promise(resolve=>setTimeout(resolve,1000))
      }
      throw Error('等待 Credit 确认超时；如已扣款，请核对已发送记录并引用红包编号')
    }catch(error){reply(null,error.message)}
    return
  }
  if(!['query','claim'].includes(data.action))return
  try {
    const ext=data.external,provider=ext?.provider,ref=String(ext?.ref || '')
    const platform=({hb:'HB',credit:'Credit',fish:'Fish'})[provider]||'红包平台'
    let lookup
    if(provider==='credit' && /^[1-9][0-9]{0,19}$/.test(ref))lookup='https://credit.linux.do/api/v1/redenvelope/'+ref
    else if(provider==='hb'&&ext.ref_kind==='id'&&/^[A-Za-z0-9]{1,100}$/.test(ref))lookup='https://hb.unsnow.org/api/hongbao/'+ref
    else if(provider==='hb' && ((ext.ref_kind==='numeric' && /^[0-9]{8}$/.test(ref)) || (ext.ref_kind==='text' && fishCode(ref))))lookup='https://hb.unsnow.org/api/hongbao/'+(ext.ref_kind==='numeric'?'code/':'text-code/')+encodeURIComponent(ref)
    else if(provider==='fish' && (ext.ref_kind==='id'&&fishUuid(ref) || ext.ref_kind==='text'&&fishCode(ref)))lookup='https://hb.lafi.sh/api/session'
    else throw Error('红包来源或口令无效，未发送请求')
    if(!navigator.locks?.request)throw Error('浏览器不支持领取锁，请前往原站')
    await navigator.locks.request('meme-redpacket-'+provider,{ifAvailable:true},async lock=>{
      if(!lock)throw Error('另一页面正在查询或领取，请稍后重试')
      // 查询不消费领取冷却。用户看过状态后应能立即开包；连续领取仍限流。
      if(data.action==='claim'){
        const timeKey='memeRedpacketClaimTime:'+provider+':'+ref,last=Number(localStorage.getItem(timeKey)||0)
        if(!Number.isFinite(last) || last>Date.now())throw Error('本机时间异常，请到原站核对')
        if(Date.now()-last<800)throw Error('操作正在处理中，请稍候')
        localStorage.setItem(timeKey,String(Date.now()))
      }
      const request=(url,method='GET',body,extraHeaders={})=>new Promise((resolve,reject)=>GM_xmlhttpRequest({
        url,method,responseType:'json',timeout:15000,anonymous:false,
        headers:{Accept:'application/json',...(provider==='credit'?{'X-Requested-With':'XMLHttpRequest'}:{}),...(method==='POST'?{'Content-Type':'application/json'}:{}),...extraHeaders},
        ...(body?{data:JSON.stringify(body)}:{}),
        onload:r=>{
          if(r.status<200 || r.status>=300){reject(packetRequestError(provider,url,r));return}
          if(!r.response || typeof r.response!=='object'){reject(Error(platform+' 需要验证或返回格式变化，请打开平台核对'));return}
          resolve(r.response)
        },onerror:()=>reject(Error(platform+' 连接失败，请打开平台核对')),ontimeout:()=>reject(Error(platform+' 请求超时，请打开平台核对')),
      }))
      if(provider==='fish'){reply(await fishPacket(data.action,ext,request));return}
      const viewer=provider==='hb'?(await request('https://hb.unsnow.org/api/me')).user??null:undefined
      // 直链可补口令，先按口令查到同一个红包。不能把粘贴了另一个包的口令当作当前包报名。
      if(provider==='hb'&&ext.ref_kind==='id'&&ext.password){
        const password=String(ext.password).normalize('NFC').trim()
        if(!/^\d{8}$/.test(password)&&!fishCode(password))throw Error('HB口令需为8位数字或6–18字中英文数字')
        lookup='https://hb.unsnow.org/api/hongbao/'+(/^\d{8}$/.test(password)?'code/':'text-code/')+encodeURIComponent(password)
      }
      const rawPacket=await request(lookup)
      if(provider==='hb'&&ext.ref_kind==='id'&&String(rawPacket.id)!==ref)throw Error('口令对应另一份红包，请核对当前红包的口令；未报名或领取')
      const snapshot=packetSnapshot(provider,rawPacket,viewer)
      const uncertain='memeRedpacketUncertain:'+provider+':'+ref
      const resolved=s=>s.claimed||['exhausted','expired','cancelled','drawn','registered','drawing','not_won','payment_pending'].includes(s.state)
      if(data.action==='query'){
        if(resolved(snapshot))localStorage.setItem(uncertain,'')
        reply(localStorage.getItem(uncertain)?{...snapshot,state:'unconfirmed'}:snapshot);return
      }
      if(snapshot.claimed || snapshot.state!=='active' || snapshot.blocked){if(resolved(snapshot))localStorage.setItem(uncertain,'');reply(snapshot);return}
      if(!(provider==='hb'?['fixed','equal','random','exclusive','lottery']:['fixed','random']).includes(snapshot.kind)){reply(snapshot);return}
      if(localStorage.getItem(uncertain))throw Error('上次领取结果未确认，请刷新状态或打开 '+platform+' 核对，勿连续领取')
      if(!/^[a-zA-Z0-9_-]{1,100}$/.test(snapshot.id))throw Error(platform+' 红包编号异常，未领取')
      localStorage.setItem(uncertain,'1')
      let receipt
      try {
        const raw=await request(provider==='credit'?'https://credit.linux.do/api/v1/redenvelope/claim':'https://hb.unsnow.org/api/hongbao/'+encodeURIComponent(snapshot.id)+'/grab','POST',provider==='credit'?{id:ref}:undefined)
        if(provider==='hb'&&snapshot.kind==='lottery'){
          // 报名返回 packet，不是金额收据。只认已报名/开奖/发放状态。
          const fresh=packetSnapshot('hb',raw?.packet||await request(lookup),viewer)
          if(resolved(fresh))localStorage.setItem(uncertain,'')
          reply(localStorage.getItem(uncertain)?{...fresh,state:'unconfirmed'}:fresh);return
        }
        receipt=claimReceipt(provider,raw)
      }catch(error){
        if(error.status>=400&&error.status<500){localStorage.setItem(uncertain,'');throw error}
        try{const fresh=packetSnapshot(provider,await request(lookup),viewer);if(resolved(fresh)){localStorage.setItem(uncertain,'');reply(fresh);return}}catch{}
        throw Error('领取结果未确认：'+error.message+'。请刷新状态或打开 '+platform+' 核对，勿连续领取')
      }
      localStorage.setItem(uncertain,'')
      reply({...snapshot,...receipt,remaining:null})
    })
  }catch(error){reply(null,error.message)}
})
