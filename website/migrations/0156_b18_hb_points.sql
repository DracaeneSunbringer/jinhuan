CREATE TABLE IF NOT EXISTS hb_points_keys (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  binding_at INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_box TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS hb_points_trades (
  sender_id INTEGER NOT NULL,
  out_trade_no TEXT NOT NULL,
  trade_no TEXT NOT NULL UNIQUE,
  recipient_id INTEGER NOT NULL,
  recipient_subject TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 9007199254740991),
  remark TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(sender_id,out_trade_no),
  CHECK(sender_id<>recipient_id)
) WITHOUT ROWID;
