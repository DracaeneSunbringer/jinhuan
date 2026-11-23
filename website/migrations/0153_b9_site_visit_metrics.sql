-- 共享访问统计：按日/渠道汇总；去重键仅存按日散列，保留45天。
CREATE TABLE IF NOT EXISTS site_visit_daily (
 day TEXT NOT NULL,
 surface TEXT NOT NULL,
 opens INTEGER NOT NULL DEFAULT 0,
 active_users INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(day,surface)
);
CREATE TABLE IF NOT EXISTS site_visit_unique (
 day TEXT NOT NULL,
 surface TEXT NOT NULL,
 identity TEXT NOT NULL,
 PRIMARY KEY(day,surface,identity)
);
