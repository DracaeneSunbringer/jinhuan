ALTER TABLE dm_messages ADD COLUMN media TEXT;
ALTER TABLE dm_messages ADD COLUMN reply_id INTEGER REFERENCES dm_messages(id);
ALTER TABLE dm_messages ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN(0,1));
ALTER TABLE dm_messages ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dm_messages ADD COLUMN request_hash TEXT;
CREATE INDEX idx_dm_messages_updates ON dm_messages(thread_id,updated_at,id);
CREATE TABLE dm_media_access (
 key TEXT PRIMARY KEY REFERENCES uploads(key),
 message_id INTEGER NOT NULL REFERENCES dm_messages(id)
) WITHOUT ROWID;
CREATE INDEX idx_dm_media_message ON dm_media_access(message_id);
