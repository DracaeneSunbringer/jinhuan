-- 互动提醒逐条已读、提醒设置
-- 本地：npx wrangler d1 execute meme-hall --local --file=migrations/0004_notif_reads.sql
-- 线上：把 --local 换成 --remote（先跑 0001～0003）。新库直接用 schema.sql，不用跑

-- 点开单条提醒就记一条；「全部已读」时推进 users.notif_read 并清掉这里的旧记录
CREATE TABLE IF NOT EXISTS notif_reads (
  user_id  INTEGER NOT NULL,
  kind     TEXT    NOT NULL,
  meme_id  INTEGER NOT NULL,
  actor_id INTEGER NOT NULL,
  at       INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, meme_id, actor_id, at)
) WITHOUT ROWID;

-- 提醒设置（JSON）：{"post":0,"chat":1,"like":1,"emoji":1,"reply":1,"comment":1}，缺省按默认
ALTER TABLE users ADD COLUMN notif_prefs TEXT;
