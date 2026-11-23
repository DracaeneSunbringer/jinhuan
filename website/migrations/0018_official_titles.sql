CREATE TABLE IF NOT EXISTS user_official_titles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  granted_by INTEGER NOT NULL REFERENCES users(id),
  granted_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,title)
);
CREATE TABLE IF NOT EXISTS official_title_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('grant','revoke')),
  actor_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
