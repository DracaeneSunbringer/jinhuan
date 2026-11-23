-- 只登记上线时仍有效及之后的原生拼手气红包；不以个人连接器快照授奖。
CREATE TABLE packet_luck_jobs(packet_id TEXT PRIMARY KEY REFERENCES ldc_packets(packet_id),due_at INTEGER NOT NULL);
CREATE INDEX idx_packet_luck_due ON packet_luck_jobs(due_at,packet_id);
CREATE TABLE packet_luck_settlements(packet_id TEXT PRIMARY KEY REFERENCES ldc_packets(packet_id),settled_at INTEGER NOT NULL);
CREATE TABLE packet_luck_wins(
 packet_id TEXT NOT NULL REFERENCES packet_luck_settlements(packet_id),user_id INTEGER NOT NULL REFERENCES users(id),
 badge TEXT NOT NULL CHECK(badge IN('luck_king','luck_last')),amount_cents INTEGER NOT NULL CHECK(amount_cents>0),created_at INTEGER NOT NULL,
 PRIMARY KEY(packet_id,user_id,badge)
);
CREATE INDEX idx_packet_luck_user ON packet_luck_wins(user_id,badge,created_at);
INSERT INTO packet_luck_jobs SELECT packet_id,ends_at FROM ldc_packets WHERE mode='random' AND state='open' AND ends_at>unixepoch();
CREATE TRIGGER packet_luck_enqueue AFTER INSERT ON ldc_packets WHEN NEW.mode='random' BEGIN
 INSERT INTO packet_luck_jobs VALUES(NEW.packet_id,NEW.ends_at);
END;
CREATE TRIGGER packet_luck_award_signal AFTER UPDATE OF state,recipient_id ON ldc_awards
WHEN OLD.state IS NOT NEW.state OR OLD.recipient_id IS NOT NEW.recipient_id BEGIN
 UPDATE packet_luck_jobs SET due_at=unixepoch() WHERE packet_id=NEW.packet_id;
END;
CREATE TRIGGER packet_luck_close_signal AFTER UPDATE OF state ON ldc_packets WHEN OLD.state<>NEW.state BEGIN
 UPDATE packet_luck_jobs SET due_at=unixepoch() WHERE packet_id=NEW.packet_id;
END;
CREATE TRIGGER packet_luck_retired_insert BEFORE INSERT ON packet_luck_wins
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER packet_luck_win_immutable BEFORE UPDATE ON packet_luck_wins BEGIN SELECT RAISE(ABORT,'luck_win_immutable'); END;
CREATE TRIGGER packet_luck_settled AFTER INSERT ON packet_luck_settlements BEGIN
 INSERT INTO packet_luck_wins(packet_id,user_id,badge,amount_cents,created_at)
 SELECT NEW.packet_id,a.recipient_id,k.badge,a.amount_cents,NEW.settled_at
 FROM ldc_awards a JOIN users u ON u.id=a.recipient_id
 JOIN (SELECT 'luck_king' badge UNION ALL SELECT 'luck_last') k
 WHERE a.packet_id=NEW.packet_id AND a.state='accepted' AND u.disabled=0 AND u.kind='user'
 AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=a.recipient_id)
 AND (SELECT COUNT(*) FROM ldc_awards WHERE packet_id=NEW.packet_id AND state='accepted' AND recipient_id IS NOT NULL)>=2
 AND (SELECT MIN(amount_cents)<MAX(amount_cents) FROM ldc_awards WHERE packet_id=NEW.packet_id AND state='accepted' AND recipient_id IS NOT NULL)
 AND a.amount_cents=CASE k.badge WHEN 'luck_king' THEN (SELECT MAX(amount_cents) FROM ldc_awards WHERE packet_id=NEW.packet_id AND state='accepted' AND recipient_id IS NOT NULL)
 ELSE (SELECT MIN(amount_cents) FROM ldc_awards WHERE packet_id=NEW.packet_id AND state='accepted' AND recipient_id IS NOT NULL) END;
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
