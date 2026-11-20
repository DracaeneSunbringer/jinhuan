import {Hono} from 'hono'
import type {Ctx} from '../types'
import {needUser} from '../services/auth'
import {boundedJson,fail,sameOrigin} from '../lib/http'
import {sha256} from '../lib/crypto'
import {validArcadeSave} from '../../public/arcade/save-validation.js'
export const arcade=new Hono<Ctx>()
type Save={revision:number;state:string;operation:string;state_hash:string;updated_at:number;authority_version:number}
const gameOf=(s:string)=>{if(!['mole','rift'].includes(s))fail(404,'游戏不存在');return s}
arcade.get('/arcade/:game?',async c=>{
 const g=c.req.param('game');if(g)gameOf(g)
 if(!c.get('user'))return c.redirect('/login?next='+encodeURIComponent(c.req.path))
 needUser(c);const url=new URL(c.req.url);url.pathname=g?`/arcade/${g}/index.html`:'/arcade/index.html';url.search=''
 const r=await c.env.ASSETS.fetch(new Request(url));return new Response(r.body,{status:r.status,headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})
})
arcade.use('/api/arcade/*',async(c,next)=>{needUser(c);c.header('cache-control','no-store');await next()})
arcade.get('/api/arcade/:game/state',async c=>{
 const u=needUser(c),game=gameOf(c.req.param('game')),row=await c.env.DB.prepare('SELECT revision,state,operation,updated_at FROM arcade_saves WHERE user_id=? AND game_id=?').bind(u.id,game).first<Save>()
 return c.json({user_id:u.id,name:u.name||u.username,revision:row?.revision??0,state:row?JSON.parse(row.state):null,operation:row?.operation??null,updated_at:row?.updated_at??null})
})
arcade.post('/api/arcade/:game/state',async c=>{
 sameOrigin(c);const u=needUser(c),game=gameOf(c.req.param('game')),body=await boundedJson(c,512*1024),t=Math.floor(Date.now()/1000)
 if(body.user_id!==u.id)fail(403,'登录账号已变化，请重新进入游戏','arcade_account_changed')
 if(!Number.isSafeInteger(body.revision)||Number(body.revision)<0||typeof body.operation!=='string'||!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(body.operation))fail(400,'存档版本或操作编号无效')
 if(!validArcadeSave(game,body.state))fail(400,'存档格式未通过校验，请保留本机备份','arcade_invalid_save')
 const raw=JSON.stringify(body.state),hash=await sha256(raw),prior=await c.env.DB.prepare('SELECT revision,state_hash,operation,updated_at,authority_version FROM arcade_saves WHERE user_id=? AND game_id=?').bind(u.id,game).first<Save>()
 if(prior?.authority_version===1)fail(403,'可信游戏存档不接受客户端直接覆盖','arcade_authoritative')
 if(prior && prior.operation===body.operation){if(prior.state_hash!==hash)fail(409,'操作编号已用于另一份进度');return c.json({revision:prior.revision,operation:prior.operation,duplicate:true})}
 if((prior?.revision??0)!==body.revision)fail(409,'另一设备已更新存档，请保留本机副本后载入云档','arcade_conflict')
 if(prior&&t-prior.updated_at<5){c.header('retry-after','5');return c.json({error:'保存较频繁，稍后同步',code:'arcade_save_rate'},429)}
 const s=(game==='rift'?(body.state as any).state:body.state) as Record<string,any>,integer=(x:unknown)=>Math.min(1e9,Math.max(0,Math.floor(Number(x)||0)))
 const row=await c.env.DB.prepare(`INSERT INTO arcade_saves(user_id,game_id,revision,state,state_hash,operation,updated_at,rank_level,rank_depth,rank_actions)
 SELECT ?1,?2,1,?3,?4,?5,?6,?8,?9,?10 WHERE (?7=0 OR EXISTS(SELECT 1 FROM arcade_saves WHERE user_id=?1 AND game_id=?2 AND revision=?7)) AND EXISTS(SELECT 1 FROM users WHERE id=?1 AND disabled=0 AND kind='user') AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=?1)
 ON CONFLICT(user_id,game_id) DO UPDATE SET revision=arcade_saves.revision+1,state=excluded.state,state_hash=excluded.state_hash,operation=excluded.operation,updated_at=excluded.updated_at,rank_level=excluded.rank_level,rank_depth=excluded.rank_depth,rank_actions=excluded.rank_actions
 WHERE arcade_saves.revision=?7 AND arcade_saves.authority_version=0 RETURNING revision,operation`).bind(u.id,game,raw,hash,body.operation,t,body.revision,integer(s.level),integer(game==='mole'?s.depth:s.maxFloor),integer(game==='mole'?s.totalDigs:s.stats?.kills)).first()
 if(!row){
  const current=await c.env.DB.prepare('SELECT revision,state_hash,operation,updated_at,authority_version FROM arcade_saves WHERE user_id=? AND game_id=?').bind(u.id,game).first<Save>()
  if(current?.authority_version===1)fail(403,'可信游戏存档不接受客户端直接覆盖','arcade_authoritative')
  if(current && current.operation===body.operation){if(current.state_hash!==hash)fail(409,'操作编号已用于另一份进度');return c.json({revision:current.revision,operation:current.operation,duplicate:true})}
  fail(409,'存档版本已变化，请重新载入云档','arcade_conflict')
 }
 return c.json(row)
})
arcade.get('/api/arcade/:game/ranking',async c=>{
 const game=gameOf(c.req.param('game')),rows=await c.env.DB.prepare(`SELECT a.user_id,COALESCE(NULLIF(u.name,''),u.username) AS player_name,a.rank_level AS level,a.rank_depth AS depth,a.rank_actions AS total_digs FROM arcade_saves a JOIN users u ON u.id=a.user_id WHERE a.game_id=? AND u.disabled=0 AND u.kind='user' ORDER BY a.rank_level DESC,a.rank_depth DESC,a.user_id LIMIT 50`).bind(game).all()
 return c.json({rows:rows.results})
})
