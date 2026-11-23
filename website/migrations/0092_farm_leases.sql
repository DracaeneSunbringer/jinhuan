ALTER TABLE farm_saves ADD COLUMN owner_operated_at INTEGER NOT NULL DEFAULT 0;
UPDATE farm_saves SET owner_operated_at=updated_at;
CREATE INDEX idx_farm_owner_idle ON farm_saves(owner_operated_at,user_id);
CREATE TABLE farm_lease_offers (
 owner_id INTEGER NOT NULL REFERENCES users(id),
 plot INTEGER NOT NULL CHECK(plot BETWEEN 0 AND 23),
 price INTEGER NOT NULL CHECK(price BETWEEN 1 AND 10000),
 days INTEGER NOT NULL CHECK(days BETWEEN 1 AND 7),
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(owner_id,plot)
);
CREATE TABLE farm_leases (
 id TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL REFERENCES users(id),
 tenant_id INTEGER NOT NULL REFERENCES users(id),
 plot INTEGER NOT NULL CHECK(plot BETWEEN 0 AND 23),
 price INTEGER NOT NULL CHECK(price BETWEEN 1 AND 10000),
 started_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 forced INTEGER NOT NULL CHECK(forced IN(0,1)),
 state TEXT NOT NULL CHECK(state IN('active','ended')),
 crop_state TEXT NOT NULL CHECK(json_valid(crop_state)),
 revision INTEGER NOT NULL DEFAULT 0,
 attempt TEXT NOT NULL UNIQUE,
 CHECK(owner_id<>tenant_id)
);
CREATE UNIQUE INDEX idx_farm_lease_plot ON farm_leases(owner_id,plot) WHERE state='active';
CREATE INDEX idx_farm_lease_due ON farm_leases(state,expires_at);
CREATE INDEX idx_farm_lease_tenant ON farm_leases(tenant_id,state,expires_at);
CREATE INDEX idx_farm_lease_owner ON farm_leases(owner_id,state,expires_at);
CREATE TABLE farm_lease_actions (
 lease_id TEXT NOT NULL REFERENCES farm_leases(id),
 request_id TEXT NOT NULL,
 actor_id INTEGER NOT NULL REFERENCES users(id),
 attempt TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(lease_id,request_id)
);
