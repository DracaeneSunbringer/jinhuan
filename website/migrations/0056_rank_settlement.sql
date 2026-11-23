-- 每个统计日只生成一份结算快照；奖励与群通知在同一事务中写入。
CREATE TABLE rank_settlement_jobs(
 group_id INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
 board TEXT NOT NULL CHECK(board IN('guess','sender_count','chat_count','chat_early','chat_late')),
 period TEXT NOT NULL CHECK(period IN('day','all')),next_at INTEGER NOT NULL,
 PRIMARY KEY(group_id,board,period),CHECK(period='day' OR board NOT IN('chat_early','chat_late'))
);
CREATE INDEX idx_rank_jobs_due ON rank_settlement_jobs(next_at,group_id,board,period);
CREATE TABLE rank_settlements(
 group_id INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,board TEXT NOT NULL,
 period TEXT NOT NULL,day TEXT NOT NULL,cutoff INTEGER NOT NULL,settled_at INTEGER NOT NULL,token TEXT NOT NULL,
 PRIMARY KEY(group_id,board,period,day),CHECK(cutoff<=settled_at)
);
CREATE TABLE rank_placements(
 group_id INTEGER NOT NULL,board TEXT NOT NULL,period TEXT NOT NULL,day TEXT NOT NULL,
 place INTEGER NOT NULL CHECK(place BETWEEN 1 AND 3),user_id INTEGER NOT NULL REFERENCES users(id),
 score INTEGER NOT NULL,name TEXT NOT NULL,created_at INTEGER NOT NULL,
 PRIMARY KEY(group_id,board,period,day,place),UNIQUE(group_id,board,period,day,user_id),
 FOREIGN KEY(group_id,board,period,day) REFERENCES rank_settlements(group_id,board,period,day) ON DELETE CASCADE
);
CREATE INDEX idx_rank_placement_user ON rank_placements(user_id,board,period,day);
CREATE TRIGGER rank_placement_immutable BEFORE UPDATE ON rank_placements BEGIN SELECT RAISE(ABORT,'rank_placement_immutable'); END;
CREATE TRIGGER rank_placement_retired BEFORE INSERT ON rank_placements WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
INSERT INTO rank_settlement_jobs
 SELECT g.id,b.board,p.period,((unixepoch()+b.offset)/86400+1)*86400-b.offset
 FROM chat_groups g JOIN (SELECT 'guess' board,28800 offset UNION ALL SELECT 'sender_count',28800 UNION ALL SELECT 'chat_count',14400 UNION ALL SELECT 'chat_early',14400 UNION ALL SELECT 'chat_late',14400) b
 JOIN (SELECT 'day' period UNION ALL SELECT 'all') p WHERE p.period='day' OR b.board NOT IN('chat_early','chat_late');
CREATE TRIGGER rank_group_jobs AFTER INSERT ON chat_groups BEGIN
 INSERT INTO rank_settlement_jobs
 SELECT NEW.id,b.board,p.period,((unixepoch()+b.offset)/86400+1)*86400-b.offset
 FROM (SELECT 'guess' board,28800 offset UNION ALL SELECT 'sender_count',28800 UNION ALL SELECT 'chat_count',14400 UNION ALL SELECT 'chat_early',14400 UNION ALL SELECT 'chat_late',14400) b
 JOIN (SELECT 'day' period UNION ALL SELECT 'all') p WHERE p.period='day' OR b.board NOT IN('chat_early','chat_late');
END;

