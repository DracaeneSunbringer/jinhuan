-- Durable, bounded work queue. No answer plaintext is copied by a trigger.
CREATE TABLE IF NOT EXISTS guess_word_archive_jobs(
 store TEXT NOT NULL CHECK(store IN ('ldc','none')), packet_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done','skipped','error','failed')),
 next_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
 PRIMARY KEY(store,packet_id)
);
CREATE INDEX IF NOT EXISTS idx_guess_word_archive_due ON guess_word_archive_jobs(next_at,store,packet_id)
 WHERE status IN ('pending','error');
CREATE INDEX IF NOT EXISTS idx_game_word_candidates_word ON game_word_candidates(word,id);

CREATE TRIGGER IF NOT EXISTS trg_word_archive_paid_insert AFTER INSERT ON ldc_packets
 WHEN NEW.mode IN ('guess','clues') BEGIN
 INSERT OR IGNORE INTO guess_word_archive_jobs(store,packet_id,next_at) VALUES('ldc',NEW.packet_id,CASE WHEN NEW.state='closed' THEN 0 ELSE NEW.ends_at END);
END;
CREATE TRIGGER IF NOT EXISTS trg_word_archive_paid_end AFTER UPDATE OF state,ends_at ON ldc_packets
 WHEN NEW.mode IN ('guess','clues') AND (NEW.state<>OLD.state OR NEW.ends_at<>OLD.ends_at) BEGIN
 UPDATE guess_word_archive_jobs SET next_at=CASE WHEN NEW.state='closed' THEN 0 ELSE NEW.ends_at END
 WHERE store='ldc' AND packet_id=NEW.packet_id AND status IN ('pending','error');
END;
CREATE TRIGGER IF NOT EXISTS trg_word_archive_paid_win AFTER UPDATE OF recipient_id ON ldc_awards
 WHEN NEW.recipient_id IS NOT NULL AND OLD.recipient_id IS NULL BEGIN
 UPDATE guess_word_archive_jobs SET next_at=0 WHERE store='ldc' AND packet_id=NEW.packet_id AND status='pending';
END;
CREATE TRIGGER IF NOT EXISTS trg_word_archive_paid_award AFTER INSERT ON ldc_awards
 WHEN NEW.recipient_id IS NOT NULL BEGIN
 UPDATE guess_word_archive_jobs SET next_at=0 WHERE store='ldc' AND packet_id=NEW.packet_id AND status='pending';
END;
CREATE TRIGGER IF NOT EXISTS trg_word_archive_free_insert AFTER INSERT ON guess_free_rounds
 WHEN NEW.mode IN ('guess','clues') BEGIN
 INSERT OR IGNORE INTO guess_word_archive_jobs(store,packet_id,next_at) VALUES('none',NEW.packet_id,CASE WHEN NEW.state='closed' OR NEW.winner_id IS NOT NULL THEN 0 ELSE NEW.ends_at END);
END;
CREATE TRIGGER IF NOT EXISTS trg_word_archive_free_end AFTER UPDATE OF state,ends_at,winner_id ON guess_free_rounds
 WHEN NEW.state<>OLD.state OR NEW.ends_at<>OLD.ends_at OR NEW.winner_id IS NOT OLD.winner_id BEGIN
 UPDATE guess_word_archive_jobs SET next_at=CASE WHEN NEW.state='closed' OR NEW.winner_id IS NOT NULL THEN 0 ELSE NEW.ends_at END
 WHERE store='none' AND packet_id=NEW.packet_id AND status IN ('pending','error');
END;
-- One-time backfill, including rounds dropped by the previous eight-item cursor.
INSERT OR IGNORE INTO guess_word_archive_jobs(store,packet_id,next_at)
 SELECT 'ldc',packet_id,CASE WHEN state='closed' THEN 0 ELSE ends_at END FROM ldc_packets WHERE mode IN ('guess','clues');
INSERT OR IGNORE INTO guess_word_archive_jobs(store,packet_id,next_at)
 SELECT 'none',packet_id,CASE WHEN state='closed' OR winner_id IS NOT NULL THEN 0 ELSE ends_at END FROM guess_free_rounds WHERE mode IN ('guess','clues');
