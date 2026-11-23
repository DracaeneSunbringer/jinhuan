DROP TRIGGER "fish_capacity_award_delete";

DROP TRIGGER "fish_capacity_award_insert";

DROP TRIGGER "fish_capacity_award_update";

DROP TRIGGER "fish_capacity_packet_insert";

DROP TRIGGER "fish_capacity_packet_update";

DROP TRIGGER "free_guess_single_active";

DROP TRIGGER "guess_close_vote_signal";

DROP TRIGGER "guess_explanation_enqueue";

DROP TRIGGER "guess_fish_room_update";

DROP TRIGGER "guess_luckybag_candidate_refresh";

DROP TRIGGER "guess_luckybag_question_insert";

DROP TRIGGER "guess_luckybag_question_update";

DROP TRIGGER "guess_luckybag_refresh";

DROP TRIGGER "guess_luckybag_round_closed";

DROP TRIGGER "guess_luckybag_seed";

DROP TRIGGER "guess_luckybag_winner";

DROP TRIGGER "guess_multi_growth";

DROP TRIGGER "guess_multi_last_winner";

DROP TRIGGER "guess_prediction_room_update";

DROP TRIGGER "guess_rate_snapshot";

DROP TRIGGER "guess_rate_winner";

DROP TRIGGER "guess_reward_freeze";

DROP TRIGGER "guess_room_signal_insert";

DROP TRIGGER "guess_room_signal_update";

DROP TRIGGER "guess_sidebar_winner_finalized";

DROP TRIGGER "guess_sidebar_winner_new";

DROP TRIGGER "guess_sidebar_winner_payment";

DROP TRIGGER "guess_stats_ldc_start";

DROP TRIGGER "ldc_block_free_active";

DROP TRIGGER "ldc_exclusive_award_insert";

DROP TRIGGER "ldc_exclusive_award_update";

DROP TRIGGER "ldc_exclusive_packet_shape_insert";

DROP TRIGGER "ldc_exclusive_packet_shape_update";

DROP TRIGGER "ldc_firstshot_honor";

DROP TRIGGER "ldc_packets_rate_close";

DROP TRIGGER "ldc_packets_retired_insert";

DROP TRIGGER "ldc_packets_retired_update";

DROP TRIGGER "ldc_questions_rate_insert";

DROP TRIGGER "ldc_questions_rate_update";

DROP TRIGGER "ldc_single_active";

DROP TRIGGER "packet_luck_close_signal";

DROP TRIGGER "packet_luck_enqueue";

DROP TRIGGER "packet_luck_unlock";

DROP TRIGGER "packet_notice_award";

DROP TRIGGER "packet_notice_close";

DROP TRIGGER "packet_notice_enqueue";

DROP TRIGGER "packet_sender_created";

DROP TRIGGER "packet_sender_paid_aggregate";

DROP TRIGGER "packet_sender_paid_insert";

DROP TRIGGER "packet_sender_paid_update";

DROP TRIGGER "trg_guess_author_result";

DROP TRIGGER "trg_guess_escalation";

DROP TRIGGER "trg_guess_win_reward";

DROP TRIGGER "trg_word_archive_paid_end";

DROP TRIGGER "trg_word_archive_paid_insert";

DROP VIEW "fish_capacity_source";

DROP VIEW "guess_sidebar_winner_snapshot";

DROP INDEX "idx_ldc_active_group";

DROP INDEX "idx_ldc_author_results";

DROP INDEX "idx_ldc_escalation_open";

DROP INDEX "idx_ldc_guess_due";

DROP INDEX "idx_ldc_guess_history";

DROP INDEX "idx_ldc_packet_owner";

DROP INDEX "idx_ldc_word_backfill";

CREATE TABLE ldc_amount_migration_0132 AS SELECT packet_id,total_cents FROM ldc_packets;

CREATE UNIQUE INDEX idx_ldc_amount_migration_0132 ON ldc_amount_migration_0132(packet_id);

ALTER TABLE ldc_packets DROP COLUMN total_cents;

ALTER TABLE ldc_packets ADD COLUMN total_cents INTEGER NOT NULL DEFAULT 1 CHECK(total_cents BETWEEN 1 AND CASE WHEN payment_provider='coin52' THEN 20000000 ELSE 200000 END);

UPDATE ldc_packets SET total_cents=(SELECT total_cents FROM ldc_amount_migration_0132 b WHERE b.packet_id=ldc_packets.packet_id);

DROP TABLE ldc_amount_migration_0132;

CREATE INDEX idx_ldc_active_group ON ldc_packets(group_id,ends_at) WHERE state='open' AND mode IN ('guess','clues');

CREATE INDEX idx_ldc_author_results ON ldc_packets(owner_id,created_at,packet_id) WHERE author_rule_version=1 AND author_result_saved=0;

CREATE INDEX idx_ldc_escalation_open ON ldc_packets(ends_at,packet_id) WHERE state='open' AND author_rule_version=1 AND mode IN('guess','clues');

CREATE INDEX idx_ldc_guess_due ON ldc_packets(ends_at,packet_id) WHERE state='open' AND mode IN('guess','clues');

CREATE INDEX idx_ldc_guess_history ON ldc_packets(group_id,created_at DESC,packet_id DESC) WHERE mode IN ('guess','clues');

CREATE INDEX idx_ldc_packet_owner ON ldc_packets(owner_id,state);

CREATE INDEX idx_ldc_word_backfill ON ldc_packets(group_id,created_at,packet_id);

CREATE VIEW fish_capacity_source AS
 SELECT p.packet_id,p.owner_id,p.client_id,p.ends_at,
 CASE WHEN p.state='open' AND COUNT(a.recipient_id)<p.count
 THEN MAX(0,MAX(p.total_cents,CASE WHEN p.reward_freeze_ai_count IS NULL THEN p.base_total_cents+p.escalation_cap_cents ELSE p.total_cents END)-COALESCE(SUM(CASE WHEN a.state='accepted' THEN a.amount_cents ELSE 0 END),0))
 ELSE COALESCE(SUM(CASE WHEN a.recipient_id IS NOT NULL AND a.state<>'accepted' THEN a.amount_cents ELSE 0 END),0) END AS reserved_cents,
 COALESCE(SUM(CASE WHEN a.recipient_id IS NOT NULL AND a.state<>'accepted' THEN a.amount_cents ELSE 0 END),0) AS unpaid_cents
 FROM ldc_packets p LEFT JOIN ldc_awards a ON a.packet_id=p.packet_id WHERE p.payment_provider='fish' GROUP BY p.packet_id;

