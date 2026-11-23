-- 按发送人/群/消息游标定位，每人分页只读所需候选；不索引已撤回消息。
CREATE INDEX idx_chat_msg_sender_page ON chat_messages(user_id,group_id,id DESC) WHERE deleted=0;
