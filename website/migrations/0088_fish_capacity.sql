-- 本站待发承诺；不等同 Fish 侧冻结。仅对 Fish 维护，普通页面按账户索引读取。
CREATE TABLE fish_capacity_versions(owner_id INTEGER PRIMARY KEY REFERENCES users(id),revision INTEGER NOT NULL DEFAULT 0);
-- 瞬时事务校验，成功后立即删除；RAISE 保留可识别错误，避免 JSON 异常丢失原因。
CREATE TABLE fish_capacity_checks(owner_id INTEGER NOT NULL,expected_revision INTEGER NOT NULL);
CREATE TRIGGER fish_capacity_check BEFORE INSERT ON fish_capacity_checks
 WHEN COALESCE((SELECT revision FROM fish_capacity_versions WHERE owner_id=NEW.owner_id),0)<>NEW.expected_revision
 BEGIN SELECT RAISE(ABORT,'fish_capacity_changed'); END;
CREATE TRIGGER fish_capacity_check_clear AFTER INSERT ON fish_capacity_checks
 BEGIN DELETE FROM fish_capacity_checks WHERE rowid=NEW.rowid; END;
CREATE TABLE fish_packet_capacity(
 packet_id TEXT PRIMARY KEY REFERENCES ldc_packets(packet_id) ON DELETE CASCADE,
 owner_id INTEGER NOT NULL,client_id TEXT NOT NULL,ends_at INTEGER NOT NULL,
 reserved_cents INTEGER NOT NULL CHECK(reserved_cents>=0),unpaid_cents INTEGER NOT NULL CHECK(unpaid_cents>=0)
);
CREATE INDEX idx_fish_capacity_active ON fish_packet_capacity(owner_id,client_id,ends_at);
CREATE INDEX idx_fish_capacity_unpaid ON fish_packet_capacity(owner_id,client_id,ends_at) WHERE unpaid_cents>0;
CREATE VIEW fish_capacity_source AS
 SELECT p.packet_id,p.owner_id,p.client_id,p.ends_at,
 CASE WHEN p.state='open' AND COUNT(a.recipient_id)<p.count
 THEN MAX(0,MAX(p.total_cents,CASE WHEN p.reward_freeze_ai_count IS NULL THEN p.base_total_cents+p.escalation_cap_cents ELSE p.total_cents END)-COALESCE(SUM(CASE WHEN a.state='accepted' THEN a.amount_cents ELSE 0 END),0))
 ELSE COALESCE(SUM(CASE WHEN a.recipient_id IS NOT NULL AND a.state<>'accepted' THEN a.amount_cents ELSE 0 END),0) END AS reserved_cents,
 COALESCE(SUM(CASE WHEN a.recipient_id IS NOT NULL AND a.state<>'accepted' THEN a.amount_cents ELSE 0 END),0) AS unpaid_cents
 FROM ldc_packets p LEFT JOIN ldc_awards a ON a.packet_id=p.packet_id WHERE p.payment_provider='fish' GROUP BY p.packet_id;
CREATE TRIGGER fish_capacity_version_insert AFTER INSERT ON fish_packet_capacity BEGIN
 INSERT INTO fish_capacity_versions(owner_id,revision) VALUES(NEW.owner_id,1) ON CONFLICT(owner_id) DO UPDATE SET revision=revision+1;
 END;
CREATE TRIGGER fish_capacity_version_update AFTER UPDATE ON fish_packet_capacity BEGIN
 INSERT INTO fish_capacity_versions(owner_id,revision) VALUES(NEW.owner_id,1) ON CONFLICT(owner_id) DO UPDATE SET revision=revision+1;
 END;
CREATE TRIGGER fish_capacity_version_delete AFTER DELETE ON fish_packet_capacity BEGIN
 INSERT INTO fish_capacity_versions(owner_id,revision) VALUES(OLD.owner_id,1) ON CONFLICT(owner_id) DO UPDATE SET revision=revision+1;
 END;
CREATE TRIGGER fish_capacity_packet_insert AFTER INSERT ON ldc_packets WHEN NEW.payment_provider='fish' BEGIN
 DELETE FROM fish_packet_capacity WHERE packet_id=NEW.packet_id;
 INSERT INTO fish_packet_capacity SELECT * FROM fish_capacity_source WHERE packet_id=NEW.packet_id AND (reserved_cents>0 OR unpaid_cents>0);
 END;
CREATE TRIGGER fish_capacity_packet_update AFTER UPDATE OF state,total_cents,base_total_cents,escalation_cap_cents,reward_freeze_ai_count,ends_at,payment_provider ON ldc_packets WHEN NEW.payment_provider='fish' OR OLD.payment_provider='fish' BEGIN
 DELETE FROM fish_packet_capacity WHERE packet_id=NEW.packet_id;
 INSERT INTO fish_packet_capacity SELECT * FROM fish_capacity_source WHERE packet_id=NEW.packet_id AND (reserved_cents>0 OR unpaid_cents>0);
 END;
CREATE TRIGGER fish_capacity_award_insert AFTER INSERT ON ldc_awards WHEN EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id AND payment_provider='fish') BEGIN
 DELETE FROM fish_packet_capacity WHERE packet_id=NEW.packet_id;
 INSERT INTO fish_packet_capacity SELECT * FROM fish_capacity_source WHERE packet_id=NEW.packet_id AND (reserved_cents>0 OR unpaid_cents>0);
 END;
CREATE TRIGGER fish_capacity_award_update AFTER UPDATE OF state,recipient_id,amount_cents ON ldc_awards WHEN EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=NEW.packet_id AND payment_provider='fish') BEGIN
 DELETE FROM fish_packet_capacity WHERE packet_id=NEW.packet_id;
 INSERT INTO fish_packet_capacity SELECT * FROM fish_capacity_source WHERE packet_id=NEW.packet_id AND (reserved_cents>0 OR unpaid_cents>0);
 END;
CREATE TRIGGER fish_capacity_award_delete AFTER DELETE ON ldc_awards WHEN EXISTS(SELECT 1 FROM ldc_packets WHERE packet_id=OLD.packet_id AND payment_provider='fish') BEGIN
 DELETE FROM fish_packet_capacity WHERE packet_id=OLD.packet_id;
 INSERT INTO fish_packet_capacity SELECT * FROM fish_capacity_source WHERE packet_id=OLD.packet_id AND (reserved_cents>0 OR unpaid_cents>0);
 END;
INSERT INTO fish_packet_capacity SELECT * FROM fish_capacity_source WHERE (ends_at>unixepoch() AND reserved_cents>0) OR unpaid_cents>0;
