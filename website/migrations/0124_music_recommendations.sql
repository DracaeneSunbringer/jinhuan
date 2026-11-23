CREATE TABLE IF NOT EXISTS music_playlist_tracks (
 list TEXT NOT NULL CHECK(list IN ('owner','friends')),
 track_key TEXT NOT NULL,
 metadata TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(list,track_key)
);
CREATE INDEX IF NOT EXISTS music_playlist_order ON music_playlist_tracks(list,updated_at DESC,track_key DESC);
CREATE TABLE IF NOT EXISTS music_recommendations (
 list TEXT NOT NULL,
 track_key TEXT NOT NULL,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 display_name TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(list,track_key,user_id),
 FOREIGN KEY(list,track_key) REFERENCES music_playlist_tracks(list,track_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS music_recommendations_user ON music_recommendations(user_id);
CREATE TRIGGER IF NOT EXISTS music_recommendation_quota BEFORE INSERT ON music_recommendations
WHEN NOT EXISTS(SELECT 1 FROM music_recommendations WHERE list=NEW.list AND track_key=NEW.track_key AND user_id=NEW.user_id)
AND (SELECT COUNT(*) FROM music_recommendations WHERE user_id=NEW.user_id)>=500
BEGIN SELECT RAISE(ABORT,'music_recommendation_quota'); END;
