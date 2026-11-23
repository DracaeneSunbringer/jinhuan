ALTER TABLE chat_title_raffles ADD COLUMN paid_version INTEGER NOT NULL DEFAULT 0 CHECK(paid_version IN (0,1));
ALTER TABLE chat_title_raffle_entries ADD COLUMN boosts INTEGER NOT NULL DEFAULT 0 CHECK(boosts BETWEEN 0 AND 20);
ALTER TABLE chat_title_raffle_entries ADD COLUMN paid INTEGER NOT NULL DEFAULT 0 CHECK(paid BETWEEN 0 AND 2100);
ALTER TABLE chat_title_raffle_entries ADD COLUMN result INTEGER CHECK(result IN (0,1,2));
ALTER TABLE chat_title_raffle_entries ADD COLUMN result_token TEXT;
ALTER TABLE chat_title_raffle_entries ADD COLUMN refunded INTEGER NOT NULL DEFAULT 0 CHECK(refunded IN (0,1));
CREATE TABLE title_awards (
 user_id INTEGER NOT NULL REFERENCES users(id),
 title TEXT NOT NULL,
 source TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,title,source)
) WITHOUT ROWID;
CREATE INDEX idx_title_paid_pending ON chat_title_raffle_entries(raffle_id,result,user_id);
CREATE TRIGGER title_entry_refund AFTER UPDATE OF result ON chat_title_raffle_entries
WHEN NEW.result=2 AND OLD.result IS NULL AND NEW.paid>0 AND NEW.refunded=0 BEGIN
 INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at)
 SELECT NEW.user_id,'title-refund',NEW.raffle_id,'title-refund:'||NEW.raffle_id||':'||NEW.user_id,NEW.paid,balance+NEW.paid,unixepoch()
 FROM coin52_wallets WHERE user_id=NEW.user_id;
 UPDATE coin52_wallets SET balance=balance+NEW.paid,revision=revision+1,updated_at=unixepoch() WHERE user_id=NEW.user_id;
 UPDATE chat_title_raffle_entries SET refunded=1 WHERE raffle_id=NEW.raffle_id AND user_id=NEW.user_id;
END;
CREATE TRIGGER title_cancel_refund AFTER UPDATE OF status ON chat_title_raffles
WHEN NEW.paid_version=1 AND NEW.status='cancelled' AND OLD.status='open' BEGIN
 UPDATE chat_title_raffle_entries SET result=2 WHERE raffle_id=NEW.id AND result IS NULL;
END;
