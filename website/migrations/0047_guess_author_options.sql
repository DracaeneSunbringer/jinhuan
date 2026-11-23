-- 默认 1 兼容滚动发布期间旧 Worker 的 INSERT；新代码始终显式写入选择。
-- 参与权限还必须满足 generated=1，手动题不会因该兼容默认值获得参与资格。
ALTER TABLE guess_free_rounds ADD COLUMN owner_participates INTEGER NOT NULL DEFAULT 1 CHECK(owner_participates IN (0,1));
UPDATE guess_free_rounds SET owner_participates=0 WHERE generated=0;
ALTER TABLE guess_free_rounds ADD COLUMN judge_context_box TEXT;
ALTER TABLE ldc_packets ADD COLUMN judge_context_box TEXT;
ALTER TABLE ldc_packets ADD COLUMN generated INTEGER NOT NULL DEFAULT 0 CHECK(generated IN (0,1));
