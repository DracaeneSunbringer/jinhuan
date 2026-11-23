-- Audit snapshots only. Inventory conversion is revision-gated per account.
CREATE TABLE farm_market_imports(
 user_id INTEGER PRIMARY KEY,
 original_state TEXT NOT NULL,
 migrated_state TEXT NOT NULL,
 source_revision INTEGER NOT NULL,
 quantities TEXT NOT NULL,
 attempt TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL
);
CREATE TRIGGER farm_market_import_revision BEFORE INSERT ON farm_market_imports
WHEN NOT EXISTS(SELECT 1 FROM farm_saves WHERE user_id=NEW.user_id AND revision=NEW.source_revision)
BEGIN SELECT RAISE(ABORT,'market_import_conflict'); END;
-- Each account import is one atomic INSERT, including its lots and save. This
-- also makes an interrupted, resumable administrative import safe to retry.
CREATE TRIGGER farm_market_import_apply AFTER INSERT ON farm_market_imports BEGIN
 INSERT OR IGNORE INTO farm_market_accounts(user_id,created_at) VALUES(NEW.user_id,NEW.created_at);
 INSERT OR IGNORE INTO farm_market_goods(item,base_cents,price_cents,tick_at,fresh_at)
 SELECT json_extract(value,'$.item'),json_extract(value,'$.base'),json_extract(value,'$.base'),NEW.created_at,NEW.created_at FROM json_each(NEW.quantities);
 INSERT INTO farm_market_lots(id,owner_id,item,source,quantity,born_at,expires_at)
 SELECT json_extract(value,'$.id'),NEW.user_id,json_extract(value,'$.item'),json_extract(value,'$.source'),json_extract(value,'$.quantity'),json_extract(value,'$.born'),json_extract(value,'$.expires') FROM json_each(NEW.quantities) WHERE 1
 ON CONFLICT(owner_id,item,source,born_at,expires_at,cooldown_until,expired) DO UPDATE SET quantity=quantity+excluded.quantity,revision=revision+1;
 UPDATE farm_market_goods SET
 fresh_seconds=fresh_seconds+(SELECT sum(json_extract(value,'$.quantity')*(json_extract(value,'$.expires')-farm_market_goods.fresh_at)) FROM json_each(NEW.quantities) WHERE json_extract(value,'$.item')=farm_market_goods.item),
 fresh_qty=fresh_qty+(SELECT sum(json_extract(value,'$.quantity')) FROM json_each(NEW.quantities) WHERE json_extract(value,'$.item')=farm_market_goods.item),revision=revision+1
 WHERE item IN(SELECT json_extract(value,'$.item') FROM json_each(NEW.quantities));
 UPDATE farm_saves SET state=NEW.migrated_state,revision=revision+1,updated_at=NEW.created_at WHERE user_id=NEW.user_id;
END;

-- One-time, auditable shop supply. Replaying a grant cannot mint more stock.
CREATE TABLE farm_market_supply_grants(
 id TEXT PRIMARY KEY,
 item TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity>0),
 base_cents INTEGER NOT NULL CHECK(base_cents>0),
 born_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at>born_at)
);
CREATE TRIGGER farm_market_supply_apply AFTER INSERT ON farm_market_supply_grants BEGIN
 INSERT OR IGNORE INTO farm_market_goods(item,base_cents,price_cents,tick_at,fresh_at)
 VALUES(NEW.item,NEW.base_cents,NEW.base_cents,NEW.born_at,NEW.born_at);
 INSERT INTO farm_market_lots(id,owner_id,item,source,quantity,born_at,expires_at)
 VALUES('initial-'||NEW.id,0,NEW.item,'market',NEW.quantity,NEW.born_at,NEW.expires_at)
 ON CONFLICT(owner_id,item,source,born_at,expires_at,cooldown_until,expired)
 DO UPDATE SET quantity=quantity+excluded.quantity,revision=revision+1;
 UPDATE farm_market_goods SET fresh_seconds=fresh_seconds+NEW.quantity*(NEW.expires_at-fresh_at),
 fresh_qty=fresh_qty+NEW.quantity,revision=revision+1 WHERE item=NEW.item;
END;
