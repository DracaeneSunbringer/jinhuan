-- 有效参与以结束快照归属北京时间统计日；页面只读聚合。
CREATE TABLE guess_rate_participants(packet_id TEXT NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id),PRIMARY KEY(packet_id,user_id));
CREATE TABLE guess_rate_rounds(packet_id TEXT PRIMARY KEY,group_id INTEGER NOT NULL REFERENCES chat_groups(id),day TEXT NOT NULL,ended_at INTEGER NOT NULL,winner_id INTEGER REFERENCES users(id),origin TEXT NOT NULL CHECK(origin IN('history','live')));
CREATE INDEX idx_guess_rate_coverage ON guess_rate_rounds(group_id,ended_at);
CREATE TABLE guess_rate_stats(group_id INTEGER NOT NULL REFERENCES chat_groups(id),day TEXT NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id),rounds INTEGER NOT NULL CHECK(rounds>0),wins INTEGER NOT NULL CHECK(wins>=0 AND wins<=rounds),rate REAL GENERATED ALWAYS AS (1.0*wins/rounds) STORED,PRIMARY KEY(group_id,day,user_id));
CREATE INDEX idx_guess_rate_rank ON guess_rate_stats(group_id,day,rate DESC,rounds DESC,user_id);
CREATE TABLE guess_rate_exclusions(packet_id TEXT PRIMARY KEY,group_id INTEGER NOT NULL,reason TEXT NOT NULL);
CREATE TABLE guess_rate_coverage(group_id INTEGER PRIMARY KEY,since INTEGER,rounds INTEGER NOT NULL DEFAULT 0,excluded INTEGER NOT NULL DEFAULT 0);
CREATE TRIGGER guess_rate_excluded AFTER INSERT ON guess_rate_exclusions BEGIN
 INSERT INTO guess_rate_coverage(group_id,excluded) VALUES(NEW.group_id,1) ON CONFLICT(group_id) DO UPDATE SET excluded=excluded+1;
END;
CREATE TRIGGER guess_rate_snapshot AFTER INSERT ON guess_rate_rounds BEGIN
 INSERT INTO guess_rate_coverage(group_id,since,rounds) VALUES(NEW.group_id,NEW.ended_at,1)
 ON CONFLICT(group_id) DO UPDATE SET since=MIN(COALESCE(since,excluded.since),excluded.since),rounds=rounds+1;
 INSERT INTO guess_rate_stats(group_id,day,user_id,rounds,wins)
 SELECT NEW.group_id,d.day,p.user_id,1,CASE WHEN p.user_id=NEW.winner_id THEN 1 ELSE 0 END
 FROM guess_rate_participants p JOIN (SELECT NEW.day day UNION ALL SELECT '*') d WHERE p.packet_id=NEW.packet_id
 ON CONFLICT(group_id,day,user_id) DO UPDATE SET rounds=rounds+1,wins=wins+excluded.wins;
END;

INSERT OR IGNORE INTO guess_rate_participants SELECT q.packet_id,q.user_id FROM ldc_questions q WHERE q.verdict IN ('yes','no','correct','similarity');
INSERT OR IGNORE INTO guess_rate_participants SELECT w.packet_id,w.user_id FROM guess_wins w JOIN ldc_packets p ON p.packet_id=w.packet_id;
INSERT INTO guess_rate_rounds
 SELECT p.packet_id,p.group_id,date(COALESCE((SELECT created_at FROM guess_wins WHERE packet_id=p.packet_id),(SELECT MIN(m.created_at) FROM chat_redpacks r JOIN chat_messages m ON m.system_kind='ldc_cancel' AND m.system_ref=CAST(r.message_id AS TEXT) WHERE r.id=p.packet_id),CASE WHEN p.ends_at<=unixepoch() THEN p.ends_at END),'unixepoch','+8 hours'),COALESCE((SELECT created_at FROM guess_wins WHERE packet_id=p.packet_id),(SELECT MIN(m.created_at) FROM chat_redpacks r JOIN chat_messages m ON m.system_kind='ldc_cancel' AND m.system_ref=CAST(r.message_id AS TEXT) WHERE r.id=p.packet_id),CASE WHEN p.ends_at<=unixepoch() THEN p.ends_at END),(SELECT user_id FROM guess_wins WHERE packet_id=p.packet_id),'history'
 FROM ldc_packets p WHERE p.mode IN ('guess','clues') AND p.game_version=1
 AND ((SELECT user_id FROM guess_wins WHERE packet_id=p.packet_id) IS NOT NULL OR p.state='closed' OR p.ends_at<=unixepoch())
 AND COALESCE((SELECT created_at FROM guess_wins WHERE packet_id=p.packet_id),(SELECT MIN(m.created_at) FROM chat_redpacks r JOIN chat_messages m ON m.system_kind='ldc_cancel' AND m.system_ref=CAST(r.message_id AS TEXT) WHERE r.id=p.packet_id),CASE WHEN p.ends_at<=unixepoch() THEN p.ends_at END) BETWEEN p.created_at AND unixepoch()
 AND p.guess_count=(SELECT COUNT(*) FROM ldc_questions WHERE packet_id=p.packet_id AND kind='guess')
 AND p.question_count=(SELECT COUNT(*) FROM ldc_questions WHERE packet_id=p.packet_id AND kind='question')
 AND NOT EXISTS(SELECT 1 FROM ldc_questions q WHERE q.packet_id=p.packet_id AND
  ((q.source_message_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM chat_messages m WHERE m.id=q.source_message_id)) OR
   (q.source_room_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM guess_room_messages m WHERE m.id=q.source_room_id))));
