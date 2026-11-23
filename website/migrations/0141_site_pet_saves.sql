CREATE TABLE IF NOT EXISTS pet_saves (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL CHECK(revision>0),
 state TEXT NOT NULL CHECK(json_valid(state)),
 state_hash TEXT NOT NULL,
 operation TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS pet_saves_no_retired_insert BEFORE INSERT ON pet_saves
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'retired_account'); END;
CREATE TRIGGER IF NOT EXISTS pet_saves_no_retired_update BEFORE UPDATE ON pet_saves
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'retired_account'); END;
