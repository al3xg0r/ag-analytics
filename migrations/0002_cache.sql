-- Replaces Workers KV as the cache layer for expensive aggregate dashboard
-- queries. KV's free tier write quota (1,000/day, account-wide across every
-- KV namespace) turned out too tight once the dashboard grew to 13 cached
-- queries per page load — the same reason "online now" tracking was moved
-- from KV to D1 earlier. D1's free tier (100,000 writes/day, 5,000,000
-- reads/day) has far more headroom for this.
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache (expires_at);
