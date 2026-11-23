-- Opt-in conflict inventory. No existing farm assets are enrolled automatically.
CREATE TABLE farm_conflict_members (
 user_id INTEGER PRIMARY KEY REFERENCES users(id),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 stance TEXT NOT NULL DEFAULT 'patrol' CHECK(stance IN ('patrol','barrier','decoy')),
 joined_at INTEGER NOT NULL,
 protected_until INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_farm_conflict_members_enabled ON farm_conflict_members(enabled,user_id);
CREATE TABLE farm_conflict_stakes (
 lot_id TEXT PRIMARY KEY REFERENCES farm_market_lots(id),
 user_id INTEGER NOT NULL REFERENCES users(id),
 quantity INTEGER NOT NULL CHECK(quantity>0),
 revision INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_farm_conflict_stakes_owner ON farm_conflict_stakes(user_id,lot_id);
CREATE TABLE farm_conflict_budgets (
 user_id INTEGER NOT NULL REFERENCES users(id),
 day INTEGER NOT NULL,
 limit_cents INTEGER NOT NULL CHECK(limit_cents>=0),
 reserved_cents INTEGER NOT NULL DEFAULT 0 CHECK(reserved_cents>=0 AND reserved_cents<=limit_cents),
 PRIMARY KEY(user_id,day)
);
CREATE TABLE farm_conflicts (
 id TEXT PRIMARY KEY,
 attacker_id INTEGER NOT NULL REFERENCES users(id),
 defender_id INTEGER NOT NULL REFERENCES users(id),
 lot_id TEXT NOT NULL,
 item TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity>0),
 loot_cents INTEGER NOT NULL CHECK(loot_cents>0 AND loot_cents<=5000),
 bond INTEGER NOT NULL CHECK(bond>0),
 attack_tools INTEGER NOT NULL CHECK(attack_tools BETWEEN 0 AND 5),
 defense_tools INTEGER NOT NULL DEFAULT 0 CHECK(defense_tools BETWEEN 0 AND 5),
 tactic TEXT NOT NULL CHECK(tactic IN ('sneak','rush','lure')),
 stance TEXT NOT NULL CHECK(stance IN ('patrol','barrier','decoy')),
 guardian INTEGER NOT NULL DEFAULT 0 CHECK(guardian IN (0,1)),
 sealed INTEGER NOT NULL DEFAULT 0 CHECK(sealed IN (0,1)),
 roll INTEGER NOT NULL CHECK(roll BETWEEN 0 AND 999999),
 roll_nonce TEXT NOT NULL,
 commitment TEXT NOT NULL,
 chance REAL,
 status TEXT NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing','failed','escrow','uprising','claimable','claimed','recovered')),
 starts_at INTEGER NOT NULL,
 resolves_at INTEGER NOT NULL,
 release_at INTEGER NOT NULL DEFAULT 0,
 settled_at INTEGER,
 revision INTEGER NOT NULL DEFAULT 0,
 CHECK(attacker_id<>defender_id)
);
CREATE INDEX idx_farm_conflicts_due ON farm_conflicts(status,resolves_at,id);
CREATE INDEX idx_farm_conflicts_release ON farm_conflicts(status,release_at,id);
CREATE INDEX idx_farm_conflicts_attacker ON farm_conflicts(attacker_id,starts_at DESC);
CREATE INDEX idx_farm_conflicts_defender ON farm_conflicts(defender_id,starts_at DESC);
CREATE INDEX idx_farm_conflicts_pair ON farm_conflicts(attacker_id,defender_id,starts_at DESC);
CREATE UNIQUE INDEX idx_farm_conflicts_active_defender ON farm_conflicts(defender_id) WHERE status IN ('preparing','escrow','uprising','claimable');
CREATE TABLE farm_uprisings (
 battle_id TEXT PRIMARY KEY REFERENCES farm_conflicts(id),
 closes_at INTEGER NOT NULL,
 roll INTEGER NOT NULL CHECK(roll BETWEEN 0 AND 999999),
 roll_nonce TEXT NOT NULL,
 commitment TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'forming' CHECK(status IN ('forming','won','lost','insufficient')),
 chance REAL,
 revision INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_farm_uprisings_due ON farm_uprisings(status,closes_at,battle_id);
CREATE TABLE farm_uprising_members (
 battle_id TEXT NOT NULL REFERENCES farm_uprisings(battle_id),
 user_id INTEGER NOT NULL REFERENCES users(id),
 joined_at INTEGER NOT NULL,
 PRIMARY KEY(battle_id,user_id)
);
CREATE INDEX idx_farm_uprising_members_user ON farm_uprising_members(user_id,battle_id);
CREATE TABLE farm_conflict_receipts (
 user_id INTEGER NOT NULL,
 request_id TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 attempt TEXT NOT NULL UNIQUE,
 result TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,request_id)
);
CREATE INDEX idx_farm_conflict_receipts_time ON farm_conflict_receipts(user_id,created_at);
CREATE TABLE farm_conflict_events (
 id INTEGER PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id),
 actor_id INTEGER NOT NULL REFERENCES users(id),
 battle_id TEXT NOT NULL REFERENCES farm_conflicts(id),
 phase TEXT NOT NULL,
 body TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 UNIQUE(user_id,battle_id,phase)
);
CREATE INDEX idx_farm_conflict_events_user_time ON farm_conflict_events(user_id,created_at DESC);
INSERT OR IGNORE INTO site_settings(k,v,updated_at) VALUES('farm.conflict.enabled','off',strftime('%s','now'));
