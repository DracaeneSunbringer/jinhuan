CREATE TABLE slime_saves (
 user_id INTEGER PRIMARY KEY REFERENCES users(id),
 revision INTEGER NOT NULL CHECK(revision>0),
 state TEXT NOT NULL CHECK(json_valid(state)),
 state_hash TEXT NOT NULL,
 operation TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TRIGGER trg_retired_slime_insert BEFORE INSERT ON slime_saves
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER trg_retired_slime_update BEFORE UPDATE ON slime_saves
WHEN NEW.user_id<>OLD.user_id OR EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'account_retired'); END;
