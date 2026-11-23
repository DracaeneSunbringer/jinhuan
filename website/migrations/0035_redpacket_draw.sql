-- 连接器只读展示信息，不是付款或领取授权。
ALTER TABLE chat_redpacks ADD COLUMN external_code TEXT;
ALTER TABLE chat_redpacks ADD COLUMN draw_data TEXT;
ALTER TABLE chat_redpacks ADD COLUMN draw_synced_at INTEGER;
ALTER TABLE chat_redpacks ADD COLUMN draw_lease_until INTEGER;
ALTER TABLE chat_redpacks ADD COLUMN draw_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_redpacks ADD COLUMN draw_announced_at INTEGER;
