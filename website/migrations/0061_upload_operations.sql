-- 短期回执与清理登记；不按内容跨用户去重，不修改已使用资源。
CREATE TABLE upload_operations (
 user_id INTEGER NOT NULL REFERENCES users(id),
 nonce TEXT NOT NULL,
 key TEXT NOT NULL UNIQUE,
 fingerprint TEXT NOT NULL,
 mime TEXT NOT NULL,
 size INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','ready','deleting')),
 lease_token TEXT NOT NULL DEFAULT '',
 lease_until INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 cleanup_after INTEGER NOT NULL,
 PRIMARY KEY(user_id,nonce)
);
CREATE INDEX idx_upload_operations_cleanup ON upload_operations(cleanup_after);
CREATE INDEX idx_upload_operations_user_time ON upload_operations(user_id,created_at);
CREATE INDEX idx_uploads_unused_time ON uploads(created_at) WHERE used=0;
CREATE TRIGGER trg_retired_upload_operations_ins BEFORE INSERT ON upload_operations
WHEN NEW.state='pending' AND EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER trg_retired_upload_operations_upd BEFORE UPDATE OF user_id ON upload_operations
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'account_retired'); END;
