// Cloudflare KV caching helper.
// Dashboard, top pages, countries, referrers and daily stats are all expensive
// aggregate queries, so their results are cached here.
//
// IMPORTANT: "online now" tracking used to live in KV (one write per visitor
// every 30 seconds). Cloudflare's free plan allows only 1,000 KV writes per
// day per namespace, so a handful of concurrent visitors could exhaust the
// entire daily quota within minutes. Online tracking now lives in D1 instead
// (see lib/db.js -> countOnline), which has a much higher free quota
// (100,000 writes/day, 5,000,000 reads/day) and needs no extra writes beyond
// the session update collect/heartbeat already perform.

// 15 minutes by default. Raise this further (e.g. 1800 = 30 min) if you are
// close to the free plan's D1 read quota; lower it if you want fresher numbers
// and have headroom left. This is the single place that controls it.
const CACHE_TTL_SECONDS = 900;

export async function cacheGet(kv, key) {
  const raw = await kv.get(key);
  return raw ? JSON.parse(raw) : null;
}

export async function cacheSet(kv, key, value) {
  await kv.put(key, JSON.stringify(value), { expirationTtl: CACHE_TTL_SECONDS });
}
