CREATE TABLE huancai_rounds (
 day TEXT PRIMARY KEY, closes_at INTEGER NOT NULL, special INTEGER NOT NULL CHECK(special IN(0,1)),
 state TEXT NOT NULL DEFAULT 'open' CHECK(state IN('open','drawing','paid')),
 tickets INTEGER NOT NULL DEFAULT 0, sales INTEGER NOT NULL DEFAULT 0,
 front TEXT, back TEXT, weight_total INTEGER, pool INTEGER, token TEXT, settled_at INTEGER
) WITHOUT ROWID;
CREATE INDEX idx_huancai_due ON huancai_rounds(state,closes_at);
CREATE TABLE huancai_usage (
 user_id INTEGER NOT NULL REFERENCES users(id),day TEXT NOT NULL,
 lotto_count INTEGER NOT NULL DEFAULT 0,scratch_spent INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,day)
) WITHOUT ROWID;
CREATE TABLE huancai_orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('lotto','scratch')),signature TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>0),
 payload TEXT NOT NULL CHECK(json_valid(payload)),attempt TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,
 UNIQUE(user_id,request_id)
);
CREATE INDEX idx_huancai_orders_user ON huancai_orders(user_id,id DESC);
CREATE TABLE huancai_tickets (
 id TEXT PRIMARY KEY,day TEXT NOT NULL REFERENCES huancai_rounds(day),user_id INTEGER NOT NULL REFERENCES users(id),
 front TEXT NOT NULL,back TEXT NOT NULL,created_at INTEGER NOT NULL,
 weight INTEGER,payout INTEGER,settled_at INTEGER,attempt TEXT UNIQUE
) WITHOUT ROWID;
CREATE INDEX idx_huancai_tickets_due ON huancai_tickets(day,settled_at,id);
CREATE INDEX idx_huancai_tickets_user ON huancai_tickets(user_id,day DESC,id);
CREATE TRIGGER huancai_order_active BEFORE INSERT ON huancai_orders WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
