CREATE TABLE farm_loss_totals(user_id INTEGER PRIMARY KEY REFERENCES users(id),crops INTEGER NOT NULL DEFAULT 0,products INTEGER NOT NULL DEFAULT 0,total INTEGER NOT NULL DEFAULT 0);
CREATE INDEX idx_farm_loss_rank ON farm_loss_totals(total DESC,user_id);
INSERT INTO farm_loss_totals(user_id,crops,products,total)
SELECT owner_id,sum(crops),sum(products),sum(crops+products) FROM (
 SELECT owner_id,sum(amount) crops,0 products FROM farm_visits WHERE kind='steal' GROUP BY owner_id
 UNION ALL SELECT owner_id,0,sum(amount) FROM farm_ranch_visits WHERE kind='animal_steal' GROUP BY owner_id
) GROUP BY owner_id;
CREATE TRIGGER farm_loss_crop AFTER INSERT ON farm_visits WHEN NEW.kind='steal' AND NEW.amount>0 BEGIN
 INSERT INTO farm_loss_totals(user_id,crops,total) VALUES(NEW.owner_id,NEW.amount,NEW.amount)
 ON CONFLICT(user_id) DO UPDATE SET crops=crops+NEW.amount,total=total+NEW.amount;
END;
CREATE TRIGGER farm_loss_product AFTER INSERT ON farm_ranch_visits WHEN NEW.kind='animal_steal' AND NEW.amount>0 BEGIN
 INSERT INTO farm_loss_totals(user_id,products,total) VALUES(NEW.owner_id,NEW.amount,NEW.amount)
 ON CONFLICT(user_id) DO UPDATE SET products=products+NEW.amount,total=total+NEW.amount;
END;
