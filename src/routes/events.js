import { resolvePeriod } from "../lib/db.js";
import { cacheGet, cacheSet } from "../lib/cache.js";
import { json, error } from "../lib/response.js";

// Same shape as the breakdown endpoints in lib/aggregate.js ({label, views,
// visitors}), but querying the separate `events` table instead of `visits` —
// custom events aren't page views, so they don't belong in that table.
export async function handleEvents(request, env) {
  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
  if (!siteId) return error("site_id is required");

  const { period, start, end, cacheKeyPeriod } = resolvePeriod(url);

  const cacheKey = `events:${siteId}:${cacheKeyPeriod}:${limit}`;
  const cached = await cacheGet(env.DB, cacheKey);
  if (cached) return json(cached);

  const { results } = await env.DB.prepare(
    `SELECT name as label, COUNT(*) as views, COUNT(DISTINCT visitor_hash) as visitors
     FROM events
     WHERE site_id = ? AND created_at BETWEEN ? AND ? AND name != 'bot_blocked'
     GROUP BY label
     ORDER BY views DESC
     LIMIT ?`
  )
    .bind(siteId, start, end, limit)
    .all();

  const payload = { site_id: siteId, period, items: results };
  await cacheSet(env.DB, cacheKey, payload);
  return json(payload);
}
