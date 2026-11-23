-- Add aggregate lifetime weighting. No wallet, lot quantity, or expiry is changed.
ALTER TABLE farm_market_goods ADD COLUMN fresh_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE farm_market_goods ADD COLUMN fresh_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE farm_market_goods ADD COLUMN effective_qty INTEGER;
ALTER TABLE farm_market_ticks ADD COLUMN effective_qty INTEGER;
-- One bounded-by-existing-inventory upgrade pass, not a recurring scan.
WITH totals AS MATERIALIZED (
 SELECT item,SUM(quantity*(expires_at-CAST(strftime('%s','now') AS INTEGER))) AS seconds
 FROM farm_market_lots WHERE expired=0 AND quantity>0 GROUP BY item
)
UPDATE farm_market_goods SET fresh_at=CAST(strftime('%s','now') AS INTEGER),
 fresh_seconds=COALESCE((SELECT seconds FROM totals WHERE totals.item=farm_market_goods.item),0);
