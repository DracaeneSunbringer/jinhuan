-- Resource posts are separate from gallery media and its automatic read counts.
CREATE TABLE resource_posts (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
 request_id TEXT NOT NULL, category TEXT NOT NULL CHECK(category IN ('project','film','link')),
 title TEXT NOT NULL, body TEXT NOT NULL, share_url TEXT NOT NULL DEFAULT '', film_code TEXT NOT NULL DEFAULT '',
 media TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(media)), cover_url TEXT NOT NULL DEFAULT '',
 hidden INTEGER NOT NULL DEFAULT 0, approvals INTEGER NOT NULL DEFAULT 0, comments INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 UNIQUE(user_id,request_id)
);
CREATE INDEX idx_resource_recent ON resource_posts(hidden,id DESC);
CREATE INDEX idx_resource_category ON resource_posts(hidden,category,id DESC);
CREATE INDEX idx_resource_author ON resource_posts(user_id,created_at);
CREATE TABLE resource_marks (
 user_id INTEGER NOT NULL REFERENCES users(id), post_id INTEGER NOT NULL REFERENCES resource_posts(id),
 checked INTEGER NOT NULL DEFAULT 0 CHECK(checked IN(0,1)), favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN(0,1)),
 approved INTEGER NOT NULL DEFAULT 0 CHECK(approved IN(0,1)), reaction TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,post_id)
);
CREATE INDEX idx_resource_marks_post ON resource_marks(post_id,approved);
CREATE INDEX idx_resource_favorites ON resource_marks(user_id,favorite,post_id DESC);
CREATE TRIGGER resource_approval_insert AFTER INSERT ON resource_marks WHEN NEW.approved=1 BEGIN
 UPDATE resource_posts SET approvals=approvals+1 WHERE id=NEW.post_id;
END;
CREATE TRIGGER resource_approval_update AFTER UPDATE OF approved ON resource_marks WHEN NEW.approved!=OLD.approved BEGIN
 UPDATE resource_posts SET approvals=approvals+NEW.approved-OLD.approved WHERE id=NEW.post_id;
END;
CREATE TABLE resource_recognition (
 post_id INTEGER NOT NULL REFERENCES resource_posts(id), user_id INTEGER NOT NULL REFERENCES users(id),
 author_id INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL, PRIMARY KEY(post_id,user_id)
);
CREATE TRIGGER resource_recognition_apply AFTER INSERT ON resource_recognition BEGIN
 INSERT INTO community_progress(user_id,metric,value) VALUES(NEW.author_id,'resource_respect',1)
 ON CONFLICT(user_id,metric) DO UPDATE SET value=value+1;
END;
CREATE TABLE resource_comments (
 id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL REFERENCES resource_posts(id),
 user_id INTEGER NOT NULL REFERENCES users(id), request_id TEXT NOT NULL, body TEXT NOT NULL,
 hidden INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, UNIQUE(user_id,request_id)
);
CREATE INDEX idx_resource_comments ON resource_comments(post_id,hidden,id);
CREATE INDEX idx_resource_comment_rate ON resource_comments(user_id,created_at);
CREATE TRIGGER resource_comment_insert AFTER INSERT ON resource_comments BEGIN
 UPDATE resource_posts SET comments=comments+1 WHERE id=NEW.post_id;
END;
CREATE TRIGGER resource_comment_hide AFTER UPDATE OF hidden ON resource_comments WHEN OLD.hidden=0 AND NEW.hidden=1 BEGIN
 UPDATE resource_posts SET comments=MAX(0,comments-1) WHERE id=NEW.post_id;
