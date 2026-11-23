-- Keep peak wealth monotonic without rewriting it on every below-peak income.
DROP TRIGGER IF EXISTS community_wealth_insert;
DROP TRIGGER IF EXISTS community_wealth_update;
CREATE TRIGGER community_wealth_insert AFTER INSERT ON coin52_wallets BEGIN
 INSERT INTO community_progress(user_id,metric,value) VALUES(NEW.user_id,'coins_peak',NEW.balance)
 ON CONFLICT(user_id,metric) DO UPDATE SET value=excluded.value WHERE community_progress.value<excluded.value;
END;
CREATE TRIGGER community_wealth_update AFTER UPDATE OF balance ON coin52_wallets WHEN NEW.balance>OLD.balance BEGIN
 INSERT INTO community_progress(user_id,metric,value) VALUES(NEW.user_id,'coins_peak',NEW.balance)
 ON CONFLICT(user_id,metric) DO UPDATE SET value=excluded.value WHERE community_progress.value<excluded.value;
END;
