-- 已看日聚合：所有变化仅按该帖浏览者增量维护。禁止重放其他旧迁移。
CREATE INDEX idx_views_meme_user ON views(meme_id,user_id);
DROP TRIGGER trg_views_ins;
DROP TRIGGER trg_views_del;
DROP TRIGGER trg_memes_hidden;

CREATE TRIGGER trg_views_ins AFTER INSERT ON views BEGIN
 INSERT INTO view_days(user_id,day,n,n_safe)
 SELECT NEW.user_id,date(created_at,'unixepoch','+8 hours'),1,(nsfw=0) FROM memes WHERE id=NEW.meme_id AND hidden=0
 ON CONFLICT(user_id,day) DO UPDATE SET n=n+1,n_safe=n_safe+excluded.n_safe;
END;
CREATE TRIGGER trg_views_del AFTER DELETE ON views BEGIN
 UPDATE view_days SET n=n-1,n_safe=n_safe-(SELECT nsfw=0 FROM memes WHERE id=OLD.meme_id)
 WHERE user_id=OLD.user_id AND day=(SELECT date(created_at,'unixepoch','+8 hours') FROM memes WHERE id=OLD.meme_id AND hidden=0);
END;

-- 先按旧敏感性移动可见份额；嵌套的nsfw更新另计差值。
-- 不截断中间负值：同一SQL内触发器顺序不同，差值仍需精确相加，事务结束后应恢复合法范围。
CREATE TRIGGER trg_memes_view_location AFTER UPDATE OF hidden,created_at ON memes
WHEN OLD.hidden!=NEW.hidden OR date(OLD.created_at,'unixepoch','+8 hours')!=date(NEW.created_at,'unixepoch','+8 hours') BEGIN
 UPDATE view_days SET n=n-1,n_safe=n_safe-(OLD.nsfw=0)
 WHERE OLD.hidden=0 AND day=date(OLD.created_at,'unixepoch','+8 hours') AND user_id IN(SELECT user_id FROM views WHERE meme_id=OLD.id);
 INSERT INTO view_days(user_id,day,n,n_safe)
 SELECT user_id,date(NEW.created_at,'unixepoch','+8 hours'),1,(OLD.nsfw=0) FROM views WHERE meme_id=NEW.id AND NEW.hidden=0
 ON CONFLICT(user_id,day) DO UPDATE SET n=n+excluded.n,n_safe=n_safe+excluded.n_safe;
END;
CREATE TRIGGER trg_memes_view_safety AFTER UPDATE OF nsfw ON memes
WHEN OLD.nsfw!=NEW.nsfw AND NEW.hidden=0 BEGIN
 INSERT INTO view_days(user_id,day,n,n_safe)
 SELECT user_id,date(NEW.created_at,'unixepoch','+8 hours'),0,(NEW.nsfw=0)-(OLD.nsfw=0) FROM views WHERE meme_id=NEW.id
 ON CONFLICT(user_id,day) DO UPDATE SET n_safe=n_safe+excluded.n_safe;
END;
CREATE TRIGGER trg_memes_view_delete BEFORE DELETE ON memes WHEN OLD.hidden=0 BEGIN
 UPDATE view_days SET n=n-1,n_safe=n_safe-(OLD.nsfw=0)
 WHERE day=date(OLD.created_at,'unixepoch','+8 hours') AND user_id IN(SELECT user_id FROM views WHERE meme_id=OLD.id);
END;

-- 一次性纠偏，只写存在差异的键，保留浏览明细与有效零值行。
WITH expected AS MATERIALIZED (
 SELECT v.user_id,date(m.created_at,'unixepoch','+8 hours') AS day,COUNT(*) AS n,SUM(m.nsfw=0) AS n_safe
 FROM views v JOIN memes m ON m.id=v.meme_id WHERE m.hidden=0 GROUP BY 1,2
)
INSERT INTO view_days(user_id,day,n,n_safe)
SELECT e.user_id,e.day,e.n,e.n_safe FROM expected e
WHERE NOT EXISTS(SELECT 1 FROM view_days a WHERE a.user_id=e.user_id AND a.day=e.day AND a.n=e.n AND a.n_safe=e.n_safe)
ON CONFLICT(user_id,day) DO UPDATE SET n=excluded.n,n_safe=excluded.n_safe;
WITH expected AS MATERIALIZED (
 SELECT v.user_id,date(m.created_at,'unixepoch','+8 hours') AS day FROM views v JOIN memes m ON m.id=v.meme_id WHERE m.hidden=0 GROUP BY 1,2
)
UPDATE view_days SET n=0,n_safe=0 WHERE (n!=0 OR n_safe!=0)
 AND NOT EXISTS(SELECT 1 FROM expected e WHERE e.user_id=view_days.user_id AND e.day=view_days.day);
