CREATE TABLE guess_queue (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE,
 group_id INTEGER NOT NULL REFERENCES chat_groups(id),
 owner_id INTEGER NOT NULL REFERENCES users(id),
 state TEXT NOT NULL CHECK(state IN('draft','queued','starting','started','failed','cancelled')),
 ticket INTEGER,
 config_box TEXT NOT NULL,
 reward_type TEXT NOT NULL CHECK(reward_type IN('ldc','none')),
 amount_cents INTEGER NOT NULL DEFAULT 0,
 automatic INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 lease TEXT,
 lease_until INTEGER NOT NULL DEFAULT 0,
 error TEXT,
 message_id INTEGER REFERENCES chat_messages(id)
);
CREATE UNIQUE INDEX idx_guess_queue_order ON guess_queue(group_id,ticket);
CREATE INDEX idx_guess_queue_pending ON guess_queue(state,group_id,ticket) WHERE state IN('queued','starting');
CREATE INDEX idx_guess_queue_group ON guess_queue(group_id,ticket) WHERE state IN('queued','starting');
CREATE INDEX idx_guess_queue_owner ON guess_queue(owner_id,group_id,state,seq);