CREATE VIEW guess_sidebar_winner_snapshot AS
SELECT a.id AS award_id,a.recipient_id AS user_id,
 json_object('version',1,'message_id',r.message_id,'rank',a.slot+1,
 'amount_cents',CASE WHEN p.escalation_every=0 OR p.reward_finalized=1 THEN a.amount_cents ELSE NULL END,
 'payment_provider',p.payment_provider,'state',a.state,
 'needs_fish_setup',CASE WHEN p.payment_provider='fish' AND a.state='rejected' AND a.payment_error='RECIPIENT_NOT_FOUND' THEN 1 ELSE 0 END,
 'remaining_slots',MAX(0,p.count-a.slot-1),
 'remaining_cents',CASE WHEN p.escalation_every=0 OR p.reward_finalized=1 THEN
   MAX(0,p.total_cents-COALESCE((SELECT SUM(w.amount_cents) FROM ldc_awards w WHERE w.packet_id=a.packet_id AND w.purpose='winner' AND w.slot<=a.slot),0)) ELSE NULL END) AS payload
FROM ldc_awards a JOIN ldc_packets p ON p.packet_id=a.packet_id JOIN chat_redpacks r ON r.id=p.packet_id
WHERE p.group_id=1 AND p.mode IN ('guess','clues') AND a.purpose='winner' AND a.recipient_id IS NOT NULL;

CREATE TRIGGER fish_capacity_award_delete AFTER DELETE ON ldc_awards WHEN EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=OLD.packet_id AND payment_provider='fish') BEGIN
 DELETE FROM fish_packet_capacity WHERE packet_id=OLD.packet_id;
 INSERT INTO fish_packet_capacity SELECT * FROM fish_capacity_source WHERE packet_id=OLD.packet_id AND (reserved_cents>0 OR unpaid_cents>0);
 END;

CREATE TRIGGER fish_capacity_award_insert AFTER INSERT ON ldc_awards WHEN EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id AND payment_provider='fish') BEGIN
 DELETE FROM fish_packet_capacity WHERE packet_id=NEW.packet_id;
 INSERT INTO fish_packet_capacity SELECT * FROM fish_capacity_source WHERE packet_id=NEW.packet_id AND (reserved_cents>0 OR unpaid_cents>0);
 END;

CREATE TRIGGER fish_capacity_award_update AFTER UPDATE OF state,recipient_id,amount_cents ON ldc_awards WHEN EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id AND payment_provider='fish') BEGIN
 DELETE FROM fish_packet_capacity WHERE packet_id=NEW.packet_id;
 INSERT INTO fish_packet_capacity SELECT * FROM fish_capacity_source WHERE packet_id=NEW.packet_id AND (reserved_cents>0 OR unpaid_cents>0);
 END;

CREATE TRIGGER fish_capacity_packet_insert AFTER INSERT ON ldc_packets WHEN NEW.payment_provider='fish' BEGIN
 DELETE FROM fish_packet_capacity WHERE packet_id=NEW.packet_id;
 INSERT INTO fish_packet_capacity SELECT * FROM fish_capacity_source WHERE packet_id=NEW.packet_id AND (reserved_cents>0 OR unpaid_cents>0);
 END;

CREATE TRIGGER fish_capacity_packet_update AFTER UPDATE OF state,total_cents,base_total_cents,escalation_cap_cents,reward_freeze_ai_count,ends_at,payment_provider ON ldc_packets WHEN NEW.payment_provider='fish' OR OLD.payment_provider='fish' BEGIN
 DELETE FROM fish_packet_capacity WHERE packet_id=NEW.packet_id;
 INSERT INTO fish_packet_capacity SELECT * FROM fish_capacity_source WHERE packet_id=NEW.packet_id AND (reserved_cents>0 OR unpaid_cents>0);
 END;

CREATE TRIGGER free_guess_single_active BEFORE INSERT ON guess_free_rounds
WHEN NOT EXISTS(SELECT 1 FROM guess_free_rounds WHERE packet_id=NEW.packet_id) AND (
 EXISTS(SELECT 1 FROM guess_free_rounds WHERE group_id=NEW.group_id AND state='open' AND winner_id IS NULL AND ends_at>NEW.created_at) OR
 EXISTS(SELECT 1 FROM ldc_packets p WHERE p.group_id=NEW.group_id AND p.state='open' AND p.mode IN('guess','clues') AND p.ends_at>NEW.created_at
 AND (SELECT count(*) FROM ldc_awards a WHERE a.packet_id=p.packet_id AND a.recipient_id IS NOT NULL)<p.count))
BEGIN SELECT RAISE(ABORT,'ldc_active_game'); END;

CREATE TRIGGER guess_close_vote_signal AFTER UPDATE OF choice ON guess_close_electors
WHEN OLD.choice IS NULL AND NEW.choice IS NOT NULL BEGIN
 UPDATE chat_messages SET updated_at=unixepoch() WHERE id=(SELECT message_id FROM chat_redpacks WHERE id=NEW.packet_id);
 UPDATE ldc_packets SET room_revision=room_revision+1 WHERE packet_id=NEW.packet_id;
 UPDATE guess_free_rounds SET room_revision=room_revision+1 WHERE packet_id=NEW.packet_id;
END;

CREATE TRIGGER guess_explanation_enqueue AFTER INSERT ON chat_messages
WHEN NEW.system_kind IN('ldc_winner','ldc_expired','ldc_cancel') AND NEW.deleted=0 BEGIN
 INSERT OR IGNORE INTO guess_answer_explanations(packet_id,notice_id,next_at)
 SELECT r.id,NEW.id,NEW.created_at FROM chat_redpacks r
 WHERE r.message_id=CAST(NEW.system_ref AS INTEGER) AND (
 EXISTS(SELECT 1 FROM ldc_packets p WHERE p.packet_id=r.id AND p.mode IN('guess','clues')) OR
 EXISTS(SELECT 1 FROM guess_free_rounds p WHERE p.packet_id=r.id));
