-- 52B limited pool uses a fixed chance and awards a collectible character card on each draw.
CREATE TABLE community_bubble_draws_v2 (
 user_id INTEGER NOT NULL REFERENCES users(id),
 request_id TEXT NOT NULL,
 attempt TEXT NOT NULL UNIQUE,
 owner_id INTEGER NOT NULL REFERENCES users(id),
 item_id TEXT,
 won INTEGER NOT NULL CHECK(won IN(0,1)),
 duplicate INTEGER NOT NULL CHECK(duplicate IN(0,1)),
 guaranteed INTEGER NOT NULL CHECK(guaranteed IN(0,1)),
 pity_after INTEGER NOT NULL CHECK(pity_after BETWEEN 0 AND 59),
 chance INTEGER NOT NULL CHECK(chance BETWEEN 5 AND 25),
 finger_level INTEGER NOT NULL CHECK(finger_level BETWEEN 0 AND 5),
 catalog_source TEXT NOT NULL,
 card_id TEXT,
 card_duplicate INTEGER NOT NULL DEFAULT 0 CHECK(card_duplicate IN(0,1)),
 reward_amount INTEGER NOT NULL DEFAULT 0 CHECK(reward_amount>=0 AND reward_amount<=100000),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,request_id),
 CHECK((won=0 AND item_id IS NULL AND duplicate=0 AND guaranteed=0) OR (won=1 AND item_id IS NOT NULL))
) WITHOUT ROWID;
INSERT INTO community_bubble_draws_v2(user_id,request_id,attempt,owner_id,item_id,won,duplicate,guaranteed,pity_after,chance,finger_level,catalog_source,created_at)
 SELECT user_id,request_id,attempt,owner_id,item_id,won,duplicate,guaranteed,pity_after,chance,finger_level,catalog_source,created_at FROM community_bubble_draws;
DROP TABLE community_bubble_draws;
ALTER TABLE community_bubble_draws_v2 RENAME TO community_bubble_draws;

CREATE TABLE collectible_cards (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 pack_id TEXT NOT NULL CHECK(length(pack_id)>=1 AND length(pack_id)<=48),
 card_id TEXT NOT NULL CHECK(card_id IN('0','1','2','3','4','5')),
 first_at INTEGER NOT NULL,
 last_at INTEGER NOT NULL,
 count INTEGER NOT NULL DEFAULT 1 CHECK(count>0),
 PRIMARY KEY(user_id,pack_id,card_id)
) WITHOUT ROWID;
