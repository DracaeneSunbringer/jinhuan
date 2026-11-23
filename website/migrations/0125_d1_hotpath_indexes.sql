-- Attempt values are intentionally not globally unique: some transfers share one across users.
CREATE INDEX IF NOT EXISTS idx_coin52_ledger_attempt ON coin52_ledger(attempt);
-- Exact running predicate lets expiry scans skip all completed and pending batches.
-- Retain idx_guess_review_due for the pending/running claim queue.
CREATE INDEX IF NOT EXISTS idx_guess_review_running ON guess_review_batches(next_at,locked_until) WHERE state='running';
