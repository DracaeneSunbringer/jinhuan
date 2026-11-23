-- 擂台第三期：突破训练（每日 300，阶梯价）+ 实时约战押注 D币（2026-11）
CREATE TABLE IF NOT EXISTS pet_train (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 day TEXT NOT NULL,
 xp INTEGER NOT NULL DEFAULT 0 CHECK(xp BETWEEN 0 AND 300),
 PRIMARY KEY(user_id,day)
);
CREATE TABLE IF NOT EXISTS pet_duels (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 invitee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 operation TEXT NOT NULL,
 day TEXT NOT NULL,
 stake INTEGER NOT NULL CHECK(stake BETWEEN 100 AND 20000),
 status TEXT NOT NULL CHECK(status IN ('open','done','cancelled','declined','expired')),
 battle_id INTEGER REFERENCES pet_battles(id),
 winner_id INTEGER,
 payout INTEGER NOT NULL DEFAULT 0,
 rake INTEGER NOT NULL DEFAULT 0,
 flag INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 settled_at INTEGER,
 UNIQUE(inviter_id,operation),
 CHECK(inviter_id<>invitee_id)
);
CREATE INDEX IF NOT EXISTS idx_pet_duels_invitee ON pet_duels(invitee_id,status);
CREATE INDEX IF NOT EXISTS idx_pet_duels_inviter ON pet_duels(inviter_id,status);
CREATE INDEX IF NOT EXISTS idx_pet_duels_day ON pet_duels(day,inviter_id,invitee_id);
CREATE TRIGGER IF NOT EXISTS pet_duels_no_retired_insert BEFORE INSERT ON pet_duels
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id IN (NEW.inviter_id,NEW.invitee_id))
BEGIN SELECT RAISE(ABORT,'retired_account'); END;
