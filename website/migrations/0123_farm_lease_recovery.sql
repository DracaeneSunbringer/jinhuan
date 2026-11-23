-- One-time audit receipts for involuntary rerents after an owner buyback.
CREATE TABLE IF NOT EXISTS farm_lease_recoveries (
 lease_id TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL,
 tenant_id INTEGER NOT NULL,
 plot INTEGER NOT NULL,
 rent_refund INTEGER NOT NULL CHECK(rent_refund>=0),
 crop_coins INTEGER NOT NULL CHECK(crop_coins>=0),
 crop_state TEXT NOT NULL CHECK(json_valid(crop_state)),
 created_at INTEGER NOT NULL,
 CHECK(owner_id<>tenant_id),
 CHECK(plot>=0 AND plot<60),
 CHECK(typeof(rent_refund)='integer' AND typeof(crop_coins)='integer')
);
CREATE TRIGGER IF NOT EXISTS farm_lease_recovery_guard BEFORE INSERT ON farm_lease_recoveries
WHEN NOT EXISTS(SELECT 1 FROM farm_lease_recoveries WHERE lease_id=NEW.lease_id) BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM farm_leases l JOIN coin52_wallets o ON o.user_id=l.owner_id JOIN coin52_wallets t ON t.user_id=l.tenant_id
  WHERE l.id=NEW.lease_id AND l.owner_id=NEW.owner_id AND l.tenant_id=NEW.tenant_id AND l.plot=NEW.plot
   AND l.state='active' AND l.forced=1 AND l.price=NEW.rent_refund AND l.crop_state=NEW.crop_state
   AND o.balance>=NEW.rent_refund AND t.balance<=9007199254740991-NEW.rent_refund-NEW.crop_coins
   AND EXISTS(SELECT 1 FROM farm_lease_buybacks b WHERE b.owner_id=l.owner_id AND b.plot=l.plot AND b.created_at<=l.started_at)
 ) THEN RAISE(ABORT,'lease recovery state changed') END;
END;
CREATE TRIGGER IF NOT EXISTS farm_lease_recovery_settle AFTER INSERT ON farm_lease_recoveries BEGIN
 INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at)
 SELECT user_id,'farm-rerent-recovery',NEW.lease_id,'rerent-recovery-'||NEW.lease_id||'-'||user_id,
 CASE WHEN user_id=NEW.owner_id THEN -NEW.rent_refund ELSE NEW.rent_refund+NEW.crop_coins END,
 balance+CASE WHEN user_id=NEW.owner_id THEN -NEW.rent_refund ELSE NEW.rent_refund+NEW.crop_coins END,NEW.created_at
 FROM coin52_wallets WHERE user_id IN(NEW.owner_id,NEW.tenant_id);
 UPDATE coin52_wallets SET balance=balance+CASE WHEN user_id=NEW.owner_id THEN -NEW.rent_refund ELSE NEW.rent_refund+NEW.crop_coins END,revision=revision+1,updated_at=NEW.created_at WHERE user_id IN(NEW.owner_id,NEW.tenant_id);
 UPDATE farm_leases SET state='ended',crop_state='{"tilled":true}',revision=revision+1 WHERE id=NEW.lease_id;
 UPDATE farm_saves SET revision=revision+1 WHERE user_id IN(NEW.owner_id,NEW.tenant_id);
 DELETE FROM farm_lease_offers WHERE owner_id=NEW.owner_id AND plot=NEW.plot;
END;
