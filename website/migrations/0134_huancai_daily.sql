-- One row per closed 22:30 cycle; the draw and wallet credit share a transaction.
CREATE INDEX IF NOT EXISTS idx_huancai_orders_daily ON huancai_orders(created_at,user_id);
CREATE TABLE IF NOT EXISTS huancai_daily (
 day TEXT PRIMARY KEY,
 starts_at INTEGER NOT NULL,
 closes_at INTEGER NOT NULL,
 user_id INTEGER REFERENCES users(id),
 entrants INTEGER NOT NULL CHECK(entrants>=0),
 sales INTEGER NOT NULL CHECK(sales>=0),
 payout INTEGER NOT NULL CHECK(payout>=0 AND payout<=9007199254740991),
 draw_token TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL,
 CHECK((user_id IS NULL AND payout=0 AND entrants=0) OR (user_id IS NOT NULL AND entrants>0 AND payout=sales+52000))
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS huancai_daily_cursor (
 id INTEGER PRIMARY KEY CHECK(id=1),
 next_day TEXT NOT NULL
);
INSERT OR IGNORE INTO huancai_daily_cursor(id,next_day) VALUES(1,'2026-10-29');
CREATE TRIGGER IF NOT EXISTS huancai_daily_pay AFTER INSERT ON huancai_daily WHEN NEW.user_id IS NOT NULL BEGIN
 INSERT OR IGNORE INTO coin52_wallets(user_id,updated_at) VALUES(NEW.user_id,NEW.created_at);
 INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at)
 SELECT NEW.user_id,'huancai-daily',NEW.day,'daily:'||NEW.day,NEW.payout,balance+NEW.payout,NEW.created_at FROM coin52_wallets WHERE user_id=NEW.user_id;
 UPDATE coin52_wallets SET balance=balance+NEW.payout,revision=revision+1,updated_at=NEW.created_at WHERE user_id=NEW.user_id;
 SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'huancai_daily_wallet_missing') END;
END;
