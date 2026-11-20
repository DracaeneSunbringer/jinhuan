const eligible=`u.kind='user' AND u.disabled=0 AND EXISTS(SELECT 1 FROM chat_members WHERE group_id=1 AND user_id=u.id) AND NOT EXISTS(SELECT 1 FROM chat_bans WHERE group_id=1 AND user_id=u.id) AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=u.id)`
export async function settleDailyHuancai(db:D1Database,t:number,random:(n:number)=>number,ensureBot:(db:D1Database,t:number)=>Promise<boolean>,botId:number){
 const cursor=await db.prepare('SELECT next_day FROM huancai_daily_cursor WHERE id=1').first<{next_day:string}>()
 if(!cursor||!/^\d{4}-\d{2}-\d{2}$/.test(cursor.next_day))throw Error('每日保底日期不可用')
 const day=cursor.next_day,closes=Date.parse(day+'T22:30:00+08:00')/1000,starts=closes-86400
 if(t<closes)return {due:false}
 if(await db.prepare("SELECT 1 FROM huancai_rounds WHERE closes_at>? AND closes_at<=? AND state!='paid' LIMIT 1").bind(starts,closes).first())return {waiting:true}
 // The MATERIALIZED aggregate reads the bounded order window once; each user appears once.
 const rows=(await db.prepare(`WITH per_user AS MATERIALIZED (SELECT user_id,SUM(price) AS spent FROM huancai_orders WHERE created_at>=?1 AND created_at<?2 AND kind IN ('lotto','scratch') GROUP BY user_id),
 totals AS (SELECT COALESCE(SUM(spent),0) AS sales FROM per_user),
 participants AS (SELECT p.user_id FROM per_user p JOIN users u ON u.id=p.user_id WHERE ${eligible})
 SELECT p.user_id,totals.sales FROM totals LEFT JOIN participants p ON 1=1 ORDER BY p.user_id`).bind(starts,closes).all<{user_id:number|null;sales:number}>()).results
 const sales=Number(rows[0]?.sales||0),people=rows.filter(r=>r.user_id!==null&&r.user_id!==undefined).map(r=>Number(r.user_id))
 if(!Number.isSafeInteger(sales)||sales<0||sales>9007199254740991-52000)throw Error('每日保底投注金额超出范围')
 const winner=people.length?people[random(people.length)]:null,payout=winner?sales+52000:0,token=crypto.randomUUID(),next=new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10)
 if(winner&&!await ensureBot(db,t))throw Error('每日保底通知服务不可用')
 const validWinner=winner?`EXISTS(SELECT 1 FROM users u WHERE u.id=?4 AND ${eligible})`:'1'
 const statements=[
  db.prepare(`INSERT INTO huancai_daily(day,starts_at,closes_at,user_id,entrants,sales,payout,draw_token,created_at)
    SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9 WHERE ${validWinner}
    ON CONFLICT(day) DO NOTHING`).bind(day,starts,closes,winner,people.length,sales,payout,token,t),
  ...(winner?[db.prepare(`INSERT OR IGNORE INTO chat_messages(group_id,user_id,body,created_at,updated_at,system_kind,system_ref)
    SELECT 1,?1,'欢彩每日保底：'||COALESCE(u.nick,u.name,u.username)||' 获得 '||d.payout||' D币（本周期投入 '||d.sales||' + 52000），已到账。',?2,?2,'huancai_draw','huancai-daily:'||d.day
    FROM huancai_daily d JOIN users u ON u.id=d.user_id WHERE d.day=?3 AND d.draw_token=?4 AND EXISTS(SELECT 1 FROM chat_groups WHERE id=1)`).bind(botId,t,day,token)]:[]),
  db.prepare('UPDATE huancai_daily_cursor SET next_day=?1 WHERE id=1 AND next_day=?2 AND EXISTS(SELECT 1 FROM huancai_daily WHERE day=?2)').bind(next,day)
 ]
 await db.batch(statements)
 return {processed:true}
}
