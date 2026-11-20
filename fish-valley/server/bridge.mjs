// Platform JWT boundary for the existing valley/arena routes. Never falls back to site cookies.
// Inject the official SDK verifier, a trusted JWKS loader, identity lookup and a private game dispatcher.
const readRoutes=/^\/pet\/world$/
const writeRoutes=/^\/pet\/world\/(?:act|auto|welcome)$/
export function createMiniAppHandler({verifyPlatformRequest,loadKeys,resolveUser,dispatch,issuer,audience,appId,channel,pathBase}){
 if(!['sandbox','production'].includes(channel))throw Error('Invalid channel')
 const forumOrigin=new URL(issuer).origin
 return async function handle(request,env){
  const headers={'access-control-allow-origin':forumOrigin,'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'Authorization, Content-Type','cache-control':'no-store','vary':'Origin'}
  const json=(body,status=200)=>Response.json(body,{status,headers})
  if(request.headers.get('origin')!==forumOrigin)return json({error:'来源不受信任'},403)
  const url=new URL(request.url),base=pathBase||'/api/miniapp/'+channel+'/'
  const expected=url.pathname===base+'read'?'GET':url.pathname===base+'write'?'POST':null
  if(!expected||url.origin!==audience)return json({error:'接口不存在'},404)
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers})
  if(request.method!==expected)return json({error:'请求方法不支持'},405)
  if(!appId)return json({error:'小程序尚未完成平台配置'},503)
  // Sandbox must use its own database. A missing binding is an error, never a fallback to production.
  const db=channel==='sandbox'?env.MINIAPP_SANDBOX_DB:env.MINIAPP_DB
  if(!db)return json({error:'小程序测试环境尚未配置'},503)
  const authorization=request.headers.get('authorization')||''
  if(authorization.length>8199||!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization))return json({error:'需要平台登录凭据'},401)
  let claims
  try{
   const keys=await loadKeys()
   for(const key of keys.slice(0,5))try{
    claims=await verifyPlatformRequest({authorization:request.headers.get('authorization')||'',publicKey:key,issuer,audience,appId,channel,scope:'network.request',method:request.method,url:request.url})
    break
   }catch{}
  }catch{return json({error:'平台公钥暂时不可用'},503)}
  if(!claims)return json({error:'平台登录凭据无效，请重新打开小程序'},401)
  let user
  try { user=await resolveUser(db,claims.iss,claims.sub) } catch { return json({error:'游戏账号暂时无法读取，请稍后重试'},503) }
  if(!user||user.disabled||user.kind!=='user')return json({error:'当前平台身份暂时不能使用这个游戏账号。',code:'mini_account_unavailable'},403)
  let route,payload
  if(expected==='GET')route=url.searchParams.get('route')
  else{
   if(Number(request.headers.get('content-length'))>4096)return json({error:'请求过大'},413)
   const reader=request.body?.getReader();let length=0,chunks=[]
   try{if(reader)while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4096){await reader.cancel();return json({error:'请求过大'},413)}chunks.push(value)}const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}const body=JSON.parse(new TextDecoder().decode(bytes));route=body.route;payload=body.payload}catch{return json({error:'请求格式无效'},400)}
  }
  if(expected==='GET'&&route==='/session')return json({id:user.id,username:user.username,name:user.nick||user.name||user.username,forum_id:claims.sub,channel:claims.channel})
  if(typeof route!=='string'||!(expected==='GET'?readRoutes:writeRoutes).test(route))return json({error:'操作不在小程序范围内'},403)
  if(expected==='POST'&&(!payload||typeof payload!=='object'||Array.isArray(payload)))return json({error:'操作参数无效'},400)
  // Identity is resolved from the verified token. Ignore a caller-supplied save owner.
  if(route==='/pet/state'&&expected==='POST')payload={...payload,user_id:user.id, state:payload.state?{...payload.state,activePet:'dsh-blue-whale'}:undefined}
  let target='/api'+route
  const query=new URLSearchParams();for(const name of ['q','limit','cursor'])if(url.searchParams.has(name))query.set(name,url.searchParams.get(name));if(expected==='POST'){if(/^\d{1,4}$/.test(String(postQuery.xp??'')))query.set('xp',String(postQuery.xp));if(/^[A-Za-z0-9_-]{1,40}$/.test(String(postQuery.item??'')))query.set('item',String(postQuery.item))}if(query.size)target+='?'+query
  try{
   const response=await dispatch({path:target,method:expected,payload,user,env:{...env,DB:db},channel})
   const bytes=new Uint8Array(await response.arrayBuffer())
   if(bytes.length>65536)return json({error:'返回内容过大，请缩小查询范围'},502)
   return new Response(bytes,{status:response.status,headers:{...headers,'content-type':'application/json;charset=utf-8'}})
  }catch{return json({error:'游戏服务暂时不可用，请稍后重试'},500)}
 }
}
// Called only for the configured trusted issuer; no token-provided key URL is accepted.
export function cachedJWKS(issuer,fetcher=fetch){
 const endpoint=new URL('/mini-app-api/jwks',issuer).href
 let cached=null,until=0,pending=null
 return async()=>{
  if(cached&&Date.now()<until)return cached
  if(pending)return pending
  pending=(async()=>{const r=await fetcher(endpoint,{redirect:'error',headers:{accept:'application/json'},signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error('JWKS unavailable');const body=await r.json();const keys=body.keys?.filter(k=>k.kty==='EC'&&k.crv==='P-256'&&!k.d);if(!keys?.length||keys.length>5)throw Error('Invalid JWKS');cached=keys;until=Date.now()+300000;return keys})()
  try{return await pending}finally{pending=null}
 }
}
