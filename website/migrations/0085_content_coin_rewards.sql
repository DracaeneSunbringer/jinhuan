CREATE TABLE content_coin_rewards(
 source TEXT NOT NULL CHECK(source IN('post','road')),
 content_id INTEGER NOT NULL,
 user_id INTEGER NOT NULL REFERENCES users(id),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','paid','skipped')),
 amount INTEGER NOT NULL DEFAULT 0 CHECK(amount IN(0,20,52,100)),
 available_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 granted_at INTEGER,
 batch_key TEXT,
 PRIMARY KEY(source,content_id)
);
CREATE INDEX idx_content_reward_due ON content_coin_rewards(state,available_at,source,content_id);
CREATE INDEX idx_content_reward_user ON content_coin_rewards(user_id,created_at);
CREATE INDEX idx_content_reward_batch ON content_coin_rewards(batch_key,user_id);
CREATE TRIGGER trg_content_reward_retired BEFORE INSERT ON content_coin_rewards
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'account_retired'); END;
CREATE TRIGGER trg_content_reward_identity BEFORE UPDATE OF source,content_id,user_id ON content_coin_rewards
BEGIN SELECT RAISE(ABORT,'reward_identity_immutable'); END;
CREATE TRIGGER trg_content_reward_final BEFORE UPDATE ON content_coin_rewards WHEN OLD.state<>'pending'
BEGIN SELECT RAISE(ABORT,'reward_final_immutable'); END;
CREATE TRIGGER trg_meme_coin_reward AFTER INSERT ON memes
WHEN NEW.author_id IS NOT NULL AND NEW.hidden=0
 AND EXISTS(SELECT 1 FROM users WHERE id=NEW.author_id AND disabled=0 AND kind='user')
 AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.author_id)
BEGIN INSERT OR IGNORE INTO content_coin_rewards(source,content_id,user_id,available_at,created_at)
 VALUES('post',NEW.id,NEW.author_id,unixepoch()+60,unixepoch()); END;
CREATE TRIGGER trg_road_coin_reward AFTER INSERT ON road_items
WHEN NEW.hidden=0 AND NEW.source_hidden=0
 AND EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND disabled=0 AND kind='user')
 AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id)
BEGIN INSERT OR IGNORE INTO content_coin_rewards(source,content_id,user_id,available_at,created_at)
 VALUES('road',NEW.id,NEW.user_id,unixepoch()+60,unixepoch()); END;
-- One-time historical enqueue; background settlement is bounded and idempotent.
INSERT OR IGNORE INTO content_coin_rewards(source,content_id,user_id,amount,available_at,created_at)
 SELECT 'post',m.id,m.author_id,CASE WHEN m.nsfw=1 THEN 52 ELSE 20 END,unixepoch(),unixepoch()
 FROM memes m JOIN users u ON u.id=m.author_id WHERE m.hidden=0 AND u.disabled=0 AND u.kind='user'
 AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=u.id);
INSERT OR IGNORE INTO content_coin_rewards(source,content_id,user_id,amount,available_at,created_at)
 SELECT 'road',r.id,r.user_id,100,unixepoch(),unixepoch()
 FROM road_items r JOIN users u ON u.id=r.user_id WHERE r.hidden=0 AND r.source_hidden=0 AND u.disabled=0 AND u.kind='user'
 AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=u.id);
