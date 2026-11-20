import {sha256} from '../lib/crypto'

// Internal transaction primitive. A caller must compute state and delta in a
// trusted server-side game engine; never pass an HTTP client's claimed delta.
export type ArcadeTransition={userId:number;game:'mole'|'rift';operation:string;requestHash:string;saveRevision:number;walletRevision:number;nextState:string;delta:number;rankLevel:number;rankDepth:number;rankActions:number;now:number}
type Receipt={request_hash:string;state_hash:string;delta:number;balance_after:number;save_revision:number}
export async function findArcadeOperation(db:D1Database,userId:number,game:'mole'|'rift',operation:string,requestHash:string){
 const prior=await db.prepare('SELECT request_hash,state_hash,delta,balance_after,save_revision FROM arcade_operations WHERE user_id=? AND game_id=? AND operation=?').bind(userId,game,operation).first<Receipt>()
 if(!prior)return null
 if(prior.request_hash!==requestHash)throw Error('操作编号已用于其他游戏动作')
 return {revision:prior.save_revision,balanceAfter:prior.balance_after,delta:prior.delta,duplicate:true}
}
export async function commitArcadeTransition(db:D1Database,p:ArcadeTransition){
 if(!Number.isSafeInteger(p.userId)||p.userId<1||!['mole','rift'].includes(p.game)||!/^[0-9a-f-]{36}$/i.test(p.operation)||!/^[0-9a-f]{64}$/i.test(p.requestHash)||!Number.isSafeInteger(p.saveRevision)||p.saveRevision<1||!Number.isSafeInteger(p.walletRevision)||p.walletRevision<0||!Number.isSafeInteger(p.delta)||!Number.isSafeInteger(p.now)||![p.rankLevel,p.rankDepth,p.rankActions].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1e9)||typeof p.nextState!=='string'||p.nextState.length>512*1024)throw Error('游戏动作参数无效')
 try{JSON.parse(p.nextState)}catch{throw Error('游戏状态无效')}
 const prior=await findArcadeOperation(db,p.userId,p.game,p.operation,p.requestHash);if(prior)return prior
 const attempt=crypto.randomUUID(),hash=await sha256(p.nextState),gate='EXISTS(SELECT 1 FROM arcade_operations WHERE attempt=?1)'
 const result=await db.batch([
  db.prepare(`INSERT OR IGNORE INTO arcade_operations(user_id,game_id,operation,request_hash,state_hash,attempt,delta,balance_after,save_revision,created_at)
   SELECT ?2,?3,?4,?5,?6,?1,?7,w.balance+?7,s.revision+1,?8 FROM arcade_saves s JOIN coin52_wallets w ON w.user_id=s.user_id
   WHERE s.user_id=?2 AND s.game_id=?3 AND s.revision=?9 AND s.authority_version=1 AND w.revision=?10 AND w.balance+?7 BETWEEN 0 AND 9007199254740991
   AND EXISTS(SELECT 1 FROM users WHERE id=?2 AND disabled=0 AND kind='user') AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=?2)`).bind(attempt,p.userId,p.game,p.operation,p.requestHash,hash,p.delta,p.now,p.saveRevision,p.walletRevision),
  db.prepare(`INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at)
   SELECT user_id,'arcade-game',game_id||':'||operation,attempt,delta,balance_after,created_at FROM arcade_operations WHERE attempt=?1 AND delta<>0`).bind(attempt),
  db.prepare(`UPDATE coin52_wallets SET balance=balance+?3,revision=revision+1,updated_at=?4 WHERE user_id=?2 AND ?3<>0 AND ${gate}`).bind(attempt,p.userId,p.delta,p.now),
  db.prepare(`UPDATE arcade_saves SET revision=revision+1,state=?4,state_hash=?5,operation=?6,updated_at=?7,rank_level=?8,rank_depth=?9,rank_actions=?10
   WHERE user_id=?2 AND game_id=?3 AND ${gate}`).bind(attempt,p.userId,p.game,p.nextState,hash,p.operation,p.now,p.rankLevel,p.rankDepth,p.rankActions),
 ])
 if(!result[0].meta.changes){const duplicate=await findArcadeOperation(db,p.userId,p.game,p.operation,p.requestHash);if(duplicate)return duplicate;throw Error('游戏进度、钱包余额或账号状态已变化，请重新载入')}
 if(result[3].meta.changes!==1)throw Error('游戏状态提交异常')
 const saved=await findArcadeOperation(db,p.userId,p.game,p.operation,p.requestHash);if(!saved)throw Error('游戏操作回执缺失')
 return {...saved,duplicate:false}
}
