-- Authorized 2026-10-28 supplement: revised weekly first prize from 5m to 5.2m.
-- The unique ledger reference owns all side effects; replay cannot pay twice.
CREATE TRIGGER huancai_award_supplement AFTER INSERT ON coin52_ledger
WHEN NEW.kind='huancai-award-supplement'
BEGIN
 SELECT CASE WHEN NEW.delta!=200000 OR NOT EXISTS(
  SELECT 1 FROM huancai_weekly h JOIN coin52_wallets w ON w.user_id=h.user_id JOIN huancai_jackpot p ON p.id=1
  WHERE h.week=NEW.ref AND h.user_id=NEW.user_id AND h.payout=5000000
   AND NEW.balance_after=w.balance+NEW.delta AND p.available>=NEW.delta
   AND EXISTS(SELECT 1 FROM huancai_award_corrections c WHERE c.week=h.week AND c.replacement_amount=5000000)
 ) THEN RAISE(ABORT,'award supplement precondition changed') END;
 UPDATE coin52_wallets SET balance=balance+NEW.delta,revision=revision+1,updated_at=NEW.created_at WHERE user_id=NEW.user_id;
 UPDATE huancai_jackpot SET available=available-NEW.delta,paid=paid+NEW.delta,updated_at=NEW.created_at WHERE id=1;
 UPDATE huancai_weekly SET payout=payout+NEW.delta WHERE week=NEW.ref;
 UPDATE chat_messages SET body=REPLACE(REPLACE(body,'获得 5000000 D币','获得 5200000 D币'),'500万 D币已补发','520万 D币已补发'),edited_at=NEW.created_at,updated_at=NEW.created_at
 WHERE system_kind='huancai_draw' AND system_ref='huancai-weekly:'||NEW.ref;
END;
