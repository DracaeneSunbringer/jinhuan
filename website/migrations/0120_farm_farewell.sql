CREATE TABLE farm_farewell_batches (
 id TEXT PRIMARY KEY,closes_at INTEGER NOT NULL,created_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'settling' CHECK(status IN('settling','complete')),completed_at INTEGER
);
CREATE TABLE farm_farewell_recipients (
 batch_id TEXT NOT NULL REFERENCES farm_farewell_batches(id),user_id INTEGER NOT NULL REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','paid','skipped')),
 asset_coins INTEGER NOT NULL DEFAULT 0,bonus INTEGER NOT NULL DEFAULT 100000,
 details TEXT,state_snapshot TEXT,save_revision INTEGER,wallet_revision INTEGER,
 attempt TEXT UNIQUE,paid_at INTEGER,retry_at INTEGER NOT NULL DEFAULT 0,failures INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(batch_id,user_id)
);
CREATE INDEX idx_farm_farewell_pending ON farm_farewell_recipients(batch_id,retry_at,user_id) WHERE status='pending';
CREATE TABLE farm_farewell_prices (
 batch_id TEXT NOT NULL REFERENCES farm_farewell_batches(id),item TEXT NOT NULL,price_cents INTEGER NOT NULL CHECK(price_cents>0),
 PRIMARY KEY(batch_id,item)
);
CREATE TRIGGER farm_farewell_snapshot AFTER INSERT ON farm_farewell_batches BEGIN
 INSERT INTO farm_farewell_recipients(batch_id,user_id)
 SELECT NEW.id,id FROM users WHERE id>0 AND kind='user' AND disabled=0 AND created_at<=NEW.closes_at
 AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=users.id);
 INSERT INTO farm_farewell_prices(batch_id,item,price_cents)
 SELECT NEW.id,item,price_cents FROM farm_market_goods;
END;
