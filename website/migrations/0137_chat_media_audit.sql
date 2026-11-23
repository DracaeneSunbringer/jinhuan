-- 仅建立群附件引用审计，不执行对象删除。仅带附件的消息会触发索引写入。
CREATE TABLE IF NOT EXISTS chat_media_audit_refs (
  message_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(message_id,key)
);
CREATE INDEX IF NOT EXISTS idx_chat_media_audit_key ON chat_media_audit_refs(key,created_at,message_id);
CREATE TABLE IF NOT EXISTS chat_media_audit_state (
  id INTEGER PRIMARY KEY CHECK(id=1), cursor INTEGER NOT NULL DEFAULT 0,
  high_water INTEGER NOT NULL DEFAULT 0, complete INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS chat_media_audit_issues (
  message_id INTEGER PRIMARY KEY,
  reason TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS chat_media_audit_insert AFTER INSERT ON chat_messages
WHEN NEW.image_key IS NOT NULL OR NEW.media IS NOT NULL BEGIN
 INSERT OR IGNORE INTO chat_media_audit_refs(message_id,key,created_at)
 SELECT NEW.id,NEW.image_key,NEW.created_at WHERE NEW.image_key LIKE 'c/%';
 INSERT OR IGNORE INTO chat_media_audit_refs(message_id,key,created_at)
 SELECT NEW.id,key,NEW.created_at FROM (
   SELECT CASE WHEN j.type='object' THEN json_extract(j.value,'$.k') END AS key FROM json_each(CASE WHEN json_valid(NEW.media) THEN NEW.media ELSE '[]' END) j
   UNION SELECT CASE WHEN j.type='object' THEN json_extract(j.value,'$.p') END FROM json_each(CASE WHEN json_valid(NEW.media) THEN NEW.media ELSE '[]' END) j
   UNION SELECT CASE WHEN j.type='object' THEN json_extract(j.value,'$.o') END FROM json_each(CASE WHEN json_valid(NEW.media) THEN NEW.media ELSE '[]' END) j
 ) WHERE typeof(key)='text' AND key LIKE 'c/%';
 INSERT OR REPLACE INTO chat_media_audit_issues(message_id,reason)
 SELECT NEW.id,'invalid_media' WHERE NEW.media IS NOT NULL AND (NOT json_valid(NEW.media) OR json_type(CASE WHEN json_valid(NEW.media) THEN NEW.media ELSE 'null' END)<>'array' OR EXISTS(
  SELECT 1 FROM json_each(CASE WHEN json_valid(NEW.media) THEN NEW.media ELSE '[]' END) j
  WHERE j.type<>'object' OR CASE WHEN j.type='object' THEN COALESCE(json_type(j.value,'$.k'),'') ELSE '' END<>'text'
  OR CASE WHEN j.type='object' THEN COALESCE(length(json_extract(j.value,'$.k')),0) ELSE 0 END=0
  OR CASE WHEN j.type='object' THEN COALESCE(json_type(j.value,'$.p'),'text') ELSE 'text' END NOT IN ('text','null')
  OR CASE WHEN j.type='object' THEN COALESCE(json_type(j.value,'$.o'),'text') ELSE 'text' END NOT IN ('text','null')
 ));
END;
CREATE TRIGGER IF NOT EXISTS chat_media_audit_update AFTER UPDATE OF image_key,media,created_at ON chat_messages
WHEN OLD.image_key IS NOT NEW.image_key OR OLD.media IS NOT NEW.media OR OLD.created_at IS NOT NEW.created_at BEGIN
 DELETE FROM chat_media_audit_refs WHERE message_id=OLD.id;
 DELETE FROM chat_media_audit_issues WHERE message_id=OLD.id;
 INSERT OR IGNORE INTO chat_media_audit_refs(message_id,key,created_at)
 SELECT NEW.id,NEW.image_key,NEW.created_at WHERE NEW.image_key LIKE 'c/%';
 INSERT OR IGNORE INTO chat_media_audit_refs(message_id,key,created_at)
 SELECT NEW.id,key,NEW.created_at FROM (
   SELECT CASE WHEN j.type='object' THEN json_extract(j.value,'$.k') END AS key FROM json_each(CASE WHEN json_valid(NEW.media) THEN NEW.media ELSE '[]' END) j
   UNION SELECT CASE WHEN j.type='object' THEN json_extract(j.value,'$.p') END FROM json_each(CASE WHEN json_valid(NEW.media) THEN NEW.media ELSE '[]' END) j
   UNION SELECT CASE WHEN j.type='object' THEN json_extract(j.value,'$.o') END FROM json_each(CASE WHEN json_valid(NEW.media) THEN NEW.media ELSE '[]' END) j
 ) WHERE typeof(key)='text' AND key LIKE 'c/%';
 INSERT OR REPLACE INTO chat_media_audit_issues(message_id,reason)
 SELECT NEW.id,'invalid_media' WHERE NEW.media IS NOT NULL AND (NOT json_valid(NEW.media) OR json_type(CASE WHEN json_valid(NEW.media) THEN NEW.media ELSE 'null' END)<>'array' OR EXISTS(
  SELECT 1 FROM json_each(CASE WHEN json_valid(NEW.media) THEN NEW.media ELSE '[]' END) j
  WHERE j.type<>'object' OR CASE WHEN j.type='object' THEN COALESCE(json_type(j.value,'$.k'),'') ELSE '' END<>'text'
  OR CASE WHEN j.type='object' THEN COALESCE(length(json_extract(j.value,'$.k')),0) ELSE 0 END=0
  OR CASE WHEN j.type='object' THEN COALESCE(json_type(j.value,'$.p'),'text') ELSE 'text' END NOT IN ('text','null')
  OR CASE WHEN j.type='object' THEN COALESCE(json_type(j.value,'$.o'),'text') ELSE 'text' END NOT IN ('text','null')
 ));
END;
