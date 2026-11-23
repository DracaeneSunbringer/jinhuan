-- One-time, auditable daily-guarantee reroll. The correction is atomic through a D1 trigger.
CREATE TABLE IF NOT EXISTS huancai_daily_corrections (
 day TEXT PRIMARY KEY REFERENCES huancai_daily(day),
 original_user_id INTEGER NOT NULL REFERENCES users(id),
 replacement_user_id INTEGER NOT NULL REFERENCES users(id),
 original_amount INTEGER NOT NULL CHECK(original_amount>0),
 created_at INTEGER NOT NULL,
 CHECK(original_user_id<>replacement_user_id)
);

CREATE TRIGGER IF NOT EXISTS huancai_daily_correct AFTER INSERT ON huancai_daily_corrections
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM huancai_daily d
   JOIN coin52_wallets w ON w.user_id=d.user_id
   JOIN coin52_wealth e ON e.user_id=d.user_id
  WHERE d.day=NEW.day AND d.user_id=NEW.original_user_id AND d.payout=NEW.original_amount
    AND w.balance>=NEW.original_amount AND e.earned>=NEW.original_amount
    AND EXISTS(SELECT 1 FROM coin52_ledger l WHERE l.user_id=d.user_id AND l.kind='huancai-daily' AND l.ref=d.day AND l.delta=NEW.original_amount)
 ) THEN RAISE(ABORT,'huancai_daily_correction_precondition_changed') END;
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM users u
   JOIN coin52_wallets w ON w.user_id=u.id
  WHERE u.id=NEW.replacement_user_id AND u.kind='user' AND u.disabled=0
    AND EXISTS(SELECT 1 FROM chat_members WHERE group_id=1 AND user_id=u.id)
    AND NOT EXISTS(SELECT 1 FROM chat_bans WHERE group_id=1 AND user_id=u.id)
    AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=u.id)
    AND w.balance<=9007199254740991-NEW.original_amount
 ) THEN RAISE(ABORT,'huancai_daily_replacement_ineligible') END;
 INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at)
  SELECT NEW.original_user_id,'huancai-daily-reroll-reversal',NEW.day,'daily-reroll:reverse:'||NEW.day,-NEW.original_amount,w.balance-NEW.original_amount,NEW.created_at
  FROM coin52_wallets w WHERE w.user_id=NEW.original_user_id;
 UPDATE coin52_wallets SET balance=balance-NEW.original_amount,revision=revision+1,updated_at=NEW.created_at WHERE user_id=NEW.original_user_id;
 UPDATE coin52_wealth SET earned=earned-NEW.original_amount,updated_at=NEW.created_at WHERE user_id=NEW.original_user_id;
 INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at)
  SELECT NEW.replacement_user_id,'huancai-daily-reroll',NEW.day,'daily-reroll:reissue:'||NEW.day,NEW.original_amount,w.balance+NEW.original_amount,NEW.created_at
  FROM coin52_wallets w WHERE w.user_id=NEW.replacement_user_id;
 UPDATE coin52_wallets SET balance=balance+NEW.original_amount,revision=revision+1,updated_at=NEW.created_at WHERE user_id=NEW.replacement_user_id;
 UPDATE huancai_daily SET user_id=NEW.replacement_user_id WHERE day=NEW.day AND user_id=NEW.original_user_id;
 UPDATE chat_messages SET body=body||char(10)||'欢彩每日保底已重新抽取：原获奖账号不参与本次结果；新获奖账号为 '||COALESCE((SELECT nick FROM users WHERE id=NEW.replacement_user_id),(SELECT name FROM users WHERE id=NEW.replacement_user_id),(SELECT username FROM users WHERE id=NEW.replacement_user_id))||'，奖励已冲正并补发。',edited_at=NEW.created_at,updated_at=NEW.created_at
  WHERE system_kind='huancai_draw' AND system_ref='huancai-daily:'||NEW.day;
END;
