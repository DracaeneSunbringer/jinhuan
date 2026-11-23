-- 收藏仅记录来源，读取以当前成员权限与消息状态为准。
CREATE TABLE chat_message_favorites (
  user_id INTEGER NOT NULL REFERENCES users(id),
  message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,message_id)
);
CREATE INDEX idx_chat_message_favorites_page ON chat_message_favorites(user_id,created_at DESC,message_id DESC);
CREATE TRIGGER chat_message_favorites_retired_insert BEFORE INSERT ON chat_message_favorites
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER chat_message_favorites_retired_update BEFORE UPDATE OF user_id ON chat_message_favorites
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'account_retired'); END;
