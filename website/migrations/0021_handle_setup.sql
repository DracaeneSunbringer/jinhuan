-- 在已执行 0020 的预览库上可继续增量执行，不重放既有 ALTER TABLE。
ALTER TABLE users ADD COLUMN handle_setup_pending INTEGER NOT NULL DEFAULT 0;
-- 默认不补发旧账号的免费机会；Google 新建号事务显式设为 1。
