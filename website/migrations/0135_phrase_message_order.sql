-- New phrase packets are ordered by the first eligible matching message.
-- Existing packets retain their previous claim order.
CREATE TABLE IF NOT EXISTS phrase_order_settings(id INTEGER PRIMARY KEY CHECK(id=1),active INTEGER NOT NULL DEFAULT 0 CHECK(active IN(0,1)));
INSERT OR IGNORE INTO phrase_order_settings(id,active) VALUES(1,0);
CREATE TABLE IF NOT EXISTS phrase_order_policies(packet_id TEXT PRIMARY KEY REFERENCES ldc_packets(packet_id) ON DELETE CASCADE) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS phrase_order_entries(
 packet_id TEXT NOT NULL REFERENCES phrase_order_policies(packet_id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id),message_id INTEGER NOT NULL REFERENCES chat_messages(id),
 PRIMARY KEY(packet_id,user_id),UNIQUE(packet_id,message_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_phrase_order_rank ON phrase_order_entries(packet_id,message_id);
CREATE TRIGGER IF NOT EXISTS phrase_order_policy_after_packet AFTER INSERT ON ldc_packets BEGIN
 INSERT OR IGNORE INTO phrase_order_policies(packet_id)
 SELECT NEW.packet_id FROM chat_redpacks r JOIN phrase_order_settings s ON s.id=1 AND s.active=1
 WHERE r.id=NEW.packet_id AND r.provider='native' AND r.mode='phrase' AND NEW.mode IN('fixed','random');
END;
CREATE TRIGGER IF NOT EXISTS phrase_order_record_after_message AFTER INSERT ON chat_messages
WHEN NEW.deleted=0 AND NEW.redpack_id IS NULL AND NEW.system_kind IS NULL AND NEW.body<>'' BEGIN
 INSERT OR IGNORE INTO phrase_order_entries(packet_id,user_id,message_id)
 SELECT r.id,NEW.user_id,NEW.id
 FROM chat_redpacks r JOIN phrase_order_policies policy ON policy.packet_id=r.id
 JOIN chat_messages packet_msg ON packet_msg.id=r.message_id AND packet_msg.deleted=0
 JOIN ldc_packets p ON p.packet_id=r.id AND p.state='open' AND p.ends_at>NEW.created_at
 JOIN users u ON u.id=NEW.user_id AND u.kind='user' AND u.disabled=0 AND u.silenced=0
 JOIN chat_members cm ON cm.user_id=u.id AND cm.group_id=NEW.group_id
 WHERE r.mode='phrase' AND r.phrase=NEW.body AND packet_msg.group_id=NEW.group_id
 AND packet_msg.id<NEW.id AND packet_msg.created_at>=cm.joined_at AND u.id<>p.owner_id
 AND (p.exclusive_user_id IS NULL OR p.exclusive_user_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM chat_bans b WHERE b.group_id=NEW.group_id AND b.user_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM account_retirements ar WHERE ar.source_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM user_limits l WHERE l.user_id=u.id AND u.is_admin=0 AND l.kind='chat' AND (l.until=0 OR l.until>NEW.created_at))
 AND (p.payment_provider='coin52' OR EXISTS(SELECT 1 FROM identities i WHERE i.provider='linuxdo' AND i.user_id=u.id AND i.verified_at IS NOT NULL AND i.username IS NOT NULL AND i.username<>'' AND i.subject<>'' AND i.subject NOT GLOB '*[^0-9]*' AND CAST(i.subject AS INTEGER)>0 AND CAST(i.subject AS INTEGER)<=9007199254740991));
END;
