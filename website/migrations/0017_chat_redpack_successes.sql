CREATE TABLE IF NOT EXISTS chat_redpack_successes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  packet_id TEXT NOT NULL REFERENCES chat_redpacks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE(packet_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_redpack_success_order ON chat_redpack_successes(packet_id,seq);
