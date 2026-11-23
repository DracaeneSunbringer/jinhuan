-- 默认增量0，现有轮次保留固定间隔。
ALTER TABLE ldc_packets ADD COLUMN auto_hint_increment INTEGER NOT NULL DEFAULT 0 CHECK(auto_hint_increment BETWEEN 0 AND 1000);
ALTER TABLE guess_free_rounds ADD COLUMN auto_hint_increment INTEGER NOT NULL DEFAULT 0 CHECK(auto_hint_increment BETWEEN 0 AND 1000);
