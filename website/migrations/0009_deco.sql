-- 称号 / 炫彩名配色 / 消息气泡 / 生效范围，一个 JSON 存在 users.deco
-- 本地：npx wrangler d1 execute meme-hall --local --file=migrations/0009_deco.sql
-- 线上：把 --local 换成 --remote（先跑 0001～0008）。新库直接用 schema.sql，不用跑
ALTER TABLE users ADD COLUMN deco TEXT;
