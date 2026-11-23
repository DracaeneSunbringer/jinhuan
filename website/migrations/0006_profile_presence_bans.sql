-- 站内昵称 / 个签、在线时间、群聊踢人记录
-- 本地：npx wrangler d1 execute meme-hall --local --file=migrations/0006_profile_presence_bans.sql
-- 线上：把 --local 换成 --remote（先跑 0001～0005）。新库直接用 schema.sql，不用跑

ALTER TABLE users ADD COLUMN nick TEXT;        -- 站内昵称，设了就盖过 linux.do 的 name
ALTER TABLE users ADD COLUMN bio TEXT;         -- 个签
ALTER TABLE users ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0;  -- 最近活跃时间

-- 被管理员移出的群：默认群也不再自动拉回来
CREATE TABLE IF NOT EXISTS chat_bans (
  group_id   INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

-- 站内限制：禁言（群聊）/ 禁评 / 禁发帖 / 禁回应；until=0 是永久
CREATE TABLE IF NOT EXISTS user_limits (
  user_id    INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  until      INTEGER NOT NULL DEFAULT 0,
  reason     TEXT,
  by_id      INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind)
);
