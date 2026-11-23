-- Device subscriptions expire with the login session; no chat-history backfill.
CREATE TABLE web_push_subscriptions (
 id TEXT PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 endpoint TEXT NOT NULL,
 p256dh TEXT NOT NULL,
 auth TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1,
 next_check_at INTEGER NOT NULL,
 last_message_id INTEGER NOT NULL DEFAULT 0,
 failures INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL
);
CREATE INDEX idx_web_push_due ON web_push_subscriptions(enabled,next_check_at);
CREATE INDEX idx_web_push_user ON web_push_subscriptions(user_id);
CREATE INDEX idx_web_push_session ON web_push_subscriptions(session_id);