END;

CREATE TRIGGER guess_fish_room_update AFTER UPDATE OF state ON guess_fish_orders WHEN OLD.state<>NEW.state BEGIN
 UPDATE ldc_packets SET room_revision=room_revision+1 WHERE packet_id=(SELECT packet_id FROM guess_prediction_bets WHERE id=NEW.bet_id);
 UPDATE guess_free_rounds SET room_revision=room_revision+1 WHERE packet_id=(SELECT packet_id FROM guess_prediction_bets WHERE id=NEW.bet_id);
 UPDATE chat_messages SET updated_at=unixepoch() WHERE id=(SELECT r.message_id FROM chat_redpacks r JOIN guess_prediction_bets b ON b.packet_id=r.id WHERE b.id=NEW.bet_id);
END;

CREATE TRIGGER guess_luckybag_candidate_refresh AFTER INSERT ON guess_luckybag_candidates BEGIN
 UPDATE ldc_packets SET room_revision=room_revision+1 WHERE packet_id=NEW.packet_id;
END;

CREATE TRIGGER guess_luckybag_question_insert AFTER INSERT ON ldc_questions
 WHEN (NEW.kind='guess' AND ((NEW.score BETWEEN 0 AND 100 AND NEW.verdict IN('similarity','correct')) OR NEW.verdict='no')) OR (NEW.kind='question' AND NEW.verdict IN('yes','no'))
 BEGIN
 INSERT OR IGNORE INTO guess_luckybag_candidates(packet_id,user_id,qualified_at)
 SELECT NEW.packet_id,NEW.user_id,unixepoch() FROM guess_luckybags b JOIN ldc_packets p ON p.packet_id=b.packet_id
 JOIN users u ON u.id=NEW.user_id JOIN chat_members cm ON cm.user_id=u.id AND cm.group_id=p.group_id
 WHERE b.packet_id=NEW.packet_id AND b.state IN('pending','scheduled','open') AND p.state='open' AND p.ends_at>unixepoch()
 AND u.disabled=0 AND u.kind='user' AND u.id<>p.owner_id
 AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM chat_bans WHERE user_id=u.id AND group_id=p.group_id)
 AND ((NEW.source_room_id IS NOT NULL AND EXISTS(SELECT 1 FROM guess_room_messages s WHERE s.id=NEW.source_room_id AND s.packet_id=p.packet_id AND s.user_id=u.id AND s.body=NEW.source_body AND s.deleted=0 AND s.created_at>=cm.joined_at))
 OR (NEW.source_room_id IS NULL AND EXISTS(SELECT 1 FROM chat_messages s WHERE s.id=NEW.source_message_id AND s.group_id=p.group_id AND s.user_id=u.id AND s.body=NEW.source_body AND s.deleted=0 AND s.created_at>=cm.joined_at)))
 AND (SELECT COUNT(*) FROM guess_luckybag_candidates WHERE packet_id=b.packet_id)<1000;
END;

CREATE TRIGGER guess_luckybag_question_update AFTER UPDATE OF verdict,score ON ldc_questions
 WHEN (NEW.kind='guess' AND ((NEW.score BETWEEN 0 AND 100 AND NEW.verdict IN('similarity','correct')) OR NEW.verdict='no')) OR (NEW.kind='question' AND NEW.verdict IN('yes','no'))
 BEGIN
 INSERT OR IGNORE INTO guess_luckybag_candidates(packet_id,user_id,qualified_at)
 SELECT NEW.packet_id,NEW.user_id,unixepoch() FROM guess_luckybags b JOIN ldc_packets p ON p.packet_id=b.packet_id
 JOIN users u ON u.id=NEW.user_id JOIN chat_members cm ON cm.user_id=u.id AND cm.group_id=p.group_id
 WHERE b.packet_id=NEW.packet_id AND b.state IN('pending','scheduled','open') AND p.state='open' AND p.ends_at>unixepoch()
 AND u.disabled=0 AND u.kind='user' AND u.id<>p.owner_id
 AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM chat_bans WHERE user_id=u.id AND group_id=p.group_id)
 AND ((NEW.source_room_id IS NOT NULL AND EXISTS(SELECT 1 FROM guess_room_messages s WHERE s.id=NEW.source_room_id AND s.packet_id=p.packet_id AND s.user_id=u.id AND s.body=NEW.source_body AND s.deleted=0 AND s.created_at>=cm.joined_at))
 OR (NEW.source_room_id IS NULL AND EXISTS(SELECT 1 FROM chat_messages s WHERE s.id=NEW.source_message_id AND s.group_id=p.group_id AND s.user_id=u.id AND s.body=NEW.source_body AND s.deleted=0 AND s.created_at>=cm.joined_at)))
 AND (SELECT COUNT(*) FROM guess_luckybag_candidates WHERE packet_id=b.packet_id)<1000;
END;

CREATE TRIGGER guess_luckybag_refresh AFTER UPDATE OF state ON guess_luckybags WHEN NEW.state<>OLD.state BEGIN
 UPDATE ldc_packets SET room_revision=room_revision+1 WHERE packet_id=NEW.packet_id;
END;

CREATE TRIGGER guess_luckybag_round_closed AFTER UPDATE OF state ON ldc_packets WHEN NEW.state='closed' BEGIN
 UPDATE guess_luckybags SET state=CASE WHEN state='open' THEN 'closing' ELSE 'skipped' END,ended_at=unixepoch(),reason=CASE WHEN state='open' THEN NULL ELSE 'ended_before_appearance' END
 WHERE packet_id=NEW.packet_id AND state IN('pending','scheduled','open');
END;

CREATE TRIGGER guess_luckybag_seed AFTER INSERT ON ldc_packets
 WHEN NEW.mode IN('guess','clues') AND NEW.state='open'
 BEGIN
 INSERT INTO guess_luckybags(packet_id,sponsor_id,probability_bps,min_total,max_total,created_at)
 SELECT NEW.packet_id,sponsor_id,probability_bps,min_total,max_total,NEW.created_at FROM guess_luckybag_config
 WHERE id=1 AND enabled=1 AND NEW.created_at>=activated_at;
