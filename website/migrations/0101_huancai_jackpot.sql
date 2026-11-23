-- Independent D-coin reserve. This is a one-time seed, never a daily refill.
CREATE TABLE huancai_jackpot (
 id INTEGER PRIMARY KEY CHECK(id=1),
 seed INTEGER NOT NULL DEFAULT 500000000 CHECK(seed=500000000),
 available INTEGER NOT NULL DEFAULT 500000000 CHECK(available BETWEEN 0 AND 9007199254740991),
 reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved BETWEEN 0 AND 9007199254740991),
 contributed INTEGER NOT NULL DEFAULT 0 CHECK(contributed BETWEEN 0 AND 9007198754740991),
 paid INTEGER NOT NULL DEFAULT 0 CHECK(paid BETWEEN 0 AND 9007199254740991),
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 CHECK(available+reserved+paid=seed+contributed)
);
INSERT INTO huancai_jackpot(id,created_at,updated_at) VALUES(1,unixepoch(),unixepoch());
ALTER TABLE huancai_rounds ADD COLUMN pool_paid INTEGER NOT NULL DEFAULT 0 CHECK(pool_paid>=0 AND (pool IS NULL OR pool_paid<=pool));
ALTER TABLE huancai_rounds ADD COLUMN pool_returned INTEGER NOT NULL DEFAULT 0 CHECK(pool_returned>=0);

-- Keep already drawn and imminent rounds on their purchased rules.
UPDATE huancai_rounds SET rules_version=3 WHERE state='open' AND rules_version=2 AND closes_at>unixepoch()+300;
UPDATE huancai_jackpot SET available=available+COALESCE((SELECT SUM(sales/10*8) FROM huancai_rounds WHERE rules_version=3),0),
 contributed=COALESCE((SELECT SUM(sales/10*8) FROM huancai_rounds WHERE rules_version=3),0) WHERE id=1;

-- Inside the same purchase transaction: retries/failures cannot fund the pool twice.
-- One extra row write per successful order, independent of its ticket count.
CREATE TRIGGER huancai_lotto_contribution AFTER UPDATE OF sales ON huancai_rounds
WHEN NEW.rules_version>=3 AND NEW.sales>OLD.sales BEGIN
 UPDATE huancai_jackpot SET available=available+(NEW.sales-OLD.sales)/10*8,
 contributed=contributed+(NEW.sales-OLD.sales)/10*8,updated_at=unixepoch() WHERE id=1;
 SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'huancai_jackpot_missing') END;
END;
