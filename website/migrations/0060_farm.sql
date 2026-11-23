CREATE TABLE farm_saves (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL CHECK(json_valid(state)),
 updated_at INTEGER NOT NULL
);
