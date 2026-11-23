-- 站宠成长服务端记账 + 大肥鱼擂台战报（2026-11）
CREATE TABLE IF NOT EXISTS pet_progress (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 total_xp INTEGER NOT NULL CHECK(total_xp>=0),
 day TEXT NOT NULL,
 day_xp INTEGER NOT NULL CHECK(day_xp BETWEEN 0 AND 300),
 imported_xp INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pet_battles (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 attacker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 defender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 operation TEXT NOT NULL,
 day TEXT NOT NULL,
 seed INTEGER NOT NULL,
 attacker_level INTEGER NOT NULL,
 defender_level INTEGER NOT NULL,
 winner INTEGER NOT NULL CHECK(winner IN (-1,0,1)),
 rounds INTEGER NOT NULL,
 fighters TEXT NOT NULL CHECK(json_valid(fighters)),
 events TEXT NOT NULL CHECK(json_valid(events)),
 xp INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 UNIQUE(attacker_id,operation),
 CHECK(attacker_id<>defender_id)
);
CREATE INDEX IF NOT EXISTS idx_pet_battles_attacker_day ON pet_battles(attacker_id,day,defender_id);
CREATE INDEX IF NOT EXISTS idx_pet_battles_defender ON pet_battles(defender_id,id);
CREATE TRIGGER IF NOT EXISTS pet_progress_no_retired_insert BEFORE INSERT ON pet_progress
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'retired_account'); END;
CREATE TRIGGER IF NOT EXISTS pet_battles_no_retired_insert BEFORE INSERT ON pet_battles
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id IN (NEW.attacker_id,NEW.defender_id))
BEGIN SELECT RAISE(ABORT,'retired_account'); END;
