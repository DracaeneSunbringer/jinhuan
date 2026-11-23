-- 多图 / 视频 / 实况、连环解密
-- 本地：npx wrangler d1 execute meme-hall --local --file=migrations/0002_media_puzzle.sql
-- 线上：把 --local 换成 --remote（先跑 0001）。新库直接用 schema.sql，不用跑

-- 先传后发：文件先进 R2 并登记在这里，发帖 / 发消息时只认自己传的、没用过的 key
CREATE TABLE IF NOT EXISTS uploads (
  key TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id, created_at);

-- 多图怎么排：grid 宫格（历史帖），carousel 轮播
ALTER TABLE memes ADD COLUMN layout TEXT NOT NULL DEFAULT 'grid';

-- 一条消息多张图 / 视频：[{k,p,w,h,v}]，image_key 仍存第一张的预览图，老逻辑照常用
ALTER TABLE chat_messages ADD COLUMN media TEXT;

-- 连环解密：每层一行，没有层的老谜题按 puzzles.answer_hash 当一层口令
CREATE TABLE IF NOT EXISTS puzzle_layers (
  puzzle_id INTEGER NOT NULL,
  idx INTEGER NOT NULL,
  kind TEXT NOT NULL,          -- pass 口令 / cipher 密文 / quiz 答题 / image 看图 / stego 藏字图
  prompt TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',   -- 公开给解题人的内容（密文、选项、图片…）
  answers TEXT NOT NULL,       -- 可接受答案的哈希数组 JSON
  note TEXT NOT NULL DEFAULT '', -- 过关后显示的一句话
  PRIMARY KEY (puzzle_id, idx)
);
-- 解到第几层（0 起）
ALTER TABLE puzzle_attempts ADD COLUMN layer INTEGER NOT NULL DEFAULT 0;
