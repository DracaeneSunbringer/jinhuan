CREATE TABLE guess_tips (
 id TEXT PRIMARY KEY,
 packet_id TEXT NOT NULL REFERENCES chat_redpacks(id),
 sender_id INTEGER NOT NULL REFERENCES users(id),
 recipient_id INTEGER NOT NULL REFERENCES users(id),
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 10000),
 attempt TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL,
 CHECK(sender_id<>recipient_id)
);
CREATE INDEX idx_guess_tips_sender ON guess_tips(packet_id,sender_id,created_at);
