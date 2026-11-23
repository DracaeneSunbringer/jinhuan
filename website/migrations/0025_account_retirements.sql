-- 0025：仅封锁已合并账号ID，不修改旧用户/历史引用，不删除对象存储。
-- node scripts/account-retirement-migration.mjs --check 验证固定生成结果。
CREATE TABLE account_retirements (
 source_id INTEGER PRIMARY KEY CHECK(source_id<>0),
 target_id INTEGER NOT NULL CHECK(target_id<>0 AND target_id<>source_id),
 retired_at INTEGER NOT NULL
);
CREATE TRIGGER trg_retirement_claim BEFORE INSERT ON account_retirements
WHEN EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.source_id)
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.source_id AND disabled=2 AND kind='user')
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.target_id AND disabled=0 AND kind='user')
BEGIN SELECT RAISE(ABORT,'retirement_invalid'); END;
CREATE TRIGGER trg_retirement_update BEFORE UPDATE ON account_retirements
BEGIN SELECT RAISE(ABORT,'retirement_immutable'); END;
CREATE TRIGGER trg_retirement_delete BEFORE DELETE ON account_retirements
BEGIN SELECT RAISE(ABORT,'retirement_immutable'); END;

CREATE TRIGGER trg_retired_ai_jobs_ins BEFORE INSERT ON ai_jobs
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_ai_jobs_upd BEFORE UPDATE OF user_id ON ai_jobs
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_anchors_ins BEFORE INSERT ON anchors
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_anchors_upd BEFORE UPDATE OF user_id ON anchors
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_api_tokens_ins BEFORE INSERT ON api_tokens
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_api_tokens_upd BEFORE UPDATE OF user_id ON api_tokens
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_auth_tokens_ins BEFORE INSERT ON auth_tokens
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_auth_tokens_upd BEFORE UPDATE OF user_id ON auth_tokens
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_badge_log_ins BEFORE INSERT ON badge_log
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_badge_log_upd BEFORE UPDATE OF user_id ON badge_log
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_bans_ins BEFORE INSERT ON chat_bans
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_bans_upd BEFORE UPDATE OF user_id ON chat_bans
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_boosts_ins BEFORE INSERT ON chat_boosts
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_boosts_upd BEFORE UPDATE OF user_id ON chat_boosts
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_groups_ins BEFORE INSERT ON chat_groups
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.created_by))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_groups_upd BEFORE UPDATE OF created_by ON chat_groups
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.created_by))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_join_reqs_ins BEFORE INSERT ON chat_join_reqs
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_join_reqs_upd BEFORE UPDATE OF user_id ON chat_join_reqs
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_members_ins BEFORE INSERT ON chat_members
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_members_upd BEFORE UPDATE OF user_id ON chat_members
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_messages_ins BEFORE INSERT ON chat_messages
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_messages_upd BEFORE UPDATE OF user_id ON chat_messages
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_reactions_ins BEFORE INSERT ON chat_reactions
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_reactions_upd BEFORE UPDATE OF user_id ON chat_reactions
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_redpack_external_views_ins BEFORE INSERT ON chat_redpack_external_views
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_redpack_external_views_upd BEFORE UPDATE OF user_id ON chat_redpack_external_views
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_redpack_opens_ins BEFORE INSERT ON chat_redpack_opens
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_redpack_opens_upd BEFORE UPDATE OF user_id ON chat_redpack_opens
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_redpack_successes_ins BEFORE INSERT ON chat_redpack_successes
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_chat_redpack_successes_upd BEFORE UPDATE OF user_id ON chat_redpack_successes
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_comments_ins BEFORE INSERT ON comments
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_comments_upd BEFORE UPDATE OF user_id ON comments
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_fav_folders_ins BEFORE INSERT ON fav_folders
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_fav_folders_upd BEFORE UPDATE OF user_id ON fav_folders
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_favorites_ins BEFORE INSERT ON favorites
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_favorites_upd BEFORE UPDATE OF user_id ON favorites
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_identities_ins BEFORE INSERT ON identities
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_identities_upd BEFORE UPDATE OF user_id ON identities
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_invite_codes_ins BEFORE INSERT ON invite_codes
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.owner_id) OR EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.used_by))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_invite_codes_upd BEFORE UPDATE OF owner_id,used_by ON invite_codes
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.owner_id) OR EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.used_by))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_invites_ins BEFORE INSERT ON invites
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.invitee_id) OR EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.inviter_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_invites_upd BEFORE UPDATE OF invitee_id,inviter_id ON invites
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.invitee_id) OR EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.inviter_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_likes_ins BEFORE INSERT ON likes
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_likes_upd BEFORE UPDATE OF user_id ON likes
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_login_fails_ins BEFORE INSERT ON login_fails
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_login_fails_upd BEFORE UPDATE OF user_id ON login_fails
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_memes_ins BEFORE INSERT ON memes
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.author_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_memes_upd BEFORE UPDATE OF author_id ON memes
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.author_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_notif_reads_ins BEFORE INSERT ON notif_reads
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) OR EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.actor_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_notif_reads_upd BEFORE UPDATE OF user_id,actor_id ON notif_reads
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) OR EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.actor_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_official_title_log_ins BEFORE INSERT ON official_title_log
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) OR EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.actor_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_official_title_log_upd BEFORE UPDATE OF user_id,actor_id ON official_title_log
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) OR EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.actor_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_passwords_ins BEFORE INSERT ON passwords
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_passwords_upd BEFORE UPDATE OF user_id ON passwords
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_puzzle_attempts_ins BEFORE INSERT ON puzzle_attempts
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_puzzle_attempts_upd BEFORE UPDATE OF user_id ON puzzle_attempts
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_puzzle_codes_ins BEFORE INSERT ON puzzle_codes
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.claimed_by))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_puzzle_codes_upd BEFORE UPDATE OF claimed_by ON puzzle_codes
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.claimed_by))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_puzzles_ins BEFORE INSERT ON puzzles
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.creator_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_puzzles_upd BEFORE UPDATE OF creator_id ON puzzles
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.creator_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_quota_usage_ins BEFORE INSERT ON quota_usage
WHEN NEW.key<>0 AND NEW.scope NOT GLOB 'tok:*' AND (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.key))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_quota_usage_upd BEFORE UPDATE OF key,scope ON quota_usage
WHEN NEW.key<>0 AND NEW.scope NOT GLOB 'tok:*' AND (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.key))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_reactions_ins BEFORE INSERT ON reactions
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_reactions_upd BEFORE UPDATE OF user_id ON reactions
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_road_comments_ins BEFORE INSERT ON road_comments
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_road_comments_upd BEFORE UPDATE OF user_id ON road_comments
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_road_items_ins BEFORE INSERT ON road_items
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_road_items_upd BEFORE UPDATE OF user_id ON road_items
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_road_votes_ins BEFORE INSERT ON road_votes
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_road_votes_upd BEFORE UPDATE OF user_id ON road_votes
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_sessions_ins BEFORE INSERT ON sessions
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_sessions_upd BEFORE UPDATE OF user_id ON sessions
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_short_replies_ins BEFORE INSERT ON short_replies
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_short_replies_upd BEFORE UPDATE OF user_id ON short_replies
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_uploads_ins BEFORE INSERT ON uploads
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_uploads_upd BEFORE UPDATE OF user_id ON uploads
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_user_badges_ins BEFORE INSERT ON user_badges
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_user_badges_upd BEFORE UPDATE OF user_id ON user_badges
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_user_limits_ins BEFORE INSERT ON user_limits
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) OR EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.by_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_user_limits_upd BEFORE UPDATE OF user_id,by_id ON user_limits
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) OR EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.by_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_user_official_titles_ins BEFORE INSERT ON user_official_titles
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) OR EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.granted_by))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_user_official_titles_upd BEFORE UPDATE OF user_id,granted_by ON user_official_titles
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id) OR EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.granted_by))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_user_unlocks_ins BEFORE INSERT ON user_unlocks
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_user_unlocks_upd BEFORE UPDATE OF user_id ON user_unlocks
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_users_ins BEFORE INSERT ON users
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.id) OR EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.invited_by))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_users_upd BEFORE UPDATE OF id,invited_by ON users
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.id) OR EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.invited_by))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_view_days_ins BEFORE INSERT ON view_days
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_view_days_upd BEFORE UPDATE OF user_id ON view_days
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_views_ins BEFORE INSERT ON views
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;

CREATE TRIGGER trg_retired_views_upd BEFORE UPDATE OF user_id ON views
WHEN (EXISTS(SELECT 1 FROM account_retirements WHERE source_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT,'account_retired'); END;
