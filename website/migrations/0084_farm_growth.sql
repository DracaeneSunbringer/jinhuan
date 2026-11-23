-- One-time absolute-progress backfill. No save rewrite and no inferred theft history.
INSERT INTO user_badges(user_id,badge,n,first_at,last_day)
 SELECT f.user_id,'farm_plant',json_extract(f.state,'$.totals.planted'),unixepoch(),date('now','+8 hours')
 FROM farm_saves f JOIN users u ON u.id=f.user_id
 WHERE u.kind='user' AND u.disabled=0
 AND NOT EXISTS(SELECT 1 FROM account_retirements a WHERE a.source_id=f.user_id)
 AND CASE WHEN json_valid(f.state) THEN json_extract(f.state,'$.version') IN(1,2)
   AND json_type(f.state,'$.totals.planted')='integer'
   AND json_extract(f.state,'$.totals.planted') BETWEEN 1 AND 9007199254740991 ELSE 0 END
 ON CONFLICT(user_id,badge) DO UPDATE SET n=MAX(user_badges.n,excluded.n);
INSERT OR IGNORE INTO user_unlocks(user_id,item,at)
 SELECT b.user_id,'farm_plant:'||r.level,unixepoch() FROM user_badges b
 JOIN (SELECT 1 level,1 threshold UNION ALL SELECT 2,24 UNION ALL SELECT 3,100 UNION ALL SELECT 4,500 UNION ALL SELECT 5,2000) r
 JOIN users u ON u.id=b.user_id
 WHERE b.badge='farm_plant' AND b.n>=r.threshold AND u.kind='user' AND u.disabled=0
 AND NOT EXISTS(SELECT 1 FROM account_retirements a WHERE a.source_id=b.user_id);
