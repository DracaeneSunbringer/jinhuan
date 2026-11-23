-- 原生LDC：密钥仅密文；未知发送结果不换订单，不重新分配名额。
CREATE TABLE ldc_accounts (
 user_id INTEGER PRIMARY KEY REFERENCES users(id), client_id TEXT NOT NULL UNIQUE,
 secret_box TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE ldc_packets (
 packet_id TEXT PRIMARY KEY REFERENCES chat_redpacks(id), owner_id INTEGER NOT NULL REFERENCES users(id),
 client_id TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('fixed','random','guess','clues')),
 total_cents INTEGER NOT NULL CHECK(total_cents BETWEEN 1 AND 200000), count INTEGER NOT NULL CHECK(count BETWEEN 1 AND 100),
 ends_at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','closed')),
 answer_box TEXT, hints_json TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL,
 question_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_ldc_packet_owner ON ldc_packets(owner_id,state);
CREATE TABLE ldc_awards (
 id TEXT PRIMARY KEY, packet_id TEXT NOT NULL REFERENCES ldc_packets(packet_id), slot INTEGER NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0), recipient_id INTEGER REFERENCES users(id),
 recipient_subject TEXT, recipient_username TEXT,
 state TEXT NOT NULL DEFAULT 'ready' CHECK(state IN ('ready','reserved','sent','accepted','unknown','rejected')),
 order_no TEXT NOT NULL UNIQUE, receipt_no TEXT, sent_at INTEGER, checked_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
 UNIQUE(packet_id,slot), UNIQUE(packet_id,recipient_id), UNIQUE(packet_id,recipient_subject)
);
CREATE INDEX idx_ldc_award_recipient ON ldc_awards(recipient_id);
CREATE TABLE ldc_questions (
 id TEXT PRIMARY KEY, packet_id TEXT NOT NULL REFERENCES ldc_packets(packet_id), user_id INTEGER NOT NULL REFERENCES users(id),
 nonce TEXT NOT NULL, question TEXT NOT NULL, verdict TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL,
 UNIQUE(packet_id,user_id,nonce)
);
CREATE INDEX idx_ldc_question_packet ON ldc_questions(packet_id,created_at);
CREATE INDEX idx_ldc_question_user ON ldc_questions(user_id,created_at);
CREATE TRIGGER ldc_accounts_retired_insert BEFORE INSERT ON ldc_accounts WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER ldc_accounts_retired_update BEFORE UPDATE OF user_id ON ldc_accounts WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER ldc_packets_retired_insert BEFORE INSERT ON ldc_packets WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER ldc_packets_retired_update BEFORE UPDATE OF owner_id ON ldc_packets WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER ldc_awards_retired_insert BEFORE INSERT ON ldc_awards WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.recipient_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER ldc_awards_retired_update BEFORE UPDATE OF recipient_id ON ldc_awards WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.recipient_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER ldc_questions_retired_insert BEFORE INSERT ON ldc_questions WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER ldc_questions_retired_update BEFORE UPDATE OF user_id ON ldc_questions WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_retired'); END;
-- 同时请求编辑/识别分享时也不能绕过红包不可撤回规则。
CREATE TRIGGER chat_packet_no_recall BEFORE UPDATE OF deleted ON chat_messages WHEN OLD.deleted=0 AND NEW.deleted<>0 AND (OLD.redpack_id IS NOT NULL OR EXISTS(SELECT 1 FROM chat_redpacks WHERE message_id=OLD.id)) BEGIN SELECT RAISE(ABORT,'packet_irrevocable'); END;
CREATE TRIGGER chat_packet_no_edit BEFORE UPDATE OF body ON chat_messages WHEN NEW.body<>OLD.body AND (OLD.redpack_id IS NOT NULL OR EXISTS(SELECT 1 FROM chat_redpacks WHERE message_id=OLD.id)) BEGIN SELECT RAISE(ABORT,'packet_immutable'); END;
