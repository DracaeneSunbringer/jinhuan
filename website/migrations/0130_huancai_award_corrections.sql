-- Explicit operator corrections retain the original award and compensating ledger.
CREATE TABLE huancai_award_corrections (
 week TEXT PRIMARY KEY REFERENCES huancai_weekly(week),
 original_amount INTEGER NOT NULL CHECK(original_amount>0),
 replacement_amount INTEGER NOT NULL CHECK(replacement_amount>0 AND replacement_amount<original_amount),
 created_at INTEGER NOT NULL
);
CREATE TRIGGER huancai_award_correct AFTER INSERT ON huancai_award_corrections
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM huancai_weekly h JOIN coin52_wallets w ON w.user_id=h.user_id
  JOIN coin52_wealth e ON e.user_id=h.user_id JOIN huancai_jackpot p ON p.id=1
  WHERE h.week=NEW.week AND h.payout=NEW.original_amount AND w.balance>=NEW.original_amount
  AND e.earned>=NEW.original_amount AND p.paid>=NEW.original_amount
  AND EXISTS(SELECT 1 FROM coin52_ledger l WHERE l.user_id=h.user_id AND l.kind='huancai-weekly' AND l.ref=h.week AND l.delta=NEW.original_amount)
 ) THEN RAISE(ABORT,'award correction precondition changed') END;
 INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at)
 SELECT h.user_id,'huancai-award-reversal',NEW.week,'weekly-correction:reverse:'||NEW.week,-NEW.original_amount,w.balance-NEW.original_amount,NEW.created_at
 FROM huancai_weekly h JOIN coin52_wallets w ON w.user_id=h.user_id WHERE h.week=NEW.week;
 UPDATE coin52_wallets SET balance=balance-NEW.original_amount,revision=revision+1,updated_at=NEW.created_at WHERE user_id=(SELECT user_id FROM huancai_weekly WHERE week=NEW.week);
 UPDATE coin52_wealth SET earned=earned-NEW.original_amount,updated_at=NEW.created_at WHERE user_id=(SELECT user_id FROM huancai_weekly WHERE week=NEW.week);
 INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at)
 SELECT h.user_id,'huancai-award-reissue',NEW.week,'weekly-correction:reissue:'||NEW.week,NEW.replacement_amount,w.balance+NEW.replacement_amount,NEW.created_at
 FROM huancai_weekly h JOIN coin52_wallets w ON w.user_id=h.user_id WHERE h.week=NEW.week;
 UPDATE coin52_wallets SET balance=balance+NEW.replacement_amount,revision=revision+1,updated_at=NEW.created_at WHERE user_id=(SELECT user_id FROM huancai_weekly WHERE week=NEW.week);
 UPDATE huancai_jackpot SET available=available+NEW.original_amount-NEW.replacement_amount,paid=paid-NEW.original_amount+NEW.replacement_amount,updated_at=NEW.created_at WHERE id=1;
 UPDATE huancai_weekly SET payout=NEW.replacement_amount WHERE week=NEW.week;
 UPDATE chat_messages SET body=REPLACE(body,'获得 '||NEW.original_amount||' D币','获得 '||NEW.replacement_amount||' D币')||'（奖金已按新规则调整：原奖励已冲正，500万 D币已补发。）',edited_at=NEW.created_at,updated_at=NEW.created_at
 WHERE system_kind='huancai_draw' AND system_ref='huancai-weekly:'||NEW.week;
END;
