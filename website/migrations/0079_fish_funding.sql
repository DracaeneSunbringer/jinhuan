-- New packets pin the funding provider/key. Existing Credit orders keep their original channel.
ALTER TABLE ldc_accounts ADD COLUMN create_enabled INTEGER NOT NULL DEFAULT 1 CHECK(create_enabled IN (0,1));
CREATE TABLE fish_accounts (
 user_id INTEGER PRIMARY KEY REFERENCES users(id), client_id TEXT NOT NULL UNIQUE,
 secret_box TEXT NOT NULL, subject TEXT NOT NULL, username TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
ALTER TABLE ldc_packets ADD COLUMN payment_provider TEXT NOT NULL DEFAULT 'credit' CHECK(payment_provider IN ('credit','fish','coin52'));
ALTER TABLE ldc_awards ADD COLUMN payment_error TEXT;
ALTER TABLE guess_queue ADD COLUMN payment_provider TEXT NOT NULL DEFAULT 'credit' CHECK(payment_provider IN ('credit','fish','coin52'));
CREATE TABLE packet_draws(packet_id TEXT PRIMARY KEY REFERENCES ldc_packets(packet_id),draw_at INTEGER NOT NULL,settled_at INTEGER);
CREATE INDEX idx_packet_draw_due ON packet_draws(draw_at,packet_id) WHERE settled_at IS NULL;
CREATE TABLE packet_draw_entries(packet_id TEXT NOT NULL REFERENCES packet_draws(packet_id),user_id INTEGER NOT NULL REFERENCES users(id),subject TEXT NOT NULL,username TEXT NOT NULL,priority TEXT NOT NULL,entered_at INTEGER NOT NULL,PRIMARY KEY(packet_id,user_id),UNIQUE(packet_id,subject));
CREATE INDEX idx_packet_draw_user ON packet_draw_entries(user_id,entered_at);
CREATE TRIGGER packet_draw_entry_retired BEFORE INSERT ON packet_draw_entries WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TABLE packet_events(id INTEGER PRIMARY KEY AUTOINCREMENT,packet_id TEXT NOT NULL REFERENCES ldc_packets(packet_id),user_id INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('joined','result')),body TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(packet_id,user_id,kind));
CREATE INDEX idx_packet_events_user ON packet_events(user_id,created_at);
CREATE TABLE packet_notice_jobs(packet_id TEXT PRIMARY KEY REFERENCES ldc_packets(packet_id),due_at INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
CREATE INDEX idx_packet_notice_due ON packet_notice_jobs(due_at,packet_id);
CREATE TRIGGER packet_notice_enqueue AFTER INSERT ON ldc_packets WHEN NEW.mode IN('fixed','random') BEGIN INSERT INTO packet_notice_jobs(packet_id,due_at) VALUES(NEW.packet_id,NEW.ends_at); END;
CREATE TRIGGER packet_notice_award AFTER UPDATE OF state,recipient_id ON ldc_awards WHEN OLD.state IS NOT NEW.state OR OLD.recipient_id IS NOT NEW.recipient_id BEGIN INSERT INTO packet_notice_jobs(packet_id,due_at) SELECT packet_id,unixepoch() FROM ldc_packets WHERE packet_id=NEW.packet_id AND mode IN('fixed','random') ON CONFLICT(packet_id) DO UPDATE SET due_at=excluded.due_at,revision=revision+1; END;
CREATE TRIGGER packet_notice_close AFTER UPDATE OF state ON ldc_packets WHEN OLD.state<>NEW.state AND NEW.mode IN('fixed','random') BEGIN INSERT INTO packet_notice_jobs(packet_id,due_at) VALUES(NEW.packet_id,unixepoch()) ON CONFLICT(packet_id) DO UPDATE SET due_at=excluded.due_at,revision=revision+1; END;
CREATE VIEW packet_funding_accounts AS
 SELECT 'credit' AS payment_provider,user_id,client_id,secret_box,enabled FROM ldc_accounts
 UNION ALL SELECT 'fish',user_id,client_id,secret_box,enabled FROM fish_accounts
 UNION ALL SELECT 'coin52',user_id,'coin52:'||user_id,'',1 FROM coin52_wallets;
CREATE TRIGGER fish_accounts_retired_insert BEFORE INSERT ON fish_accounts WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER fish_accounts_retired_update BEFORE UPDATE ON fish_accounts WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TABLE packet_coin_escrows(packet_id TEXT PRIMARY KEY REFERENCES ldc_packets(packet_id),owner_id INTEGER NOT NULL REFERENCES users(id),reserved INTEGER NOT NULL CHECK(reserved>0),remaining INTEGER NOT NULL CHECK(remaining>=0 AND remaining<=reserved),created_at INTEGER NOT NULL,refunded_at INTEGER);
CREATE INDEX idx_packet_coin_pending ON packet_coin_escrows(refunded_at,packet_id) WHERE refunded_at IS NULL AND remaining>0;
DROP TRIGGER packet_sender_created;
CREATE TRIGGER packet_sender_created AFTER INSERT ON ldc_packets WHEN NEW.group_id IS NOT NULL AND NEW.payment_provider<>'coin52' BEGIN
 INSERT INTO packet_sender_stats(group_id,day,user_id,packets,declared_cents,created_at)
 VALUES(NEW.group_id,'*',NEW.owner_id,1,NEW.total_cents,NEW.created_at),(NEW.group_id,date(NEW.created_at,'unixepoch','+8 hours'),NEW.owner_id,1,NEW.total_cents,NEW.created_at)
 ON CONFLICT(group_id,day,user_id) DO UPDATE SET packets=packets+1,declared_cents=declared_cents+excluded.declared_cents,created_at=MAX(created_at,excluded.created_at);
END;
DROP TRIGGER packet_sender_paid_update;
CREATE TRIGGER packet_sender_paid_update AFTER UPDATE OF state ON ldc_awards WHEN NEW.state='accepted' AND NEW.recipient_id IS NOT NULL AND EXISTS(SELECT 1 FROM ldc_packets p WHERE p.packet_id=NEW.packet_id AND p.payment_provider<>'coin52') BEGIN
 INSERT OR IGNORE INTO packet_sender_paid_events VALUES(NEW.id,NEW.packet_id,NEW.amount_cents,unixepoch());
END;
DROP TRIGGER packet_sender_paid_insert;
CREATE TRIGGER packet_sender_paid_insert AFTER INSERT ON ldc_awards WHEN NEW.state='accepted' AND NEW.recipient_id IS NOT NULL AND EXISTS(SELECT 1 FROM ldc_packets p WHERE p.packet_id=NEW.packet_id AND p.payment_provider<>'coin52') BEGIN
 INSERT OR IGNORE INTO packet_sender_paid_events VALUES(NEW.id,NEW.packet_id,NEW.amount_cents,unixepoch());
END;
