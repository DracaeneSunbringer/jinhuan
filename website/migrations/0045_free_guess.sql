-- 无奖励游戏不写入资金奖池或订单。共用开局卡片、专区消息与确定性判题算法。
CREATE TABLE guess_free_rounds (
 packet_id TEXT PRIMARY KEY REFERENCES chat_redpacks(id),owner_id INTEGER NOT NULL REFERENCES users(id),
 group_id INTEGER NOT NULL REFERENCES chat_groups(id),mode TEXT NOT NULL CHECK(mode IN('guess','clues')),
 ends_at INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'open' CHECK(state IN('open','closed')),
 answer_box TEXT NOT NULL,hints_json TEXT NOT NULL DEFAULT '[]',created_at INTEGER NOT NULL,
 game_version INTEGER NOT NULL DEFAULT 1,response_mode TEXT NOT NULL CHECK(response_mode IN('yesno','similarity')),
 answer_length INTEGER NOT NULL,guess_count INTEGER NOT NULL DEFAULT 0,question_count INTEGER NOT NULL DEFAULT 0,
 ai_count INTEGER NOT NULL DEFAULT 0,hints_box TEXT,hints_revealed INTEGER NOT NULL DEFAULT 0,hint_at INTEGER NOT NULL DEFAULT 0,
 room_revision INTEGER NOT NULL DEFAULT 0,generated INTEGER NOT NULL CHECK(generated IN(0,1)),
 winner_id INTEGER REFERENCES users(id),won_at INTEGER
);
CREATE INDEX idx_free_guess_owner ON guess_free_rounds(owner_id);
CREATE INDEX idx_free_guess_winner ON guess_free_rounds(winner_id) WHERE winner_id IS NOT NULL;
CREATE INDEX idx_free_guess_active ON guess_free_rounds(group_id,ends_at) WHERE state='open' AND winner_id IS NULL;
CREATE INDEX idx_free_guess_history ON guess_free_rounds(group_id,created_at DESC,packet_id DESC);
CREATE INDEX idx_free_guess_due ON guess_free_rounds(ends_at,packet_id) WHERE state='open' AND mode IN('guess','clues');
CREATE INDEX idx_ldc_guess_due ON ldc_packets(ends_at,packet_id) WHERE state='open' AND mode IN('guess','clues');
CREATE TABLE guess_free_questions (
 id TEXT PRIMARY KEY,packet_id TEXT NOT NULL REFERENCES guess_free_rounds(packet_id),user_id INTEGER NOT NULL REFERENCES users(id),
 nonce TEXT NOT NULL,question TEXT NOT NULL,verdict TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('question','guess')),score INTEGER CHECK(score BETWEEN 0 AND 100),cache_key TEXT,
 source_message_id INTEGER REFERENCES chat_messages(id),source_body TEXT,source_room_id INTEGER REFERENCES guess_room_messages(id),
 UNIQUE(packet_id,user_id,nonce)
);
CREATE INDEX idx_free_question_user ON guess_free_questions(user_id);
CREATE INDEX idx_free_question_cache ON guess_free_questions(packet_id,cache_key);
CREATE UNIQUE INDEX idx_free_question_message ON guess_free_questions(source_message_id) WHERE source_message_id IS NOT NULL;
CREATE UNIQUE INDEX idx_free_question_room ON guess_free_questions(source_room_id) WHERE source_room_id IS NOT NULL;
CREATE INDEX idx_free_guess_rank ON guess_free_questions(packet_id,score DESC,created_at DESC,id DESC) WHERE kind='guess' AND score IS NOT NULL;
CREATE INDEX idx_free_yes_facts ON guess_free_questions(packet_id,created_at DESC,id DESC) WHERE kind='question' AND verdict='yes';
CREATE INDEX idx_free_no_facts ON guess_free_questions(packet_id,created_at DESC,id DESC) WHERE kind='question' AND verdict='no';
CREATE TABLE guess_free_cache (
 packet_id TEXT NOT NULL REFERENCES guess_free_rounds(packet_id),cache_key TEXT NOT NULL,lease TEXT NOT NULL,expires_at INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','done','error')),verdict TEXT NOT NULL DEFAULT 'pending',score INTEGER CHECK(score BETWEEN 0 AND 99),
 PRIMARY KEY(packet_id,cache_key)
);
CREATE TRIGGER free_guess_single_active BEFORE INSERT ON guess_free_rounds
WHEN NOT EXISTS(SELECT 1 FROM guess_free_rounds WHERE packet_id=NEW.packet_id) AND (
 EXISTS(SELECT 1 FROM guess_free_rounds WHERE group_id=NEW.group_id AND state='open' AND winner_id IS NULL AND ends_at>NEW.created_at) OR
 EXISTS(SELECT 1 FROM ldc_packets p WHERE p.group_id=NEW.group_id AND p.state='open' AND p.mode IN('guess','clues') AND p.ends_at>NEW.created_at
 AND NOT EXISTS(SELECT 1 FROM ldc_awards a WHERE a.packet_id=p.packet_id AND a.recipient_id IS NOT NULL)))
BEGIN SELECT RAISE(ABORT,'ldc_active_game'); END;
CREATE TRIGGER ldc_block_free_active BEFORE INSERT ON ldc_packets
WHEN NEW.mode IN('guess','clues') AND NOT EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id)
 AND EXISTS(SELECT 1 FROM guess_free_rounds WHERE group_id=NEW.group_id AND state='open' AND winner_id IS NULL AND ends_at>NEW.created_at)
