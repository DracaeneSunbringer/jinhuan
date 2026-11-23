-- 回归 update9：独立庄园重新上线，撤掉谷社交时期的冻结触发器。
-- 只解冻写入，庄园数据和 D币 账本都不动；pet_world_manor_* 迁移表保留但不再使用。
DROP TRIGGER IF EXISTS manor_closed_insert;
DROP TRIGGER IF EXISTS manor_closed_update;
