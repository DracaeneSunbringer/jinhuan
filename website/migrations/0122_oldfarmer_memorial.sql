INSERT OR IGNORE INTO title_awards(user_id,title,source,created_at,levels)
SELECT id,'oldfarmer','farm-farewell-20261028',unixepoch(),5200 FROM users
WHERE id>0 AND kind='user' AND disabled=0 AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=users.id);
