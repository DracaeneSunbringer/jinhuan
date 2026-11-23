-- 一次性清理：只保留 /chat/1「迷友」。执行前必须确认 group 1 存在且为默认群。
-- 本脚本只删 D1 关系，不删除 R2 对象；不要作为数据库迁移自动执行。
UPDATE road_items SET source_hidden=1,updated_at=strftime('%s','now')
  WHERE source_group_id<>1 AND source_group_id IS NOT NULL AND source_hidden<>1;

DELETE FROM chat_redpack_external_views WHERE packet_id IN
  (SELECT r.id FROM chat_redpacks r JOIN chat_messages m ON m.id=r.message_id WHERE m.group_id<>1);
DELETE FROM chat_redpack_opens WHERE packet_id IN
  (SELECT r.id FROM chat_redpacks r JOIN chat_messages m ON m.id=r.message_id WHERE m.group_id<>1);
DELETE FROM chat_redpack_successes WHERE packet_id IN
  (SELECT r.id FROM chat_redpacks r JOIN chat_messages m ON m.id=r.message_id WHERE m.group_id<>1);
DELETE FROM chat_redpacks WHERE message_id IN (SELECT id FROM chat_messages WHERE group_id<>1);
DELETE FROM chat_reactions WHERE message_id IN (SELECT id FROM chat_messages WHERE group_id<>1);
DELETE FROM chat_boosts WHERE message_id IN (SELECT id FROM chat_messages WHERE group_id<>1);
DELETE FROM chat_messages WHERE group_id<>1;
DELETE FROM chat_bans WHERE group_id<>1;
DELETE FROM chat_join_reqs WHERE group_id<>1;
DELETE FROM chat_members WHERE group_id<>1;
DELETE FROM chat_groups WHERE id<>1;
