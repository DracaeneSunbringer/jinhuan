CREATE TABLE instant_card_progress (
 user_id INTEGER PRIMARY KEY REFERENCES users(id),
 pity INTEGER NOT NULL DEFAULT 0 CHECK(pity BETWEEN 0 AND 119),
 draws INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE instant_card_batches (
 user_id INTEGER NOT NULL REFERENCES users(id),
 request_id TEXT NOT NULL,
 owner_id INTEGER NOT NULL REFERENCES users(id),
 attempt TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL,
 count INTEGER NOT NULL CHECK(count IN(1,10)),
 finger_level INTEGER NOT NULL,
 results TEXT NOT NULL CHECK(json_valid(results)),
 pity_after INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,request_id)
) WITHOUT ROWID;
CREATE INDEX idx_card_batches_owner ON instant_card_batches(owner_id,created_at);
ALTER TABLE instant_card_receipts ADD COLUMN batch_id TEXT;
ALTER TABLE instant_card_receipts ADD COLUMN reward_kind TEXT;
ALTER TABLE instant_card_receipts ADD COLUMN reward_id TEXT;
ALTER TABLE instant_card_receipts ADD COLUMN reward_amount INTEGER;
ALTER TABLE instant_card_receipts ADD COLUMN guaranteed INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_card_receipts_batch ON instant_card_receipts(user_id,batch_id,id);
CREATE INDEX idx_farm_lease_actions_actor ON farm_lease_actions(actor_id);
CREATE TRIGGER card_batch_active BEFORE INSERT ON instant_card_batches WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id IN(NEW.user_id,NEW.owner_id)) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
