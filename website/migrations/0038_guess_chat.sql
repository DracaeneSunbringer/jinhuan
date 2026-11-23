-- 群内猜词：保留已有游戏/订单，只约束新创建；不得重放。
ALTER TABLE ldc_packets ADD COLUMN group_id INTEGER;
ALTER TABLE ldc_packets ADD COLUMN game_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ldc_packets ADD COLUMN response_mode TEXT NOT NULL DEFAULT 'yesno' CHECK(response_mode IN ('yesno','similarity'));
ALTER TABLE ldc_packets ADD COLUMN answer_length INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ldc_packets ADD COLUMN guess_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ldc_packets ADD COLUMN ai_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ldc_packets ADD COLUMN hints_box TEXT;
ALTER TABLE ldc_packets ADD COLUMN hints_revealed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ldc_packets ADD COLUMN hint_at INTEGER NOT NULL DEFAULT 0;
UPDATE ldc_packets SET group_id=(SELECT m.group_id FROM chat_redpacks r JOIN chat_messages m ON m.id=r.message_id WHERE r.id=ldc_packets.packet_id);
CREATE INDEX idx_ldc_active_group ON ldc_packets(group_id,ends_at) WHERE state='open' AND mode IN ('guess','clues');
CREATE TRIGGER ldc_single_active BEFORE INSERT ON ldc_packets
WHEN NEW.mode IN ('guess','clues') AND NEW.group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id)
AND EXISTS(SELECT 1 FROM ldc_packets p WHERE p.group_id=NEW.group_id AND p.state='open' AND p.mode IN ('guess','clues') AND p.ends_at>NEW.created_at
 AND NOT EXISTS(SELECT 1 FROM ldc_awards a WHERE a.packet_id=p.packet_id AND a.recipient_id IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'ldc_active_game'); END;
ALTER TABLE ldc_questions ADD COLUMN kind TEXT NOT NULL DEFAULT 'question' CHECK(kind IN ('question','guess'));
ALTER TABLE ldc_questions ADD COLUMN score INTEGER CHECK(score BETWEEN 0 AND 100);
ALTER TABLE ldc_questions ADD COLUMN cache_key TEXT;
ALTER TABLE ldc_questions ADD COLUMN source_message_id INTEGER;
ALTER TABLE ldc_questions ADD COLUMN source_body TEXT;
CREATE UNIQUE INDEX idx_ldc_question_message ON ldc_questions(source_message_id) WHERE source_message_id IS NOT NULL;
CREATE INDEX idx_ldc_question_cache ON ldc_questions(packet_id,cache_key);
CREATE TABLE ldc_question_cache (
 packet_id TEXT NOT NULL REFERENCES ldc_packets(packet_id), cache_key TEXT NOT NULL,
 lease TEXT NOT NULL, expires_at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','done','error')),
 verdict TEXT NOT NULL DEFAULT 'pending', score INTEGER CHECK(score BETWEEN 0 AND 99),
 PRIMARY KEY(packet_id,cache_key)
);
ALTER TABLE chat_boosts ADD COLUMN ai_status TEXT NOT NULL DEFAULT '';
ALTER TABLE chat_boosts ADD COLUMN ai_score INTEGER CHECK(ai_score BETWEEN 0 AND 100);
-- 发消息限速：一分钟发言范围与一天内图片范围分开定位，避免每次重扫全天文字。
CREATE INDEX idx_chat_msg_media_rate ON chat_messages(user_id,created_at)
 WHERE system_kind IS NULL AND image_key IS NOT NULL;
