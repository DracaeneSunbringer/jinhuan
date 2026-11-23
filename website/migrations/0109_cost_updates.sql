-- Sparse event index: ordinary chat inserts do not enter this index.
CREATE INDEX IF NOT EXISTS idx_guess_announcement_events
ON chat_messages(group_id,created_at DESC,id DESC)
WHERE deleted=0 AND system_kind IN ('join','guess_level','ldc_winner','ldc_cancel','ldc_expired');

-- A non-series post cannot change a plain series directory. Other caches keep
-- their existing invalidation rules; series moderation still invalidates now.
DROP TRIGGER IF EXISTS trg_memes_ins;
CREATE TRIGGER trg_memes_ins AFTER INSERT ON memes BEGIN
 UPDATE memes SET nsfw=NEW.spoiler,hot=NEW.ld_likes+NEW.like_count*2+NEW.reaction_count+NEW.reply_count*2+NEW.comment_count*3+NEW.fav_count*3 WHERE id=NEW.id;
 DELETE FROM stats_cache WHERE key NOT LIKE 'series:%' OR NEW.series IS NOT NULL;
END;
DROP TRIGGER IF EXISTS trg_memes_flag;
CREATE TRIGGER trg_memes_flag AFTER UPDATE OF spoiler,hidden,created_at ON memes BEGIN
 UPDATE memes SET nsfw=(NEW.spoiler=1 OR EXISTS(SELECT 1 FROM meme_tags t WHERE t.meme_id=NEW.id AND t.tag IN ('番号/车牌','番号','车牌','NSFW','nsfw','涩图','福利'))) WHERE id=NEW.id;
 DELETE FROM stats_cache WHERE key NOT LIKE 'series:%' OR NEW.series IS NOT NULL OR OLD.series IS NOT NULL;
END;
DROP TRIGGER IF EXISTS trg_tags_ins;
CREATE TRIGGER trg_tags_ins AFTER INSERT ON meme_tags BEGIN
 UPDATE memes SET nsfw=1 WHERE id=NEW.meme_id AND NEW.tag IN ('番号/车牌','番号','车牌','NSFW','nsfw','涩图','福利');
 DELETE FROM stats_cache WHERE key NOT LIKE 'series:%' OR EXISTS(SELECT 1 FROM memes WHERE id=NEW.meme_id AND series IS NOT NULL);
END;
DROP TRIGGER IF EXISTS trg_tags_del;
CREATE TRIGGER trg_tags_del AFTER DELETE ON meme_tags BEGIN
 UPDATE memes SET nsfw=(spoiler=1 OR EXISTS(SELECT 1 FROM meme_tags t WHERE t.meme_id=OLD.meme_id AND t.tag IN ('番号/车牌','番号','车牌','NSFW','nsfw','涩图','福利'))) WHERE id=OLD.meme_id;
 DELETE FROM stats_cache WHERE key NOT LIKE 'series:%' OR EXISTS(SELECT 1 FROM memes WHERE id=OLD.meme_id AND series IS NOT NULL);
END;
CREATE TRIGGER IF NOT EXISTS trg_series_metadata AFTER UPDATE OF series,title,thumb_url,image_url,image_key ON memes
WHEN OLD.series IS NOT NULL OR NEW.series IS NOT NULL BEGIN
 DELETE FROM stats_cache WHERE key LIKE 'series:%';
END;
CREATE TRIGGER IF NOT EXISTS trg_series_deleted AFTER DELETE ON memes WHEN OLD.series IS NOT NULL BEGIN
 DELETE FROM stats_cache WHERE key LIKE 'series:%';
END;
