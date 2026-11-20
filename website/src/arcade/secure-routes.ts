import {Hono} from 'hono'
import type {Ctx,C} from '../types'
import {needUser} from '../services/auth'
import {boundedJson,fail,sameOrigin} from '../lib/http'
import {ensureCoinWallet} from '../farm/coin-packets'
import {executeArcadeAction,initializeArcadeAuthority,readArcadeAuthority} from './action-service'
import type {ArcadeServiceContext,TrustedArcadeEngine} from './action-service'

// Candidate only: the main app must not mount this until both UIs use
// authoritative actions and release migrations have been separately verified.
export function createSecureArcadeRoutes(engines:Partial<Record<'mole'|'rift',TrustedArcadeEngine>>,options:Pick<ArcadeServiceContext,'now'|'randomInt'>={}){
 const routes=new Hono<Ctx>()
 routes.use('/api/arcade/*',async(c,next)=>{c.header('cache-control','no-store');await next()})
 const game=(value:string):'mole'|'rift'=>{if(value!=='mole'&&value!=='rift')return fail(404,'游戏不存在');if(!engines[value])return fail(503,'游戏正在准备中');return value}
 const context=(c:C):ArcadeServiceContext=>({db:c.env.DB,engines,...options})
 const knownError=(c:C,error:unknown):never=>{
  if(!(error instanceof Error))throw error
  const text=error.message
  if(text==='同步过于频繁，请稍候'){c.header('retry-after','10');return fail(429,text,'arcade_rate')}
  if(text==='出手过快，请稍候'){c.header('retry-after','1');return fail(429,text,'arcade_rate')}
  if(text==='游戏进度正在补算，请先同步')return fail(409,text,'arcade_catchup')
  if(/^(游戏进度已变化|游戏进度、钱包余额或账号状态已变化|操作编号已用于|旧游戏存档不能自动成为可信游戏进度|可信游戏进度尚未建立)/.test(text))return fail(409,text,'arcade_conflict')
  if(/^(游戏动作无效|游戏动作参数无效|不能提交游戏状态或货币变动|动作参数|游戏动作不支持|地图参数无效|区域参数无效|技能参数无效|商店参数无效|物品参数无效|物品不支持此操作|物品数量不足|D币余额不足|技能点不足|技能已满级|等级不足|战斗中不能|战斗结束后才能|当前没有战斗|活力已满|没有遗失物|背包没有空间|商品已售出|自动刷新尚未到时间|离线时间尚未达到领取条件)/.test(text))return fail(400,text,'arcade_invalid_action')
  throw error
 }
 routes.get('/api/arcade/:game/authority',async c=>{
  const user=needUser(c),id=game(c.req.param('game'))
  try{const result=await readArcadeAuthority(context(c),user.id,id);return c.json({user_id:user.id,name:user.name||user.username,...(result||{revision:0,state:null,balance:null})})}catch(e){return knownError(c,e)}
 })
 routes.post('/api/arcade/:game/authority',async c=>{
  sameOrigin(c);const user=needUser(c),id=game(c.req.param('game')),body=await boundedJson(c,1024),now=options.now?options.now():Math.floor(Date.now()/1000)
  if(body.user_id!==user.id||Object.keys(body).length!==1)fail(403,'登录账号已变化，请重新进入游戏','arcade_account_changed')
  await ensureCoinWallet(c.env.DB,user.id,now)
  try{const result=await initializeArcadeAuthority(context(c),user.id,id);return c.json({user_id:user.id,name:user.name||user.username,...result})}catch(e){return knownError(c,e)}
 })
 routes.post('/api/arcade/:game/action',async c=>{
  sameOrigin(c);const user=needUser(c),id=game(c.req.param('game')),body=await boundedJson(c,8192)
  if(body.user_id!==user.id)fail(403,'登录账号已变化，请重新进入游戏','arcade_account_changed')
  const {user_id,...input}=body
  try{return c.json(await executeArcadeAction(context(c),user.id,id,input))}catch(e){return knownError(c,e)}
 })
 routes.get('/api/arcade/:game/ranking',async c=>{
  needUser(c);const id=game(c.req.param('game'))
  const rows=await c.env.DB.prepare(`SELECT a.user_id,COALESCE(NULLIF(u.name,''),u.username) AS player_name,a.rank_level AS level,a.rank_depth AS depth,a.rank_actions AS total_digs FROM arcade_saves a JOIN users u ON u.id=a.user_id WHERE a.game_id=? AND a.authority_version=1 AND u.disabled=0 AND u.kind='user' AND NOT EXISTS(SELECT 1 FROM account_retirements r WHERE r.source_id=a.user_id) ORDER BY a.rank_level DESC,a.rank_depth DESC,a.user_id LIMIT 50`).bind(id).all()
  return c.json({rows:rows.results})
 })
 return routes
}
