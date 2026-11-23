-- 谷社交：有界目录、持久操作幂等、现实日配额、逐生产轮访问记录。
CREATE INDEX IF NOT EXISTS pet_world_updated_at ON pet_world(updated_at DESC,user_id DESC);
CREATE TABLE IF NOT EXISTS pet_world_social_ops (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  op TEXT NOT NULL,
  request TEXT NOT NULL,
  result TEXT NOT NULL CHECK(json_valid(result)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,op)
);
CREATE TABLE IF NOT EXISTS pet_world_social_daily (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 20),
  fines INTEGER NOT NULL DEFAULT 0 CHECK(fines BETWEEN 0 AND 1000),
  PRIMARY KEY(user_id,day)
);
CREATE TABLE IF NOT EXISTS pet_world_social_targets (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 2),
  PRIMARY KEY(user_id,owner_id,day)
);
CREATE TABLE IF NOT EXISTS pet_world_social_rounds (
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round TEXT NOT NULL,
  visitor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  op TEXT NOT NULL,
  caught INTEGER NOT NULL CHECK(caught IN (0,1)),
  item TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity IN (0,1)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(owner_id,round,visitor_id)
);
-- 资产估值固定在下线时刻，不能靠等待让已冻结庄园继续生产更多迁移额度。
CREATE TABLE IF NOT EXISTS pet_world_manor_policy (
  id INTEGER PRIMARY KEY CHECK(id=1),
  closed_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO pet_world_manor_policy(id,closed_at) VALUES(1,unixepoch());
CREATE TABLE IF NOT EXISTS pet_world_manor_transfers (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  op TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  manor_rev INTEGER NOT NULL,
  world_rev INTEGER NOT NULL,
  manor_snapshot TEXT NOT NULL CHECK(json_valid(manor_snapshot)),
  quote TEXT NOT NULL CHECK(json_valid(quote)),
  credit INTEGER NOT NULL CHECK(credit>=0),
  created_at INTEGER NOT NULL
);
-- 独立庄园冻结。路由入口还需返回下线提示；旧客户端也不得继续生产或新建。
CREATE TRIGGER IF NOT EXISTS manor_closed_insert BEFORE INSERT ON manor
BEGIN SELECT RAISE(ABORT,'manor_closed'); END;
CREATE TRIGGER IF NOT EXISTS manor_closed_update BEFORE UPDATE ON manor
WHEN NOT (
  NEW.user_id=OLD.user_id AND NEW.rev=OLD.rev+1 AND NEW.state=OLD.state
  AND NEW.active_at=OLD.active_at AND NEW.ripe_at=OLD.ripe_at AND NEW.help_at=OLD.help_at AND NEW.lv=OLD.lv
  AND EXISTS(SELECT 1 FROM pet_world_manor_transfers t WHERE t.user_id=OLD.user_id AND t.manor_rev=OLD.rev AND t.op=NEW.op AND t.created_at=NEW.updated_at)
)
BEGIN SELECT RAISE(ABORT,'manor_closed'); END;
