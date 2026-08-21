// D1-backed cache for expensive aggregate dashboard queries (replaces the
// old Workers KV cache — see migrations/0002_cache.sql for why: KV's free
// tier write quota is tight and shared across the whole Cloudflare account,
// D1's is far more generous, and it's the same move already made for
// "online now" tracking a while back).
//
// 30 minutes by default. Raise this further if you're ever close to D1's
// free write quota; lower it if you want fresher numbers and have headroom
// left. This is the single place that controls it.
const CACHE_TTL_SECONDS = 1800;

export async function cacheGet(db, key) {
  const row = await db.prepare("SELECT payload, expires_at FROM cache WHERE key = ?").bind(key).first();
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    // Expired — clean it up on read rather than waiting for the next cron
    // sweep, so a stale row never gets served even briefly.
    await db.prepare("DELETE FROM cache WHERE key = ?").bind(key).run();
    return null;
  }
  return JSON.parse(row.payload);
}

export async function cacheSet(db, key, value) {
  const expiresAt = Date.now() + CACHE_TTL_SECONDS * 1000;
  await db
    .prepare("INSERT INTO cache (key, payload, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at")
    .bind(key, JSON.stringify(value), expiresAt)
    .run();
}

// Deletes any cache rows past their TTL. Called from the same cron that
// prunes old visits/sessions/events — expired reads already self-clean (see
// cacheGet above), this just catches keys that were written once and never
// read again, so they don't linger in the table forever.
export async function pruneExpiredCache(db) {
  const { meta } = await db.prepare("DELETE FROM cache WHERE expires_at < ?").bind(Date.now()).run();
  return meta?.changes || 0;
}
