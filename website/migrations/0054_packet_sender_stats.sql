-- 创建与实际发放分开累计；外站分享不能证明真实创建者/金额。
CREATE TABLE packet_sender_stats(
 group_id INTEGER NOT NULL REFERENCES chat_groups(id),day TEXT NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id),
 packets INTEGER NOT NULL DEFAULT 0,declared_cents INTEGER NOT NULL DEFAULT 0,paid_cents INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL DEFAULT 0,paid_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(group_id,day,user_id)
);
CREATE INDEX idx_packet_sender_count ON packet_sender_stats(group_id,day,packets DESC,created_at,user_id);
CREATE INDEX idx_packet_sender_declared ON packet_sender_stats(group_id,day,declared_cents DESC,created_at,user_id);
CREATE INDEX idx_packet_sender_paid ON packet_sender_stats(group_id,day,paid_cents DESC,paid_at,user_id);
CREATE TABLE packet_sender_paid_events(
 award_id TEXT PRIMARY KEY REFERENCES ldc_awards(id),packet_id TEXT NOT NULL REFERENCES ldc_packets(packet_id),
 amount_cents INTEGER NOT NULL,confirmed_at INTEGER NOT NULL
);
CREATE INDEX idx_packet_sender_paid_packet ON packet_sender_paid_events(packet_id);
-- 一次性回填原生创建事实；不会触碰订单或密钥。
INSERT INTO packet_sender_stats(group_id,day,user_id,packets,declared_cents,created_at)
 SELECT group_id,'*',owner_id,COUNT(*),SUM(total_cents),MAX(created_at) FROM ldc_packets WHERE group_id IS NOT NULL GROUP BY group_id,owner_id;
INSERT INTO packet_sender_stats(group_id,day,user_id,packets,declared_cents,created_at)
 SELECT group_id,date(created_at,'unixepoch','+8 hours'),owner_id,COUNT(*),SUM(total_cents),MAX(created_at) FROM ldc_packets WHERE group_id IS NOT NULL GROUP BY group_id,date(created_at,'unixepoch','+8 hours'),owner_id;
CREATE TRIGGER packet_sender_created AFTER INSERT ON ldc_packets WHEN NEW.group_id IS NOT NULL BEGIN
 INSERT INTO packet_sender_stats(group_id,day,user_id,packets,declared_cents,created_at)
 VALUES(NEW.group_id,'*',NEW.owner_id,1,NEW.total_cents,NEW.created_at),(NEW.group_id,date(NEW.created_at,'unixepoch','+8 hours'),NEW.owner_id,1,NEW.total_cents,NEW.created_at)
 ON CONFLICT(group_id,day,user_id) DO UPDATE SET packets=packets+1,declared_cents=declared_cents+excluded.declared_cents,created_at=MAX(created_at,excluded.created_at);
END;
CREATE TRIGGER packet_sender_paid_aggregate AFTER INSERT ON packet_sender_paid_events BEGIN
 INSERT INTO packet_sender_stats(group_id,day,user_id,paid_cents,paid_at)
 SELECT p.group_id,'*',p.owner_id,NEW.amount_cents,NEW.confirmed_at FROM ldc_packets p WHERE p.packet_id=NEW.packet_id AND p.group_id IS NOT NULL
 ON CONFLICT(group_id,day,user_id) DO UPDATE SET paid_cents=paid_cents+excluded.paid_cents,paid_at=MAX(paid_at,excluded.paid_at);
 INSERT INTO packet_sender_stats(group_id,day,user_id,paid_cents,paid_at)
 SELECT p.group_id,date(NEW.confirmed_at,'unixepoch','+8 hours'),p.owner_id,NEW.amount_cents,NEW.confirmed_at FROM ldc_packets p WHERE p.packet_id=NEW.packet_id AND p.group_id IS NOT NULL
 ON CONFLICT(group_id,day,user_id) DO UPDATE SET paid_cents=paid_cents+excluded.paid_cents,paid_at=MAX(paid_at,excluded.paid_at);
END;
INSERT INTO packet_sender_paid_events SELECT a.id,a.packet_id,a.amount_cents,COALESCE(a.checked_at,a.sent_at,p.created_at)
 FROM ldc_awards a JOIN ldc_packets p ON p.packet_id=a.packet_id WHERE a.state='accepted' AND a.recipient_id IS NOT NULL;
CREATE TRIGGER packet_sender_paid_update AFTER UPDATE OF state ON ldc_awards WHEN NEW.state='accepted' AND NEW.recipient_id IS NOT NULL BEGIN
 INSERT OR IGNORE INTO packet_sender_paid_events VALUES(NEW.id,NEW.packet_id,NEW.amount_cents,unixepoch());
END;
CREATE TRIGGER packet_sender_paid_insert AFTER INSERT ON ldc_awards WHEN NEW.state='accepted' AND NEW.recipient_id IS NOT NULL BEGIN
 INSERT OR IGNORE INTO packet_sender_paid_events VALUES(NEW.id,NEW.packet_id,NEW.amount_cents,unixepoch());
END;
CREATE TRIGGER packet_sender_paid_immutable BEFORE UPDATE ON packet_sender_paid_events BEGIN SELECT RAISE(ABORT,'packet_paid_event_immutable'); END;
CREATE TRIGGER packet_sender_stats_retired_insert BEFORE INSERT ON packet_sender_stats WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER packet_sender_stats_retired_update BEFORE UPDATE OF user_id ON packet_sender_stats WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
