-- 迷友群称号抽奖；旧库只执行一次，0026_dm 已先上线。
CREATE TABLE chat_title_raffles (
  id TEXT PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES chat_groups(id),
  creator_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL CHECK(title IN ('mona','lace','giant','worship','muscle')),
  entry_mode TEXT NOT NULL CHECK(entry_mode IN ('optin','all')),
  packet_id TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  closes_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closing','drawn','empty','cancelled')),
  winner_id INTEGER REFERENCES users(id),
  claim_token TEXT UNIQUE,
  drawn_at INTEGER,
  CHECK(group_id=1),
  CHECK(closes_at>created_at),
  CHECK(packet_id IS NULL OR entry_mode='optin')
);
CREATE INDEX idx_title_raffles_due ON chat_title_raffles(status,closes_at);
CREATE INDEX idx_title_raffles_wins ON chat_title_raffles(winner_id,title,status);
CREATE TABLE chat_title_raffle_entries (
  raffle_id TEXT NOT NULL REFERENCES chat_title_raffles(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY(raffle_id,user_id)
) WITHOUT ROWID;
CREATE INDEX idx_title_raffle_entries_user ON chat_title_raffle_entries(user_id,raffle_id);
CREATE TRIGGER trg_title_raffles_retired_insert BEFORE INSERT ON chat_title_raffles
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id IN(NEW.creator_id,NEW.winner_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER trg_title_raffles_retired_update BEFORE UPDATE OF creator_id,winner_id ON chat_title_raffles
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id IN(NEW.creator_id,NEW.winner_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER trg_title_raffle_entries_retired_insert BEFORE INSERT ON chat_title_raffle_entries
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER trg_title_raffle_entries_retired_update BEFORE UPDATE OF user_id ON chat_title_raffle_entries
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'account_retired'); END;
