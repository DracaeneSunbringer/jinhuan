-- 群：区分被移出 / 自己退出、申请入群、群公告；徽章系统；今日统计用的索引
-- 本地：npx wrangler d1 execute meme-hall --local --file=migrations/0010_badges_join_notice.sql
-- 线上：把 --local 换成 --remote（先跑 0001～0009）。新库直接用 schema.sql，不用跑

-- kick 被管理员移出 / left 自己退出
ALTER TABLE chat_bans ADD COLUMN kind TEXT NOT NULL DEFAULT 'kick';

-- 申请入群：status 0 待处理 / 1 通过 / 2 拒绝
CREATE TABLE IF NOT EXISTS chat_join_reqs (
  group_id   INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  status     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_join_reqs_st ON chat_join_reqs (status, created_at);

-- 群公告
ALTER TABLE chat_groups ADD COLUMN notice TEXT;
ALTER TABLE chat_groups ADD COLUMN notice_at INTEGER;

-- 徽章：每人每种一行，n 是拿过几次（每日徽章可以反复拿）
CREATE TABLE IF NOT EXISTS user_badges (
  user_id  INTEGER NOT NULL,
  badge    TEXT    NOT NULL,
  n        INTEGER NOT NULL DEFAULT 1,
  first_at INTEGER NOT NULL,
  last_day TEXT    NOT NULL,
  PRIMARY KEY (user_id, badge)
);
-- 颁发记录：互动提醒里「你获得了徽章」用
CREATE TABLE IF NOT EXISTS badge_log (
  user_id INTEGER NOT NULL,
  badge   TEXT    NOT NULL,
  day     TEXT    NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (user_id, badge, day)
);
CREATE INDEX IF NOT EXISTS idx_badge_log_user ON badge_log (user_id, at);
-- 每天只结算一次（北京时间的「昨天」）
CREATE TABLE IF NOT EXISTS badge_runs (
  day TEXT PRIMARY KEY,
  at  INTEGER NOT NULL
);

-- 今日统计按人查
CREATE INDEX IF NOT EXISTS idx_chat_rx_user ON chat_reactions (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_boost_user ON chat_boosts (user_id, created_at);

-- 太上长老：2026-10-01（北京时间）开站当天进站的佬友
INSERT OR IGNORE INTO user_badges (user_id, badge, n, first_at, last_day)
  SELECT id, 'elder', 1, strftime('%s', 'now'), '2026-10-01' FROM users WHERE date(created_at, 'unixepoch', '+8 hours') = '2026-10-01';
INSERT OR IGNORE INTO badge_log (user_id, badge, day, at)
  SELECT id, 'elder', '2026-10-01', strftime('%s', 'now') FROM users WHERE date(created_at, 'unixepoch', '+8 hours') = '2026-10-01';

-- 管理身份：admin 网站管理员（和 ADMIN_USERNAMES 一样）、gadmin 群管（只管群聊）。登录不会覆盖
ALTER TABLE users ADD COLUMN role TEXT;
-- 徽章结算按天扫浏览记录
CREATE INDEX IF NOT EXISTS idx_views_seen ON views (seen_at);
CREATE INDEX IF NOT EXISTS idx_chat_msg_at ON chat_messages (created_at);