BEGIN SELECT RAISE(ABORT,'ldc_active_game'); END;
CREATE TRIGGER free_guess_winner_immutable BEFORE UPDATE OF winner_id ON guess_free_rounds
WHEN OLD.winner_id IS NOT NULL AND NEW.winner_id IS NOT OLD.winner_id BEGIN SELECT RAISE(ABORT,'guess_winner_immutable'); END;
CREATE TRIGGER free_guess_retired_insert BEFORE INSERT ON guess_free_rounds
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.owner_id OR source_id=NEW.winner_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER free_guess_retired_update BEFORE UPDATE OF owner_id,winner_id ON guess_free_rounds
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.owner_id OR source_id=NEW.winner_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER free_question_retired_insert BEFORE INSERT ON guess_free_questions
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER free_question_retired_update BEFORE UPDATE OF user_id ON guess_free_questions
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER guess_room_account_live_update BEFORE UPDATE OF user_id ON guess_room_messages
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER free_guess_signal_insert AFTER INSERT ON guess_room_messages BEGIN
 UPDATE guess_free_rounds SET room_revision=room_revision+1 WHERE packet_id=NEW.packet_id;
END;
CREATE TRIGGER free_guess_signal_update AFTER UPDATE OF ai_text,ai_score,ai_status,deleted ON guess_room_messages
WHEN OLD.ai_text IS NOT NEW.ai_text OR OLD.ai_score IS NOT NEW.ai_score OR OLD.ai_status IS NOT NEW.ai_status OR OLD.deleted<>NEW.deleted BEGIN
 UPDATE guess_free_rounds SET room_revision=room_revision+1 WHERE packet_id=NEW.packet_id;
END;
-- 回填唯一登记，不重算或重加已有计数。随后两种胜利均通过同一个登记触发器累计。
CREATE TABLE guess_wins(packet_id TEXT PRIMARY KEY REFERENCES chat_redpacks(id),user_id INTEGER NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL);
CREATE INDEX idx_guess_wins_user ON guess_wins(user_id,created_at);
INSERT OR IGNORE INTO guess_wins SELECT a.packet_id,a.recipient_id,COALESCE(a.sent_at,p.created_at) FROM ldc_awards a JOIN ldc_packets p ON p.packet_id=a.packet_id
 WHERE a.slot=0 AND a.recipient_id IS NOT NULL AND p.mode IN('guess','clues') AND p.count=1;
CREATE TRIGGER guess_wins_retired_insert BEFORE INSERT ON guess_wins
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER guess_wins_immutable BEFORE UPDATE ON guess_wins BEGIN SELECT RAISE(ABORT,'guess_win_immutable'); END;
DROP TRIGGER trg_guess_win_reward;
CREATE TRIGGER trg_guess_win_reward AFTER UPDATE OF recipient_id ON ldc_awards
WHEN OLD.recipient_id IS NULL AND NEW.recipient_id IS NOT NULL AND NEW.slot=0
 AND EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id AND mode IN('guess','clues') AND count=1)
BEGIN INSERT OR IGNORE INTO guess_wins VALUES(NEW.packet_id,NEW.recipient_id,unixepoch()); END;
CREATE TRIGGER free_guess_win_reward AFTER UPDATE OF winner_id ON guess_free_rounds
WHEN OLD.winner_id IS NULL AND NEW.winner_id IS NOT NULL
BEGIN INSERT OR IGNORE INTO guess_wins VALUES(NEW.packet_id,NEW.winner_id,NEW.won_at); END;
CREATE TRIGGER guess_win_unlock AFTER INSERT ON guess_wins BEGIN
 INSERT INTO user_badges(user_id,badge,n,first_at,last_day) VALUES(NEW.user_id,'guess',1,NEW.created_at,date(NEW.created_at,'unixepoch','+8 hours'))
 ON CONFLICT(user_id,badge) DO UPDATE SET n=n+1,last_day=excluded.last_day;
 INSERT OR IGNORE INTO user_unlocks(user_id,item,at)
 SELECT NEW.user_id,'guess:'||level,NEW.created_at FROM (SELECT 1 AS level,1 AS wins UNION ALL SELECT 2,3 UNION ALL SELECT 3,10 UNION ALL SELECT 4,30 UNION ALL SELECT 5,100)
 WHERE wins<=(SELECT n FROM user_badges WHERE user_id=NEW.user_id AND badge='guess');
 UPDATE users SET deco=json_set(deco,'$.bn',(SELECT n FROM user_badges WHERE user_id=NEW.user_id AND badge='guess'))
 WHERE id=NEW.user_id AND json_valid(deco) AND json_extract(deco,'$.bd')='guess';
 INSERT OR IGNORE INTO chat_messages(group_id,user_id,body,created_at,updated_at,system_kind,system_ref)
 SELECT m.group_id,NEW.user_id,COALESCE(u.nick,u.name,u.username)||' 猜词累计获胜 '||b.n||' 次，升至 LV.'||r.level||'「'||r.title||'」！已解锁本级称号、徽章和气泡，可在装扮中自行选择。',NEW.created_at,NEW.created_at,'guess_level',CAST(NEW.user_id AS TEXT)||':'||r.level
 FROM chat_redpacks p JOIN chat_messages m ON m.id=p.message_id JOIN users u ON u.id=NEW.user_id JOIN user_badges b ON b.user_id=u.id AND b.badge='guess'
 JOIN (SELECT 1 AS level,1 AS wins,'猜词新星' AS title UNION ALL SELECT 2,3,'识词达人' UNION ALL SELECT 3,10,'灵感猎手' UNION ALL SELECT 4,30,'谜语大师' UNION ALL SELECT 5,100,'猜词王者') r ON r.wins=b.n
 WHERE p.id=NEW.packet_id;
END;
