-- All distinct correct winners count, regardless of award slot or payment state.
-- Existing live triggers already count slot 0 via guess_wins and later slots via
-- guess_multi_growth. Do not remove the slot guard: that would double-count first place.
INSERT INTO user_badges(user_id,badge,n,first_at,last_day)
SELECT w.user_id,'guess',COUNT(*),MIN(w.at),date(MAX(w.at),'unixepoch','+8 hours')
FROM (
 SELECT packet_id,user_id,MIN(at) AS at FROM (
  SELECT packet_id,user_id,created_at AS at FROM guess_wins
  UNION ALL
  SELECT a.packet_id,a.recipient_id,COALESCE(a.sent_at,p.created_at)
  FROM ldc_awards a JOIN ldc_packets p ON p.packet_id=a.packet_id
  WHERE a.purpose='winner' AND a.recipient_id IS NOT NULL AND p.mode IN('guess','clues')
 ) GROUP BY packet_id,user_id
) w JOIN users u ON u.id=w.user_id
WHERE u.kind='user' AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=w.user_id)
GROUP BY w.user_id
ON CONFLICT(user_id,badge) DO UPDATE SET n=MAX(n,excluded.n);

INSERT OR IGNORE INTO user_unlocks(user_id,item,at)
SELECT b.user_id,'guess:'||r.level,unixepoch() FROM user_badges b
CROSS JOIN (SELECT 1 level,1 wins UNION ALL SELECT 2,3 UNION ALL SELECT 3,10 UNION ALL SELECT 4,30 UNION ALL SELECT 5,100) r
WHERE b.badge='guess' AND b.n>=r.wins;
UPDATE users SET deco=json_set(deco,'$.bn',(SELECT n FROM user_badges WHERE user_id=users.id AND badge='guess'))
WHERE json_valid(deco) AND json_extract(deco,'$.bd')='guess'
AND EXISTS(SELECT 1 FROM user_badges WHERE user_id=users.id AND badge='guess' AND n<>COALESCE(json_extract(users.deco,'$.bn'),0));