END;

CREATE TRIGGER guess_luckybag_winner AFTER UPDATE OF recipient_id ON ldc_awards
 WHEN NEW.recipient_id IS NOT NULL AND OLD.recipient_id IS NULL AND NEW.purpose='winner'
 BEGIN
 INSERT OR IGNORE INTO guess_luckybag_candidates(packet_id,user_id,qualified_at)
 SELECT b.packet_id,NEW.recipient_id,unixepoch() FROM guess_luckybags b JOIN ldc_packets p ON p.packet_id=b.packet_id
 JOIN users u ON u.id=NEW.recipient_id JOIN chat_members cm ON cm.user_id=u.id AND cm.group_id=p.group_id
 WHERE b.packet_id=NEW.packet_id AND b.state IN('pending','scheduled','open','closing') AND p.ends_at>unixepoch()
 AND u.disabled=0 AND u.kind='user' AND u.id<>p.owner_id
 AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM chat_bans WHERE user_id=u.id AND group_id=p.group_id)
 AND (SELECT COUNT(*) FROM guess_luckybag_candidates WHERE packet_id=b.packet_id)<1000;
 UPDATE guess_luckybags SET state=CASE WHEN state='open' THEN 'closing' ELSE 'skipped' END,ended_at=unixepoch(),reason=CASE WHEN state='open' THEN NULL ELSE 'ended_before_appearance' END
 WHERE packet_id=NEW.packet_id AND state IN('pending','scheduled','open') AND
 (SELECT COUNT(*) FROM ldc_awards WHERE packet_id=NEW.packet_id AND recipient_id IS NOT NULL)>=(SELECT count FROM ldc_packets WHERE packet_id=NEW.packet_id);
END;

CREATE TRIGGER guess_multi_growth AFTER UPDATE OF recipient_id ON ldc_awards
WHEN NEW.purpose='winner' AND OLD.recipient_id IS NULL AND NEW.recipient_id IS NOT NULL AND NEW.slot>0 AND EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id AND mode IN('guess','clues') AND count>1)
BEGIN

 INSERT INTO user_badges(user_id,badge,n,first_at,last_day) VALUES(NEW.recipient_id,'guess',1,unixepoch(),date(unixepoch(),'unixepoch','+8 hours'))
 ON CONFLICT(user_id,badge) DO UPDATE SET n=n+1,last_day=excluded.last_day;
 INSERT OR IGNORE INTO user_unlocks(user_id,item,at)
 SELECT NEW.recipient_id,'guess:'||level,unixepoch() FROM (SELECT 1 AS level,1 AS wins UNION ALL SELECT 2,3 UNION ALL SELECT 3,10 UNION ALL SELECT 4,30 UNION ALL SELECT 5,100)
 WHERE wins<=(SELECT n FROM user_badges WHERE user_id=NEW.recipient_id AND badge='guess');
 UPDATE users SET deco=json_set(deco,'$.bn',(SELECT n FROM user_badges WHERE user_id=NEW.recipient_id AND badge='guess'))
 WHERE id=NEW.recipient_id AND json_valid(deco) AND json_extract(deco,'$.bd')='guess';
 INSERT OR IGNORE INTO chat_messages(group_id,user_id,body,created_at,updated_at,system_kind,system_ref)
 SELECT m.group_id,NEW.recipient_id,COALESCE(u.nick,u.name,u.username)||' 猜词累计获胜 '||b.n||' 次，升至 LV.'||r.level||'「'||r.title||'」！已解锁本级称号、徽章和气泡，可在装扮中自行选择。',unixepoch(),unixepoch(),'guess_level',CAST(NEW.recipient_id AS TEXT)||':'||r.level
 FROM chat_redpacks p JOIN chat_messages m ON m.id=p.message_id JOIN users u ON u.id=NEW.recipient_id JOIN user_badges b ON b.user_id=u.id AND b.badge='guess'
 JOIN (SELECT 1 AS level,1 AS wins,'猜词新星' AS title UNION ALL SELECT 2,3,'识词达人' UNION ALL SELECT 3,10,'灵感猎手' UNION ALL SELECT 4,30,'谜语大师' UNION ALL SELECT 5,100,'猜词王者') r ON r.wins=b.n
 WHERE p.id=NEW.packet_id;

 INSERT INTO guess_group_stats(group_id,day,rounds,wins)
 SELECT m.group_id,'*',0,1 FROM chat_redpacks r JOIN chat_messages m ON m.id=r.message_id WHERE r.id=NEW.packet_id
 ON CONFLICT(group_id,day) DO UPDATE SET wins=wins+1;
 INSERT INTO guess_group_stats(group_id,day,rounds,wins)
 SELECT m.group_id,date(unixepoch(),'unixepoch','+8 hours'),0,1 FROM chat_redpacks r JOIN chat_messages m ON m.id=r.message_id WHERE r.id=NEW.packet_id
 ON CONFLICT(group_id,day) DO UPDATE SET wins=wins+1;
 INSERT INTO guess_group_player_stats(group_id,day,user_id,wins,last_at)
 SELECT m.group_id,'*',NEW.recipient_id,1,unixepoch() FROM chat_redpacks r JOIN chat_messages m ON m.id=r.message_id WHERE r.id=NEW.packet_id
 ON CONFLICT(group_id,day,user_id) DO UPDATE SET wins=wins+1,last_at=MAX(last_at,unixepoch());
 INSERT INTO guess_group_player_stats(group_id,day,user_id,wins,last_at)
 SELECT m.group_id,date(unixepoch(),'unixepoch','+8 hours'),NEW.recipient_id,1,unixepoch() FROM chat_redpacks r JOIN chat_messages m ON m.id=r.message_id WHERE r.id=NEW.packet_id
 ON CONFLICT(group_id,day,user_id) DO UPDATE SET wins=wins+1,last_at=MAX(last_at,unixepoch());
END;

CREATE TRIGGER guess_multi_last_winner AFTER UPDATE OF recipient_id ON ldc_awards
WHEN NEW.purpose='winner' AND OLD.recipient_id IS NULL AND NEW.recipient_id IS NOT NULL
 AND EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id AND count>1 AND mode IN('guess','clues'))
