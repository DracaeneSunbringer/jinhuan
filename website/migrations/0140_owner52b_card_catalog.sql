-- 52B pack expands to distinct Yamada and Tayama cards; keep prior ownership counts.
CREATE TABLE collectible_cards_v2 (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 pack_id TEXT NOT NULL CHECK(length(pack_id)>=1 AND length(pack_id)<=48),
 card_id TEXT NOT NULL CHECK(card_id IN('0','1','2','3','4','5','6')),
 first_at INTEGER NOT NULL,
 last_at INTEGER NOT NULL,
 count INTEGER NOT NULL DEFAULT 1 CHECK(count>0),
 PRIMARY KEY(user_id,pack_id,card_id)
) WITHOUT ROWID;
INSERT INTO collectible_cards_v2(user_id,pack_id,card_id,first_at,last_at,count)
 SELECT user_id,pack_id,card_id,first_at,last_at,count FROM collectible_cards;
DROP TABLE collectible_cards;
ALTER TABLE collectible_cards_v2 RENAME TO collectible_cards;
