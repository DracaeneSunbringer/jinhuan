// Candidate client for server-owned game actions. It is not loaded by boot.js
// until the two game interfaces have been adapted and the release is ready.
export async function createAuthorityClient({game,fetcher=fetch,storage=localStorage,makeId=()=>crypto.randomUUID(),onState=()=>{},onStatus=()=>{}}){
 if(!['mole','rift'].includes(game))throw Error('游戏不存在')
 let uid=null,name='',revision=0,state=null,balance=null,blocked=false,chain=Promise.resolve()
 const prefix=()=>`jinhuan.arcade.action.${game}.${uid}.`
 const notify=(text)=>{try{onStatus(text)}catch{}}
 const publish=()=>{try{onState({user_id:uid,name,revision,state,balance})}catch{}}
 async function request(path,body){
  const response=await fetcher(`/api/arcade/${game}/${path}`,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)})
  const data=await response.json().catch(()=>({error:'服务器返回异常响应'}))
  if(!response.ok)throw Object.assign(Error(data.error||'游戏暂时无法连接'),{status:response.status,code:data.code,retryAfter:Number(response.headers.get('retry-after'))||0})
  return data
 }
 function accept(data){if(!Number.isSafeInteger(data.user_id)||data.user_id<1||!Number.isSafeInteger(data.revision)||data.revision<0||data.revision>0&&(!data.state||!Number.isSafeInteger(data.balance)))throw Error('游戏存档响应无效');if(uid!==null&&uid!==data.user_id)throw Object.assign(Error('登录账号已变化，请重新进入游戏'),{code:'arcade_account_changed'});uid=data.user_id;name=data.name||'';revision=data.revision;state=data.state;balance=data.balance;publish()}
 async function reload(){let data=await request('authority');accept(data);if(data.revision===0){data=await request('authority',{user_id:uid});accept(data)}return {revision,state,balance}}
 function write(record){try{storage.setItem(prefix()+record.operation,JSON.stringify(record))}catch{throw Error('浏览器无法保存操作记录，请开启站点存储后重试')}}
 function erase(record){try{storage.removeItem(prefix()+record.operation)}catch{}}
 function records(){const result=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(!k?.startsWith(prefix()))continue;let r;try{r=JSON.parse(storage.getItem(k))}catch{throw Error('本地操作记录损坏，请保留浏览器数据')};if(r?.user_id!==uid||typeof r.operation!=='string'||!Number.isSafeInteger(r.revision)||typeof r.action!=='string'||!r.args||typeof r.args!=='object'||Array.isArray(r.args))throw Error('本地操作记录无效，请保留浏览器数据');result.push(r)}return result.sort((a,b)=>a.created-b.created||a.operation.localeCompare(b.operation))}
 async function execute(record){
  for(let cycles=0;cycles<512;cycles++){
   write(record)
   let result
   try{result=await request('action',{user_id:uid,operation:record.operation,revision:record.revision,action:record.action,args:record.args})}
   catch(error){
    if(error.code==='arcade_catchup'&&record.action!=='tick'){
     notify('正在补算游戏进度…')
     const tick={user_id:uid,operation:makeId(),revision,action:'tick',args:{},created:Date.now()}
     await execute(tick);record.revision=revision;continue
    }
    if(error.code==='arcade_conflict'){erase(record);try{await reload()}catch(failure){blocked=true;notify('无法读取最新进度，请重新连接');throw failure}blocked=false;notify('进度已更新，请重新操作');throw error}
    if(error.status>=400&&error.status<500){erase(record);throw error}
    blocked=true;notify('连接中断，操作等待确认');throw error
   }
   if(result.duplicate){await reload();erase(record);blocked=false;notify('云端已同步');return {revision,state,balance,duplicate:true}}
   if(!Number.isSafeInteger(result.revision)||result.revision!==record.revision+1||!Number.isSafeInteger(result.balanceAfter)||!result.state){blocked=true;throw Error('操作回执异常，请重新连接确认')}
   revision=result.revision;state=result.state;balance=result.balanceAfter;erase(record);blocked=false;publish();notify('云端已同步');return {revision,state,balance,delta:result.delta,duplicate:false}
  }
  blocked=true;throw Error('补算尚未完成，请稍后继续同步')
 }
 function serialized(fn){const work=chain.then(fn);chain=work.catch(()=>{});return work}
 async function recoverPending(){const items=records();if(!items.length){if(blocked)await reload();blocked=false;return}blocked=true;try{for(const record of items){notify('正在确认未完成操作…');await execute(record)}blocked=false}catch(error){blocked=blocked||records().length>0;throw error}}
 await reload();try{await recoverPending()}catch(error){notify(error.message)}
 return {get userId(){return uid},get name(){return name},get revision(){return revision},get state(){return state},get balance(){return balance},get blocked(){return blocked},
  dispatch(action,args={}){return serialized(async()=>{if(blocked)throw Error('请先确认未完成的操作');if(typeof action!=='string'||!args||typeof args!=='object'||Array.isArray(args))throw Error('游戏动作无效');return execute({user_id:uid,operation:makeId(),revision,action,args,created:Date.now()})})},
  recover(){return serialized(recoverPending)},reload(){return serialized(reload)} }
}
