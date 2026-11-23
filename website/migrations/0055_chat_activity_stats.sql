-- 水群统计日为北京时间04:00至次日04:00。主群用户消息计数，独立猜词表不参与。
CREATE TABLE chat_activity_stats(
 group_id INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
 day TEXT NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id),messages INTEGER NOT NULL CHECK(messages>=0),
 first_at INTEGER,last_at INTEGER,PRIMARY KEY(group_id,day,user_id)
);
CREATE INDEX idx_chat_activity_count ON chat_activity_stats(group_id,day,messages DESC,user_id);
CREATE INDEX idx_chat_activity_first ON chat_activity_stats(group_id,day,first_at,user_id);
CREATE INDEX idx_chat_activity_last ON chat_activity_stats(group_id,day,last_at DESC,user_id);
-- 撤回边界消息时只在本群/本人的一天内定位相邻有效消息，MIN/MAX可使用索引端点。
CREATE INDEX idx_chat_activity_source ON chat_messages(group_id,user_id,created_at,id) WHERE deleted=0 AND system_kind IS NULL;
INSERT INTO chat_activity_stats
 SELECT m.group_id,date(m.created_at,'unixepoch','+4 hours'),m.user_id,COUNT(*),MIN(m.created_at),MAX(m.created_at)
 FROM chat_messages m JOIN users u ON u.id=m.user_id WHERE m.deleted=0 AND m.system_kind IS NULL AND u.kind='user'
 GROUP BY m.group_id,date(m.created_at,'unixepoch','+4 hours'),m.user_id;
INSERT INTO chat_activity_stats SELECT group_id,'*',user_id,SUM(messages),NULL,NULL FROM chat_activity_stats GROUP BY group_id,user_id;
CREATE TRIGGER chat_activity_insert AFTER INSERT ON chat_messages BEGIN
 INSERT INTO chat_activity_stats(group_id,day,user_id,messages,first_at,last_at)
 SELECT NEW.group_id,date(NEW.created_at,'unixepoch','+4 hours'),NEW.user_id,1,NEW.created_at,NEW.created_at
 WHERE NEW.deleted=0 AND NEW.system_kind IS NULL AND EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND kind='user')
 ON CONFLICT(group_id,day,user_id) DO UPDATE SET messages=messages+1,first_at=MIN(first_at,excluded.first_at),last_at=MAX(last_at,excluded.last_at);
 INSERT INTO chat_activity_stats(group_id,day,user_id,messages)
 SELECT NEW.group_id,'*',NEW.user_id,1
 WHERE NEW.deleted=0 AND NEW.system_kind IS NULL AND EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND kind='user')
 ON CONFLICT(group_id,day,user_id) DO UPDATE SET messages=messages+1;
END;
CREATE TRIGGER chat_activity_remove AFTER DELETE ON chat_messages BEGIN
 UPDATE chat_activity_stats SET messages=messages-1,
 first_at=CASE WHEN first_at=OLD.created_at THEN (SELECT MIN(created_at) FROM chat_messages INDEXED BY idx_chat_activity_source WHERE group_id=OLD.group_id AND user_id=OLD.user_id AND deleted=0 AND system_kind IS NULL AND id<>OLD.id AND created_at>=(OLD.created_at+14400)/86400*86400-14400 AND created_at<(OLD.created_at+14400)/86400*86400+72000) ELSE first_at END,
 last_at=CASE WHEN last_at=OLD.created_at THEN (SELECT MAX(created_at) FROM chat_messages INDEXED BY idx_chat_activity_source WHERE group_id=OLD.group_id AND user_id=OLD.user_id AND deleted=0 AND system_kind IS NULL AND id<>OLD.id AND created_at>=(OLD.created_at+14400)/86400*86400-14400 AND created_at<(OLD.created_at+14400)/86400*86400+72000) ELSE last_at END
 WHERE group_id=OLD.group_id AND user_id=OLD.user_id AND day IN('*',date(OLD.created_at,'unixepoch','+4 hours')) AND OLD.deleted=0 AND OLD.system_kind IS NULL AND EXISTS(SELECT 1 FROM users WHERE id=OLD.user_id AND kind='user');
 DELETE FROM chat_activity_stats WHERE group_id=OLD.group_id AND user_id=OLD.user_id AND day IN('*',date(OLD.created_at,'unixepoch','+4 hours')) AND messages=0;
END;
CREATE TRIGGER chat_activity_update AFTER UPDATE OF deleted,system_kind,user_id,group_id,created_at ON chat_messages WHEN OLD.deleted IS NOT NEW.deleted OR OLD.system_kind IS NOT NEW.system_kind OR OLD.user_id IS NOT NEW.user_id OR OLD.group_id IS NOT NEW.group_id OR OLD.created_at IS NOT NEW.created_at BEGIN
 UPDATE chat_activity_stats SET messages=messages-1,
 first_at=CASE WHEN first_at=OLD.created_at THEN (SELECT MIN(created_at) FROM chat_messages INDEXED BY idx_chat_activity_source WHERE group_id=OLD.group_id AND user_id=OLD.user_id AND deleted=0 AND system_kind IS NULL AND id<>OLD.id AND created_at>=(OLD.created_at+14400)/86400*86400-14400 AND created_at<(OLD.created_at+14400)/86400*86400+72000) ELSE first_at END,
 last_at=CASE WHEN last_at=OLD.created_at THEN (SELECT MAX(created_at) FROM chat_messages INDEXED BY idx_chat_activity_source WHERE group_id=OLD.group_id AND user_id=OLD.user_id AND deleted=0 AND system_kind IS NULL AND id<>OLD.id AND created_at>=(OLD.created_at+14400)/86400*86400-14400 AND created_at<(OLD.created_at+14400)/86400*86400+72000) ELSE last_at END
 WHERE group_id=OLD.group_id AND user_id=OLD.user_id AND day IN('*',date(OLD.created_at,'unixepoch','+4 hours')) AND OLD.deleted=0 AND OLD.system_kind IS NULL AND EXISTS(SELECT 1 FROM users WHERE id=OLD.user_id AND kind='user');
 DELETE FROM chat_activity_stats WHERE group_id=OLD.group_id AND user_id=OLD.user_id AND day IN('*',date(OLD.created_at,'unixepoch','+4 hours')) AND messages=0;

 INSERT INTO chat_activity_stats(group_id,day,user_id,messages,first_at,last_at)
 SELECT NEW.group_id,date(NEW.created_at,'unixepoch','+4 hours'),NEW.user_id,1,NEW.created_at,NEW.created_at
 WHERE NEW.deleted=0 AND NEW.system_kind IS NULL AND EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND kind='user')
 ON CONFLICT(group_id,day,user_id) DO UPDATE SET messages=messages+1,first_at=MIN(first_at,excluded.first_at),last_at=MAX(last_at,excluded.last_at);
 INSERT INTO chat_activity_stats(group_id,day,user_id,messages)
 SELECT NEW.group_id,'*',NEW.user_id,1
 WHERE NEW.deleted=0 AND NEW.system_kind IS NULL AND EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND kind='user')
 ON CONFLICT(group_id,day,user_id) DO UPDATE SET messages=messages+1;
END;
CREATE TRIGGER chat_activity_retired_insert BEFORE INSERT ON chat_activity_stats WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER chat_activity_retired_update BEFORE UPDATE OF user_id ON chat_activity_stats WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
