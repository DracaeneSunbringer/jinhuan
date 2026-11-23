-- 将旧的单一授予快照保存为独立所有权。复用已有受退休守卫保护的 user_unlocks。
-- 不改当前佩戴，不改抽奖/报名，不触碰媒体。
INSERT OR IGNORE INTO user_unlocks(user_id,item,at)
SELECT id,'raffle:'||json_extract(deco,'$.fg'),updated_at FROM users
WHERE json_valid(deco) AND json_extract(deco,'$.fg') IN
('mona','lace','giant','worship','muscle','deepseek','maid','whalepunch','nightdevil','whalebuddy','gpt','claude','gemini','whitedragon')
AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=users.id);
-- 旧版本资料保存曾丢失 fg：实际佩戴等级高于中奖次数时，保全服务端授予快照。
INSERT OR IGNORE INTO user_unlocks(user_id,item,at)
SELECT id,'raffle:'||json_extract(deco,'$.ft'),updated_at FROM users
WHERE json_valid(deco) AND json_extract(deco,'$.ft') IN
('mona','lace','giant','worship','muscle','deepseek','maid','whalepunch','nightdevil','whalebuddy','gpt','claude','gemini','whitedragon')
AND NOT EXISTS(SELECT 1 FROM account_retirements WHERE source_id=users.id)
AND COALESCE(json_extract(deco,'$.fn'),1) > (SELECT COUNT(*) FROM chat_title_raffles WHERE winner_id=users.id AND title=json_extract(users.deco,'$.ft') AND status='drawn');

-- PERSONAL COLLECTION：本次快照中的真实成员；不强制佩戴，不纳入群抽奖。
-- 原版本在这里给指定用户发放专属装扮（含真实用户 ID），开源版已移除。

