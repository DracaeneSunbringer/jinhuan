-- 大肥鱼的小岛：每用户一行世界状态 + 集市每日卖出量（2026-11）
CREATE TABLE IF NOT EXISTS pet_world (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 rev INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(json_valid(state)),
 op TEXT NOT NULL DEFAULT '',
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pet_market_volume (
 day TEXT NOT NULL,
 item TEXT NOT NULL,
 n INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(day,item)
);
CREATE TRIGGER IF NOT EXISTS pet_world_no_retired_insert BEFORE INSERT ON pet_world
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'retired_account'); END;
