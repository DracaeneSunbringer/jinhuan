-- 入群系统事件；先检查system_kind未存在，再应用一次。不回填已有成员。
ALTER TABLE chat_messages ADD COLUMN system_kind TEXT;
CREATE TRIGGER IF NOT EXISTS trg_cm_welcome AFTER INSERT ON chat_members BEGIN
  INSERT INTO chat_messages (group_id, user_id, body, created_at, updated_at, system_kind)
  VALUES (NEW.group_id, NEW.user_id, '加入了群聊', NEW.joined_at, NEW.joined_at, 'join');
  UPDATE chat_members SET last_read = (SELECT MAX(id) FROM chat_messages WHERE group_id = NEW.group_id)
  WHERE group_id = NEW.group_id AND user_id = NEW.user_id;
END;
