import { resolvePeriod } from "../lib/db.js";
import { cacheGet, cacheSet } from "../lib/cache.js";
import { json, error } from "../lib/response.js";

// Groups visits into daily buckets (or hourly buckets for "today"/"yesterday")
// so the dashboard can draw a line/bar chart. A custom range always buckets
// daily, same as 30d/12m/all — it could span anywhere from a day to years,
// and daily is a safe default either way.
export async function handleStats(request, env) {
  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  if (!siteId) return error("site_id is required");

  const { period, start, end, cacheKeyPeriod } = resolvePeriod(url);

  const cacheKey = `stats:${siteId}:${cacheKeyPeriod}`;
  const cached = await cacheGet(env.DB, cacheKey);
  if (cached) return json(cached);

  const bucketByHour = period === "today" || period === "yesterday";

  // SQLite strftime works on seconds, our timestamps are stored in milliseconds
  const format = bucketByHour ? "%Y-%m-%dT%H:00:00Z" : "%Y-%m-%dT00:00:00Z";

  const { results } = await env.DB.prepare(
    `SELECT strftime('${format}', created_at / 1000, 'unixepoch') as bucket,
            COUNT(*) as views,
            COUNT(DISTINCT visitor_hash) as visitors
     FROM visits
     WHERE site_id = ? AND created_at BETWEEN ? AND ?
     GROUP BY bucket
     ORDER BY bucket ASC`
  )
    .bind(siteId, start, end)
    .all();

  const payload = { site_id: siteId, period, buckets: results };
  await cacheSet(env.DB, cacheKey, payload);
  return json(payload);
}
