CREATE TABLE IF NOT EXISTS community_bubble_progress (
 user_id INTEGER PRIMARY KEY REFERENCES users(id),
 pity INTEGER NOT NULL DEFAULT 0 CHECK(pity BETWEEN 0 AND 59),
 draws INTEGER NOT NULL DEFAULT 0 CHECK(draws>=0),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0)
);
CREATE TABLE IF NOT EXISTS community_bubble_draws (
 user_id INTEGER NOT NULL REFERENCES users(id),
 request_id TEXT NOT NULL,
 attempt TEXT NOT NULL UNIQUE,
 owner_id INTEGER NOT NULL REFERENCES users(id),
 item_id TEXT,
 won INTEGER NOT NULL CHECK(won IN(0,1)),
 duplicate INTEGER NOT NULL CHECK(duplicate IN(0,1)),
 guaranteed INTEGER NOT NULL CHECK(guaranteed IN(0,1)),
 pity_after INTEGER NOT NULL CHECK(pity_after BETWEEN 0 AND 59),
 chance INTEGER NOT NULL CHECK(chance BETWEEN 10 AND 25),
 finger_level INTEGER NOT NULL CHECK(finger_level BETWEEN 0 AND 5),
 catalog_source TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,request_id),
 CHECK((won=0 AND item_id IS NULL AND duplicate=0 AND guaranteed=0) OR (won=1 AND item_id IS NOT NULL))
) WITHOUT ROWID;
