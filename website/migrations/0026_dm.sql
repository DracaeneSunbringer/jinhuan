-- 两人私信独立于群聊；低/高用户 ID 唯一锁定一对会话。
CREATE TABLE dm_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_low INTEGER NOT NULL REFERENCES users(id),
  user_high INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  last_message_id INTEGER NOT NULL DEFAULT 0,
  last_at INTEGER NOT NULL DEFAULT 0,
  read_low INTEGER NOT NULL DEFAULT 0,
  read_high INTEGER NOT NULL DEFAULT 0,
  CHECK(user_low<user_high),
  UNIQUE(user_low,user_high)
);
CREATE INDEX idx_dm_threads_high ON dm_threads(user_high,last_message_id);
CREATE INDEX idx_dm_threads_low ON dm_threads(user_low,last_message_id);

CREATE TABLE dm_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES dm_threads(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK(length(body)>0 AND length(body)<=2000),
  client_nonce TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(sender_id,client_nonce)
);
CREATE INDEX idx_dm_messages_thread ON dm_messages(thread_id,id);
CREATE INDEX idx_dm_messages_sender_time ON dm_messages(sender_id,created_at);

CREATE TRIGGER trg_dm_threads_insert BEFORE INSERT ON dm_threads
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id IN(NEW.user_low,NEW.user_high))
  OR (SELECT COUNT(*) FROM users WHERE id IN(NEW.user_low,NEW.user_high) AND kind='user' AND disabled=0)<>2
BEGIN SELECT RAISE(ABORT,'dm_participant_unavailable'); END;
CREATE TRIGGER trg_dm_messages_insert BEFORE INSERT ON dm_messages
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.sender_id)
  OR NOT EXISTS(SELECT 1 FROM dm_threads t JOIN users u ON u.id=NEW.sender_id
      WHERE t.id=NEW.thread_id AND NEW.sender_id IN(t.user_low,t.user_high) AND u.kind='user' AND u.disabled=0)
BEGIN SELECT RAISE(ABORT,'dm_sender_unavailable'); END;
CREATE TRIGGER trg_dm_messages_sender_update BEFORE UPDATE OF sender_id ON dm_messages
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.sender_id)
BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER trg_dm_threads_participants_update BEFORE UPDATE OF user_low,user_high ON dm_threads
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id IN(NEW.user_low,NEW.user_high))
  OR (SELECT COUNT(*) FROM users WHERE id IN(NEW.user_low,NEW.user_high) AND kind='user' AND disabled=0)<>2
BEGIN SELECT RAISE(ABORT,'dm_participant_unavailable'); END;
