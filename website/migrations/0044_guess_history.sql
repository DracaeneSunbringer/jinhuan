-- 按群分页旧轮次；只为是非“否”的汇总增加索引，不扫描全部猜测。
CREATE INDEX idx_ldc_guess_history ON ldc_packets(group_id,created_at DESC,packet_id DESC) WHERE mode IN ('guess','clues');
CREATE INDEX idx_ldc_no_facts ON ldc_questions(packet_id,created_at DESC,id DESC) WHERE kind='question' AND verdict='no';
