-- 群聊反向引用：按 reply_to 统计「N 条回复」、列出回复了某条的消息
CREATE INDEX IF NOT EXISTS idx_chat_msg_reply ON chat_messages (reply_to) WHERE reply_to IS NOT NULL;
