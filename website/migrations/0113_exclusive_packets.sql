-- 单人专属奖励：公开消息保持可见，领取资格在数据库再次校验。
ALTER TABLE ldc_packets ADD COLUMN exclusive_user_id INTEGER REFERENCES users(id);
CREATE TRIGGER ldc_exclusive_packet_shape_insert BEFORE INSERT ON ldc_packets
WHEN NEW.exclusive_user_id IS NOT NULL AND (NEW.count<>1 OR NEW.mode NOT IN ('fixed','random') OR NEW.exclusive_user_id=NEW.owner_id)
BEGIN SELECT RAISE(ABORT,'exclusive_packet_invalid'); END;
CREATE TRIGGER ldc_exclusive_packet_shape_update BEFORE UPDATE OF exclusive_user_id,count,mode,owner_id ON ldc_packets
WHEN NEW.exclusive_user_id IS NOT NULL AND (NEW.count<>1 OR NEW.mode NOT IN ('fixed','random') OR NEW.exclusive_user_id=NEW.owner_id)
BEGIN SELECT RAISE(ABORT,'exclusive_packet_invalid'); END;
CREATE TRIGGER ldc_exclusive_award_insert BEFORE INSERT ON ldc_awards
WHEN NEW.recipient_id IS NOT NULL AND EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id AND exclusive_user_id IS NOT NULL AND exclusive_user_id<>NEW.recipient_id)
BEGIN SELECT RAISE(ABORT,'exclusive_recipient_mismatch'); END;
CREATE TRIGGER ldc_exclusive_award_update BEFORE UPDATE OF recipient_id,packet_id ON ldc_awards
WHEN NEW.recipient_id IS NOT NULL AND EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id AND exclusive_user_id IS NOT NULL AND exclusive_user_id<>NEW.recipient_id)
BEGIN SELECT RAISE(ABORT,'exclusive_recipient_mismatch'); END;
