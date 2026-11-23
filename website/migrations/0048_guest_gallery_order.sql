-- 游客最新 52 张和普通「最新」列表共享稳定排序，避免同一时间戳下临时排序。
CREATE INDEX IF NOT EXISTS idx_memes_guest_latest ON memes(hidden, created_at DESC, id DESC);
