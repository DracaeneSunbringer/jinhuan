-- 猜词轮次与获胜次数的增量汇总；查看榜单时不扫描历史问答或中奖记录。
CREATE TABLE guess_group_stats (
  group_id INTEGER NOT NULL REFERENCES chat_groups(id),
  day TEXT NOT NULL,
  rounds INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(group_id,day)
);
CREATE TABLE guess_group_player_stats (
  group_id INTEGER NOT NULL REFERENCES chat_groups(id),
  day TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  wins INTEGER NOT NULL DEFAULT 0,
  last_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(group_id,day,user_id)
);
CREATE INDEX idx_guess_group_rank ON guess_group_player_stats(group_id,day,wins DESC,last_at ASC,user_id);

INSERT INTO guess_group_stats(group_id,day,rounds,wins)
SELECT group_id,day,SUM(rounds),SUM(wins) FROM (
  SELECT group_id,'*' AS day,COUNT(*) AS rounds,0 AS wins FROM ldc_packets WHERE group_id IS NOT NULL AND mode IN ('guess','clues') GROUP BY group_id
  UNION ALL SELECT group_id,date(created_at,'unixepoch','+8 hours'),COUNT(*),0 FROM ldc_packets WHERE group_id IS NOT NULL AND mode IN ('guess','clues') GROUP BY group_id,date(created_at,'unixepoch','+8 hours')
  UNION ALL SELECT group_id,'*',COUNT(*),0 FROM guess_free_rounds WHERE mode IN ('guess','clues') GROUP BY group_id
  UNION ALL SELECT group_id,date(created_at,'unixepoch','+8 hours'),COUNT(*),0 FROM guess_free_rounds WHERE mode IN ('guess','clues') GROUP BY group_id,date(created_at,'unixepoch','+8 hours')
  UNION ALL SELECT m.group_id,'*',0,COUNT(*) FROM guess_wins w JOIN chat_redpacks r ON r.id=w.packet_id JOIN chat_messages m ON m.id=r.message_id GROUP BY m.group_id
  UNION ALL SELECT m.group_id,date(w.created_at,'unixepoch','+8 hours'),0,COUNT(*) FROM guess_wins w JOIN chat_redpacks r ON r.id=w.packet_id JOIN chat_messages m ON m.id=r.message_id GROUP BY m.group_id,date(w.created_at,'unixepoch','+8 hours')
) GROUP BY group_id,day;
INSERT INTO guess_group_player_stats(group_id,day,user_id,wins,last_at)
SELECT m.group_id,'*',w.user_id,COUNT(*),MAX(w.created_at) FROM guess_wins w JOIN chat_redpacks r ON r.id=w.packet_id JOIN chat_messages m ON m.id=r.message_id GROUP BY m.group_id,w.user_id;
INSERT INTO guess_group_player_stats(group_id,day,user_id,wins,last_at)
SELECT m.group_id,date(w.created_at,'unixepoch','+8 hours'),w.user_id,COUNT(*),MAX(w.created_at) FROM guess_wins w JOIN chat_redpacks r ON r.id=w.packet_id JOIN chat_messages m ON m.id=r.message_id GROUP BY m.group_id,date(w.created_at,'unixepoch','+8 hours'),w.user_id;

CREATE TRIGGER guess_stats_ldc_start AFTER INSERT ON ldc_packets
WHEN NEW.group_id IS NOT NULL AND NEW.mode IN ('guess','clues') BEGIN
 INSERT INTO guess_group_stats(group_id,day,rounds,wins) VALUES(NEW.group_id,'*',1,0),(NEW.group_id,date(NEW.created_at,'unixepoch','+8 hours'),1,0)
 ON CONFLICT(group_id,day) DO UPDATE SET rounds=rounds+1;
END;
CREATE TRIGGER guess_stats_free_start AFTER INSERT ON guess_free_rounds
WHEN NEW.mode IN ('guess','clues') BEGIN
 INSERT INTO guess_group_stats(group_id,day,rounds,wins) VALUES(NEW.group_id,'*',1,0),(NEW.group_id,date(NEW.created_at,'unixepoch','+8 hours'),1,0)
 ON CONFLICT(group_id,day) DO UPDATE SET rounds=rounds+1;
END;
CREATE TRIGGER guess_stats_win AFTER INSERT ON guess_wins BEGIN
 INSERT INTO guess_group_stats(group_id,day,rounds,wins)
 SELECT m.group_id,'*',0,1 FROM chat_redpacks r JOIN chat_messages m ON m.id=r.message_id WHERE r.id=NEW.packet_id
 ON CONFLICT(group_id,day) DO UPDATE SET wins=wins+1;
 INSERT INTO guess_group_stats(group_id,day,rounds,wins)
 SELECT m.group_id,date(NEW.created_at,'unixepoch','+8 hours'),0,1 FROM chat_redpacks r JOIN chat_messages m ON m.id=r.message_id WHERE r.id=NEW.packet_id
 ON CONFLICT(group_id,day) DO UPDATE SET wins=wins+1;
 INSERT INTO guess_group_player_stats(group_id,day,user_id,wins,last_at)
 SELECT m.group_id,'*',NEW.user_id,1,NEW.created_at FROM chat_redpacks r JOIN chat_messages m ON m.id=r.message_id WHERE r.id=NEW.packet_id
 ON CONFLICT(group_id,day,user_id) DO UPDATE SET wins=wins+1,last_at=MAX(last_at,NEW.created_at);
 INSERT INTO guess_group_player_stats(group_id,day,user_id,wins,last_at)
 SELECT m.group_id,date(NEW.created_at,'unixepoch','+8 hours'),NEW.user_id,1,NEW.created_at FROM chat_redpacks r JOIN chat_messages m ON m.id=r.message_id WHERE r.id=NEW.packet_id
 ON CONFLICT(group_id,day,user_id) DO UPDATE SET wins=wins+1,last_at=MAX(last_at,NEW.created_at);
END;
