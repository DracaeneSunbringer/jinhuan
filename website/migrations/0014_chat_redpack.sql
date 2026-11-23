-- 无金额的群聊红包；旧 Worker 可忽略新增列与表。
ALTER TABLE chat_messages ADD COLUMN redpack_id TEXT;
CREATE UNIQUE INDEX idx_chat_redpack_id ON chat_messages(redpack_id) WHERE redpack_id IS NOT NULL;
CREATE TABLE chat_redpacks (
  id TEXT PRIMARY KEY,
  message_id INTEGER NOT NULL UNIQUE REFERENCES chat_messages(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('open','phrase','cipher','image')),
  game TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  phrase TEXT NOT NULL DEFAULT '',
  post_id INTEGER,
  image_index INTEGER NOT NULL DEFAULT 0,
  mask INTEGER NOT NULL DEFAULT 4
);
CREATE TABLE chat_redpack_opens (
  packet_id TEXT NOT NULL REFERENCES chat_redpacks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_at INTEGER NOT NULL DEFAULT 0,
  window_n INTEGER NOT NULL DEFAULT 0,
  solved_at INTEGER,
  PRIMARY KEY(packet_id,user_id)
);
