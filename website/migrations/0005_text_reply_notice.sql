-- 文字帖、评论楼中楼、网站公告 / 每日公告、群聊图转帖子
-- 本地：npx wrangler d1 execute meme-hall --local --file=migrations/0005_text_reply_notice.sql
-- 线上：把 --local 换成 --remote（先跑 0001～0004）。新库直接用 schema.sql，不用跑

-- 帖子类型：image 图帖 / text 文字帖（文字帖在图廊里占满整行）
ALTER TABLE memes ADD COLUMN kind TEXT NOT NULL DEFAULT 'image';

-- 评论回复的是哪条评论
ALTER TABLE comments ADD COLUMN reply_to INTEGER;

-- 群聊消息转成的帖子，重复点直接跳过去
ALTER TABLE chat_messages ADD COLUMN meme_id INTEGER;

-- 公告：site 网站公告（取最新一条启用的）/ daily 每日公告（只在 day 那天显示，北京时间）
CREATE TABLE IF NOT EXISTS notices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT    NOT NULL,
  day        TEXT,
  body       TEXT    NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notices_day ON notices(kind, day);
