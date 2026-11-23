-- A recent-interaction route for authors with a large post history.
-- Keep the original author/meme indexes for authors with few posts.
CREATE INDEX IF NOT EXISTS idx_likes_recent ON likes(created_at,meme_id,user_id);
CREATE INDEX IF NOT EXISTS idx_reactions_recent ON reactions(created_at,meme_id,user_id);
CREATE INDEX IF NOT EXISTS idx_replies_recent ON short_replies(created_at,meme_id,user_id);
CREATE INDEX IF NOT EXISTS idx_comments_recent ON comments(created_at,meme_id,user_id) WHERE deleted=0;
