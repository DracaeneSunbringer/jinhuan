-- Preserve all previous receipts and batches while extending the batch-size check.
CREATE TABLE instant_card_batches_next (
 user_id INTEGER NOT NULL REFERENCES users(id),
 request_id TEXT NOT NULL,
 owner_id INTEGER NOT NULL REFERENCES users(id),
 attempt TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL,
 count INTEGER NOT NULL CHECK(count IN(1,10,100)),
 finger_level INTEGER NOT NULL,
 results TEXT NOT NULL CHECK(json_valid(results)),
 pity_after INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,request_id)
) WITHOUT ROWID;
INSERT INTO instant_card_batches_next SELECT * FROM instant_card_batches;
DROP TABLE instant_card_batches;
ALTER TABLE instant_card_batches_next RENAME TO instant_card_batches;
CREATE INDEX idx_card_batches_owner ON instant_card_batches(owner_id,created_at);
CREATE TRIGGER card_batch_active BEFORE INSERT ON instant_card_batches WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id IN(NEW.user_id,NEW.owner_id)) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
