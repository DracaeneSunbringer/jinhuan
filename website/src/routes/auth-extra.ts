import {Hono} from 'hono'
import {getCookie,setCookie,deleteCookie} from 'hono/cookie'
import type {C,Ctx} from '../types'
import {boundedJson,fail,safeNext} from '../lib/http'
import {randHex,sha256,hmacHex,verifyHmac} from '../lib/crypto'
import {needUser,ownerNames} from '../services/auth'
import {authConfiguration,authRateLimit,authRequestGuard,requireAuthOpen} from '../services/auth-gate'
import {hashPassword,verifyPassword} from '../services/password'
import {recordLoginFailure} from '../services/login-failure'
import {completeSignup} from '../services/accounts'
import {googleHandle} from '../services/google'
import {passwordInput} from '../shared/schemas'

// 2026-11-04 新增两种登录方式：
// 1) 账号密码：每个用户自己设置一个「登录名 + 密码」（identities.provider='password'，subject=小写登录名；密码存在 passwords 表，
//    和邮箱登录共用同一个密码）。之后在 /account-password.html 用登录名 + 密码登录，是同一个号。
// 2) GitHub：登录 / 在账号安全里关联到当前账号（identities.provider='github'，subject=GitHub 数字 id）。关联后用 GitHub 登录就是这个号；
//    没关联过的 GitHub 登录会新建账号（开放注册时）。和 Google 一样：state 带 HMAC 签名 + 一次性令牌 + 关联时校验当前会话。
export const authExtra=new Hono<Ctx>()
for(const path of ['/auth/github/*','/api/me/bind/github','/api/me/login-password','/api/auth/password-login'])authExtra.use(path,async(c,next)=>{c.header('cache-control','no-store');c.header('referrer-policy','no-referrer');await next()})
const axNow=()=>Math.floor(Date.now()/1000)
const axSession=(c:C,sid:string)=>setCookie(c,'sid',sid,{httpOnly:true,secure:c.req.url.startsWith('https:'),sameSite:'Lax',path:'/',maxAge:2592000})
const axIp=async(c:C)=>(await hmacHex(c.env.PASSWORD_PEPPER!,c.req.header('cf-connecting-ip')??'local')).slice(0,16)
const AX_DUMMY='pbkdf2_sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA$p1'
const AX_RESERVED=new Set(['admin','administrator','root','system','support','official','null','undefined','52d'])
// 登录名：3～24 位字母、数字、下划线、点、减号；不能全是数字；不分大小写唯一
function axLoginInput(value:unknown){
  if(typeof value!=='string')fail(400,'登录名需要 3～24 位字母、数字、下划线')
  const login=(value as string).trim()
  if(!/^[A-Za-z0-9_][A-Za-z0-9_.-]{1,22}[A-Za-z0-9_]$/.test(login)||/^\d+$/.test(login))fail(400,'登录名需要 3～24 位字母、数字、下划线（不能全是数字）')
  if(AX_RESERVED.has(login.toLowerCase()))fail(400,'这个登录名不能用')
  return login
}
function axPasswordInput(value:unknown,login:string){try{return passwordInput(value,'',login)}catch(e){return fail(400,(e as Error).message||'密码需要 8～128 个字符')}}
async function axPasswordReady(c:C){await requireAuthOpen(c);if(!(await authConfiguration(c) as {password_login?:boolean}).password_login)fail(503,'账号密码登录尚未开放')}