BEGIN
 INSERT OR IGNORE INTO guess_rate_participants VALUES(NEW.packet_id,NEW.recipient_id);
 UPDATE ldc_packets SET state='closed',room_revision=room_revision+1
 WHERE packet_id=NEW.packet_id AND state='open' AND NOT EXISTS(SELECT 1 FROM ldc_awards WHERE packet_id=NEW.packet_id AND recipient_id IS NULL);
END;

CREATE TRIGGER guess_prediction_room_update AFTER UPDATE OF state,settlement_token ON guess_prediction_pools WHEN OLD.state<>NEW.state OR OLD.settlement_token IS NOT NEW.settlement_token BEGIN
 UPDATE ldc_packets SET room_revision=room_revision+1 WHERE packet_id=NEW.packet_id;
 UPDATE guess_free_rounds SET room_revision=room_revision+1 WHERE packet_id=NEW.packet_id;
 UPDATE chat_messages SET updated_at=unixepoch() WHERE id=(SELECT message_id FROM chat_redpacks WHERE id=NEW.packet_id);
END;

CREATE TRIGGER guess_rate_snapshot AFTER INSERT ON guess_rate_rounds BEGIN
 INSERT INTO guess_rate_coverage(group_id,since,rounds) VALUES(NEW.group_id,NEW.ended_at,1)
 ON CONFLICT(group_id) DO UPDATE SET since=MIN(COALESCE(since,excluded.since),excluded.since),rounds=rounds+1;
 INSERT INTO guess_rate_stats(group_id,day,user_id,rounds,wins)
 SELECT NEW.group_id,d.day,p.user_id,1,CASE WHEN p.user_id=NEW.winner_id OR EXISTS(SELECT 1 FROM ldc_awards a JOIN ldc_packets g ON g.packet_id=a.packet_id WHERE a.packet_id=p.packet_id AND a.recipient_id=p.user_id AND a.purpose='winner' AND g.count>1 AND g.mode IN('guess','clues')) THEN 1 ELSE 0 END
 FROM guess_rate_participants p JOIN (SELECT NEW.day day UNION ALL SELECT '*') d WHERE p.packet_id=NEW.packet_id
 ON CONFLICT(group_id,day,user_id) DO UPDATE SET rounds=rounds+1,wins=wins+excluded.wins;
END;

CREATE TRIGGER guess_rate_winner AFTER INSERT ON guess_wins BEGIN
 INSERT OR IGNORE INTO guess_rate_participants VALUES(NEW.packet_id,NEW.user_id);
 INSERT OR IGNORE INTO guess_rate_rounds
 SELECT NEW.packet_id,p.group_id,date(NEW.created_at,'unixepoch','+8 hours'),NEW.created_at,NEW.user_id,'live'
 FROM (SELECT packet_id,group_id,game_version FROM ldc_packets WHERE count=1 UNION ALL SELECT packet_id,group_id,game_version FROM guess_free_rounds) p
 WHERE p.packet_id=NEW.packet_id AND p.game_version=1 AND NOT EXISTS(SELECT 1 FROM guess_rate_exclusions WHERE packet_id=NEW.packet_id);
END;

CREATE TRIGGER guess_reward_freeze AFTER UPDATE OF recipient_id ON ldc_awards
WHEN NEW.purpose='winner' AND OLD.recipient_id IS NULL AND NEW.recipient_id IS NOT NULL AND NEW.slot=0 BEGIN
 UPDATE ldc_packets SET reward_freeze_ai_count=ai_count WHERE packet_id=NEW.packet_id AND mode IN('guess','clues') AND reward_freeze_ai_count IS NULL;
END;

CREATE TRIGGER guess_room_signal_insert AFTER INSERT ON guess_room_messages
BEGIN
 UPDATE ldc_packets SET room_revision=room_revision+1 WHERE packet_id=NEW.packet_id;
 UPDATE chat_messages SET updated_at=MAX(updated_at,NEW.updated_at) WHERE id=(SELECT message_id FROM chat_redpacks WHERE id=NEW.packet_id);
END;

CREATE TRIGGER guess_room_signal_update AFTER UPDATE OF ai_text,ai_score,ai_status,deleted ON guess_room_messages
WHEN OLD.ai_text IS NOT NEW.ai_text OR OLD.ai_score IS NOT NEW.ai_score OR OLD.ai_status IS NOT NEW.ai_status OR OLD.deleted<>NEW.deleted
BEGIN
 UPDATE ldc_packets SET room_revision=room_revision+1 WHERE packet_id=NEW.packet_id;
 UPDATE chat_messages SET updated_at=MAX(updated_at,NEW.updated_at) WHERE id=(SELECT message_id FROM chat_redpacks WHERE id=NEW.packet_id);
END;

CREATE TRIGGER guess_sidebar_winner_finalized AFTER UPDATE OF reward_finalized ON ldc_packets
WHEN OLD.reward_finalized IS NOT NEW.reward_finalized AND NEW.reward_finalized=1
BEGIN
 UPDATE guess_sidebar_messages SET system_data=(SELECT payload FROM guess_sidebar_winner_snapshot WHERE award_id=system_ref),updated_at=unixepoch()
 WHERE system_kind='guess_winner' AND system_ref IN (SELECT id FROM ldc_awards WHERE packet_id=NEW.packet_id AND purpose='winner' AND recipient_id IS NOT NULL)
 AND created_at>=(CAST((unixepoch()+28800)/86400 AS INTEGER)*86400-28800)
 AND EXISTS(SELECT 1 FROM guess_sidebar_winner_snapshot WHERE award_id=system_ref AND payload<>guess_sidebar_messages.system_data);
END;

CREATE TRIGGER guess_sidebar_winner_new AFTER UPDATE OF recipient_id ON ldc_awards
WHEN OLD.recipient_id IS NULL AND NEW.recipient_id IS NOT NULL AND NEW.purpose='winner'
BEGIN
 INSERT OR IGNORE INTO guess_sidebar_messages(user_id,body,nonce,created_at,updated_at,system_kind,system_ref,system_data)
 SELECT user_id,'猜中了本轮，奖励和剩余名额见系统记录。','system:guess-winner:'||award_id,unixepoch(),unixepoch(),'guess_winner',award_id,payload
 FROM guess_sidebar_winner_snapshot WHERE award_id=NEW.id;
