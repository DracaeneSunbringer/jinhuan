-- Incremental market foundation. Existing wallets and inventories are not rewritten.
CREATE TABLE farm_action_limits (
 user_id INTEGER PRIMARY KEY REFERENCES users(id),
 minute INTEGER NOT NULL,
 units INTEGER NOT NULL CHECK(units BETWEEN 1 AND 360)
);
CREATE TABLE farm_market_accounts (
 user_id INTEGER PRIMARY KEY REFERENCES users(id),
 remainder_cents INTEGER NOT NULL DEFAULT 0 CHECK(remainder_cents BETWEEN 0 AND 99),
 revision INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL
);
CREATE TABLE farm_market_goods (
 item TEXT PRIMARY KEY,
 base_cents INTEGER NOT NULL CHECK(base_cents>0),
 price_cents INTEGER NOT NULL CHECK(price_cents>0),
 fresh_qty INTEGER NOT NULL DEFAULT 0 CHECK(fresh_qty>=0),
 sold_flow INTEGER NOT NULL DEFAULT 0 CHECK(sold_flow>=0),
 bought_flow INTEGER NOT NULL DEFAULT 0 CHECK(bought_flow>=0),
 split_carry INTEGER NOT NULL DEFAULT 0 CHECK(split_carry BETWEEN 0 AND 9),
 tick_at INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE farm_market_lots (
 id TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL CHECK(owner_id>=0), -- 0 is the public shop
 item TEXT NOT NULL REFERENCES farm_market_goods(item),
 source TEXT NOT NULL CHECK(source IN ('grown','stolen','market')),
 quantity INTEGER NOT NULL CHECK(quantity>=0),
 locked_quantity INTEGER NOT NULL DEFAULT 0 CHECK(locked_quantity>=0 AND locked_quantity<=quantity),
 born_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at>born_at),
 cooldown_until INTEGER NOT NULL DEFAULT 0,
 expired INTEGER NOT NULL DEFAULT 0 CHECK(expired IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0,
 UNIQUE(owner_id,item,source,born_at,expires_at,cooldown_until,expired)
);
CREATE INDEX idx_farm_market_lots_owner ON farm_market_lots(owner_id,item,expires_at,id);
CREATE INDEX idx_farm_market_lots_page ON farm_market_lots(owner_id);
CREATE INDEX idx_farm_market_lots_expiry ON farm_market_lots(expires_at,id) WHERE expired=0 AND quantity>0;
CREATE TABLE farm_market_receipts (
 user_id INTEGER NOT NULL,
 request_id TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 attempt TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL,
 item TEXT,
 quantity INTEGER NOT NULL DEFAULT 0,
 total_cents INTEGER NOT NULL DEFAULT 0,
 result TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,request_id)
);
CREATE INDEX idx_farm_market_receipts_time ON farm_market_receipts(created_at);
CREATE INDEX idx_farm_market_receipts_user_time ON farm_market_receipts(user_id,created_at);
CREATE TABLE farm_market_ticks (
 item TEXT NOT NULL,
 tick_at INTEGER NOT NULL,
 price_cents INTEGER NOT NULL,
 fresh_qty INTEGER NOT NULL,
 sold INTEGER NOT NULL,
 bought INTEGER NOT NULL,
 PRIMARY KEY(item,tick_at)
);
CREATE INDEX idx_farm_market_ticks_time ON farm_market_ticks(tick_at);
INSERT OR IGNORE INTO site_settings(k,v,updated_at) VALUES('farm.market.enabled','off',strftime('%s','now'));
