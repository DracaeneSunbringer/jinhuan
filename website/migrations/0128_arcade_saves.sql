CREATE TABLE IF NOT EXISTS arcade_saves (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 game_id TEXT NOT NULL CHECK(game_id IN ('mole','rift')),
 revision INTEGER NOT NULL CHECK(revision>0),
 state TEXT NOT NULL CHECK(json_valid(state)),
 state_hash TEXT NOT NULL,
 operation TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 authority_version INTEGER NOT NULL DEFAULT 0 CHECK(authority_version IN (0,1)),
 rank_level INTEGER NOT NULL DEFAULT 1,
 rank_depth INTEGER NOT NULL DEFAULT 1,
 rank_actions INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,game_id)
);
CREATE INDEX IF NOT EXISTS idx_arcade_rank ON arcade_saves(game_id,rank_level DESC,rank_depth DESC,user_id);
CREATE TRIGGER IF NOT EXISTS arcade_no_retired_insert BEFORE INSERT ON arcade_saves
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'retired_account'); END;
CREATE TRIGGER IF NOT EXISTS arcade_no_retired_update BEFORE UPDATE ON arcade_saves
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'retired_account'); END;
