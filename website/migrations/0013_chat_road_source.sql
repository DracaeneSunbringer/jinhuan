-- 群聊反馈来源；先迁移数据库，再部署代码。历史回填由管理员显式触发。
ALTER TABLE road_items ADD COLUMN source_msg_id INTEGER;
ALTER TABLE road_items ADD COLUMN source_group_id INTEGER;
ALTER TABLE road_items ADD COLUMN source_hidden INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_road_source_msg ON road_items(source_msg_id);
