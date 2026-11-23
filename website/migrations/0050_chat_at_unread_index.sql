-- The group list counts @me in unread messages. Only live messages containing @ can match.
CREATE INDEX IF NOT EXISTS idx_chat_msg_at_unread ON chat_messages(group_id,id)
  WHERE deleted=0 AND instr(body,'@')>0;
