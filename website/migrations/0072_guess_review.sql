-- Only newly completed unique AI judgments enter this queue; no historical backfill.
CREATE TABLE guess_review_batches (
 id TEXT PRIMARY KEY,
 packet_id TEXT NOT NULL REFERENCES chat_redpacks(id) ON DELETE CASCADE,
 reward_type TEXT NOT NULL CHECK(reward_type IN ('ldc','none')),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','done','failed')),
 lease TEXT, locked_until INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL, completed_at INTEGER,
 model TEXT, error_code TEXT
);
CREATE INDEX idx_guess_review_due ON guess_review_batches(next_at,created_at) WHERE state IN ('pending','running');
CREATE TABLE guess_review_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 packet_id TEXT NOT NULL REFERENCES chat_redpacks(id) ON DELETE CASCADE,
 reward_type TEXT NOT NULL CHECK(reward_type IN ('ldc','none')),
 cache_key TEXT NOT NULL, question_id TEXT NOT NULL, question TEXT NOT NULL, kind TEXT NOT NULL,
 original_verdict TEXT NOT NULL, original_score INTEGER,
 batch_id TEXT REFERENCES guess_review_batches(id) ON DELETE CASCADE,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','verified','corrected','uncertain','stale')),
 verdict TEXT, score INTEGER, created_at INTEGER NOT NULL, reviewed_at INTEGER,
 UNIQUE(packet_id,reward_type,cache_key)
);
CREATE INDEX idx_guess_review_unassigned ON guess_review_items(packet_id,reward_type,id) WHERE batch_id IS NULL;
CREATE INDEX idx_guess_review_batch ON guess_review_items(batch_id,id);