END;

CREATE TRIGGER guess_sidebar_winner_payment AFTER UPDATE OF state,amount_cents,payment_error ON ldc_awards
WHEN NEW.recipient_id IS NOT NULL AND NEW.purpose='winner' AND (OLD.state IS NOT NEW.state OR OLD.amount_cents IS NOT NEW.amount_cents OR OLD.payment_error IS NOT NEW.payment_error)
BEGIN
 UPDATE guess_sidebar_messages SET system_data=(SELECT payload FROM guess_sidebar_winner_snapshot WHERE award_id=NEW.id),updated_at=unixepoch()
 WHERE system_kind='guess_winner' AND system_ref=NEW.id
 AND created_at>=(CAST((unixepoch()+28800)/86400 AS INTEGER)*86400-28800)
 AND EXISTS(SELECT 1 FROM guess_sidebar_winner_snapshot WHERE award_id=NEW.id AND payload<>guess_sidebar_messages.system_data);
END;

CREATE TRIGGER guess_stats_ldc_start AFTER INSERT ON ldc_packets
WHEN NEW.group_id IS NOT NULL AND NEW.mode IN ('guess','clues') BEGIN
 INSERT INTO guess_group_stats(group_id,day,rounds,wins) VALUES(NEW.group_id,'*',1,0),(NEW.group_id,date(NEW.created_at,'unixepoch','+8 hours'),1,0)
 ON CONFLICT(group_id,day) DO UPDATE SET rounds=rounds+1;
END;

CREATE TRIGGER ldc_block_free_active BEFORE INSERT ON ldc_packets
WHEN NEW.mode IN('guess','clues') AND NOT EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id)
 AND EXISTS(SELECT 1 FROM guess_free_rounds WHERE group_id=NEW.group_id AND state='open' AND winner_id IS NULL AND ends_at>NEW.created_at)
BEGIN SELECT RAISE(ABORT,'ldc_active_game'); END;

CREATE TRIGGER ldc_exclusive_award_insert BEFORE INSERT ON ldc_awards
WHEN NEW.recipient_id IS NOT NULL AND EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id AND exclusive_user_id IS NOT NULL AND exclusive_user_id<>NEW.recipient_id)
BEGIN SELECT RAISE(ABORT,'exclusive_recipient_mismatch'); END;

CREATE TRIGGER ldc_exclusive_award_update BEFORE UPDATE OF recipient_id,packet_id ON ldc_awards
WHEN NEW.recipient_id IS NOT NULL AND EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id AND exclusive_user_id IS NOT NULL AND exclusive_user_id<>NEW.recipient_id)
BEGIN SELECT RAISE(ABORT,'exclusive_recipient_mismatch'); END;

CREATE TRIGGER ldc_exclusive_packet_shape_insert BEFORE INSERT ON ldc_packets
WHEN NEW.exclusive_user_id IS NOT NULL AND (NEW.count<>1 OR NEW.mode NOT IN ('fixed','random') OR NEW.exclusive_user_id=NEW.owner_id)
BEGIN SELECT RAISE(ABORT,'exclusive_packet_invalid'); END;

CREATE TRIGGER ldc_exclusive_packet_shape_update BEFORE UPDATE OF exclusive_user_id,count,mode,owner_id ON ldc_packets
WHEN NEW.exclusive_user_id IS NOT NULL AND (NEW.count<>1 OR NEW.mode NOT IN ('fixed','random') OR NEW.exclusive_user_id=NEW.owner_id)
BEGIN SELECT RAISE(ABORT,'exclusive_packet_invalid'); END;

CREATE TRIGGER ldc_firstshot_honor AFTER UPDATE OF verdict ON ldc_questions
WHEN NEW.kind='guess' AND OLD.verdict='pending' AND NEW.verdict<>'pending'
 AND NOT EXISTS(SELECT 1 FROM activity_honor_events WHERE event_key=NEW.packet_id AND series='guess_firstshot')
 AND EXISTS(SELECT 1 FROM guess_wins WHERE packet_id=NEW.packet_id) BEGIN
 INSERT OR IGNORE INTO activity_honor_events(event_key,user_id,series,created_at)
 SELECT w.packet_id,CASE r.series WHEN 'guess_firstshot' THEN w.user_id ELSE p.owner_id END,r.series,unixepoch()
 FROM guess_wins w JOIN ldc_packets p ON p.packet_id=w.packet_id
 JOIN (SELECT 'guess_firstshot' series UNION ALL SELECT 'guess_easy') r
 JOIN users u ON u.id=CASE r.series WHEN 'guess_firstshot' THEN w.user_id ELSE p.owner_id END
 WHERE w.packet_id=NEW.packet_id AND u.disabled=0 AND u.kind='user'
 AND EXISTS(SELECT 1 FROM ldc_questions q WHERE q.packet_id=w.packet_id AND q.kind='guess' AND q.verdict='correct' AND q.user_id=w.user_id)
 AND NOT EXISTS(SELECT 1 FROM ldc_questions q WHERE q.packet_id=w.packet_id AND q.kind='guess' AND q.verdict NOT IN('correct','unavailable','error','not_question'));
END;

CREATE TRIGGER ldc_packets_rate_close AFTER UPDATE OF state ON ldc_packets
 WHEN NEW.state='closed' AND OLD.state='open' AND NEW.mode IN ('guess','clues') AND NEW.game_version=1
 AND NOT EXISTS(SELECT 1 FROM guess_rate_exclusions WHERE packet_id=NEW.packet_id) BEGIN
 INSERT OR IGNORE INTO guess_rate_participants SELECT packet_id,recipient_id FROM ldc_awards WHERE packet_id=NEW.packet_id AND recipient_id IS NOT NULL AND purpose='winner';
 INSERT OR IGNORE INTO guess_rate_rounds SELECT NEW.packet_id,NEW.group_id,date(t.at,'unixepoch','+8 hours'),t.at,(SELECT user_id FROM guess_wins WHERE packet_id=NEW.packet_id),'live'
 FROM (SELECT CASE WHEN NEW.count>1 THEN MIN(NEW.ends_at,unixepoch()) ELSE COALESCE((SELECT created_at FROM guess_wins WHERE packet_id=NEW.packet_id),MIN(NEW.ends_at,unixepoch())) END at) t;
