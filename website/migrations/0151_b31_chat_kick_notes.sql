-- b31：群聊不活跃清理的原因记录，用于给被清理的人发提醒、允许直接重新入群
CREATE TABLE IF NOT EXISTS chat_kick_notes (group_id INTEGER NOT NULL, user_id INTEGER NOT NULL, at INTEGER NOT NULL, reason TEXT NOT NULL, PRIMARY KEY (group_id, user_id, at));
CREATE INDEX IF NOT EXISTS idx_chat_kick_notes_user ON chat_kick_notes (user_id, at);
