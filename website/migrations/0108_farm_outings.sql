CREATE TABLE farm_outings (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 actor_id INTEGER NOT NULL REFERENCES users(id), owner_id INTEGER NOT NULL REFERENCES users(id),
 request_id TEXT NOT NULL, request_hash TEXT NOT NULL, attempt TEXT NOT NULL UNIQUE,
 mode TEXT NOT NULL CHECK(mode IN ('normal','sneak')), place TEXT NOT NULL CHECK(place IN ('home','ranch')),
 fee INTEGER NOT NULL CHECK(fee>=0), result TEXT NOT NULL CHECK(json_valid(result)), created_at INTEGER NOT NULL,
 CHECK(actor_id<>owner_id), UNIQUE(actor_id,request_id)
);
CREATE INDEX idx_farm_outings_actor_time ON farm_outings(actor_id,created_at DESC,id DESC);
CREATE INDEX idx_farm_outings_pair_time ON farm_outings(actor_id,owner_id,created_at DESC);
CREATE INDEX idx_farm_outings_owner_time ON farm_outings(owner_id,mode,created_at DESC,id DESC);
