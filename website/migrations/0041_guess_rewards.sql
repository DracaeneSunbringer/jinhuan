-- 猜词首位获胜：与原子名额预留同事务登记；资金状态变更、重试不重复累计。
CREATE TRIGGER trg_guess_win_reward AFTER UPDATE OF recipient_id ON ldc_awards
WHEN OLD.recipient_id IS NULL AND NEW.recipient_id IS NOT NULL AND NEW.slot=0
 AND EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id AND mode IN ('guess','clues') AND count=1)
BEGIN
 INSERT INTO user_badges(user_id,badge,n,first_at,last_day)
 VALUES(NEW.recipient_id,'guess',1,unixepoch(),date('now','+8 hours'))
 ON CONFLICT(user_id,badge) DO UPDATE SET n=n+1,last_day=excluded.last_day;
 INSERT OR IGNORE INTO user_unlocks(user_id,item,at)
 SELECT NEW.recipient_id,'guess:'||level,unixepoch() FROM (
  SELECT 1 AS level,1 AS wins UNION ALL SELECT 2,3 UNION ALL SELECT 3,10 UNION ALL SELECT 4,30 UNION ALL SELECT 5,100
 ) WHERE wins<=(SELECT n FROM user_badges WHERE user_id=NEW.recipient_id AND badge='guess');
 UPDATE users SET deco=json_set(deco,'$.bn',(SELECT n FROM user_badges WHERE user_id=NEW.recipient_id AND badge='guess'))
 WHERE id=NEW.recipient_id AND json_valid(deco) AND json_extract(deco,'$.bd')='guess';
END;

-- 一次性回填历史获胜者，按红包唯一轮次计算；不改已佩戴装扮及发放状态。
INSERT INTO user_badges(user_id,badge,n,first_at,last_day)
SELECT a.recipient_id,'guess',COUNT(DISTINCT a.packet_id),MIN(p.created_at),date(MAX(p.created_at),'unixepoch','+8 hours')
FROM ldc_awards a JOIN ldc_packets p ON p.packet_id=a.packet_id JOIN users u ON u.id=a.recipient_id
WHERE p.mode IN ('guess','clues') AND p.count=1 AND a.slot=0 AND u.kind='user'
 AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=u.id)
GROUP BY a.recipient_id
ON CONFLICT(user_id,badge) DO UPDATE SET n=MAX(n,excluded.n);
INSERT OR IGNORE INTO user_unlocks(user_id,item,at)
SELECT b.user_id,'guess:'||r.level,unixepoch() FROM user_badges b CROSS JOIN (
 SELECT 1 AS level,1 AS wins UNION ALL SELECT 2,3 UNION ALL SELECT 3,10 UNION ALL SELECT 4,30 UNION ALL SELECT 5,100
) r WHERE b.badge='guess' AND b.n>=r.wins;
