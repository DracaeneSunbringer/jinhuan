-- 永久同群答案指纹；明文答案仍只存在原红包的加密字段。
CREATE TABLE ldc_word_history (
 group_id INTEGER NOT NULL,
 answer_hash TEXT NOT NULL,
 packet_id TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(group_id,answer_hash)
) WITHOUT ROWID;
CREATE TABLE ldc_word_history_progress (
 group_id INTEGER PRIMARY KEY,
 last_at INTEGER NOT NULL DEFAULT 0,
 last_id TEXT NOT NULL DEFAULT '',
 complete INTEGER NOT NULL DEFAULT 0 CHECK(complete IN (0,1))
);
CREATE INDEX idx_ldc_word_backfill ON ldc_packets(group_id,created_at,packet_id);
