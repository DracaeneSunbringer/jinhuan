ALTER TABLE title_awards ADD COLUMN levels INTEGER NOT NULL DEFAULT 1 CHECK(levels BETWEEN 1 AND 5200);
CREATE TABLE title_trials (
 user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL,
 level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 5200), expires_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,title)
) WITHOUT ROWID;
CREATE TABLE instant_card_limited_progress (
 user_id INTEGER PRIMARY KEY REFERENCES users(id), pity INTEGER NOT NULL DEFAULT 0 CHECK(pity BETWEEN 0 AND 119),
 draws INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_title_trials_expiry ON title_trials(expires_at);
ALTER TABLE huancai_rounds ADD COLUMN rules_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE huancai_rounds ADD COLUMN prize_counts TEXT;
CREATE TABLE community_progress (
 user_id INTEGER NOT NULL REFERENCES users(id), metric TEXT NOT NULL, value INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,metric)
) WITHOUT ROWID;
-- Preserve old receipts and assets. Only cached displayed levels are capped.
UPDATE users SET deco=json_set(deco,'$.fn',MIN(5200,MAX(1,CAST(json_extract(deco,'$.fn') AS INTEGER))))
 WHERE json_valid(deco) AND json_extract(deco,'$.ft') IS NOT NULL AND json_extract(deco,'$.fn')>5200;

-- New collections inherit the existing site-owner pool; no credentials or balances are changed.
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'mona',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'lace',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'giant',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'worship',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'muscle',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'deepseek',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'deepseekupgrade',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'maid',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'whalepunch',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'nightdevil',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'whalebuddy',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'gpt',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'claude',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'gemini',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'whitedragon',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'rascal',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'weirdo',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'blacksilk',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'loli',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'electric',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'blade',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'spear',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'sword',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'halberd',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'snow',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'moon',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'wind',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'flower',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'sun',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'star',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
INSERT OR IGNORE INTO instant_card_pools(title,owner_id,active,created_at,updated_at) SELECT 'cloud',owner_id,active,unixepoch(),unixepoch() FROM instant_card_pools WHERE title='whalebuddy';
CREATE INDEX idx_huancai_classify ON huancai_tickets(day,weight,id);
UPDATE huancai_rounds SET rules_version=2,special=0 WHERE state='open' AND tickets=0;
-- One-time indexed/account history reconstruction; live requests never rescan receipts.
INSERT OR IGNORE INTO community_progress(user_id,metric,value) SELECT user_id,'card_draws',COUNT(*) FROM instant_card_receipts WHERE kind='draw' GROUP BY user_id;
INSERT OR IGNORE INTO community_progress(user_id,metric,value) SELECT user_id,'card_wins',SUM(won) FROM instant_card_receipts WHERE kind='draw' GROUP BY user_id;
INSERT OR IGNORE INTO community_progress(user_id,metric,value) SELECT user_id,'card_dry',pity FROM instant_card_progress;
INSERT OR IGNORE INTO community_progress(user_id,metric,value) SELECT user_id,'coins_peak',balance FROM coin52_wallets;
INSERT OR IGNORE INTO community_progress(user_id,metric,value) SELECT user_id,'market_trades',COUNT(*) FROM farm_market_receipts GROUP BY user_id;
INSERT OR IGNORE INTO community_progress(user_id,metric,value) SELECT user_id,'market_sold',CAST(SUM(total_cents)/100 AS INTEGER) FROM farm_market_receipts WHERE kind='sell' GROUP BY user_id;
INSERT OR IGNORE INTO community_progress(user_id,metric,value) SELECT user_id,'scratch_draws',SUM(json_array_length(payload,'$.cards')) FROM huancai_orders WHERE kind='scratch' GROUP BY user_id;
INSERT OR IGNORE INTO community_progress(user_id,metric,value) SELECT o.user_id,'scratch_wins',COUNT(*) FROM huancai_orders o,json_each(o.payload,'$.cards') j WHERE o.kind='scratch' AND json_extract(j.value,'$.payout')>0 GROUP BY o.user_id;
INSERT OR IGNORE INTO community_progress(user_id,metric,value) SELECT o.user_id,'scratch_jackpot',COUNT(*) FROM huancai_orders o,json_each(o.payload,'$.cards') j WHERE o.kind='scratch' AND json_extract(j.value,'$.multiple')>=10 GROUP BY o.user_id;
INSERT OR IGNORE INTO community_progress(user_id,metric,value) SELECT user_id,'lotto_wins',COUNT(*) FROM huancai_tickets WHERE payout>0 AND settled_at IS NOT NULL GROUP BY user_id;

-- Record peak wealth at the balance source; no per-request history scans.
CREATE TRIGGER community_wealth_insert AFTER INSERT ON coin52_wallets BEGIN
 INSERT INTO community_progress(user_id,metric,value) VALUES(NEW.user_id,'coins_peak',NEW.balance)
 ON CONFLICT(user_id,metric) DO UPDATE SET value=MAX(value,excluded.value);
END;
CREATE TRIGGER community_wealth_update AFTER UPDATE OF balance ON coin52_wallets WHEN NEW.balance>OLD.balance BEGIN
 INSERT INTO community_progress(user_id,metric,value) VALUES(NEW.user_id,'coins_peak',NEW.balance)
 ON CONFLICT(user_id,metric) DO UPDATE SET value=MAX(value,excluded.value);
END;
