-- 渐进迁移开关；仅新增，旧版本不受影响。
CREATE TABLE IF NOT EXISTS site_settings (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;
INSERT OR IGNORE INTO site_settings (k, v, updated_at) VALUES
  ('ui.next', '[]', unixepoch()),
  ('plan', 'free', unixepoch());