CREATE TABLE rank_reward_catalog(series TEXT NOT NULL,level INTEGER NOT NULL,threshold INTEGER NOT NULL,name TEXT NOT NULL,label TEXT NOT NULL,PRIMARY KEY(series,level));
INSERT INTO rank_reward_catalog VALUES
('rank_guess_day',1,1,'灵感新星·日','猜词日榜'),
('rank_guess_day',2,3,'解谜先锋·日','猜词日榜'),
('rank_guess_day',3,10,'词境探长·日','猜词日榜'),
('rank_guess_day',4,30,'谜域宗师·日','猜词日榜'),
('rank_guess_day',5,100,'万象解谜·日','猜词日榜'),
('rank_guess_all',1,1,'灵感新星·总','猜词总榜'),
('rank_guess_all',2,3,'解谜先锋·总','猜词总榜'),
('rank_guess_all',3,10,'词境探长·总','猜词总榜'),
('rank_guess_all',4,30,'谜域宗师·总','猜词总榜'),
('rank_guess_all',5,100,'万象解谜·总','猜词总榜'),
('rank_sender_count_day',1,1,'分享新星·日','发包次数日榜'),
('rank_sender_count_day',2,3,'慷慨使者·日','发包次数日榜'),
('rank_sender_count_day',3,10,'福袋名家·日','发包次数日榜'),
('rank_sender_count_day',4,30,'散财宗师·日','发包次数日榜'),
('rank_sender_count_day',5,100,'万福领主·日','发包次数日榜'),
('rank_sender_count_all',1,1,'分享新星·总','发包次数总榜'),
('rank_sender_count_all',2,3,'慷慨使者·总','发包次数总榜'),
('rank_sender_count_all',3,10,'福袋名家·总','发包次数总榜'),
('rank_sender_count_all',4,30,'散财宗师·总','发包次数总榜'),
('rank_sender_count_all',5,100,'万福领主·总','发包次数总榜'),
('rank_chat_count_day',1,1,'话匣初开·日','水群日榜'),
('rank_chat_count_day',2,3,'畅聊达人·日','水群日榜'),
('rank_chat_count_day',3,10,'话题领航·日','水群日榜'),
('rank_chat_count_day',4,30,'群聊宗师·日','水群日榜'),
('rank_chat_count_day',5,100,'万语星主·日','水群日榜'),
('rank_chat_count_all',1,1,'话匣初开·总','水群总榜'),
('rank_chat_count_all',2,3,'畅聊达人·总','水群总榜'),
('rank_chat_count_all',3,10,'话题领航·总','水群总榜'),
('rank_chat_count_all',4,30,'群聊宗师·总','水群总榜'),
('rank_chat_count_all',5,100,'万语星主·总','水群总榜'),
('rank_chat_early_day',1,1,'晨光初至·日','早起日榜'),
('rank_chat_early_day',2,3,'破晓行者·日','早起日榜'),
('rank_chat_early_day',3,10,'朝露信使·日','早起日榜'),
('rank_chat_early_day',4,30,'晨曦领航·日','早起日榜'),
('rank_chat_early_day',5,100,'曜日起航·日','早起日榜'),
('rank_chat_late_day',1,1,'晚星初现·日','夜聊日榜'),
('rank_chat_late_day',2,3,'夜语行者·日','夜聊日榜'),
('rank_chat_late_day',3,10,'月下听风·日','夜聊日榜'),
('rank_chat_late_day',4,30,'星河守望·日','夜聊日榜'),
('rank_chat_late_day',5,100,'长夜星主·日','夜聊日榜');
CREATE TRIGGER rank_placement_unlock AFTER INSERT ON rank_placements BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rank_reward_catalog WHERE series='rank_'||NEW.board||'_'||NEW.period AND level=1) THEN RAISE(ABORT,'rank_catalog_missing') END;
 INSERT INTO user_badges(user_id,badge,n,first_at,last_day) VALUES(NEW.user_id,'rank_'||NEW.board||'_'||NEW.period,1,NEW.created_at,NEW.day)
 ON CONFLICT(user_id,badge) DO UPDATE SET n=n+1,last_day=MAX(last_day,excluded.last_day);
 INSERT OR IGNORE INTO user_unlocks(user_id,item,at)
 SELECT NEW.user_id,r.series||':'||r.level,NEW.created_at FROM rank_reward_catalog r
 JOIN user_badges b ON b.user_id=NEW.user_id AND b.badge=r.series
 WHERE r.series='rank_'||NEW.board||'_'||NEW.period AND b.n>=r.threshold;
 UPDATE users SET deco=json_set(deco,'$.bn',(SELECT n FROM user_badges WHERE user_id=NEW.user_id AND badge='rank_'||NEW.board||'_'||NEW.period))
 WHERE id=NEW.user_id AND json_valid(deco) AND json_extract(deco,'$.bd')='rank_'||NEW.board||'_'||NEW.period;
END;
