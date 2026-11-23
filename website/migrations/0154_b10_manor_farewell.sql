CREATE TABLE IF NOT EXISTS manor_farewell_batches (
 id TEXT PRIMARY KEY,
 closed_at INTEGER NOT NULL,
 initialized INTEGER NOT NULL DEFAULT 0 CHECK(initialized IN(0,1)),
 status TEXT NOT NULL DEFAULT 'settling' CHECK(status IN('settling','complete')),
 completed_at INTEGER
);
CREATE TABLE IF NOT EXISTS manor_farewell_recipients (
 batch_id TEXT NOT NULL REFERENCES manor_farewell_batches(id),
 user_id INTEGER NOT NULL REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','paid','skipped')),
 amount INTEGER CHECK(amount BETWEEN 0 AND 9007199254740991),
 details TEXT,
 state_snapshot TEXT,
 source_rev INTEGER,
 wallet_rev INTEGER,
 attempt TEXT UNIQUE,
 paid_at INTEGER,
 failures INTEGER NOT NULL DEFAULT 0,
 retry_at INTEGER NOT NULL DEFAULT 0,
 error TEXT,
 PRIMARY KEY(batch_id,user_id)
);
CREATE INDEX IF NOT EXISTS manor_farewell_pending ON manor_farewell_recipients(batch_id,status,retry_at,user_id);