END;

CREATE TRIGGER ldc_packets_retired_insert BEFORE INSERT ON ldc_packets WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER ldc_packets_retired_update BEFORE UPDATE OF owner_id ON ldc_packets WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER ldc_questions_rate_insert AFTER INSERT ON ldc_questions WHEN NEW.verdict IN ('yes','no','correct','similarity') AND NOT EXISTS(SELECT 1 FROM guess_rate_rounds WHERE packet_id=NEW.packet_id) AND EXISTS(SELECT 1 FROM ldc_packets p WHERE p.packet_id=NEW.packet_id AND p.state='open' AND p.ends_at>unixepoch()) BEGIN
 INSERT OR IGNORE INTO guess_rate_participants VALUES(NEW.packet_id,NEW.user_id);
END;

CREATE TRIGGER ldc_questions_rate_update AFTER UPDATE OF verdict ON ldc_questions WHEN NEW.verdict IN ('yes','no','correct','similarity') AND NOT EXISTS(SELECT 1 FROM guess_rate_rounds WHERE packet_id=NEW.packet_id) AND EXISTS(SELECT 1 FROM ldc_packets p WHERE p.packet_id=NEW.packet_id AND p.state='open' AND p.ends_at>unixepoch()) BEGIN
 INSERT OR IGNORE INTO guess_rate_participants VALUES(NEW.packet_id,NEW.user_id);
END;

CREATE TRIGGER ldc_single_active BEFORE INSERT ON ldc_packets
WHEN NEW.mode IN ('guess','clues') AND NEW.group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id)
AND EXISTS(SELECT 1 FROM ldc_packets p WHERE p.group_id=NEW.group_id AND p.state='open' AND p.mode IN ('guess','clues') AND p.ends_at>NEW.created_at
 AND (SELECT count(*) FROM ldc_awards a WHERE a.packet_id=p.packet_id AND a.recipient_id IS NOT NULL)<p.count)
BEGIN SELECT RAISE(ABORT,'ldc_active_game'); END;

CREATE TRIGGER packet_luck_close_signal AFTER UPDATE OF state ON ldc_packets WHEN OLD.state<>NEW.state BEGIN
 UPDATE packet_luck_jobs SET due_at=unixepoch() WHERE packet_id=NEW.packet_id;
END;

CREATE TRIGGER packet_luck_enqueue AFTER INSERT ON ldc_packets WHEN NEW.mode='random' BEGIN
 INSERT INTO packet_luck_jobs VALUES(NEW.packet_id,NEW.ends_at);
END;

CREATE TRIGGER packet_luck_unlock AFTER INSERT ON packet_luck_wins BEGIN
 INSERT INTO user_badges(user_id,badge,n,first_at,last_day) VALUES(NEW.user_id,NEW.badge,1,NEW.created_at,date(NEW.created_at,'unixepoch','+8 hours'))
 ON CONFLICT(user_id,badge) DO UPDATE SET n=n+1,last_day=excluded.last_day;
 INSERT OR IGNORE INTO user_unlocks(user_id,item,at)
 SELECT NEW.user_id,NEW.badge||':'||level,NEW.created_at FROM (SELECT 1 level,1 wins UNION ALL SELECT 2,3 UNION ALL SELECT 3,10 UNION ALL SELECT 4,30 UNION ALL SELECT 5,100)
 WHERE wins<=(SELECT n FROM user_badges WHERE user_id=NEW.user_id AND badge=NEW.badge);
 UPDATE users SET deco=json_set(deco,'$.bn',(SELECT n FROM user_badges WHERE user_id=NEW.user_id AND badge=NEW.badge))
 WHERE id=NEW.user_id AND json_valid(deco) AND json_extract(deco,'$.bd')=NEW.badge;
 INSERT OR IGNORE INTO chat_messages(group_id,user_id,body,created_at,updated_at,system_kind,system_ref)
 SELECT p.group_id,NEW.user_id,COALESCE(u.nick,u.name,u.username)||' 累计获得'||CASE NEW.badge WHEN 'luck_king' THEN '手气王' ELSE '手气亡' END||' '||b.n||' 次，升至 LV.'||r.level||'「'||CASE NEW.badge WHEN 'luck_king' THEN r.king ELSE r.last END||'」！称号、徽章和气泡已解锁，可在装扮中自行选择。',NEW.created_at,NEW.created_at,'luck_level',NEW.badge||':'||NEW.user_id||':'||r.level
 FROM ldc_packets p JOIN users u ON u.id=NEW.user_id JOIN user_badges b ON b.user_id=u.id AND b.badge=NEW.badge
 JOIN (SELECT 1 level,1 wins,'初遇好运' king,'微光入袋' last UNION ALL SELECT 2,3,'福气临门','一分不弃' UNION ALL SELECT 3,10,'锦鲤附体','逆风收集' UNION ALL SELECT 4,30,'鸿运当头','低谷漫游' UNION ALL SELECT 5,100,'天选锦鲤','逆运星主') r ON r.wins=b.n
 WHERE p.packet_id=NEW.packet_id;
END;

CREATE TRIGGER packet_notice_award AFTER UPDATE OF state,recipient_id ON ldc_awards WHEN OLD.state IS NOT NEW.state OR OLD.recipient_id IS NOT NEW.recipient_id BEGIN INSERT INTO packet_notice_jobs(packet_id,due_at) SELECT packet_id,unixepoch() FROM ldc_packets WHERE packet_id=NEW.packet_id AND mode IN('fixed','random') ON CONFLICT(packet_id) DO UPDATE SET due_at=excluded.due_at,revision=revision+1; END;

CREATE TRIGGER packet_notice_close AFTER UPDATE OF state ON ldc_packets WHEN OLD.state<>NEW.state AND NEW.mode IN('fixed','random') BEGIN INSERT INTO packet_notice_jobs(packet_id,due_at) VALUES(NEW.packet_id,unixepoch()) ON CONFLICT(packet_id) DO UPDATE SET due_at=excluded.due_at,revision=revision+1; END;

