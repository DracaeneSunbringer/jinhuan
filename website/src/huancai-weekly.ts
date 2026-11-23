import {HUANCAI_RETIRED} from './shared/huancai-rules'
import {ensureAiBot,AI_BOT_ID} from './ai/images'

export function completedWeek(t:number){
 const d=new Date((t+28800)*1000),day=d.toISOString().slice(0,10)
 let closes=Date.parse(day+'T22:30:00+08:00')/1000-d.getUTCDay()*86400
 if(t<closes)closes-=7*86400
 const week=new Date((closes-6*86400+28800)*1000).toISOString().slice(0,10)
 return {week,closes,starts:Date.parse(week+'T00:00:00+08:00')/1000,until:new Date((closes+28800)*1000).toISOString().slice(0,10)}
}
export const eligible=`u.kind='user' AND u.disabled=0 AND EXISTS(SELECT 1 FROM chat_members WHERE group_id=1 AND user_id=u.id) AND NOT EXISTS(SELECT 1 FROM chat_bans WHERE group_id=1 AND user_id=u.id) AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=u.id)`
export async function settleWeekly(db:D1Database,t:number,random:(n:number)=>number){
 if(HUANCAI_RETIRED)return // 欢彩已下线（b19），每周保底不再结算
 const w=completedWeek(t)
 if(w.until<'2026-10-25'||await db.prepare('SELECT 1 FROM huancai_weekly WHERE week=?').bind(w.week).first())return
 if(await db.prepare("SELECT 1 FROM huancai_rounds WHERE closes_at<=? AND state!='paid' LIMIT 1").bind(w.closes).first())return
 const natural=await db.prepare("SELECT 1 FROM huancai_rounds WHERE closes_at>=? AND closes_at<=? AND state='paid' AND rules_version>=2 AND COALESCE(json_extract(prize_counts,'$.\"1\"'),0)>0 LIMIT 1").bind(w.starts,w.closes).first()
 if(natural){await db.prepare("INSERT OR IGNORE INTO huancai_weekly(week,closes_at,mode,created_at) VALUES(?,?,'natural',?)").bind(w.week,w.closes,t).run();return}
 const entrants=`FROM users u WHERE ${eligible} AND EXISTS(SELECT 1 FROM huancai_tickets t JOIN huancai_rounds r ON r.day=t.day WHERE t.user_id=u.id AND r.closes_at>=? AND r.closes_at<=?)`
 const n=Number((await db.prepare('SELECT count(*) AS n '+entrants).bind(w.starts,w.closes).first<{n:number}>())?.n??0)
 const people=n||Number((await db.prepare('SELECT count(*) AS n FROM users u WHERE '+eligible).first<{n:number}>())?.n??0)
 if(!people)return
 const winner=await (n?db.prepare('SELECT u.id '+entrants+' ORDER BY u.id LIMIT 1 OFFSET ?').bind(w.starts,w.closes,random(people)):db.prepare('SELECT u.id FROM users u WHERE '+eligible+' ORDER BY u.id LIMIT 1 OFFSET ?').bind(random(people))).first<{id:number}>()
 if(!winner)return
 const bot=await ensureAiBot(db,t),token=crypto.randomUUID()
 // The unique week insert owns all coin effects through its trigger. Retrying cannot pay twice.
 await db.batch([
  db.prepare(`INSERT OR IGNORE INTO huancai_weekly(week,closes_at,mode,user_id,ticket_id,payout,created_at)
   SELECT ?1,?2,?3,?4,?5,5200000,?6 FROM huancai_jackpot WHERE id=1 AND available>=500000000 AND reserved=0
   AND NOT EXISTS(SELECT 1 FROM huancai_rounds WHERE closes_at<=?7 AND state!='paid')`).bind(w.week,w.closes,n?'ticket':'free',winner.id,token,t,w.closes),
  ...(bot?[db.prepare(`INSERT OR IGNORE INTO chat_messages(group_id,user_id,body,created_at,updated_at,system_kind,system_ref)
   SELECT 1,?1,'欢彩周保底一等奖：'||COALESCE(u.nick,u.name,u.username)||'，获得 '||w.payout||' D币，已到账。独立于各期开奖号码；本周未自然中出一等奖，按公开周保底规则抽出。',?2,?2,'huancai_draw','huancai-weekly:'||w.week
   FROM huancai_weekly w JOIN users u ON u.id=w.user_id WHERE w.week=?3 AND w.ticket_id=?4`).bind(AI_BOT_ID,t,w.week,token)]:[])
 ])
}
