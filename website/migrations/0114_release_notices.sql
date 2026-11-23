CREATE TABLE site_release_notices (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 release_key TEXT NOT NULL UNIQUE,
 worker_version TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at INTEGER NOT NULL
);
CREATE INDEX idx_release_notices_recent ON site_release_notices(created_at DESC,id DESC) WHERE active=1;
CREATE TRIGGER site_release_notice_chat AFTER INSERT ON site_release_notices BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=999999999 AND username='jinhuan_ai' AND kind='bot' AND disabled=0)
  OR NOT EXISTS(SELECT 1 FROM chat_groups WHERE is_default=1) THEN RAISE(ABORT,'release_notice_chat_unavailable') END;
 INSERT INTO chat_messages(group_id,user_id,body,created_at,updated_at,system_kind,system_ref)
 SELECT id,999999999,NEW.body,NEW.created_at,NEW.created_at,'release_notice',NEW.release_key||':'||id FROM chat_groups WHERE is_default=1;
END;
