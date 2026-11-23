-- An additional permanent collection. Reuses the existing owner and availability;
-- no wallet, price, odds, pity or existing award is changed. Safe to run twice.
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at)
SELECT 'chickengun',owner_id,active,unixepoch(),unixepoch()
FROM instant_card_pools WHERE title='whalebuddy';
