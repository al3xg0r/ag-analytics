// Cloudflare KV caching helper.
// Dashboard, top pages, countries, referrers and daily stats are all expensive
// aggregate queries, so their results are cached for a short TTL.

const CACHE_TTL_SECONDS = 300; // 5 minutes, as required by the project spec

export async function cacheGet(kv, key) {
  const raw = await kv.get(key);
  return raw ? JSON.parse(raw) : null;
}

export async function cacheSet(kv, key, value) {
  await kv.put(key, JSON.stringify(value), { expirationTtl: CACHE_TTL_SECONDS });
}

// Tracks "online now" visitors without ever storing an IP address.
// Each heartbeat refreshes a per-visitor key with a short TTL; counting the
// matching keys tells us how many people are currently on the site.
const ONLINE_TTL_SECONDS = 60;

export async function markOnline(kv, siteId, visitorHash) {
  await kv.put(`online:${siteId}:${visitorHash}`, "1", { expirationTtl: ONLINE_TTL_SECONDS });
}

export async function countOnline(kv, siteId) {
  const list = await kv.list({ prefix: `online:${siteId}:` });
  return list.keys.length;
}
