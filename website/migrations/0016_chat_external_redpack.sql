-- 旧库单次迁移；执行前核对provider/system_ref不存在。
ALTER TABLE chat_redpacks ADD COLUMN provider TEXT NOT NULL DEFAULT 'native';
ALTER TABLE chat_redpacks ADD COLUMN external_ref TEXT NOT NULL DEFAULT '';
ALTER TABLE chat_redpacks ADD COLUMN external_kind TEXT NOT NULL DEFAULT '';
ALTER TABLE chat_redpacks ADD COLUMN notify_at INTEGER;
ALTER TABLE chat_redpacks ADD COLUMN reminded_at INTEGER;
ALTER TABLE chat_messages ADD COLUMN system_ref TEXT;
CREATE UNIQUE INDEX idx_chat_system_ref ON chat_messages(system_kind,system_ref) WHERE system_ref IS NOT NULL;
CREATE INDEX idx_redpack_notify ON chat_redpacks(notify_at) WHERE reminded_at IS NULL;
CREATE TABLE chat_redpack_external_views (
  packet_id TEXT NOT NULL REFERENCES chat_redpacks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  data TEXT NOT NULL,
  synced_at INTEGER NOT NULL,
  PRIMARY KEY(packet_id,user_id)
);