INSERT INTO guess_rate_exclusions SELECT p.packet_id,p.group_id,'历史回执或结束时间无法完整核验'
 FROM ldc_packets p WHERE p.mode IN ('guess','clues') AND ((SELECT user_id FROM guess_wins WHERE packet_id=p.packet_id) IS NOT NULL OR p.state='closed' OR p.ends_at<=unixepoch()) AND NOT EXISTS(SELECT 1 FROM guess_rate_rounds WHERE packet_id=p.packet_id);
CREATE TRIGGER ldc_questions_rate_insert AFTER INSERT ON ldc_questions WHEN NEW.verdict IN ('yes','no','correct','similarity') AND NOT EXISTS(SELECT 1 FROM guess_rate_rounds WHERE packet_id=NEW.packet_id) AND EXISTS(SELECT 1 FROM ldc_packets p WHERE p.packet_id=NEW.packet_id AND p.state='open' AND p.ends_at>unixepoch()) BEGIN
 INSERT OR IGNORE INTO guess_rate_participants VALUES(NEW.packet_id,NEW.user_id);
END;
CREATE TRIGGER ldc_questions_rate_update AFTER UPDATE OF verdict ON ldc_questions WHEN NEW.verdict IN ('yes','no','correct','similarity') AND NOT EXISTS(SELECT 1 FROM guess_rate_rounds WHERE packet_id=NEW.packet_id) AND EXISTS(SELECT 1 FROM ldc_packets p WHERE p.packet_id=NEW.packet_id AND p.state='open' AND p.ends_at>unixepoch()) BEGIN
 INSERT OR IGNORE INTO guess_rate_participants VALUES(NEW.packet_id,NEW.user_id);
END;
CREATE TRIGGER ldc_packets_rate_close AFTER UPDATE OF state ON ldc_packets
 WHEN NEW.state='closed' AND OLD.state='open' AND NEW.mode IN ('guess','clues') AND NEW.game_version=1
 AND NOT EXISTS(SELECT 1 FROM guess_rate_exclusions WHERE packet_id=NEW.packet_id) BEGIN
 INSERT OR IGNORE INTO guess_rate_participants SELECT packet_id,user_id FROM guess_wins WHERE packet_id=NEW.packet_id;
 
 INSERT OR IGNORE INTO guess_rate_rounds SELECT NEW.packet_id,NEW.group_id,date(t.at,'unixepoch','+8 hours'),t.at,(SELECT user_id FROM guess_wins WHERE packet_id=NEW.packet_id),'live'
 FROM (SELECT COALESCE((SELECT created_at FROM guess_wins WHERE packet_id=NEW.packet_id),MIN(NEW.ends_at,unixepoch())) at) t;
END;

