-- Deferred: apply only with the verified server-side game engines and their routes.
CREATE TABLE arcade_operations (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 game_id TEXT NOT NULL CHECK(game_id IN ('mole','rift')),
 operation TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 state_hash TEXT NOT NULL,
 attempt TEXT NOT NULL UNIQUE,
 delta INTEGER NOT NULL,
 balance_after INTEGER NOT NULL CHECK(balance_after BETWEEN 0 AND 9007199254740991),
 save_revision INTEGER NOT NULL CHECK(save_revision>0),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,game_id,operation)
);
CREATE INDEX IF NOT EXISTS idx_arcade_trusted_rank ON arcade_saves(game_id,rank_level DESC,rank_depth DESC,user_id) WHERE authority_version=1;
