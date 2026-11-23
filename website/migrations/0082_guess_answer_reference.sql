ALTER TABLE ldc_packets ADD COLUMN answer_reference_box TEXT;
ALTER TABLE guess_free_rounds ADD COLUMN answer_reference_box TEXT;
CREATE TABLE guess_reference_preparations (
 packet_id TEXT PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 lease TEXT NOT NULL,
 lease_until INTEGER NOT NULL,
 result_box TEXT,
 expires_at INTEGER NOT NULL
);
CREATE INDEX idx_guess_reference_expiry ON guess_reference_preparations(expires_at);
CREATE INDEX idx_guess_reference_user ON guess_reference_preparations(user_id);
