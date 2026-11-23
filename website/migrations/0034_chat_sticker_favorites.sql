-- 个人表情只记录来源；不复制原图、不回填历史、不修改群成员。
CREATE TABLE chat_sticker_favorites (
  user_id INTEGER NOT NULL REFERENCES users(id),
  message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  media_index INTEGER NOT NULL CHECK(media_index BETWEEN 0 AND 11),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,message_id,media_index)
);
CREATE TRIGGER chat_sticker_favorites_retired_insert BEFORE INSERT ON chat_sticker_favorites
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER chat_sticker_favorites_retired_update BEFORE UPDATE OF user_id ON chat_sticker_favorites
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'account_retired'); END;
