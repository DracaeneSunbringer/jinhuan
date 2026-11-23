-- 只索引有文件附件且未撤回的消息。规范化 JSON 兼容旧数据中的空白；无效 JSON 不入索引。
-- 查询同一谓词，以 group_id/id 游标取页；不扫描全群消息、不维护额外文件副本。
CREATE INDEX IF NOT EXISTS idx_chat_files_page ON chat_messages(group_id,id DESC)
WHERE deleted=0 AND instr(CASE WHEN json_valid(media) THEN json(media) ELSE '[]' END,'"kind":"f"')>0;