INSERT OR IGNORE INTO guess_rate_participants SELECT q.packet_id,q.user_id FROM guess_free_questions q WHERE q.verdict IN ('yes','no','correct','similarity');
INSERT OR IGNORE INTO guess_rate_participants SELECT w.packet_id,w.user_id FROM guess_wins w JOIN guess_free_rounds p ON p.packet_id=w.packet_id;
INSERT INTO guess_rate_rounds
 SELECT p.packet_id,p.group_id,date(COALESCE((SELECT created_at FROM guess_wins WHERE packet_id=p.packet_id),(SELECT MIN(m.created_at) FROM chat_redpacks r JOIN chat_messages m ON m.system_kind='ldc_cancel' AND m.system_ref=CAST(r.message_id AS TEXT) WHERE r.id=p.packet_id),CASE WHEN p.ends_at<=unixepoch() THEN p.ends_at END),'unixepoch','+8 hours'),COALESCE((SELECT created_at FROM guess_wins WHERE packet_id=p.packet_id),(SELECT MIN(m.created_at) FROM chat_redpacks r JOIN chat_messages m ON m.system_kind='ldc_cancel' AND m.system_ref=CAST(r.message_id AS TEXT) WHERE r.id=p.packet_id),CASE WHEN p.ends_at<=unixepoch() THEN p.ends_at END),(SELECT user_id FROM guess_wins WHERE packet_id=p.packet_id),'history'
 FROM guess_free_rounds p WHERE p.mode IN ('guess','clues') AND p.game_version=1
 AND ((SELECT user_id FROM guess_wins WHERE packet_id=p.packet_id) IS NOT NULL OR p.state='closed' OR p.ends_at<=unixepoch())
 AND COALESCE((SELECT created_at FROM guess_wins WHERE packet_id=p.packet_id),(SELECT MIN(m.created_at) FROM chat_redpacks r JOIN chat_messages m ON m.system_kind='ldc_cancel' AND m.system_ref=CAST(r.message_id AS TEXT) WHERE r.id=p.packet_id),CASE WHEN p.ends_at<=unixepoch() THEN p.ends_at END) BETWEEN p.created_at AND unixepoch()
 AND p.guess_count=(SELECT COUNT(*) FROM guess_free_questions WHERE packet_id=p.packet_id AND kind='guess')
 AND p.question_count=(SELECT COUNT(*) FROM guess_free_questions WHERE packet_id=p.packet_id AND kind='question')
 AND NOT EXISTS(SELECT 1 FROM guess_free_questions q WHERE q.packet_id=p.packet_id AND
  ((q.source_message_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM chat_messages m WHERE m.id=q.source_message_id)) OR
   (q.source_room_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM guess_room_messages m WHERE m.id=q.source_room_id))));
INSERT INTO guess_rate_exclusions SELECT p.packet_id,p.group_id,'历史回执或结束时间无法完整核验'
 FROM guess_free_rounds p WHERE p.mode IN ('guess','clues') AND ((SELECT user_id FROM guess_wins WHERE packet_id=p.packet_id) IS NOT NULL OR p.state='closed' OR p.ends_at<=unixepoch()) AND NOT EXISTS(SELECT 1 FROM guess_rate_rounds WHERE packet_id=p.packet_id);
CREATE TRIGGER guess_free_questions_rate_insert AFTER INSERT ON guess_free_questions WHEN NEW.verdict IN ('yes','no','correct','similarity') AND NOT EXISTS(SELECT 1 FROM guess_rate_rounds WHERE packet_id=NEW.packet_id) AND EXISTS(SELECT 1 FROM guess_free_rounds p WHERE p.packet_id=NEW.packet_id AND p.state='open' AND p.ends_at>unixepoch()) BEGIN
 INSERT OR IGNORE INTO guess_rate_participants VALUES(NEW.packet_id,NEW.user_id);
END;
CREATE TRIGGER guess_free_questions_rate_update AFTER UPDATE OF verdict ON guess_free_questions WHEN NEW.verdict IN ('yes','no','correct','similarity') AND NOT EXISTS(SELECT 1 FROM guess_rate_rounds WHERE packet_id=NEW.packet_id) AND EXISTS(SELECT 1 FROM guess_free_rounds p WHERE p.packet_id=NEW.packet_id AND p.state='open' AND p.ends_at>unixepoch()) BEGIN
 INSERT OR IGNORE INTO guess_rate_participants VALUES(NEW.packet_id,NEW.user_id);
END;
CREATE TRIGGER guess_free_rounds_rate_close AFTER UPDATE OF state ON guess_free_rounds
 WHEN NEW.state='closed' AND OLD.state='open' AND NEW.mode IN ('guess','clues') AND NEW.game_version=1
 AND NOT EXISTS(SELECT 1 FROM guess_rate_exclusions WHERE packet_id=NEW.packet_id) BEGIN
 INSERT OR IGNORE INTO guess_rate_participants SELECT packet_id,user_id FROM guess_wins WHERE packet_id=NEW.packet_id;
 INSERT OR IGNORE INTO guess_rate_participants SELECT NEW.packet_id,NEW.winner_id WHERE NEW.winner_id IS NOT NULL;
 INSERT OR IGNORE INTO guess_rate_rounds SELECT NEW.packet_id,NEW.group_id,date(t.at,'unixepoch','+8 hours'),t.at,NEW.winner_id,'live'
 FROM (SELECT COALESCE(NEW.won_at,MIN(NEW.ends_at,unixepoch())) at) t;
