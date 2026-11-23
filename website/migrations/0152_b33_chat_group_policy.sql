-- b33：特殊群聊的规则（内部群「海底世界」：是否开放申请）
CREATE TABLE IF NOT EXISTS chat_group_policy (group_id INTEGER PRIMARY KEY, kind TEXT NOT NULL, open_apply INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
