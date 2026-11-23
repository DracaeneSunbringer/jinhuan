CREATE TABLE IF NOT EXISTS novel_reading_progress (
 user_id INTEGER NOT NULL REFERENCES users(id), book_id TEXT NOT NULL,
 chapter INTEGER NOT NULL, paragraph INTEGER NOT NULL DEFAULT 0, offset REAL NOT NULL DEFAULT 0,
 settings TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,book_id)
);
CREATE TABLE IF NOT EXISTS novel_works (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL,
 premise TEXT NOT NULL DEFAULT '', characters TEXT NOT NULL DEFAULT '', mode TEXT NOT NULL DEFAULT 'write',
 revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_novel_works_user ON novel_works(user_id,updated_at DESC,id);
CREATE TABLE IF NOT EXISTS novel_draft_chapters (
 work_id TEXT NOT NULL REFERENCES novel_works(id) ON DELETE CASCADE, id INTEGER NOT NULL,
 title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL,
 PRIMARY KEY(work_id,id)
);
CREATE TABLE IF NOT EXISTS novel_ai_calls (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), state TEXT NOT NULL,
 result TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_novel_ai_calls_user ON novel_ai_calls(user_id,created_at DESC,id);