END;
CREATE TRIGGER guess_rate_winner AFTER INSERT ON guess_wins BEGIN
 INSERT OR IGNORE INTO guess_rate_participants VALUES(NEW.packet_id,NEW.user_id);
 INSERT OR IGNORE INTO guess_rate_rounds
 SELECT NEW.packet_id,p.group_id,date(NEW.created_at,'unixepoch','+8 hours'),NEW.created_at,NEW.user_id,'live'
 FROM (SELECT packet_id,group_id,game_version FROM ldc_packets UNION ALL SELECT packet_id,group_id,game_version FROM guess_free_rounds) p
 WHERE p.packet_id=NEW.packet_id AND p.game_version=1 AND NOT EXISTS(SELECT 1 FROM guess_rate_exclusions WHERE packet_id=NEW.packet_id);
END;
-- 补齐确认发放额度与早晚累计前三；保留现有任务游标与全部奖励记录。
DROP TRIGGER rank_group_jobs;
CREATE TABLE rank_settlement_jobs_v3(
 group_id INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
 board TEXT NOT NULL CHECK(board IN('guess','guess_winrate','sender_count','sender_paid','chat_count','chat_early','chat_late')),
 period TEXT NOT NULL CHECK(period IN('day','all')),next_at INTEGER NOT NULL,
 PRIMARY KEY(group_id,board,period)
);
INSERT INTO rank_settlement_jobs_v3 SELECT * FROM rank_settlement_jobs;
DROP TABLE rank_settlement_jobs;
ALTER TABLE rank_settlement_jobs_v3 RENAME TO rank_settlement_jobs;
CREATE INDEX idx_rank_jobs_due ON rank_settlement_jobs(next_at,group_id,board,period);
INSERT OR IGNORE INTO rank_settlement_jobs
 SELECT g.id,b.board,p.period,((unixepoch()+b.offset)/86400+1)*86400-b.offset
 FROM chat_groups g JOIN (SELECT column1 board,column2 offset FROM (VALUES ('guess',28800),('guess_winrate',28800),('sender_count',28800),('sender_paid',28800),('chat_count',14400),('chat_early',14400),('chat_late',14400))) b JOIN (SELECT 'day' period UNION ALL SELECT 'all') p;
CREATE TRIGGER rank_group_jobs AFTER INSERT ON chat_groups BEGIN
 INSERT INTO rank_settlement_jobs
 SELECT NEW.id,b.board,p.period,((unixepoch()+b.offset)/86400+1)*86400-b.offset
 FROM (SELECT column1 board,column2 offset FROM (VALUES ('guess',28800),('guess_winrate',28800),('sender_count',28800),('sender_paid',28800),('chat_count',14400),('chat_early',14400),('chat_late',14400))) b JOIN (SELECT 'day' period UNION ALL SELECT 'all') p;
END;
INSERT INTO rank_reward_catalog VALUES('rank_guess_winrate_day',1,1,'胜率新星','猜词胜率日榜');
INSERT INTO rank_reward_catalog VALUES('rank_guess_winrate_day',2,3,'破题巧手','猜词胜率日榜');
INSERT INTO rank_reward_catalog VALUES('rank_guess_winrate_day',3,10,'解谜行家','猜词胜率日榜');
INSERT INTO rank_reward_catalog VALUES('rank_guess_winrate_day',4,30,'洞察大师','猜词胜率日榜');
INSERT INTO rank_reward_catalog VALUES('rank_guess_winrate_day',5,100,'百谜通晓','猜词胜率日榜');
INSERT INTO rank_reward_catalog VALUES('rank_guess_winrate_all',1,1,'慧眼流光','猜词胜率总榜');
INSERT INTO rank_reward_catalog VALUES('rank_guess_winrate_all',2,3,'玄机巡游','猜词胜率总榜');
INSERT INTO rank_reward_catalog VALUES('rank_guess_winrate_all',3,10,'万象洞悉','猜词胜率总榜');
INSERT INTO rank_reward_catalog VALUES('rank_guess_winrate_all',4,30,'谜域星轨','猜词胜率总榜');
INSERT INTO rank_reward_catalog VALUES('rank_guess_winrate_all',5,100,'万谜天穹','猜词胜率总榜');
