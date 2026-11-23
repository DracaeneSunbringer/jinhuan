-- 仅增量执行一次。队列基础结构；机器人账号由后续受保护初始化建立，不覆盖既有用户。
CREATE TABLE ai_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('img_reply','road_review')),
  target_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','running','done','failed','skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  run_after INTEGER NOT NULL,
  locked_at INTEGER,
  lease_token TEXT,
  logical_day TEXT,
  logical_receipt TEXT,
  logical_committed INTEGER NOT NULL DEFAULT 0 CHECK (logical_committed IN (0,1)),
  result TEXT,
  err TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE (kind,target_id),
  CHECK ((state='running' AND locked_at IS NOT NULL AND lease_token IS NOT NULL)
      OR (state!='running' AND locked_at IS NULL AND lease_token IS NULL)),
  CHECK ((logical_day IS NULL AND logical_receipt IS NULL AND logical_committed=0)
      OR (logical_day IS NOT NULL AND logical_receipt IS NOT NULL))
);
CREATE INDEX idx_ai_jobs_run ON ai_jobs(state,run_after,id);
CREATE INDEX idx_ai_jobs_lock ON ai_jobs(state,locked_at,id);
ALTER TABLE memes ADD COLUMN ai_off INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN ai_prefs TEXT;
ALTER TABLE comments ADD COLUMN ai_job_id INTEGER;
-- 软删除也保留来源，避免同一任务把已删除的评论补发。
CREATE UNIQUE INDEX idx_comments_ai_job ON comments(ai_job_id) WHERE ai_job_id IS NOT NULL;
