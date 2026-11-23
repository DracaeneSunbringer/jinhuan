CREATE TABLE farm_lease_buybacks (
 lease_id TEXT PRIMARY KEY REFERENCES farm_leases(id),
 owner_id INTEGER NOT NULL REFERENCES users(id),tenant_id INTEGER NOT NULL REFERENCES users(id),
 plot INTEGER NOT NULL,request_id TEXT NOT NULL,attempt TEXT NOT NULL UNIQUE,
 penalty INTEGER NOT NULL CHECK(penalty>0),reward INTEGER NOT NULL CHECK(reward>=0),
 crop_state TEXT NOT NULL,created_at INTEGER NOT NULL,cooldown_until INTEGER NOT NULL,
 UNIQUE(owner_id,request_id)
);
CREATE INDEX idx_farm_buyback_plot ON farm_lease_buybacks(owner_id,plot,cooldown_until DESC);