// ---------- 账号密码 ----------
authExtra.get('/api/me/login-password',async c=>{
  const user=needUser(c)
  const cfg=await authConfiguration(c) as {password_login?:boolean}
  const row=await c.env.DB.prepare("SELECT i.username,(SELECT 1 FROM passwords WHERE user_id=?1) AS pw FROM (SELECT 1) LEFT JOIN identities i ON i.provider='password' AND i.user_id=?1").bind(user.id).first<{username:string|null;pw:number|null}>()
  return c.json({available:!!cfg.password_login,login:row?.username??null,has_password:!!row?.pw,username:user.username})
})
authExtra.post('/api/me/login-password',async c=>{
  await authRequestGuard(c);const user=needUser(c);await axPasswordReady(c)
  const body=await boundedJson(c) as {login?:unknown;password?:unknown;confirm?:unknown;current?:unknown}
  const login=axLoginInput(body.login),subject=login.toLowerCase(),password=axPasswordInput(body.password,login)
  if(typeof body.confirm!=='string'||body.confirm.normalize('NFKC')!==password)fail(400,'两次输入的密码不一样')
  const db=c.env.DB,t=axNow()
  const [taken,old]=await Promise.all([
    db.prepare("SELECT user_id FROM identities WHERE provider='password' AND subject=?").bind(subject).first<{user_id:number}>(),
    db.prepare('SELECT hash FROM passwords WHERE user_id=?').bind(user.id).first<{hash:string}>(),
  ])
  if(taken&&taken.user_id!==user.id)fail(409,'这个登录名已经被别人用了，换一个吧')
  // 已经有密码（邮箱登录或之前设过）：改密码要先验证当前密码
  if(old){
    if(typeof body.current!=='string'||[...body.current.normalize('NFKC')].length>128||!await verifyPassword(body.current,old.hash,c.env.PASSWORD_PEPPER!))fail(401,'当前密码不对')
  }
  const hash=await hashPassword(password,c.env.PASSWORD_PEPPER!),sidHash=await sha256(getCookie(c,'sid')??'')
  const owned="EXISTS(SELECT 1 FROM identities WHERE provider='password' AND subject=?2 AND user_id=?1)"
  const r=await db.batch([
    db.prepare("DELETE FROM identities WHERE provider='password' AND user_id=?1 AND subject<>?2 AND EXISTS(SELECT 1 FROM users WHERE id=?1 AND disabled=0 AND kind='user') AND NOT EXISTS(SELECT 1 FROM identities WHERE provider='password' AND subject=?2 AND user_id<>?1)").bind(user.id,subject),
    db.prepare(`INSERT INTO identities(provider,subject,user_id,username,verified_at,created_at,last_login_at) SELECT 'password',?2,?1,?3,?4,?4,NULL
      WHERE EXISTS(SELECT 1 FROM users WHERE id=?1 AND disabled=0 AND kind='user')
      ON CONFLICT(provider,subject) DO UPDATE SET username=excluded.username WHERE identities.user_id=excluded.user_id`).bind(user.id,subject,login,t),
    db.prepare(`INSERT INTO passwords(user_id,hash,updated_at) SELECT ?1,?3,?4 WHERE ${owned}
      AND (?5='' OR EXISTS(SELECT 1 FROM passwords WHERE user_id=?1 AND hash=?5))
      ON CONFLICT(user_id) DO UPDATE SET hash=excluded.hash,updated_at=excluded.updated_at`).bind(user.id,subject,hash,t,old?.hash??''),
    // 改了密码：其他设备退出（和原来的改密码一致）
    db.prepare(`DELETE FROM sessions WHERE user_id=?1 AND id<>?3 AND ?4<>'' AND ${owned}`).bind(user.id,subject,sidHash,old?.hash??''),
    db.prepare(`DELETE FROM login_fails WHERE user_id=?1 AND ${owned}`).bind(user.id,subject),
  ])
  if(!r[2].meta.changes){
    const now=await db.prepare("SELECT user_id FROM identities WHERE provider='password' AND subject=?").bind(subject).first<{user_id:number}>()
    fail(409,now&&now.user_id!==user.id?'这个登录名已经被别人用了，换一个吧':'账号状态变了，请刷新后再试')
  }
  return c.json({ok:true,login,changed:!!old})
})
authExtra.post('/api/auth/password-login',async c=>{
  await authRequestGuard(c);await axPasswordReady(c)
  const body=await boundedJson(c) as {login?:unknown;password?:unknown;next?:unknown}
  const login=typeof body.login==='string'?body.login.trim().toLowerCase():''
  const pw=typeof body.password==='string'?body.password:''
  const len=[...pw.normalize('NFKC')].length
  if(!login||login.length>24||len<8||len>128)fail(400,'登录名或密码不对')
  const db=c.env.DB,t=axNow(),ip=await axIp(c)
  const user=await db.prepare("SELECT u.id,u.disabled,u.kind,p.hash FROM identities i JOIN users u ON u.id=i.user_id LEFT JOIN passwords p ON p.user_id=u.id WHERE i.provider='password' AND i.subject=?").bind(login).first<{id:number;disabled:number;kind:string;hash:string|null}>()
  const prior=user?await db.prepare('SELECT locked_until FROM login_fails WHERE user_id=? AND ip_hash=?').bind(user.id,ip).first<{locked_until:number}>():null
  if(prior&&prior.locked_until>t)fail(429,'试错太多次，请过一会儿再试')
  // 不存在的登录名也跑一次同样强度的校验，避免靠耗时猜登录名
  const ok=await verifyPassword(pw,user?.hash??AX_DUMMY,c.env.PASSWORD_PEPPER!)
  if(!ok||!user||!user.hash){if(user)await recordLoginFailure(db,user.id,ip,t);fail(401,'登录名或密码不对')}
  if(user!.disabled||user!.kind!=='user')fail(403,'账号已停用，请联系管理员')
  const sid=randHex(),sidHash=await sha256(sid)
  const r=await db.batch([
    db.prepare(`INSERT INTO sessions(id,user_id,expires_at,created_at,seen_at,method,ua) SELECT ?,?,?,?,?,'password',?
      WHERE EXISTS(SELECT 1 FROM users u JOIN passwords p ON p.user_id=u.id JOIN identities i ON i.user_id=u.id
        WHERE u.id=? AND u.disabled=0 AND u.kind='user' AND p.hash=? AND i.provider='password' AND i.subject=?)`).bind(sidHash,user!.id,t+2592000,t,t,(c.req.header('user-agent')??'').slice(0,120),user!.id,user!.hash,login),
    db.prepare('DELETE FROM login_fails WHERE user_id=? AND ip_hash=? AND EXISTS(SELECT 1 FROM sessions WHERE id=?)').bind(user!.id,ip,sidHash),
    db.prepare("UPDATE identities SET last_login_at=? WHERE provider='password' AND subject=? AND EXISTS(SELECT 1 FROM sessions WHERE id=?)").bind(t,login,sidHash),
  ])
  if(!r[0].meta.changes)fail(409,'账号状态已变化，请重新登录')
  axSession(c,sid)
  return c.json({ok:true,next:safeNext(typeof body.next==='string'?body.next:'/')})
})

