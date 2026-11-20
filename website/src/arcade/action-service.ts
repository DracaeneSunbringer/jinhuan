import {sha256} from '../lib/crypto'
import {commitArcadeTransition,findArcadeOperation} from './wallet-transaction'

type Game='mole'|'rift'
type RecordValue=Record<string,unknown>
type Snapshot={state:unknown;delta:number;rankLevel:number;rankDepth:number;rankActions:number}
export type TrustedArcadeEngine={initial:(context:{now:number;randomInt:(max:number)=>number;balance:number})=>unknown;present?:(state:unknown,balance:number)=>unknown;step:(state:unknown,action:string,args:RecordValue,context:{now:number;randomInt:(max:number)=>number;balance:number})=>Snapshot|Promise<Snapshot>}
export type ArcadeServiceContext={db:D1Database;engines:Partial<Record<Game,TrustedArcadeEngine>>;now?:()=>number;randomInt?:(max:number)=>number}
type StateRow={revision:number;state:string;authority_version:number;balance:number;wallet_revision:number}
async function readAuthorityRow(ctx:ArcadeServiceContext,userId:number,game:Game){return ctx.db.prepare(`SELECT s.revision,s.state,s.authority_version,w.balance,w.revision AS wallet_revision FROM arcade_saves s JOIN coin52_wallets w ON w.user_id=s.user_id JOIN users u ON u.id=s.user_id AND u.kind='user' AND u.disabled=0 WHERE s.user_id=?1 AND s.game_id=?2 AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=?1)`).bind(userId,game).first<StateRow>()}
export async function readArcadeAuthority(ctx:ArcadeServiceContext,userId:number,game:Game){
 if(!Number.isSafeInteger(userId)||userId<1||!['mole','rift'].includes(game))throw Error('游戏账号无效')
 const engine=ctx.engines[game];if(!engine)throw Error('游戏尚未开放')
 const row=await readAuthorityRow(ctx,userId,game);if(!row)return null
 if(row.authority_version!==1)throw Error('旧游戏存档不能自动成为可信游戏进度')
 let state:unknown;try{state=JSON.parse(row.state)}catch{throw Error('可信游戏存档无法读取')}
 return {revision:row.revision,state:engine.present?engine.present(state,row.balance):state,balance:row.balance}
}

// Canonicalize JSON parameters, reject excessive input and dangerous object keys.
function canonical(value:unknown,depth=0):string{
 if(depth>6)throw Error('动作参数层级过深')
 if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value)
 if(typeof value==='number'){if(!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)throw Error('动作参数无效');return JSON.stringify(value)}
 if(Array.isArray(value)){if(value.length>100)throw Error('动作参数过多');return '['+value.map(x=>canonical(x,depth+1)).join(',')+']'}
 if(typeof value!=='object')throw Error('动作参数无效')
 const obj=value as RecordValue,keys=Object.keys(obj).sort();if(keys.length>40||keys.some(k=>['__proto__','prototype','constructor'].includes(k)))throw Error('动作参数无效')
 return '{'+keys.map(k=>JSON.stringify(k)+':'+canonical(obj[k],depth+1)).join(',')+'}'
}
function secureRandomInt(max:number){
 if(!Number.isSafeInteger(max)||max<1||max>2147483647)throw Error('随机范围无效')
 const limit=Math.floor(4294967296/max)*max;let n:number;do{n=crypto.getRandomValues(new Uint32Array(1))[0]}while(n>=limit);return n%max
}

