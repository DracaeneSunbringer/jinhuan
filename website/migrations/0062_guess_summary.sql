CREATE TABLE guess_answer_explanations (
 packet_id TEXT PRIMARY KEY REFERENCES chat_redpacks(id) ON DELETE CASCADE,
 notice_id INTEGER NOT NULL UNIQUE REFERENCES chat_messages(id) ON DELETE CASCADE,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','running','done')),
 text TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0,
 next_at INTEGER NOT NULL, lease TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_guess_explanation_due ON guess_answer_explanations(next_at) WHERE state<>'done';
CREATE TRIGGER guess_explanation_enqueue AFTER INSERT ON chat_messages
WHEN NEW.system_kind IN('ldc_winner','ldc_expired') AND NEW.deleted=0 BEGIN
 INSERT OR IGNORE INTO guess_answer_explanations(packet_id,notice_id,next_at)
 SELECT r.id,NEW.id,NEW.created_at FROM chat_redpacks r
 WHERE r.message_id=CAST(NEW.system_ref AS INTEGER) AND (
 EXISTS(SELECT 1 FROM ldc_packets p WHERE p.packet_id=r.id AND p.mode IN('guess','clues')) OR
 EXISTS(SELECT 1 FROM guess_free_rounds p WHERE p.packet_id=r.id));
END;
CREATE TABLE rank_digest_queue (
 group_id INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
 day TEXT NOT NULL, next_at INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','done')),
 PRIMARY KEY(group_id,day)
);
CREATE INDEX idx_rank_digest_due ON rank_digest_queue(next_at,group_id) WHERE state='pending';
CREATE INDEX idx_rank_placement_digest ON rank_placements(group_id,day,period,board,place);
