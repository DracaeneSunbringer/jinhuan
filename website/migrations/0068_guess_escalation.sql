ALTER TABLE ldc_packets ADD COLUMN escalation_every INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ldc_packets ADD COLUMN escalation_step_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ldc_packets ADD COLUMN escalation_cap_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ldc_packets ADD COLUMN base_total_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ldc_packets ADD COLUMN added_reward_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ldc_packets ADD COLUMN reward_finalized INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ldc_packets ADD COLUMN author_rule_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ldc_packets ADD COLUMN author_result_saved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ldc_packets ADD COLUMN hundred_reached INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guess_free_rounds ADD COLUMN author_rule_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guess_free_rounds ADD COLUMN author_result_saved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guess_free_rounds ADD COLUMN hundred_reached INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ldc_question_cache ADD COLUMN budget_reserved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guess_free_cache ADD COLUMN budget_reserved INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_ldc_pending_budget ON ldc_question_cache(packet_id,expires_at) WHERE state='pending' AND budget_reserved=1;
CREATE INDEX idx_free_pending_budget ON guess_free_cache(packet_id,expires_at) WHERE state='pending' AND budget_reserved=1;
CREATE INDEX idx_ldc_author_results ON ldc_packets(owner_id,created_at,packet_id) WHERE author_rule_version=1 AND author_result_saved=0;
CREATE INDEX idx_free_author_results ON guess_free_rounds(owner_id,created_at,packet_id) WHERE author_rule_version=1 AND author_result_saved=0;
CREATE INDEX idx_ldc_escalation_open ON ldc_packets(ends_at,packet_id) WHERE state='open' AND author_rule_version=1 AND mode IN('guess','clues');
CREATE INDEX idx_free_progress_open ON guess_free_rounds(ends_at,packet_id) WHERE state='open' AND author_rule_version=1;
CREATE INDEX idx_ldc_escalation_reserved ON ldc_awards(packet_id) WHERE state='reserved' AND attempts=0;
CREATE TABLE guess_reward_increases (
 packet_id TEXT NOT NULL REFERENCES ldc_packets(packet_id),stage INTEGER NOT NULL,
 added_cents INTEGER NOT NULL,total_cents INTEGER NOT NULL,created_at INTEGER NOT NULL,
 PRIMARY KEY(packet_id,stage)
) WITHOUT ROWID;
CREATE TABLE guess_author_policies (
 owner_id INTEGER PRIMARY KEY REFERENCES users(id),bad_streak INTEGER NOT NULL DEFAULT 0,
 good_streak INTEGER NOT NULL DEFAULT 0,restricted INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL
);
CREATE TABLE guess_author_results (
 packet_id TEXT PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),
 hundred_reached INTEGER NOT NULL,early_win INTEGER NOT NULL,created_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE TRIGGER trg_guess_escalation AFTER UPDATE OF added_reward_cents ON ldc_packets
WHEN NEW.added_reward_cents>OLD.added_reward_cents AND NEW.escalation_every>0
BEGIN
 UPDATE ldc_awards SET amount_cents=NEW.total_cents WHERE packet_id=NEW.packet_id AND (state='ready' AND recipient_id IS NULL OR state='reserved' AND attempts=0 AND sent_at IS NULL);
 INSERT INTO guess_reward_increases(packet_id,stage,added_cents,total_cents,created_at)
 VALUES(NEW.packet_id,(NEW.added_reward_cents+NEW.escalation_step_cents-1)/NEW.escalation_step_cents,NEW.added_reward_cents-OLD.added_reward_cents,NEW.total_cents,unixepoch());
 INSERT OR IGNORE INTO chat_messages(group_id,user_id,body,created_at,updated_at,system_kind,system_ref)
 SELECT NEW.group_id,NEW.owner_id,'本轮猜词追加 '||printf('%.2f',(NEW.added_reward_cents-OLD.added_reward_cents)/100.0)||' LDC，当前奖励 '||printf('%.2f',NEW.total_cents/100.0)||' LDC。中奖后按总额发放，到账以 Credit 为准。',unixepoch(),unixepoch(),'guess_reward_increase',NEW.packet_id||':'||NEW.added_reward_cents
 WHERE EXISTS(SELECT 1 FROM chat_redpacks r JOIN chat_messages m ON m.id=r.message_id WHERE r.id=NEW.packet_id AND m.deleted=0);
END;
CREATE TRIGGER trg_guess_author_result AFTER INSERT ON guess_author_results
BEGIN
 INSERT INTO guess_author_policies(owner_id,bad_streak,good_streak,restricted,updated_at)
 VALUES(NEW.owner_id,NEW.hundred_reached,0,0,NEW.created_at)
 ON CONFLICT(owner_id) DO UPDATE SET
 bad_streak=CASE WHEN NEW.hundred_reached=1 THEN MIN(2,bad_streak+1) ELSE 0 END,
 good_streak=CASE WHEN restricted=1 AND NEW.early_win=1 THEN MIN(2,good_streak+1) ELSE 0 END,
 restricted=CASE WHEN restricted=1 THEN CASE WHEN NEW.early_win=1 AND good_streak>=1 THEN 0 ELSE 1 END ELSE CASE WHEN NEW.hundred_reached=1 AND bad_streak>=1 THEN 1 ELSE 0 END END,
 updated_at=NEW.created_at;
 UPDATE ldc_packets SET author_result_saved=1 WHERE packet_id=NEW.packet_id;
 UPDATE guess_free_rounds SET author_result_saved=1 WHERE packet_id=NEW.packet_id;
END;
