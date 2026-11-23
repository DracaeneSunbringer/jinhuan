-- 成长路线：需求 / Bug / 改进意见，大家投票，管理员标状态、写回复
-- 本地：npx wrangler d1 execute meme-hall --local --file=migrations/0008_roadmap.sql
-- 线上：把 --local 换成 --remote（先跑 0001～0007）

CREATE TABLE IF NOT EXISTS road_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  kind       TEXT    NOT NULL,             -- feature 需求 / bug 问题 / idea 改进意见
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL DEFAULT '',
  status     TEXT    NOT NULL DEFAULT 'open', -- open 待评估 / planned 计划中 / doing 进行中 / done 已上线 / declined 不做
  reply      TEXT,                          -- 管理员回复
  score      INTEGER NOT NULL DEFAULT 0,    -- 赞成 - 反对
  comments   INTEGER NOT NULL DEFAULT 0,
  hidden     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_road_status ON road_items (hidden, status, score DESC);

CREATE TABLE IF NOT EXISTS road_votes (
  item_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  v       INTEGER NOT NULL,                 -- 1 赞成 / -1 反对
  PRIMARY KEY (item_id, user_id)
);

CREATE TABLE IF NOT EXISTS road_comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id    INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  body       TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_road_comments ON road_comments (item_id, id);
