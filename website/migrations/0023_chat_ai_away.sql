-- 仅增量执行一次。旧成员首次读取时保留当前last_read作为离开边界。
ALTER TABLE chat_members ADD COLUMN last_read_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_members ADD COLUMN away_from INTEGER NOT NULL DEFAULT 0;
