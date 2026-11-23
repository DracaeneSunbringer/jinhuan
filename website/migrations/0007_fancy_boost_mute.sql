-- 炫彩昵称开关、群消息上的短句回应（boost）、群免打扰
-- 本地：npx wrangler d1 execute meme-hall --local --file=migrations/0007_fancy_boost_mute.sql
-- 线上：把 --local 换成 --remote（先跑 0001～0006）。新库直接用 schema.sql，不用跑

ALTER TABLE users ADD COLUMN fancy INTEGER;   -- 炫彩昵称：NULL 跟默认（TL3 以上有）、1 管理员授予、0 管理员回收
ALTER TABLE chat_members ADD COLUMN muted INTEGER NOT NULL DEFAULT 0;  -- 免打扰：不计未读，@ 我的照常提醒

-- 群消息上的短句回应：每人每条消息一句
CREATE TABLE IF NOT EXISTS chat_boosts (
  message_id INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  text       TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

-- 删帖（hidden=1）/ 恢复时同步「我每天看过几张」，不然删过帖的那天未看数会被算成 0，「只看未看」里新帖整天都不显示
CREATE TRIGGER IF NOT EXISTS trg_memes_hidden AFTER UPDATE OF hidden ON memes WHEN NEW.hidden != OLD.hidden BEGIN
  UPDATE view_days SET
    n = MAX(n + CASE WHEN NEW.hidden THEN -1 ELSE 1 END, 0),
    n_safe = MAX(n_safe + CASE WHEN NEW.nsfw = 0 THEN CASE WHEN NEW.hidden THEN -1 ELSE 1 END ELSE 0 END, 0)
  WHERE day = date(NEW.created_at, 'unixepoch', '+8 hours')
    AND user_id IN (SELECT user_id FROM views WHERE meme_id = NEW.id);
END;
-- 把已经算错的重算一遍（只数没删的帖）
DELETE FROM view_days;
INSERT INTO view_days (user_id, day, n, n_safe)
  SELECT v.user_id, date(m.created_at, 'unixepoch', '+8 hours'), COUNT(*), SUM(m.nsfw = 0)
  FROM views v JOIN memes m ON m.id = v.meme_id WHERE m.hidden = 0 GROUP BY 1, 2;
