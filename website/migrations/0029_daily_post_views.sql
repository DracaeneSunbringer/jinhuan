-- 今日浏览与终身首次已看分离。历史重看不推断、不回填。
CREATE TABLE daily_post_views (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  meme_id INTEGER NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,day,meme_id)
) WITHOUT ROWID;
CREATE INDEX idx_daily_post_views_day ON daily_post_views(day,user_id,meme_id);
CREATE TRIGGER trg_retired_daily_post_views_ins BEFORE INSERT ON daily_post_views
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER trg_retired_daily_post_views_upd BEFORE UPDATE OF user_id ON daily_post_views
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'account_retired'); END;
