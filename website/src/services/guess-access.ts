import type {C} from '../types'

// Guessing in the shared public room is open to active accounts. This relation
// is read-only: visiting or playing never creates a chat membership.
export const guessMembersSql=`(SELECT group_id,user_id,joined_at FROM chat_members WHERE group_id<>1
 UNION ALL SELECT 1 AS group_id,id AS user_id,0 AS joined_at FROM users WHERE kind='user' AND disabled=0)`
// Voluntary chat departure is not a game ban. Moderation bans remain effective.
export const guessBansSql="(SELECT group_id,user_id,kind FROM chat_bans WHERE group_id<>1 OR kind<>'left')"

// Resolve one account by its primary key. Joining the public-room UNION inside
// a correlated question predicate makes SQLite enumerate all public users again.
export function guessVisibleUserSql(user:string,group:string){
 return `EXISTS(SELECT 1 FROM users gv WHERE gv.id=${user} AND gv.disabled=0
  AND ((${group}=1 AND gv.kind='user') OR (${group}<>1 AND EXISTS(SELECT 1 FROM chat_members gm WHERE gm.group_id=${group} AND gm.user_id=gv.id)))
  AND NOT EXISTS(SELECT 1 FROM chat_bans gb WHERE gb.group_id=${group} AND gb.user_id=gv.id AND (${group}<>1 OR gb.kind<>'left')))`
}

export async function independentGuessRequest(c:C,gid:number){
 if(gid!==1||new URL(c.req.url).origin!=='https://cc.52dmeme.com'||!c.env.GAME_SERVICE_SECRET||c.req.header('x-game-service')!==c.env.GAME_SERVICE_SECRET)return false
 const path=new URL(c.req.url).pathname
 if(path==='/api/game-runtime/auth'||path==='/api/game-runtime/consent')return true
 if(/^\/api\/guess-sidebar\/(?:groups|messages(?:\/\d+)?)$/.test(path))return true
 if(/^\/api\/chat\/groups\/1\/(?:guess-(?:room|queue|stats)(?:\/[^/]+)?|sender-stats|packet-luck-stats|ldc\/auto-word)$/.test(path))return true
 if(path==='/api/chat/groups/1/redpacks'&&c.req.method==='POST'){
  const body=await c.req.raw.clone().json().catch(()=>null) as any
  return body?.provider==='ldc'&&['guess','clues'].includes(body?.mode)
 }
 const match=/^\/api\/chat\/messages\/(\d+)\/(?:guess-[\w-]+|prediction|redpack)(?:\/[\w-]+)?$/.exec(path)
 if(!match)return false
 return !!await c.env.DB.prepare(`SELECT 1 FROM chat_redpacks r JOIN chat_messages m ON m.id=r.message_id
 WHERE m.id=? AND m.group_id=1 AND m.deleted=0 AND
 (EXISTS(SELECT 1 FROM ldc_packets p WHERE p.packet_id=r.id AND p.mode IN('guess','clues'))
 OR EXISTS(SELECT 1 FROM guess_free_rounds p WHERE p.packet_id=r.id))`).bind(Number(match[1])).first()
}
