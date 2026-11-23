-- Additive read-cost fixes. Existing rows and notification matching semantics stay intact.
-- The query predicates must repeat these expressions to use the partial indexes.
CREATE INDEX IF NOT EXISTS idx_chat_msg_mentions ON chat_messages(group_id,created_at)
  WHERE deleted=0 AND instr(body,'@')>0;
CREATE INDEX IF NOT EXISTS idx_comments_mentions ON comments(created_at)
  WHERE deleted=0 AND instr(body,'@')>0;
CREATE INDEX IF NOT EXISTS idx_memes_mentions ON memes(created_at)
  WHERE hidden=0 AND (instr(title,'@')>0 OR instr(content,'@')>0);
CREATE INDEX IF NOT EXISTS idx_comments_reply_live ON comments(reply_to,created_at)
  WHERE deleted=0 AND reply_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_redpacks_phrase ON chat_redpacks(phrase,message_id)
  WHERE mode='phrase';
