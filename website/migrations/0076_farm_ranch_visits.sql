-- Animal visit receipts; account balances and existing saves are untouched.
CREATE TABLE farm_ranch_visits (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 attempt TEXT NOT NULL UNIQUE,
 cycle TEXT NOT NULL,
 plot INTEGER NOT NULL CHECK(plot BETWEEN 0 AND 5),
 kind TEXT NOT NULL CHECK(kind IN ('animal_steal')),
 crop TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount = 1),
 created_at INTEGER NOT NULL,
 CHECK(actor_id<>owner_id),
 UNIQUE(actor_id,request_id),
 UNIQUE(owner_id,cycle,kind)
);
CREATE INDEX idx_farm_ranch_visits_owner ON farm_ranch_visits(owner_id,id DESC);
CREATE INDEX idx_farm_ranch_visits_actor_time ON farm_ranch_visits(actor_id,created_at);
CREATE INDEX idx_farm_ranch_visits_time ON farm_ranch_visits(created_at);
