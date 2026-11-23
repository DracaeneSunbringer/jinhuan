-- 保留已获进度；仅新结算按名次增加3/2/1经验，不追溯重发。
DROP TRIGGER rank_placement_unlock;
CREATE TRIGGER rank_placement_unlock AFTER INSERT ON rank_placements BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rank_reward_catalog WHERE series='rank_'||NEW.board||'_'||NEW.period AND level=1) THEN RAISE(ABORT,'rank_catalog_missing') END;
 INSERT INTO user_badges(user_id,badge,n,first_at,last_day) VALUES(NEW.user_id,'rank_'||NEW.board||'_'||NEW.period,4-NEW.place,NEW.created_at,NEW.day)
 ON CONFLICT(user_id,badge) DO UPDATE SET n=n+excluded.n,last_day=MAX(last_day,excluded.last_day);
 INSERT OR IGNORE INTO user_unlocks(user_id,item,at)
 SELECT NEW.user_id,r.series||':'||r.level,NEW.created_at FROM rank_reward_catalog r
 JOIN user_badges b ON b.user_id=NEW.user_id AND b.badge=r.series
 WHERE r.series='rank_'||NEW.board||'_'||NEW.period AND b.n>=r.threshold;
 UPDATE users SET deco=json_set(deco,'$.bn',(SELECT n FROM user_badges WHERE user_id=NEW.user_id AND badge='rank_'||NEW.board||'_'||NEW.period))
 WHERE id=NEW.user_id AND json_valid(deco) AND json_extract(deco,'$.bd')='rank_'||NEW.board||'_'||NEW.period;
END;
