-- 肥鱼庄园（2026-11-05）：每个用户一行紧凑 JSON 状态；ripe_at / help_at / active_at 只用于串门列表排序。
CREATE TABLE IF NOT EXISTS manor (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rev INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL,
  op TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0,
  active_at INTEGER NOT NULL DEFAULT 0,
  ripe_at INTEGER NOT NULL DEFAULT 0,
  help_at INTEGER NOT NULL DEFAULT 0,
  lv INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS manor_ripe_at ON manor(ripe_at);
CREATE INDEX IF NOT EXISTS manor_active_at ON manor(active_at);
