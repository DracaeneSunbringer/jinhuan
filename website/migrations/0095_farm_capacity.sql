-- Expand bounds only; keep all existing saves, balances, leases, receipts and IDs.

CREATE TABLE farm_visits_next (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 attempt TEXT NOT NULL UNIQUE,
 cycle TEXT NOT NULL,
 plot INTEGER NOT NULL CHECK(plot BETWEEN 0 AND 59),
 kind TEXT NOT NULL CHECK(kind IN ('steal','water')),
 crop TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount IN (0,1)),
 created_at INTEGER NOT NULL,
 CHECK(actor_id<>owner_id),
 UNIQUE(actor_id,request_id),
 UNIQUE(owner_id,cycle,kind)
);

INSERT INTO farm_visits_next SELECT * FROM farm_visits;

UPDATE sqlite_sequence SET seq=MAX(seq,COALESCE((SELECT seq FROM sqlite_sequence WHERE name='farm_visits'),0)) WHERE name='farm_visits_next';

INSERT INTO sqlite_sequence(name,seq) SELECT 'farm_visits_next',seq FROM sqlite_sequence WHERE name='farm_visits' AND NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name='farm_visits_next');

CREATE TABLE farm_ranch_visits_next (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 attempt TEXT NOT NULL UNIQUE,
 cycle TEXT NOT NULL,
 plot INTEGER NOT NULL CHECK(plot BETWEEN 0 AND 23),
 kind TEXT NOT NULL CHECK(kind IN ('animal_steal')),
 crop TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount = 1),
 created_at INTEGER NOT NULL,
 CHECK(actor_id<>owner_id),
 UNIQUE(actor_id,request_id),
 UNIQUE(owner_id,cycle,kind)
);

INSERT INTO farm_ranch_visits_next SELECT * FROM farm_ranch_visits;

UPDATE sqlite_sequence SET seq=MAX(seq,COALESCE((SELECT seq FROM sqlite_sequence WHERE name='farm_ranch_visits'),0)) WHERE name='farm_ranch_visits_next';

INSERT INTO sqlite_sequence(name,seq) SELECT 'farm_ranch_visits_next',seq FROM sqlite_sequence WHERE name='farm_ranch_visits' AND NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name='farm_ranch_visits_next');

CREATE TABLE farm_lease_offers_next (
 owner_id INTEGER NOT NULL REFERENCES users(id),
 plot INTEGER NOT NULL CHECK(plot BETWEEN 0 AND 59),
 price INTEGER NOT NULL CHECK(price BETWEEN 1 AND 10000),
 days INTEGER NOT NULL CHECK(days BETWEEN 1 AND 7),
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(owner_id,plot)
);

INSERT INTO farm_lease_offers_next SELECT * FROM farm_lease_offers;

CREATE TABLE farm_leases_next (
 id TEXT PRIMARY KEY,
 owner_id INTEGER NOT NULL REFERENCES users(id),
 tenant_id INTEGER NOT NULL REFERENCES users(id),
 plot INTEGER NOT NULL CHECK(plot BETWEEN 0 AND 59),
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

INSERT INTO farm_leases_next SELECT * FROM farm_leases;

CREATE TABLE farm_lease_actions_next (
 lease_id TEXT NOT NULL REFERENCES farm_leases_next(id),
 request_id TEXT NOT NULL,
 actor_id INTEGER NOT NULL REFERENCES users(id),
 attempt TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(lease_id,request_id)
);

INSERT INTO farm_lease_actions_next SELECT * FROM farm_lease_actions;

DROP TABLE farm_lease_actions;

DROP TABLE farm_leases;

DROP TABLE farm_lease_offers;

DROP TABLE farm_ranch_visits;

DROP TABLE farm_visits;

ALTER TABLE farm_visits_next RENAME TO farm_visits;

ALTER TABLE farm_ranch_visits_next RENAME TO farm_ranch_visits;

ALTER TABLE farm_lease_offers_next RENAME TO farm_lease_offers;

ALTER TABLE farm_leases_next RENAME TO farm_leases;

ALTER TABLE farm_lease_actions_next RENAME TO farm_lease_actions;

CREATE INDEX idx_farm_visits_actor_time ON farm_visits(actor_id,created_at);

CREATE INDEX idx_farm_visits_owner ON farm_visits(owner_id,id DESC);

CREATE INDEX idx_farm_visits_owner_time ON farm_visits(owner_id,created_at DESC,id DESC);

CREATE INDEX idx_farm_visits_time ON farm_visits(created_at);

CREATE TRIGGER farm_loss_crop AFTER INSERT ON farm_visits WHEN NEW.kind='steal' AND NEW.amount>0 BEGIN
 INSERT INTO farm_loss_totals(user_id,crops,total) VALUES(NEW.owner_id,NEW.amount,NEW.amount)
 ON CONFLICT(user_id) DO UPDATE SET crops=crops+NEW.amount,total=total+NEW.amount;
END;

CREATE INDEX idx_farm_ranch_visits_actor_time ON farm_ranch_visits(actor_id,created_at);

CREATE INDEX idx_farm_ranch_visits_owner ON farm_ranch_visits(owner_id,id DESC);

CREATE INDEX idx_farm_ranch_visits_owner_time ON farm_ranch_visits(owner_id,created_at DESC,id DESC);

CREATE INDEX idx_farm_ranch_visits_time ON farm_ranch_visits(created_at);

CREATE TRIGGER farm_loss_product AFTER INSERT ON farm_ranch_visits WHEN NEW.kind='animal_steal' AND NEW.amount>0 BEGIN
 INSERT INTO farm_loss_totals(user_id,products,total) VALUES(NEW.owner_id,NEW.amount,NEW.amount)
 ON CONFLICT(user_id) DO UPDATE SET products=products+NEW.amount,total=total+NEW.amount;
END;

CREATE INDEX idx_farm_lease_due ON farm_leases(state,expires_at);

CREATE INDEX idx_farm_lease_owner ON farm_leases(owner_id,state,expires_at);

CREATE UNIQUE INDEX idx_farm_lease_plot ON farm_leases(owner_id,plot) WHERE state='active';

CREATE INDEX idx_farm_lease_tenant ON farm_leases(tenant_id,state,expires_at);

CREATE INDEX idx_farm_lease_actions_actor ON farm_lease_actions(actor_id);
