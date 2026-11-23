-- New rounds only. Existing single-winner awards and transfers remain unchanged.
ALTER TABLE ldc_packets ADD COLUMN hidden_winners INTEGER NOT NULL DEFAULT 0 CHECK(hidden_winners BETWEEN 0 AND 9);
ALTER TABLE ldc_packets ADD COLUMN guess_weights_json TEXT NOT NULL DEFAULT '[10000]';
ALTER TABLE ldc_packets ADD COLUMN reward_freeze_ai_count INTEGER;
CREATE TRIGGER guess_reward_freeze AFTER UPDATE OF recipient_id ON ldc_awards
WHEN OLD.recipient_id IS NULL AND NEW.recipient_id IS NOT NULL AND NEW.slot=0 BEGIN
 UPDATE ldc_packets SET reward_freeze_ai_count=ai_count WHERE packet_id=NEW.packet_id AND mode IN('guess','clues') AND reward_freeze_ai_count IS NULL;
END;
DROP TRIGGER ldc_single_active;
CREATE TRIGGER ldc_single_active BEFORE INSERT ON ldc_packets
WHEN NEW.mode IN ('guess','clues') AND NEW.group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id)
AND EXISTS(SELECT 1 FROM ldc_packets p WHERE p.group_id=NEW.group_id AND p.state='open' AND p.mode IN ('guess','clues') AND p.ends_at>NEW.created_at
 AND (SELECT count(*) FROM ldc_awards a WHERE a.packet_id=p.packet_id AND a.recipient_id IS NOT NULL)<p.count)
BEGIN SELECT RAISE(ABORT,'ldc_active_game'); END;
DROP TRIGGER free_guess_single_active;
CREATE TRIGGER free_guess_single_active BEFORE INSERT ON guess_free_rounds
WHEN NOT EXISTS(SELECT 1 FROM guess_free_rounds WHERE packet_id=NEW.packet_id) AND (
 EXISTS(SELECT 1 FROM guess_free_rounds WHERE group_id=NEW.group_id AND state='open' AND winner_id IS NULL AND ends_at>NEW.created_at) OR
 EXISTS(SELECT 1 FROM ldc_packets p WHERE p.group_id=NEW.group_id AND p.state='open' AND p.mode IN('guess','clues') AND p.ends_at>NEW.created_at
 AND (SELECT count(*) FROM ldc_awards a WHERE a.packet_id=p.packet_id AND a.recipient_id IS NOT NULL)<p.count))
BEGIN SELECT RAISE(ABORT,'ldc_active_game'); END;

DROP TRIGGER trg_guess_escalation;
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

-- The first hit still records the first-solver achievement; rate snapshots wait for all slots.
DROP TRIGGER trg_guess_win_reward;
CREATE TRIGGER trg_guess_win_reward AFTER UPDATE OF recipient_id ON ldc_awards
WHEN OLD.recipient_id IS NULL AND NEW.recipient_id IS NOT NULL AND NEW.slot=0
 AND EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id AND mode IN('guess','clues'))
BEGIN INSERT OR IGNORE INTO guess_wins VALUES(NEW.packet_id,NEW.recipient_id,unixepoch()); END;
DROP TRIGGER guess_rate_winner;
CREATE TRIGGER guess_rate_winner AFTER INSERT ON guess_wins BEGIN
 INSERT OR IGNORE INTO guess_rate_participants VALUES(NEW.packet_id,NEW.user_id);
 INSERT OR IGNORE INTO guess_rate_rounds
 SELECT NEW.packet_id,p.group_id,date(NEW.created_at,'unixepoch','+8 hours'),NEW.created_at,NEW.user_id,'live'
 FROM (SELECT packet_id,group_id,game_version FROM ldc_packets WHERE count=1 UNION ALL SELECT packet_id,group_id,game_version FROM guess_free_rounds) p
 WHERE p.packet_id=NEW.packet_id AND p.game_version=1 AND NOT EXISTS(SELECT 1 FROM guess_rate_exclusions WHERE packet_id=NEW.packet_id);
END;
DROP TRIGGER ldc_packets_rate_close;
CREATE TRIGGER ldc_packets_rate_close AFTER UPDATE OF state ON ldc_packets
 WHEN NEW.state='closed' AND OLD.state='open' AND NEW.mode IN ('guess','clues') AND NEW.game_version=1
 AND NOT EXISTS(SELECT 1 FROM guess_rate_exclusions WHERE packet_id=NEW.packet_id) BEGIN
 INSERT OR IGNORE INTO guess_rate_participants SELECT packet_id,recipient_id FROM ldc_awards WHERE packet_id=NEW.packet_id AND recipient_id IS NOT NULL;
 INSERT OR IGNORE INTO guess_rate_rounds SELECT NEW.packet_id,NEW.group_id,date(t.at,'unixepoch','+8 hours'),t.at,(SELECT user_id FROM guess_wins WHERE packet_id=NEW.packet_id),'live'
 FROM (SELECT CASE WHEN NEW.count>1 THEN MIN(NEW.ends_at,unixepoch()) ELSE COALESCE((SELECT created_at FROM guess_wins WHERE packet_id=NEW.packet_id),MIN(NEW.ends_at,unixepoch())) END at) t;
END;
DROP TRIGGER guess_rate_snapshot;
CREATE TRIGGER guess_rate_snapshot AFTER INSERT ON guess_rate_rounds BEGIN
 INSERT INTO guess_rate_coverage(group_id,since,rounds) VALUES(NEW.group_id,NEW.ended_at,1)
 ON CONFLICT(group_id) DO UPDATE SET since=MIN(COALESCE(since,excluded.since),excluded.since),rounds=rounds+1;
 INSERT INTO guess_rate_stats(group_id,day,user_id,rounds,wins)
 SELECT NEW.group_id,d.day,p.user_id,1,CASE WHEN p.user_id=NEW.winner_id OR EXISTS(SELECT 1 FROM ldc_awards a JOIN ldc_packets g ON g.packet_id=a.packet_id WHERE a.packet_id=p.packet_id AND a.recipient_id=p.user_id AND g.count>1 AND g.mode IN('guess','clues')) THEN 1 ELSE 0 END
 FROM guess_rate_participants p JOIN (SELECT NEW.day day UNION ALL SELECT '*') d WHERE p.packet_id=NEW.packet_id
 ON CONFLICT(group_id,day,user_id) DO UPDATE SET rounds=rounds+1,wins=wins+excluded.wins;
END;
CREATE TRIGGER guess_multi_last_winner AFTER UPDATE OF recipient_id ON ldc_awards
WHEN OLD.recipient_id IS NULL AND NEW.recipient_id IS NOT NULL
 AND EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id AND count>1 AND mode IN('guess','clues'))
BEGIN
 INSERT OR IGNORE INTO guess_rate_participants VALUES(NEW.packet_id,NEW.recipient_id);
 UPDATE ldc_packets SET state='closed',room_revision=room_revision+1
 WHERE packet_id=NEW.packet_id AND state='open' AND NOT EXISTS(SELECT 1 FROM ldc_awards WHERE packet_id=NEW.packet_id AND recipient_id IS NULL);
END;

CREATE TRIGGER guess_multi_growth AFTER UPDATE OF recipient_id ON ldc_awards
WHEN OLD.recipient_id IS NULL AND NEW.recipient_id IS NOT NULL AND NEW.slot>0 AND EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id AND mode IN('guess','clues') AND count>1)
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
