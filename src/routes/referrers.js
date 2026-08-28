import { getPeriodRange } from "../lib/db.js";
import { cacheGet, cacheSet } from "../lib/cache.js";
import { json, error } from "../lib/response.js";

// Grouped by the full referring URL (not just the domain) — each row is a
// distinct page that linked to you, with its own view count. Still filters
// on referrer_domain IS NOT NULL (not referrer itself) to exclude same-site
// and search-engine traffic: parseReferrer (lib/utm.js) nulls out
// referrerDomain for those cases while leaving the raw referrer URL
// populated, and search engines already have their own dedicated panel.
export async function handleReferrers(request, env) {
  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  const period = url.searchParams.get("period") || "7d";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
  if (!siteId) return error("site_id is required");

  const cacheKey = `referrers:${siteId}:${period}:${limit}`;
  const cached = await cacheGet(env.DB, cacheKey);
  if (cached) return json(cached);

  const { start, end } = getPeriodRange(period);

  const { results } = await env.DB.prepare(
    `SELECT referrer as label, COUNT(*) as views, COUNT(DISTINCT visitor_hash) as visitors
     FROM visits
     WHERE site_id = ? AND created_at BETWEEN ? AND ? AND referrer_domain IS NOT NULL
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
