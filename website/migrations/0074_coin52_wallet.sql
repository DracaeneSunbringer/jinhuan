CREATE TABLE coin52_wallets (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 balance INTEGER NOT NULL DEFAULT 0 CHECK(balance BETWEEN 0 AND 9007199254740991),
 revision INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL
);
CREATE TABLE coin52_ledger (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL,
 ref TEXT NOT NULL,
 attempt TEXT NOT NULL,
 delta INTEGER NOT NULL,
 balance_after INTEGER NOT NULL CHECK(balance_after BETWEEN 0 AND 9007199254740991),
 created_at INTEGER NOT NULL,
 UNIQUE(user_id,kind,ref),
 UNIQUE(user_id,attempt)
);
CREATE INDEX idx_coin52_ledger_user ON coin52_ledger(user_id,id DESC);
CREATE TABLE farm_migrations (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 version TEXT NOT NULL,
 original_revision INTEGER NOT NULL,
 original_state TEXT NOT NULL CHECK(json_valid(original_state)),
 imported_coins INTEGER NOT NULL,
 compensation INTEGER NOT NULL,
 attempt TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL
);
