-- 鞭打模块（原成长路线）：需求 / Bug / 讨论可以带图片和文件
-- 本地：npx wrangler d1 execute meme-hall --local --file=migrations/0011_road_media.sql
-- 线上：把 --local 换成 --remote
ALTER TABLE road_items ADD COLUMN media TEXT;
ALTER TABLE road_comments ADD COLUMN media TEXT;