// ---------- GitHub ----------
type AxIntent={intent:'login';next:string;invite:string}|{intent:'bind';next:string;userId:number;sessionHash:string}
async function axGithubReady(c:C){await requireAuthOpen(c);if(!(await authConfiguration(c) as {github?:boolean}).github)fail(503,'GitHub 登录尚未配置')}
function axRejected(c:C,message:string,bind=false,status:400|403|409|502=400){
  return c.html(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>GitHub 授权未完成 · 尽欢</title><body style="font:16px/1.7 system-ui;max-width:440px;margin:15vh auto;padding:24px"><h1 style="font-size:22px">GitHub 授权未完成</h1><p>${message.replace(/[<>&]/g,'')}</p><a href="${bind?'/me/account':'/login'}">${bind?'返回账号安全':'返回登录'}</a></body></html>`,status)
}
const axRedirect=(c:C)=>new URL('/auth/github/callback',c.req.url).toString()
async function axBegin(c:C,intent:AxIntent){
  const raw=randHex(),t=axNow()
  const state=raw+'.'+await hmacHex(c.env.PASSWORD_PEPPER!,'github-state|'+raw)
  await c.env.DB.prepare("INSERT INTO auth_tokens(token_hash,kind,user_id,payload,expires_at,created_at) VALUES(?,'oauth_github',?,?,?,?)")
    .bind(await sha256(raw),intent.intent==='bind'?intent.userId:null,JSON.stringify(intent),t+600,t).run()
  setCookie(c,'gh_state',state,{httpOnly:true,secure:c.req.url.startsWith('https:'),sameSite:'Lax',path:'/auth/github',maxAge:600})
  const url=new URL('https://github.com/login/oauth/authorize')
  for(const [k,v] of Object.entries({client_id:c.env.GITHUB_CLIENT_ID!,redirect_uri:axRedirect(c),scope:'read:user user:email',state,allow_signup:'true'}))url.searchParams.set(k,v)
  return url.toString()
}
authExtra.get('/auth/github/start',async c=>{
  await axGithubReady(c);await authRateLimit(c)
  const invite=(c.req.query('invite')??getCookie(c,'inv')??'').trim().toUpperCase()
  return c.redirect(await axBegin(c,{intent:'login',next:safeNext(c.req.query('next')),invite:/^[A-HJ-NP-Z2-9]{8}$/.test(invite)?invite:''}))
})
authExtra.post('/api/me/bind/github',async c=>{
  await authRequestGuard(c);const user=needUser(c);await axGithubReady(c)
  return c.json({url:await axBegin(c,{intent:'bind',next:'/me/account',userId:user.id,sessionHash:await sha256(getCookie(c,'sid')??'')})})
})
type AxProfile={sub:string;login:string;name:string;email:string|null;emailVerified:boolean;picture:string|null}
async function axGithubProfile(c:C,code:string):Promise<AxProfile>{
  const tok=await fetch('https://github.com/login/oauth/access_token',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{accept:'application/json','content-type':'application/x-www-form-urlencoded','user-agent':'jinhuan-52dmeme'},body:new URLSearchParams({client_id:c.env.GITHUB_CLIENT_ID!,client_secret:c.env.GITHUB_CLIENT_SECRET!,code,redirect_uri:axRedirect(c)})})
  const tj=await tok.json() as {access_token?:unknown}
  if(!tok.ok||typeof tj.access_token!=='string'||!tj.access_token||tj.access_token.length>512)throw new Error('github_token')
  const h={authorization:'Bearer '+tj.access_token,accept:'application/vnd.github+json','user-agent':'jinhuan-52dmeme','x-github-api-version':'2022-11-28'}
  const [ur,er]=await Promise.all([fetch('https://api.github.com/user',{headers:h,signal:AbortSignal.timeout(15000)}),fetch('https://api.github.com/user/emails',{headers:h,signal:AbortSignal.timeout(15000)})])
  if(!ur.ok)throw new Error('github_user')
  const u=await ur.json() as {id?:unknown;login?:unknown;name?:unknown;avatar_url?:unknown}
  if(!Number.isSafeInteger(u.id)||(u.id as number)<1||typeof u.login!=='string'||!/^[A-Za-z0-9-]{1,39}$/.test(u.login))throw new Error('github_claims')
  let email:string|null=null,emailVerified=false
  if(er.ok){const list=await er.json() as {email?:unknown;primary?:unknown;verified?:unknown}[];const p=Array.isArray(list)?list.find(e=>e&&e.primary&&e.verified&&typeof e.email==='string'):null;if(p&&typeof p.email==='string'&&p.email.length<=254&&/^[^\s@]+@[^\s@]+$/.test(p.email)){email=p.email.toLowerCase();emailVerified=true}}
  return {sub:String(u.id),login:u.login,name:typeof u.name==='string'&&u.name.trim()?[...u.name.trim()].slice(0,20).join(''):u.login,email,emailVerified,
    picture:typeof u.avatar_url==='string'&&/^https:\/\//.test(u.avatar_url)&&u.avatar_url.length<=2048?u.avatar_url:null}
}
authExtra.get('/auth/github/callback',async c=>{
  await axGithubReady(c)
  const state=getCookie(c,'gh_state')??'';deleteCookie(c,'gh_state',{path:'/auth/github'})
  const [raw,signature,...extra]=state.split('.')
  if(!/^[a-f0-9]{64}$/.test(raw??'')||!signature||extra.length||state!==c.req.query('state')||!await verifyHmac(c.env.PASSWORD_PEPPER!,'github-state|'+raw,signature))return axRejected(c,'授权状态已过期，请重新发起。')
  const db=c.env.DB,tokenHash=await sha256(raw),row=await db.prepare("SELECT payload FROM auth_tokens WHERE token_hash=? AND kind='oauth_github' AND used_at IS NULL AND expires_at>?").bind(tokenHash,axNow()).first<{payload:string}>()
  if(!row)return axRejected(c,'授权状态已使用或过期，请重新发起。')
  const intent=JSON.parse(row.payload) as AxIntent,bind=intent.intent==='bind'
  if(intent.intent==='bind'){
    if(c.get('user')?.id!==intent.userId||await sha256(getCookie(c,'sid')??'')!==intent.sessionHash)return axRejected(c,'登录账号或设备会话已变化，请重新关联。',true,403)
  }else if(intent.intent!=='login')return axRejected(c,'授权状态不正确。')
  if(c.req.query('error'))return axRejected(c,'已取消 GitHub 授权。',bind)
  const code=c.req.query('code');if(!code||code.length>512)return axRejected(c,'缺少授权码，请重新发起。',bind)
  let p:AxProfile
  try{p=await axGithubProfile(c,code)}catch{console.warn('github_callback_unavailable');return axRejected(c,'GitHub 暂时无法完成授权，请稍后重试。',bind,502)}
  const t=axNow(),claim=crypto.randomUUID(),claimed='EXISTS(SELECT 1 FROM auth_tokens WHERE token_hash=? AND claim_id=?)'
  const mapped=await db.prepare("SELECT user_id FROM identities WHERE provider='github' AND subject=?").bind(p.sub).first<{user_id:number}>()
  if(intent.intent==='bind'){
    const id=intent.userId
    if(mapped&&mapped.user_id!==id)return axRejected(c,'这个 GitHub 已经关联了另一个账号：先用 GitHub 登录那个账号、在账号安全里移除 GitHub，再回来关联。',true,409)
    if(await db.prepare("SELECT 1 FROM identities WHERE provider='github' AND user_id=? AND subject<>?").bind(id,p.sub).first())return axRejected(c,'当前账号已经关联了另一个 GitHub。',true,409)
    const r=await db.batch([
      db.prepare(`UPDATE auth_tokens SET used_at=?,claim_id=? WHERE token_hash=? AND kind='oauth_github' AND used_at IS NULL AND expires_at>?
        AND EXISTS(SELECT 1 FROM users WHERE id=? AND disabled=0 AND kind='user') AND EXISTS(SELECT 1 FROM sessions WHERE id=? AND user_id=? AND expires_at>?)
        AND NOT EXISTS(SELECT 1 FROM identities WHERE provider='github' AND subject=? AND user_id<>?)`).bind(t,claim,tokenHash,t,id,intent.sessionHash,id,t,p.sub,id),
      db.prepare(`INSERT INTO identities(provider,subject,user_id,email,username,verified_at,created_at,last_login_at) SELECT 'github',?,?,?,?,?,?,? WHERE ${claimed}
        ON CONFLICT(provider,subject) DO UPDATE SET email=excluded.email,username=excluded.username WHERE identities.user_id=excluded.user_id`).bind(p.sub,id,p.email,p.login,p.emailVerified?t:null,t,t,tokenHash,claim),
    ])
    if(r[0].meta.changes!==1)return axRejected(c,'授权状态已变化，请重新关联。',true,409)
    return c.redirect('/me/account?bound=github')
  }
  const sid=randHex(),sidHash=await sha256(sid),ua=(c.req.header('user-agent')??'').slice(0,120)
  if(mapped){
    const r=await db.batch([
      db.prepare(`UPDATE auth_tokens SET used_at=?,claim_id=? WHERE token_hash=? AND kind='oauth_github' AND used_at IS NULL AND expires_at>?
        AND EXISTS(SELECT 1 FROM identities i JOIN users u ON u.id=i.user_id WHERE i.provider='github' AND i.subject=? AND u.disabled=0 AND u.kind='user')`).bind(t,claim,tokenHash,t,p.sub),
      db.prepare(`INSERT INTO sessions(id,user_id,expires_at,created_at,seen_at,method,ua) SELECT ?,user_id,?,?,?,'github',? FROM identities WHERE provider='github' AND subject=? AND ${claimed}`).bind(sidHash,t+2592000,t,t,ua,p.sub,tokenHash,claim),
      db.prepare(`UPDATE identities SET last_login_at=?,email=?,username=? WHERE provider='github' AND subject=? AND ${claimed}`).bind(t,p.email,p.login,p.sub,tokenHash,claim),
    ])
    if(r[0].meta.changes!==1)return axRejected(c,'账号已停用或授权状态已变化，请重新登录。',false,403)
    axSession(c,sid);return c.redirect(safeNext(intent.next))
  }
  // 新的 GitHub：建一个新账号（和 Google 首次登录走同一个 completeSignup）
  const used=await db.prepare("UPDATE auth_tokens SET used_at=?,claim_id=? WHERE token_hash=? AND kind='oauth_github' AND used_at IS NULL AND expires_at>?").bind(t,claim,tokenHash,t).run()
  if(used.meta.changes!==1)return axRejected(c,'授权状态已使用，请重新发起。')
  const pending=randHex(),pendingHash=await sha256(pending),owners=ownerNames(c.env)
  const handle0=await googleHandle(db,{sub:p.sub,email:p.email,emailVerified:p.emailVerified,name:p.login,picture:p.picture},owners)
  await db.prepare("INSERT INTO auth_tokens(token_hash,kind,email,payload,expires_at,created_at) VALUES(?,'gpending',?,?,?,?)")
    .bind(pendingHash,p.email,JSON.stringify({sub:p.sub,email:p.email,emailVerified:p.emailVerified,name:p.name,picture:p.picture,handle:handle0,nick:p.name,next:safeNext(intent.next),invite:intent.invite}),t+600,t).run()
  for(let attempt=0;attempt<3;attempt++){
    const handle=attempt?await googleHandle(db,{sub:p.sub,email:p.email,emailVerified:p.emailVerified,name:p.login,picture:p.picture},owners,true):handle0
    const result=await completeSignup(db,{provider:'github',tokenHash:pendingHash,handle,invite:intent.invite||undefined,inviteRequired:c.env.REGISTER_MODE!=='open',now:t,sessionHash:sidHash,userAgent:c.req.header('user-agent')??''} as never) as {status:string}
    if(result.status==='created'){
      axSession(c,sid)
      const next=safeNext(intent.next)
      return c.redirect(next==='/'?'/welcome':'/welcome?next='+encodeURIComponent(next))
    }
    if(result.status==='handle-taken')continue
    if(result.status==='email-taken')return axRejected(c,'这个 GitHub 的邮箱已经注册过本站：请先用原来的方式登录，再到账号安全里关联 GitHub。',false,409)
    if(result.status==='invalid-invite')return axRejected(c,'现在注册需要邀请码：请先用邀请链接打开本站，再用 GitHub 登录。',false,403)
    return axRejected(c,'注册没有完成，请重新用 GitHub 登录。',false,403)
  }
  return axRejected(c,'用户名暂时被占用，请重试。',false,409)
})
