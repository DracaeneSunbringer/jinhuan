CREATE TABLE activity_honor_events(
 event_key TEXT NOT NULL,
 user_id INTEGER NOT NULL REFERENCES users(id),
 series TEXT NOT NULL CHECK(series IN('guess_pressure','guess_tormentor','guess_firstshot','guess_easy')),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(event_key,user_id,series)
);
CREATE INDEX idx_activity_honor_user ON activity_honor_events(user_id,series);
CREATE TRIGGER activity_honor_retired BEFORE INSERT ON activity_honor_events
 WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
 BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER activity_honor_immutable BEFORE UPDATE ON activity_honor_events
 BEGIN SELECT RAISE(ABORT,'activity_honor_immutable'); END;
CREATE TRIGGER activity_honor_grant AFTER INSERT ON activity_honor_events BEGIN
 INSERT INTO user_badges(user_id,badge,n,first_at,last_day)
 VALUES(NEW.user_id,NEW.series,1,NEW.created_at,date(NEW.created_at,'unixepoch','+8 hours'))
 ON CONFLICT(user_id,badge) DO UPDATE SET n=n+1,last_day=excluded.last_day;
 INSERT OR IGNORE INTO user_unlocks(user_id,item,at)
 SELECT NEW.user_id,NEW.series||':'||level,NEW.created_at
 FROM (SELECT 1 level,1 threshold UNION ALL SELECT 2,3 UNION ALL SELECT 3,10 UNION ALL SELECT 4,30 UNION ALL SELECT 5,100)
 WHERE threshold<=(SELECT n FROM user_badges WHERE user_id=NEW.user_id AND badge=NEW.series);
 UPDATE users SET deco=json_set(deco,'$.bn',(SELECT n FROM user_badges WHERE user_id=NEW.user_id AND badge=NEW.series))
 WHERE id=NEW.user_id AND json_valid(deco) AND json_extract(deco,'$.bd')=NEW.series;
END;

-- Existing round-prefix indexes bound these checks. Pending guesses defer the award;
-- failure completion re-evaluates, so a failed request never consumes the first guess.
CREATE INDEX idx_ldc_honor_guess ON ldc_questions(packet_id,kind,verdict,user_id);
CREATE INDEX idx_free_honor_guess ON guess_free_questions(packet_id,kind,verdict,user_id);
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
CREATE TRIGGER free_firstshot_honor AFTER UPDATE OF verdict ON guess_free_questions
WHEN NEW.kind='guess' AND OLD.verdict='pending' AND NEW.verdict<>'pending'
 AND NOT EXISTS(SELECT 1 FROM activity_honor_events WHERE event_key=NEW.packet_id AND series='guess_firstshot')
 AND EXISTS(SELECT 1 FROM guess_wins WHERE packet_id=NEW.packet_id) BEGIN
 INSERT OR IGNORE INTO activity_honor_events(event_key,user_id,series,created_at)
 SELECT w.packet_id,CASE r.series WHEN 'guess_firstshot' THEN w.user_id ELSE p.owner_id END,r.series,unixepoch()
 FROM guess_wins w JOIN guess_free_rounds p ON p.packet_id=w.packet_id
 JOIN (SELECT 'guess_firstshot' series UNION ALL SELECT 'guess_easy') r
 JOIN users u ON u.id=CASE r.series WHEN 'guess_firstshot' THEN w.user_id ELSE p.owner_id END
 WHERE w.packet_id=NEW.packet_id AND u.disabled=0 AND u.kind='user'
 AND EXISTS(SELECT 1 FROM guess_free_questions q WHERE q.packet_id=w.packet_id AND q.kind='guess' AND q.verdict='correct' AND q.user_id=w.user_id)
 AND NOT EXISTS(SELECT 1 FROM guess_free_questions q WHERE q.packet_id=w.packet_id AND q.kind='guess' AND q.verdict NOT IN('correct','unavailable','error','not_question'));
END;
