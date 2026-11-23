CREATE TABLE instant_card_pools (
 title TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL REFERENCES users(id),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE TABLE instant_card_fingers (
 user_id INTEGER PRIMARY KEY REFERENCES users(id),
 level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 5),
 updated_at INTEGER NOT NULL
);
CREATE TABLE instant_card_receipts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id),
 owner_id INTEGER NOT NULL REFERENCES users(id),
 request_id TEXT NOT NULL,
 attempt TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL CHECK(kind IN ('draw','finger')),
 title TEXT NOT NULL REFERENCES instant_card_pools(title),
 price INTEGER NOT NULL CHECK(price BETWEEN 100 AND 9000),
 finger_level INTEGER NOT NULL CHECK(finger_level BETWEEN 0 AND 5),
 chance INTEGER NOT NULL CHECK(chance BETWEEN 5 AND 25),
 won INTEGER CHECK(won IN (0,1)),
 created_at INTEGER NOT NULL,
 UNIQUE(user_id,request_id),
 CHECK((kind='draw' AND price=100 AND won IS NOT NULL) OR (kind='finger' AND won IS NULL))
);
CREATE INDEX idx_instant_receipts_user ON instant_card_receipts(user_id,id DESC);
CREATE INDEX idx_instant_receipts_rate ON instant_card_receipts(user_id,created_at);
CREATE INDEX idx_instant_receipts_pool ON instant_card_receipts(title,id DESC);
CREATE INDEX idx_instant_receipts_owner ON instant_card_receipts(owner_id,id DESC);
CREATE TRIGGER instant_pool_active BEFORE INSERT ON instant_card_pools WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER instant_finger_active BEFORE INSERT ON instant_card_fingers WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER instant_receipt_active BEFORE INSERT ON instant_card_receipts WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id IN (NEW.user_id,NEW.owner_id)) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
