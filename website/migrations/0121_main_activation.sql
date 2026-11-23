ALTER TABLE users ADD COLUMN main_activated_at INTEGER;
-- Existing accounts keep access. New accounts need an invitation for SP only.
UPDATE users SET main_activated_at=unixepoch() WHERE kind='user';
CREATE TRIGGER invite_activates_main AFTER INSERT ON invites WHEN NEW.revoked=0 BEGIN
 UPDATE users SET main_activated_at=COALESCE(main_activated_at,NEW.created_at) WHERE id=NEW.invitee_id;
END;
CREATE TABLE main_activation_receipts(user_id INTEGER PRIMARY KEY REFERENCES users(id),code TEXT NOT NULL UNIQUE,activated_at INTEGER NOT NULL);
