// Reserve accounting shares the exact transactions used to freeze/pay tickets.
// No scheduled scans, per-ticket pool ledger or writes on page reads.
export async function claimJackpotRound(db:D1Database,day:string,tickets:number,front:string,back:string,t:number){
 const token=crypto.randomUUID()
 const result=await db.batch<{pool:number}>([
  db.prepare(`UPDATE huancai_rounds SET state='drawing',front=?1,back=?2,
   pool=CASE WHEN tickets=0 THEN 0 ELSE (SELECT available FROM huancai_jackpot WHERE id=1) END,token=?3
   WHERE day=?4 AND state='open' AND tickets=?5 AND closes_at<=?6 AND rules_version>=3
   AND EXISTS(SELECT 1 FROM huancai_jackpot WHERE id=1)
   AND NOT EXISTS(SELECT 1 FROM huancai_rounds WHERE state='drawing' AND rules_version>=3)
   RETURNING pool`).bind(front,back,token,day,tickets,t),
  db.prepare(`UPDATE huancai_jackpot SET available=available-(SELECT pool FROM huancai_rounds WHERE day=?1),
   reserved=reserved+(SELECT pool FROM huancai_rounds WHERE day=?1),updated_at=?3 WHERE id=1
   AND EXISTS(SELECT 1 FROM huancai_rounds WHERE day=?1 AND token=?2 AND state='drawing' AND pool>0)`).bind(day,token,t),
 ])
 return result[0].results.length?Number(result[0].results[0].pool):null
}

export function jackpotPayoutStatements(db:D1Database,day:string,attempts:string[],t:number){
 if(!attempts.length)return []
 // At most 50 unique attempt-index probes. Only successfully claimed tickets count.
 const sum=`(SELECT COALESCE(SUM(payout),0) FROM huancai_tickets WHERE attempt IN (${attempts.map((_,i)=>'?'+(i+3)).join(',')}))`
 return [
  db.prepare(`UPDATE huancai_rounds SET pool_paid=pool_paid+${sum} WHERE day=?1 AND state='drawing' AND rules_version>=3 AND ${sum}>0 AND ?2>=0`).bind(day,t,...attempts),
  db.prepare(`UPDATE huancai_jackpot SET reserved=reserved-${sum},paid=paid+${sum},updated_at=?2 WHERE id=1 AND ${sum}>0
   AND EXISTS(SELECT 1 FROM huancai_rounds WHERE day=?1 AND state='drawing' AND rules_version>=3)`).bind(day,t,...attempts),
 ]
}

export function jackpotReturnStatement(db:D1Database,day:string,end:string,t:number){
 return db.prepare(`UPDATE huancai_jackpot SET available=available+(SELECT pool_returned FROM huancai_rounds WHERE day=?1),
  reserved=reserved-(SELECT pool_returned FROM huancai_rounds WHERE day=?1),updated_at=?3 WHERE id=1
  AND EXISTS(SELECT 1 FROM huancai_rounds WHERE day=?1 AND state='paid' AND token=?2 AND rules_version>=3 AND pool_returned>0)`).bind(day,end,t)
}
