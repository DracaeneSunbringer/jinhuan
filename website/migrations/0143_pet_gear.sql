-- 大肥鱼擂台第二期：武器装备、属性加点、每日宝箱 / 训练、D币操作幂等记录（2026-11）
CREATE TABLE IF NOT EXISTS pet_items (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 item TEXT NOT NULL,
 enh INTEGER NOT NULL DEFAULT 0 CHECK(enh BETWEEN 0 AND 10),
 source TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,item)
);
CREATE TABLE IF NOT EXISTS pet_loadout (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 weapon TEXT, armor TEXT, charm TEXT,
 points TEXT NOT NULL DEFAULT '{"str":0,"agi":0,"spd":0,"vit":0}' CHECK(json_valid(points)),
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pet_daily (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 day TEXT NOT NULL,
 trained INTEGER NOT NULL DEFAULT 0 CHECK(trained BETWEEN 0 AND 150),
 chest INTEGER NOT NULL DEFAULT 0 CHECK(chest IN (0,1)),
 PRIMARY KEY(user_id,day)
);
-- 每个付费 / 领取操作一行：operation 唯一保证重试不重复扣费；attempt 关联本次 D币流水。
CREATE TABLE IF NOT EXISTS pet_ops (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 operation TEXT NOT NULL,
 attempt TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL,
 ref TEXT NOT NULL,
 cost INTEGER NOT NULL CHECK(cost>=0),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,operation)
);
CREATE TABLE IF NOT EXISTS pet_battle_drops (
 battle_id INTEGER PRIMARY KEY REFERENCES pet_battles(id) ON DELETE CASCADE,
 item TEXT NOT NULL,
 upgraded INTEGER NOT NULL DEFAULT 0
);
CREATE TRIGGER IF NOT EXISTS pet_items_no_retired_insert BEFORE INSERT ON pet_items
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'retired_account'); END;
CREATE TRIGGER IF NOT EXISTS pet_ops_no_retired_insert BEFORE INSERT ON pet_ops
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'retired_account'); END;
