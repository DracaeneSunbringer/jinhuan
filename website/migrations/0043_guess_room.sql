-- 猜词专区独立消息；不进入 chat_messages、主群未读或@通知。
CREATE TABLE guess_room_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 packet_id TEXT NOT NULL REFERENCES chat_redpacks(id),
 group_id INTEGER NOT NULL REFERENCES chat_groups(id),
 user_id INTEGER NOT NULL REFERENCES users(id),
 nonce TEXT NOT NULL,
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),
 deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN(0,1)),
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 ai_text TEXT,ai_score INTEGER CHECK(ai_score BETWEEN 0 AND 100),
 ai_status TEXT CHECK(ai_status IN('pending','done','error')),
 UNIQUE(packet_id,user_id,nonce)
);
CREATE INDEX idx_guess_room_page ON guess_room_messages(packet_id,id);
CREATE INDEX idx_guess_room_updates ON guess_room_messages(packet_id,updated_at,id);
ALTER TABLE ldc_questions ADD COLUMN source_room_id INTEGER REFERENCES guess_room_messages(id);
ALTER TABLE ldc_packets ADD COLUMN room_revision INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_ldc_question_room_source ON ldc_questions(source_room_id) WHERE source_room_id IS NOT NULL;
CREATE INDEX idx_ldc_guess_rank ON ldc_questions(packet_id,score DESC,created_at DESC,id DESC) WHERE kind='guess' AND score IS NOT NULL;
CREATE INDEX idx_ldc_yes_facts ON ldc_questions(packet_id,created_at DESC,id DESC) WHERE kind='question' AND verdict='yes';
CREATE TRIGGER guess_room_account_live BEFORE INSERT ON guess_room_messages
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'account_retired'); END;
-- 复用原消息状态更新，无新增群消息、未读或轮询。只有状态实际改变才触发。
CREATE TRIGGER guess_room_signal_insert AFTER INSERT ON guess_room_messages
BEGIN
 UPDATE ldc_packets SET room_revision=room_revision+1 WHERE packet_id=NEW.packet_id;
 UPDATE chat_messages SET updated_at=MAX(updated_at,NEW.updated_at) WHERE id=(SELECT message_id FROM chat_redpacks WHERE id=NEW.packet_id);
END;
CREATE TRIGGER guess_room_signal_update AFTER UPDATE OF ai_text,ai_score,ai_status,deleted ON guess_room_messages
WHEN OLD.ai_text IS NOT NEW.ai_text OR OLD.ai_score IS NOT NEW.ai_score OR OLD.ai_status IS NOT NEW.ai_status OR OLD.deleted<>NEW.deleted
BEGIN
 UPDATE ldc_packets SET room_revision=room_revision+1 WHERE packet_id=NEW.packet_id;
 UPDATE chat_messages SET updated_at=MAX(updated_at,NEW.updated_at) WHERE id=(SELECT message_id FROM chat_redpacks WHERE id=NEW.packet_id);
END;
