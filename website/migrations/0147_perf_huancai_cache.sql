-- 2026-11-04 省 D1 读取：欢彩「我的号码」按天缓存。已开奖（state='paid'）的那天，结果不会再变，算一次存起来，之后只读这 1 行。
CREATE TABLE IF NOT EXISTS huancai_hist_cache (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  rows TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
) WITHOUT ROWID;
