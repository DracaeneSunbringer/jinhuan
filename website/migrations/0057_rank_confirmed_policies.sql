-- 补齐确认发放额度与早晚累计前三；保留现有任务游标与全部奖励记录。
DROP TRIGGER rank_group_jobs;
CREATE TABLE rank_settlement_jobs_v2(
 group_id INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
 board TEXT NOT NULL CHECK(board IN('guess','sender_count','sender_paid','chat_count','chat_early','chat_late')),
 period TEXT NOT NULL CHECK(period IN('day','all')),next_at INTEGER NOT NULL,
 PRIMARY KEY(group_id,board,period)
);
INSERT INTO rank_settlement_jobs_v2 SELECT * FROM rank_settlement_jobs;
DROP TABLE rank_settlement_jobs;
ALTER TABLE rank_settlement_jobs_v2 RENAME TO rank_settlement_jobs;
CREATE INDEX idx_rank_jobs_due ON rank_settlement_jobs(next_at,group_id,board,period);
INSERT OR IGNORE INTO rank_settlement_jobs
 SELECT g.id,b.board,p.period,((unixepoch()+b.offset)/86400+1)*86400-b.offset
 FROM chat_groups g JOIN (SELECT column1 board,column2 offset FROM (VALUES ('guess',28800),('sender_count',28800),('sender_paid',28800),('chat_count',14400),('chat_early',14400),('chat_late',14400))) b JOIN (SELECT 'day' period UNION ALL SELECT 'all') p;
CREATE TRIGGER rank_group_jobs AFTER INSERT ON chat_groups BEGIN
 INSERT INTO rank_settlement_jobs
 SELECT NEW.id,b.board,p.period,((unixepoch()+b.offset)/86400+1)*86400-b.offset
 FROM (SELECT column1 board,column2 offset FROM (VALUES ('guess',28800),('sender_count',28800),('sender_paid',28800),('chat_count',14400),('chat_early',14400),('chat_late',14400))) b JOIN (SELECT 'day' period UNION ALL SELECT 'all') p;
END;
CREATE INDEX idx_rank_placement_board_day ON rank_placements(group_id,board,period,day,user_id);
CREATE TABLE chat_podium_totals(
 group_id INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
 board TEXT NOT NULL CHECK(board IN('chat_early','chat_late')),
 user_id INTEGER NOT NULL REFERENCES users(id),n INTEGER NOT NULL CHECK(n>0),
 PRIMARY KEY(group_id,board,user_id)
);
CREATE INDEX idx_chat_podium_rank ON chat_podium_totals(group_id,board,n DESC,user_id);
INSERT INTO chat_podium_totals SELECT group_id,board,user_id,COUNT(*) FROM rank_placements
 WHERE period='day' AND board IN('chat_early','chat_late') GROUP BY group_id,board,user_id;
CREATE TRIGGER rank_podium_total AFTER INSERT ON rank_placements WHEN NEW.period='day' AND NEW.board IN('chat_early','chat_late') BEGIN
 INSERT INTO chat_podium_totals VALUES(NEW.group_id,NEW.board,NEW.user_id,1)
 ON CONFLICT(group_id,board,user_id) DO UPDATE SET n=n+1;
END;
INSERT INTO rank_reward_catalog VALUES
('rank_sender_paid_day',1,1,'福光初绽·日','发放额度日榜'),
('rank_sender_paid_day',2,3,'赠福使者·日','发放额度日榜'),
('rank_sender_paid_day',3,10,'流金行者·日','发放额度日榜'),
('rank_sender_paid_day',4,30,'丰盈宗师·日','发放额度日榜'),
('rank_sender_paid_day',5,100,'万福星君·日','发放额度日榜'),
('rank_sender_paid_all',1,1,'福光初绽·总','发放额度总榜'),
('rank_sender_paid_all',2,3,'赠福使者·总','发放额度总榜'),
('rank_sender_paid_all',3,10,'流金行者·总','发放额度总榜'),
('rank_sender_paid_all',4,30,'丰盈宗师·总','发放额度总榜'),
('rank_sender_paid_all',5,100,'万福星君·总','发放额度总榜'),
('rank_chat_early_all',1,1,'晨光初至·总','早起总榜'),
('rank_chat_early_all',2,3,'破晓行者·总','早起总榜'),
('rank_chat_early_all',3,10,'朝露信使·总','早起总榜'),
('rank_chat_early_all',4,30,'晨曦领航·总','早起总榜'),
('rank_chat_early_all',5,100,'曜日起航·总','早起总榜'),
('rank_chat_late_all',1,1,'晚星初现·总','夜聊总榜'),
('rank_chat_late_all',2,3,'夜语行者·总','夜聊总榜'),
('rank_chat_late_all',3,10,'月下听风·总','夜聊总榜'),
('rank_chat_late_all',4,30,'星河守望·总','夜聊总榜'),
('rank_chat_late_all',5,100,'长夜星主·总','夜聊总榜');
