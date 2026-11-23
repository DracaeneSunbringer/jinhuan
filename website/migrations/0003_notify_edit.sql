-- 互动提醒、群聊消息编辑
-- 本地：npx wrangler d1 execute meme-hall --local --file=migrations/0003_notify_edit.sql
-- 线上：把 --local 换成 --remote（先跑 0001、0002）。新库直接用 schema.sql，不用跑

-- 提醒读到哪个时间点（别人给我的图点喜欢、表情、一句回应、评论）
ALTER TABLE users ADD COLUMN notif_read INTEGER NOT NULL DEFAULT 0;
-- 群聊消息改过就记下时间，界面上标「已编辑」
ALTER TABLE chat_messages ADD COLUMN edited_at INTEGER;
