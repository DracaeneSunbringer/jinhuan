-- 执行前检查 lower(username) 无重复；需先执行 0019。
-- users 扩展
ALTER TABLE users ADD COLUMN kind TEXT NOT NULL DEFAULT 'user';   -- user 普通用户 / bot 系统账号（AI）
ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0; -- 1 管理员停用：拒绝登录，删除全部会话；2 合并中（只在合并 batch 内部存在）
ALTER TABLE users ADD COLUMN card TEXT;                           -- 名片 JSON：{cover, theme, intro, links[]}
ALTER TABLE users ADD COLUMN avatar_custom INTEGER NOT NULL DEFAULT 0; -- 1 = avatar 是自定义上传的，Linux.DO 登录不覆盖
ALTER TABLE users ADD COLUMN handle_at INTEGER;                   -- 上次改用户名的时间
ALTER TABLE users ADD COLUMN invited_by INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_users_seen ON users (last_seen);   -- P1 若已建则跳过（IF NOT EXISTS）

-- 会话扩展（「登录设备」列表）
ALTER TABLE sessions ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN seen_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN method TEXT;                      -- linuxdo / google / email / dev
ALTER TABLE sessions ADD COLUMN ua TEXT;                          -- User-Agent 前 120 个字符

-- 登录方式：一个 provider + subject 只能属于一个账号
CREATE TABLE IF NOT EXISTS identities (
  provider      TEXT    NOT NULL,          -- linuxdo / google / email / dev
  subject       TEXT    NOT NULL,          -- linuxdo: 数字 id；google: sub；email: 规范化的邮箱；dev: 小写用户名
  user_id       INTEGER NOT NULL,
  email         TEXT,                      -- google / email 的邮箱（展示用）
  username      TEXT,                      -- linuxdo：每次登录都写 L 站最新的用户名（认领历史图用）
  verified_at   INTEGER,                   -- email：验证时间
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER,
  PRIMARY KEY (provider, subject)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_ident_user ON identities (user_id);

CREATE TABLE IF NOT EXISTS passwords (
  user_id      INTEGER PRIMARY KEY,
  hash         TEXT    NOT NULL,           -- pbkdf2_sha256$<iter>$<salt b64url>$<hash b64url>$p<pepper 版本>
  updated_at   INTEGER NOT NULL
);

-- 密码登录失败计数：按「账号 + 来源 IP」分开计，别人在另一个 IP 上输错不会锁住本人（第 7.4 节）
CREATE TABLE IF NOT EXISTS login_fails (
  user_id      INTEGER NOT NULL,
  ip_hash      TEXT    NOT NULL,           -- HMAC-SHA256(PASSWORD_PEPPER, CF-Connecting-IP) 的前 16 个十六进制字符，不存明文 IP
  fails        INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, ip_hash)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_login_fails_at ON login_fails (updated_at);

-- 一次性令牌：注册待验证（signup）、找回密码（reset）、换绑邮箱（email）、合并确认（merge，10 分钟）、
-- Google 首次登录等待填邀请码（gpending，10 分钟，payload 是 {sub, email, email_verified, name, picture, next}；
-- 明文令牌只放在浏览器的 g_pend cookie 里）
CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash TEXT    PRIMARY KEY,          -- sha256(明文令牌)
  kind       TEXT    NOT NULL,
  user_id    INTEGER,
  email      TEXT,
  payload    TEXT,                         -- signup: {handle, nick, pw, invite}（pw 已经是哈希）
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  claim_id   TEXT,                         -- 随机事务凭据，后续语句只接受本次抢到的令牌
  created_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_auth_tokens_exp ON auth_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_email ON auth_tokens (email, created_at);

CREATE TABLE IF NOT EXISTS invite_codes (
  code       TEXT    PRIMARY KEY,          -- 8 位，字母表去掉易混字符（0O1Il）
  owner_id   INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_by    INTEGER,
  used_at    INTEGER,
  revoked    INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_invite_owner ON invite_codes (owner_id, created_at);

-- 邀请关系：每个被邀请人只有一行
CREATE TABLE IF NOT EXISTS invites (
  invitee_id   INTEGER PRIMARY KEY,
  inviter_id   INTEGER NOT NULL,
  code         TEXT    NOT NULL,
  method       TEXT    NOT NULL,           -- google / email / linuxdo
  created_at   INTEGER NOT NULL,
  qualified_at INTEGER,                    -- 满足「满 7 天且活跃」的时间
  revoked      INTEGER NOT NULL DEFAULT 0  -- 管理员判定刷号后作废，不计奖励
);
CREATE INDEX IF NOT EXISTS idx_invites_inviter ON invites (inviter_id, created_at);
CREATE INDEX IF NOT EXISTS idx_invites_pending ON invites (created_at) WHERE qualified_at IS NULL AND revoked = 0;

-- 个人 API Token（next-round brief 第 1 项）
CREATE TABLE IF NOT EXISTS api_tokens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  name         TEXT    NOT NULL,
  prefix       TEXT    NOT NULL,           -- 明文前 8 位，列表里展示
  hash         TEXT    NOT NULL UNIQUE,    -- sha256(明文)
  scope        TEXT    NOT NULL,           -- 目前只有 'post'（上传 + 发帖）
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens (user_id);

-- 解锁的装扮项（邀请奖励的称号样式、专属气泡）
CREATE TABLE IF NOT EXISTS user_unlocks (
  user_id INTEGER NOT NULL,
  item    TEXT    NOT NULL,                -- 如 'title:guangjie'、'bubble:yinlu'
  at      INTEGER NOT NULL,
  PRIMARY KEY (user_id, item)
) WITHOUT ROWID;

-- 通用每日计数：邮件发送量、AI 调用量、Token 限流……
CREATE TABLE IF NOT EXISTS quota_usage (
  day   TEXT    NOT NULL,                  -- 北京时间 YYYY-MM-DD；唯一例外：scope = 'mail' 用 UTC 日期（与 Resend 对齐，第 7.9 节）
  scope TEXT    NOT NULL,                  -- 例如 'mail'、'ai:summary'、'ai:*'
  key   INTEGER NOT NULL,                  -- user_id；全站计数用 0
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, scope, key)
) WITHOUT ROWID;

-- 回填已有账号的登录方式
INSERT OR IGNORE INTO identities (provider, subject, user_id, username, created_at)
  SELECT 'linuxdo', CAST(id AS TEXT), id, username, created_at FROM users WHERE id > 0 AND id < 999000000;
INSERT OR IGNORE INTO identities (provider, subject, user_id, username, created_at)
  SELECT 'dev', lower(username), id, username, created_at FROM users WHERE id < 0;
UPDATE sessions SET created_at = expires_at - 2592000, seen_at = expires_at - 2592000 WHERE created_at = 0;
UPDATE sessions SET method = CASE WHEN user_id < 0 THEN 'dev' ELSE 'linuxdo' END
  WHERE method IS NULL AND (user_id < 0 OR (user_id > 0 AND user_id < 999000000));

-- 新登录方式的上线门控（第 5.2 节），默认只对持预览 cookie 的站长开放
INSERT OR IGNORE INTO site_settings (k, v, updated_at) VALUES ('auth.open', 'preview', strftime('%s', 'now'));
