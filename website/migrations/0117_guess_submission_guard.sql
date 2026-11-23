-- Existing receipts are authoritative. Only pending rows enter these small indexes.
CREATE INDEX IF NOT EXISTS idx_guess_room_pending_user ON guess_room_messages(packet_id,user_id,created_at)
 WHERE deleted=0 AND (ai_status IS NULL OR ai_status='pending');
CREATE INDEX IF NOT EXISTS idx_ldc_pending_user ON ldc_questions(packet_id,user_id,created_at) WHERE verdict='pending';
CREATE INDEX IF NOT EXISTS idx_free_pending_user ON guess_free_questions(packet_id,user_id,created_at) WHERE verdict='pending';
CREATE INDEX IF NOT EXISTS idx_guess_overlap_observation ON quota_usage(day DESC,scope,key) WHERE scope GLOB 'guess:overlap:*';