CREATE TRIGGER packet_notice_enqueue AFTER INSERT ON ldc_packets WHEN NEW.mode IN('fixed','random') BEGIN INSERT INTO packet_notice_jobs(packet_id,due_at) VALUES(NEW.packet_id,NEW.ends_at); END;

CREATE TRIGGER packet_sender_created AFTER INSERT ON ldc_packets WHEN NEW.group_id IS NOT NULL AND NEW.payment_provider<>'coin52' BEGIN
 INSERT INTO packet_sender_stats(group_id,day,user_id,packets,declared_cents,created_at)
 VALUES(NEW.group_id,'*',NEW.owner_id,1,NEW.total_cents,NEW.created_at),(NEW.group_id,date(NEW.created_at,'unixepoch','+8 hours'),NEW.owner_id,1,NEW.total_cents,NEW.created_at)
 ON CONFLICT(group_id,day,user_id) DO UPDATE SET packets=packets+1,declared_cents=declared_cents+excluded.declared_cents,created_at=MAX(created_at,excluded.created_at);
END;

CREATE TRIGGER packet_sender_paid_aggregate AFTER INSERT ON packet_sender_paid_events BEGIN
 INSERT INTO packet_sender_stats(group_id,day,user_id,paid_cents,paid_at)
 SELECT p.group_id,'*',p.owner_id,NEW.amount_cents,NEW.confirmed_at FROM ldc_packets p WHERE p.packet_id=NEW.packet_id AND p.group_id IS NOT NULL
 ON CONFLICT(group_id,day,user_id) DO UPDATE SET paid_cents=paid_cents+excluded.paid_cents,paid_at=MAX(paid_at,excluded.paid_at);
 INSERT INTO packet_sender_stats(group_id,day,user_id,paid_cents,paid_at)
 SELECT p.group_id,date(NEW.confirmed_at,'unixepoch','+8 hours'),p.owner_id,NEW.amount_cents,NEW.confirmed_at FROM ldc_packets p WHERE p.packet_id=NEW.packet_id AND p.group_id IS NOT NULL
 ON CONFLICT(group_id,day,user_id) DO UPDATE SET paid_cents=paid_cents+excluded.paid_cents,paid_at=MAX(paid_at,excluded.paid_at);
END;

CREATE TRIGGER packet_sender_paid_insert AFTER INSERT ON ldc_awards WHEN NEW.state='accepted' AND NEW.recipient_id IS NOT NULL AND EXISTS(SELECT 1 FROM ldc_packets p WHERE p.packet_id=NEW.packet_id AND p.payment_provider<>'coin52') BEGIN
 INSERT OR IGNORE INTO packet_sender_paid_events VALUES(NEW.id,NEW.packet_id,NEW.amount_cents,unixepoch());
END;

CREATE TRIGGER packet_sender_paid_update AFTER UPDATE OF state ON ldc_awards WHEN NEW.state='accepted' AND NEW.recipient_id IS NOT NULL AND EXISTS(SELECT 1 FROM ldc_packets p WHERE p.packet_id=NEW.packet_id AND p.payment_provider<>'coin52') BEGIN
 INSERT OR IGNORE INTO packet_sender_paid_events VALUES(NEW.id,NEW.packet_id,NEW.amount_cents,unixepoch());
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

CREATE TRIGGER trg_guess_escalation AFTER UPDATE OF added_reward_cents ON ldc_packets
WHEN NEW.added_reward_cents>OLD.added_reward_cents AND NEW.escalation_every>0
BEGIN
 UPDATE ldc_awards SET amount_cents=CASE WHEN slot=0 THEN NEW.total_cents-
   (SELECT COALESCE(sum(CAST((NEW.total_cents/(CASE NEW.payment_provider WHEN 'coin52' THEN 100 ELSE 1 END))*j.value/10000 AS INTEGER)*(CASE NEW.payment_provider WHEN 'coin52' THEN 100 ELSE 1 END)),0) FROM json_each(NEW.guess_weights_json) j WHERE j.key>0)
  ELSE CAST((NEW.total_cents/(CASE NEW.payment_provider WHEN 'coin52' THEN 100 ELSE 1 END))*json_extract(NEW.guess_weights_json,'$['||slot||']')/10000 AS INTEGER)*(CASE NEW.payment_provider WHEN 'coin52' THEN 100 ELSE 1 END) END
 WHERE packet_id=NEW.packet_id AND (state='ready' AND recipient_id IS NULL OR state='reserved' AND attempts=0 AND sent_at IS NULL);
 INSERT INTO guess_reward_increases(packet_id,stage,added_cents,total_cents,created_at)
 VALUES(NEW.packet_id,(NEW.added_reward_cents+NEW.escalation_step_cents-1)/NEW.escalation_step_cents,NEW.added_reward_cents-OLD.added_reward_cents,NEW.total_cents,unixepoch());
END;

CREATE TRIGGER trg_guess_win_reward AFTER UPDATE OF recipient_id ON ldc_awards
WHEN NEW.purpose='winner' AND OLD.recipient_id IS NULL AND NEW.recipient_id IS NOT NULL AND NEW.slot=0
 AND EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id AND mode IN('guess','clues'))
BEGIN INSERT OR IGNORE INTO guess_wins VALUES(NEW.packet_id,NEW.recipient_id,unixepoch()); END;

CREATE TRIGGER trg_word_archive_paid_end AFTER UPDATE OF state,ends_at ON ldc_packets
 WHEN NEW.mode IN ('guess','clues') AND (NEW.state<>OLD.state OR NEW.ends_at<>OLD.ends_at) BEGIN
 UPDATE guess_word_archive_jobs SET next_at=CASE WHEN NEW.state='closed' THEN 0 ELSE NEW.ends_at END
 WHERE store='ldc' AND packet_id=NEW.packet_id AND status IN ('pending','error');
END;

CREATE TRIGGER trg_word_archive_paid_insert AFTER INSERT ON ldc_packets
 WHEN NEW.mode IN ('guess','clues') BEGIN
 INSERT OR IGNORE INTO guess_word_archive_jobs(store,packet_id,next_at) VALUES('ldc',NEW.packet_id,CASE WHEN NEW.state='closed' THEN 0 ELSE NEW.ends_at END);
END;
