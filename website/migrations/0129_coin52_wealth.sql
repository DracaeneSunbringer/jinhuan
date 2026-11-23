-- One-time historical aggregation; rank reads use sorted summaries thereafter.
CREATE TABLE coin52_wealth (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 earned INTEGER NOT NULL DEFAULT 0 CHECK(earned>=0),
 updated_at INTEGER NOT NULL
);
INSERT INTO coin52_wealth(user_id,earned,updated_at)
 SELECT w.user_id,MAX(w.balance,COALESCE(SUM(CASE WHEN l.delta>0 AND l.kind NOT LIKE '%refund%' AND l.kind NOT LIKE '%return%' THEN l.delta ELSE 0 END),0)),unixepoch()
 FROM coin52_wallets w LEFT JOIN coin52_ledger l ON l.user_id=w.user_id GROUP BY w.user_id;
CREATE INDEX idx_coin52_wealth_rank ON coin52_wealth(earned DESC,user_id);
CREATE INDEX idx_coin52_wallet_rank ON coin52_wallets(balance DESC,user_id);
CREATE TRIGGER coin52_wealth_wallet AFTER INSERT ON coin52_wallets
BEGIN
 INSERT OR IGNORE INTO coin52_wealth(user_id,earned,updated_at) VALUES(NEW.user_id,NEW.balance,NEW.updated_at);
END;
CREATE TRIGGER coin52_wealth_remove_wallet AFTER DELETE ON coin52_wallets
BEGIN
 DELETE FROM coin52_wealth WHERE user_id=OLD.user_id;
END;
CREATE TRIGGER coin52_wealth_income AFTER INSERT ON coin52_ledger
WHEN NEW.delta>0 AND NEW.kind NOT LIKE '%refund%' AND NEW.kind NOT LIKE '%return%'
BEGIN
 INSERT INTO coin52_wealth(user_id,earned,updated_at) VALUES(NEW.user_id,NEW.delta,NEW.created_at)
 ON CONFLICT(user_id) DO UPDATE SET earned=MIN(9007199254740991,coin52_wealth.earned+excluded.earned),updated_at=excluded.updated_at;
END;
