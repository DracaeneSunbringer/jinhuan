-- 2026-11-07：每日自然成长上限 300 → 500（落后追赶最多 ×3 = 1500）。pet_progress.day_xp 有 CHECK(0..300)，
-- 重建表要改名，会重新解析全库触发器，风险大；改为新表单独记每日经验，pet_progress.day_xp 仍写 MIN(300, 实际值) 保持兼容。
CREATE TABLE IF NOT EXISTS pet_xp_daily (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 day TEXT NOT NULL,
 xp INTEGER NOT NULL DEFAULT 0 CHECK(xp BETWEEN 0 AND 5000),
 PRIMARY KEY(user_id, day)
);
