CREATE TABLE farm_lease_batches (
 user_id INTEGER NOT NULL,
 request_id TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 attempt TEXT NOT NULL UNIQUE,
 result TEXT NOT NULL CHECK(json_valid(result)),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,request_id)
);
