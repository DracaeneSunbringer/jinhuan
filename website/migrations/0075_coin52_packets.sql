CREATE TABLE coin52_packets (
 packet_id TEXT PRIMARY KEY REFERENCES chat_redpacks(id),
 owner_id INTEGER NOT NULL REFERENCES users(id),
 group_id INTEGER NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('fixed','random')),
 total INTEGER NOT NULL CHECK(total BETWEEN 1 AND 1000000),
 count INTEGER NOT NULL CHECK(count BETWEEN 1 AND 100),
 remaining INTEGER NOT NULL CHECK(remaining>=0 AND remaining<=total),
 remaining_count INTEGER NOT NULL CHECK(remaining_count>=0 AND remaining_count<=count),
 expires_at INTEGER NOT NULL,
 refunded_at INTEGER,
 created_at INTEGER NOT NULL
);
CREATE INDEX idx_coin52_packets_expiry ON coin52_packets(expires_at) WHERE refunded_at IS NULL AND remaining>0;
CREATE INDEX idx_coin52_packets_owner ON coin52_packets(owner_id,created_at);
CREATE TABLE coin52_packet_slots (
 packet_id TEXT NOT NULL REFERENCES coin52_packets(packet_id),
 slot INTEGER NOT NULL,
 amount INTEGER NOT NULL CHECK(amount>0),
 recipient_id INTEGER REFERENCES users(id),
 claimed_at INTEGER,
 attempt TEXT UNIQUE,
 PRIMARY KEY(packet_id,slot),
 UNIQUE(packet_id,recipient_id)
);
CREATE INDEX idx_coin52_slots_recipient ON coin52_packet_slots(recipient_id);
