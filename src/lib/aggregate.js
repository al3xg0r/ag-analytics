import { getPeriodRange } from "./db.js";
import { cacheGet, cacheSet } from "./kv.js";
import { json, error } from "./response.js";

// Generic "top N by column" aggregation, used for pages, countries, referrers,
// browsers and devices/operating systems. Every one of these is really the
// same query shape: group visits by one column, order by view count.
export async function handleBreakdown(request, env, { cacheName, groupByExpr }) {
  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  const period = url.searchParams.get("period") || "7d";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
  if (!siteId) return error("site_id is required");

  const cacheKey = `${cacheName}:${siteId}:${period}:${limit}`;
  const cached = await cacheGet(env.AGANALITICS_CACHE, cacheKey);
  if (cached) return json(cached);

  const { start, end } = getPeriodRange(period);

  const { results } = await env.DB.prepare(
    `SELECT ${groupByExpr} as label, COUNT(*) as views, COUNT(DISTINCT visitor_hash) as visitors
     FROM visits
     WHERE site_id = ? AND created_at BETWEEN ? AND ? AND ${groupByExpr} IS NOT NULL
     GROUP BY label
     ORDER BY views DESC
     LIMIT ?`
  )
    .bind(siteId, start, end, limit)
    .all();

  const payload = { site_id: siteId, period, items: results };
  await cacheSet(env.AGANALITICS_CACHE, cacheKey, payload);
  return json(payload);
}
