CREATE TABLE farm_guest_visits (
 owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 visited_at INTEGER NOT NULL,
 PRIMARY KEY(owner_id,actor_id)
);
CREATE INDEX idx_farm_guest_owner_time ON farm_guest_visits(owner_id,visited_at DESC,actor_id DESC);
CREATE INDEX idx_farm_guest_time ON farm_guest_visits(visited_at);
CREATE INDEX idx_farm_guest_actor ON farm_guest_visits(actor_id);
CREATE INDEX idx_farm_visits_owner_time ON farm_visits(owner_id,created_at DESC,id DESC);
CREATE INDEX idx_farm_ranch_visits_owner_time ON farm_ranch_visits(owner_id,created_at DESC,id DESC);
