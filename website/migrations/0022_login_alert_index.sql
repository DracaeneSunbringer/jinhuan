-- 滚动失败统计按账号读取，避免遍历全站邮件/AI配额；不修改历史记录。
CREATE INDEX IF NOT EXISTS idx_quota_scope_key_day ON quota_usage(scope,key,day);
