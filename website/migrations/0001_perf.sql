-- 性能：把每次请求都要整表扫的统计改成预先算好（D1 按扫描行数计费）
-- 老库升级：npx wrangler d1 execute meme-hall --remote --file=migrations/0001_perf.sql（本地换 --local）。新库直接用 schema.sql，不用跑
-- 敏感标签列表要和 src/index.ts 里的 SENSITIVE_TAGS 保持一致

-- 1. 梗图：NSFW 标记、热度，都由触发器维护
ALTER TABLE memes ADD COLUMN nsfw INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memes ADD COLUMN hot INTEGER NOT NULL DEFAULT 0;
UPDATE memes SET
  nsfw = (spoiler = 1 OR EXISTS (SELECT 1 FROM meme_tags t WHERE t.meme_id = memes.id AND t.tag IN ('番号/车牌', '番号', '车牌', 'NSFW', 'nsfw', '涩图', '福利'))),
  hot = ld_likes + like_count * 2 + reaction_count + reply_count * 2 + comment_count * 3 + fav_count * 3;
CREATE INDEX IF NOT EXISTS idx_memes_hot ON memes(hidden, hot DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_memes_author_id ON memes(author_id);
CREATE INDEX IF NOT EXISTS idx_memes_author_nc ON memes(author_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires_at);

-- 2. 统计缓存：日期目录 / 标签条 / 图集。发图、删图、改标签时由触发器清掉
CREATE TABLE IF NOT EXISTS stats_cache (
  key  TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  at   INTEGER NOT NULL
);

CREATE TRIGGER IF NOT EXISTS trg_memes_ins AFTER INSERT ON memes BEGIN
  UPDATE memes SET nsfw = NEW.spoiler, hot = NEW.ld_likes + NEW.like_count * 2 + NEW.reaction_count + NEW.reply_count * 2 + NEW.comment_count * 3 + NEW.fav_count * 3 WHERE id = NEW.id;
  DELETE FROM stats_cache;
END;
CREATE TRIGGER IF NOT EXISTS trg_memes_flag AFTER UPDATE OF spoiler, hidden, created_at ON memes BEGIN
  UPDATE memes SET nsfw = (NEW.spoiler = 1 OR EXISTS (SELECT 1 FROM meme_tags t WHERE t.meme_id = NEW.id AND t.tag IN ('番号/车牌', '番号', '车牌', 'NSFW', 'nsfw', '涩图', '福利'))) WHERE id = NEW.id;
  DELETE FROM stats_cache;
END;
CREATE TRIGGER IF NOT EXISTS trg_memes_hot AFTER UPDATE OF ld_likes, like_count, reaction_count, reply_count, comment_count, fav_count ON memes BEGIN
  UPDATE memes SET hot = NEW.ld_likes + NEW.like_count * 2 + NEW.reaction_count + NEW.reply_count * 2 + NEW.comment_count * 3 + NEW.fav_count * 3 WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_tags_ins AFTER INSERT ON meme_tags BEGIN
  UPDATE memes SET nsfw = 1 WHERE id = NEW.meme_id AND NEW.tag IN ('番号/车牌', '番号', '车牌', 'NSFW', 'nsfw', '涩图', '福利');
  DELETE FROM stats_cache;
END;
CREATE TRIGGER IF NOT EXISTS trg_tags_del AFTER DELETE ON meme_tags BEGIN
  UPDATE memes SET nsfw = (spoiler = 1 OR EXISTS (SELECT 1 FROM meme_tags t WHERE t.meme_id = OLD.meme_id AND t.tag IN ('番号/车牌', '番号', '车牌', 'NSFW', 'nsfw', '涩图', '福利'))) WHERE id = OLD.meme_id;
  DELETE FROM stats_cache;
END;

-- 3. 每人每天看过几张：算「N 张未看」不用再逐张查看过记录
CREATE TABLE IF NOT EXISTS view_days (
  user_id INTEGER NOT NULL,
  day     TEXT    NOT NULL,
  n       INTEGER NOT NULL DEFAULT 0,
  n_safe  INTEGER NOT NULL DEFAULT 0, -- 其中非 NSFW 的（隐藏 NSFW 时用）
  PRIMARY KEY (user_id, day)
);
INSERT OR IGNORE INTO view_days (user_id, day, n, n_safe)
  SELECT v.user_id, date(m.created_at, 'unixepoch', '+8 hours'), COUNT(*), SUM(m.nsfw = 0)
  FROM views v JOIN memes m ON m.id = v.meme_id GROUP BY 1, 2;
CREATE TRIGGER IF NOT EXISTS trg_views_ins AFTER INSERT ON views BEGIN
  INSERT OR IGNORE INTO view_days (user_id, day) SELECT NEW.user_id, date(created_at, 'unixepoch', '+8 hours') FROM memes WHERE id = NEW.meme_id;
  UPDATE view_days SET n = n + 1, n_safe = n_safe + (SELECT nsfw = 0 FROM memes WHERE id = NEW.meme_id)
    WHERE user_id = NEW.user_id AND day = (SELECT date(created_at, 'unixepoch', '+8 hours') FROM memes WHERE id = NEW.meme_id);
END;
CREATE TRIGGER IF NOT EXISTS trg_views_del AFTER DELETE ON views BEGIN
  UPDATE view_days SET n = MAX(n - 1, 0), n_safe = MAX(n_safe - (SELECT nsfw = 0 FROM memes WHERE id = OLD.meme_id), 0)
    WHERE user_id = OLD.user_id AND day = (SELECT date(created_at, 'unixepoch', '+8 hours') FROM memes WHERE id = OLD.meme_id);
END;

-- 4. 群聊：消息楼层号、群人数，由触发器维护（轮询时不用再数整个群）
ALTER TABLE chat_messages ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;
UPDATE chat_messages SET seq = (SELECT COUNT(*) FROM chat_messages x WHERE x.group_id = chat_messages.group_id AND x.id <= chat_messages.id);
CREATE INDEX IF NOT EXISTS idx_chat_msg_seq ON chat_messages(group_id, seq);
CREATE TRIGGER IF NOT EXISTS trg_chat_seq AFTER INSERT ON chat_messages BEGIN
  UPDATE chat_messages SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM chat_messages WHERE group_id = NEW.group_id) WHERE id = NEW.id;
END;
ALTER TABLE chat_groups ADD COLUMN member_count INTEGER NOT NULL DEFAULT 0;
UPDATE chat_groups SET member_count = (SELECT COUNT(*) FROM chat_members m WHERE m.group_id = chat_groups.id);
CREATE TRIGGER IF NOT EXISTS trg_cm_ins AFTER INSERT ON chat_members BEGIN
  UPDATE chat_groups SET member_count = member_count + 1 WHERE id = NEW.group_id;
END;
CREATE TRIGGER IF NOT EXISTS trg_cm_del AFTER DELETE ON chat_members BEGIN
  UPDATE chat_groups SET member_count = MAX(member_count - 1, 0) WHERE id = OLD.group_id;
END;