// A new account gets only an engine-created snapshot. Existing legacy
// client-uploaded saves are never silently promoted to financial authority.
export async function initializeArcadeAuthority(ctx:ArcadeServiceContext,userId:number,game:Game){
 if(!Number.isSafeInteger(userId)||userId<1||!['mole','rift'].includes(game))throw Error('游戏账号无效')
 const engine=ctx.engines[game];if(!engine)throw Error('游戏尚未开放')
 const read=()=>readAuthorityRow(ctx,userId,game)
 let row=await read()
 if(!row){
  const wallet=await ctx.db.prepare(`SELECT w.balance FROM coin52_wallets w JOIN users u ON u.id=w.user_id AND u.kind='user' AND u.disabled=0 WHERE w.user_id=?1 AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=?1)`).bind(userId).first<{balance:number}>()
  if(!wallet)throw Error('账户或D币钱包尚不可用')
  const now=ctx.now?ctx.now():Math.floor(Date.now()/1000);if(!Number.isSafeInteger(now)||now<0)throw Error('服务端时间无效')
  const initial=JSON.stringify(engine.initial({now,randomInt:ctx.randomInt||secureRandomInt,balance:wallet.balance}));if(typeof initial!=='string'||new TextEncoder().encode(initial).length>512*1024)throw Error('游戏初始状态无效')
  const hash=await sha256(initial)
  await ctx.db.prepare(`INSERT OR IGNORE INTO arcade_saves(user_id,game_id,revision,state,state_hash,operation,updated_at,authority_version,rank_level,rank_depth,rank_actions)
   SELECT ?1,?2,1,?3,?4,'authority-init',?5,1,1,1,0 FROM users u JOIN coin52_wallets w ON w.user_id=u.id WHERE u.id=?1 AND u.kind='user' AND u.disabled=0 AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=?1)`).bind(userId,game,initial,hash,now).run()
  row=await read()
 }
 if(!row||row.authority_version!==1)throw Error('旧游戏存档不能自动成为可信游戏进度')
 let state:unknown;try{state=JSON.parse(row.state)}catch{throw Error('可信游戏存档无法读取')}
 return {revision:row.revision,state:engine.present?engine.present(state,row.balance):state,balance:row.balance}
}

// Internal service only. HTTP adapters must authenticate the account and use a
// fixed registry of server-owned engines; clients never supply engine, clock,
// random source, next state, wallet revision or currency delta.
export async function executeArcadeAction(ctx:ArcadeServiceContext,userId:number,game:Game,input:unknown){
 if(!Number.isSafeInteger(userId)||userId<1||!['mole','rift'].includes(game)||!input||typeof input!=='object'||Array.isArray(input))throw Error('游戏动作无效')
 const body=input as RecordValue,allowed=['operation','revision','action','args'];if(Object.keys(body).some(k=>!allowed.includes(k)))throw Error('不能提交游戏状态或货币变动')
 if(typeof body.operation!=='string'||!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(body.operation)||!Number.isSafeInteger(body.revision)||Number(body.revision)<1||typeof body.action!=='string'||!/^[a-z][a-z0-9_-]{0,39}$/.test(body.action)||!body.args||typeof body.args!=='object'||Array.isArray(body.args))throw Error('游戏动作参数无效')
 const engine=ctx.engines[game];if(!engine)throw Error('游戏动作尚未开放')
 const args=body.args as RecordValue,serialized=canonical({action:body.action,args});if(new TextEncoder().encode(serialized).length>4096)throw Error('动作参数过大')
 const hash=await sha256(serialized),prior=await findArcadeOperation(ctx.db,userId,game,body.operation,hash);if(prior)return prior
 const row=await ctx.db.prepare(`SELECT s.revision,s.state,s.authority_version,w.balance,w.revision AS wallet_revision FROM arcade_saves s JOIN coin52_wallets w ON w.user_id=s.user_id
  JOIN users u ON u.id=s.user_id AND u.kind='user' AND u.disabled=0 WHERE s.user_id=?1 AND s.game_id=?2 AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=?1)`).bind(userId,game).first<StateRow>()
 if(!row||row.authority_version!==1)throw Error('可信游戏进度尚未建立')
 if(row.revision!==body.revision)throw Error('游戏进度已变化，请重新载入')
 const now=ctx.now?ctx.now():Math.floor(Date.now()/1000);if(!Number.isSafeInteger(now)||now<0)throw Error('服务端时间无效')
 let state:unknown;try{state=JSON.parse(row.state)}catch{throw Error('可信游戏存档无法读取')}
 const output=await engine.step(state,body.action,args,{now,randomInt:ctx.randomInt||secureRandomInt,balance:row.balance})
 if(!output||typeof output!=='object'||!Number.isSafeInteger(output.delta)||!['rankLevel','rankDepth','rankActions'].every(k=>Number.isSafeInteger(output[k as keyof Snapshot])&&Number(output[k as keyof Snapshot])>=0&&Number(output[k as keyof Snapshot])<=1e9))throw Error('服务端游戏结果无效')
 const nextState=JSON.stringify(output.state);if(typeof nextState!=='string')throw Error('服务端游戏状态无效')
 const receipt=await commitArcadeTransition(ctx.db,{userId,game,operation:body.operation,requestHash:hash,saveRevision:row.revision,walletRevision:row.wallet_revision,nextState,delta:output.delta,rankLevel:output.rankLevel,rankDepth:output.rankDepth,rankActions:output.rankActions,now})
 return {...receipt,...(!receipt.duplicate?{state:output.state}: {})}
}