END;
CREATE TABLE resource_metadata_cache(code TEXT PRIMARY KEY, body TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE resource_metadata_limits(user_id INTEGER PRIMARY KEY, minute INTEGER NOT NULL, calls INTEGER NOT NULL);

ALTER TABLE huancai_jackpot ADD COLUMN topups INTEGER NOT NULL DEFAULT 0 CHECK(topups>=0);
CREATE TRIGGER huancai_jackpot_floor AFTER UPDATE OF available,reserved ON huancai_jackpot
WHEN NEW.available+NEW.reserved<500000000 BEGIN
 -- Existing conservation CHECK uses contributed as all external funding.
 -- topups is its separately reported subset; sales contribution = contributed-topups.
 UPDATE huancai_jackpot SET topups=topups+500000000-available-reserved,
 contributed=contributed+500000000-available-reserved,available=500000000-reserved WHERE id=NEW.id;
END;
UPDATE huancai_jackpot SET available=available WHERE id=1 AND available+reserved<500000000;
CREATE TABLE huancai_weekly (
 week TEXT PRIMARY KEY, closes_at INTEGER NOT NULL, mode TEXT NOT NULL CHECK(mode IN('natural','ticket','free')),
 user_id INTEGER REFERENCES users(id), ticket_id TEXT, payout INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, CHECK((mode='natural' AND payout=0) OR (user_id IS NOT NULL AND payout>0))
);
CREATE TRIGGER huancai_weekly_pay AFTER INSERT ON huancai_weekly WHEN NEW.payout>0 BEGIN
 INSERT OR IGNORE INTO coin52_wallets(user_id,updated_at) VALUES(NEW.user_id,NEW.created_at);
 INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at)
 SELECT NEW.user_id,'huancai-weekly',NEW.week,'weekly:'||NEW.week,NEW.payout,balance+NEW.payout,NEW.created_at FROM coin52_wallets WHERE user_id=NEW.user_id;
 UPDATE coin52_wallets SET balance=balance+NEW.payout,revision=revision+1,updated_at=NEW.created_at WHERE user_id=NEW.user_id;
 UPDATE huancai_jackpot SET available=available-NEW.payout,paid=paid+NEW.payout,updated_at=NEW.created_at WHERE id=1;
END;
CREATE TABLE coin52_grant_batches(id TEXT PRIMARY KEY, amount INTEGER NOT NULL CHECK(amount=100000), created_at INTEGER NOT NULL);
CREATE TABLE coin52_grant_recipients(batch_id TEXT NOT NULL REFERENCES coin52_grant_batches(id),user_id INTEGER NOT NULL REFERENCES users(id),PRIMARY KEY(batch_id,user_id));
CREATE TRIGGER coin52_beta_snapshot AFTER INSERT ON coin52_grant_batches BEGIN
 INSERT INTO coin52_grant_recipients(batch_id,user_id)
 SELECT NEW.id,u.id FROM chat_members m JOIN users u ON u.id=m.user_id
 WHERE m.group_id=1 AND u.kind='user' AND u.disabled=0
 AND NOT EXISTS(SELECT 1 FROM chat_bans WHERE group_id=1 AND user_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=u.id);
END;
CREATE TRIGGER coin52_beta_pay AFTER INSERT ON coin52_grant_recipients BEGIN
 INSERT OR IGNORE INTO coin52_wallets(user_id,updated_at) SELECT NEW.user_id,created_at FROM coin52_grant_batches WHERE id=NEW.batch_id;
 INSERT INTO coin52_ledger(user_id,kind,ref,attempt,delta,balance_after,created_at)
 SELECT NEW.user_id,'admin-beta-grant',b.id,'beta:'||b.id||':'||NEW.user_id,b.amount,w.balance+b.amount,b.created_at
 FROM coin52_grant_batches b JOIN coin52_wallets w ON w.user_id=NEW.user_id WHERE b.id=NEW.batch_id;
 UPDATE coin52_wallets SET balance=balance+(SELECT amount FROM coin52_grant_batches WHERE id=NEW.batch_id),revision=revision+1,
 updated_at=(SELECT created_at FROM coin52_grant_batches WHERE id=NEW.batch_id) WHERE user_id=NEW.user_id;
END;
