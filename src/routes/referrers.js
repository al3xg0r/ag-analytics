import { getPeriodRange } from "../lib/db.js";
import { cacheGet, cacheSet } from "../lib/cache.js";
import { json, error } from "../lib/response.js";

// Grouped by domain (not the full URL) so the panel stays a useful "who
// sends me traffic" overview rather than fragmenting into one row per link —
// but each row also carries `sample_url`: the full referrer URL from that
// domain's most recent visit, via a correlated subquery. The dashboard uses
// that for the actual link + hover tooltip, so you can see and open the
// exact page that linked to you, not just guess at the domain's homepage.
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
    `SELECT v.referrer_domain as label, COUNT(*) as views, COUNT(DISTINCT v.visitor_hash) as visitors,
       (SELECT v2.referrer FROM visits v2
        WHERE v2.site_id = v.site_id AND v2.referrer_domain = v.referrer_domain
          AND v2.created_at BETWEEN ? AND ?
        ORDER BY v2.created_at DESC LIMIT 1) as sample_url
     FROM visits v
     WHERE v.site_id = ? AND v.created_at BETWEEN ? AND ? AND v.referrer_domain IS NOT NULL
     GROUP BY label
     ORDER BY views DESC
     LIMIT ?`
  )
    .bind(start, end, siteId, start, end, limit)
    .all();

  const payload = { site_id: siteId, period, items: results };
  await cacheSet(env.DB, cacheKey, payload);
  return json(payload);
}
