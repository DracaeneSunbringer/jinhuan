-- Read-only, bounded audit of mature, unclaimed uploads. A zero does not authorize deletion.
WITH candidates AS (
  SELECT key, size FROM uploads
  WHERE used=0 AND created_at < unixepoch()-86400
  ORDER BY created_at LIMIT 50
), refs AS (
  SELECT c.size,
    EXISTS(SELECT 1 FROM memes m WHERE m.image_key=c.key OR instr(coalesce(m.gallery,''),c.key)>0) AS meme_ref,
    EXISTS(SELECT 1 FROM chat_messages x WHERE x.image_key=c.key OR instr(coalesce(x.media,''),c.key)>0) AS chat_ref,
    EXISTS(SELECT 1 FROM road_items r WHERE instr(coalesce(r.media,''),c.key)>0) AS road_item_ref,
    EXISTS(SELECT 1 FROM road_comments r WHERE instr(coalesce(r.media,''),c.key)>0) AS road_comment_ref,
    EXISTS(SELECT 1 FROM puzzle_layers p WHERE instr(coalesce(p.data,''),c.key)>0) AS puzzle_ref,
    EXISTS(SELECT 1 FROM chat_redpacks p WHERE p.clue_key=c.key) AS packet_ref
  FROM candidates c
)
SELECT COUNT(*) AS candidates, coalesce(SUM(size),0) AS candidate_bytes,
  coalesce(SUM(meme_ref),0) AS meme_refs,
  coalesce(SUM(chat_ref),0) AS chat_refs,
  coalesce(SUM(road_item_ref),0) AS road_item_refs,
  coalesce(SUM(road_comment_ref),0) AS road_comment_refs,
  coalesce(SUM(puzzle_ref),0) AS puzzle_refs,
  coalesce(SUM(packet_ref),0) AS packet_refs,
  coalesce(SUM(CASE WHEN meme_ref OR chat_ref OR road_item_ref OR road_comment_ref OR puzzle_ref OR packet_ref THEN 1 ELSE 0 END),0) AS any_refs
FROM refs;
