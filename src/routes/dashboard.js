import { getPeriodRange } from "../lib/db.js";
import { cacheGet, cacheSet, countOnline } from "../lib/kv.js";
import { json, error } from "../lib/response.js";

export async function handleDashboard(request, env) {
  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  const period = url.searchParams.get("period") || "today";
  if (!siteId) return error("site_id is required");

  const cacheKey = `dashboard:${siteId}:${period}`;
  const cached = await cacheGet(env.CACHE, cacheKey);

  const { start, end } = getPeriodRange(period);

  const [visitorsRow, viewsRow, avgDurationRow, singlePageSessionsRow, totalSessionsRow] = await Promise.all([
    env.DB.prepare(
      "SELECT COUNT(DISTINCT visitor_hash) as count FROM visits WHERE site_id = ? AND created_at BETWEEN ? AND ?"
    )
      .bind(siteId, start, end)
      .first(),
    env.DB.prepare(
      "SELECT COUNT(*) as count FROM visits WHERE site_id = ? AND created_at BETWEEN ? AND ?"
    )
      .bind(siteId, start, end)
      .first(),
    env.DB.prepare(
      "SELECT AVG(last_seen - first_seen) as avg_ms FROM sessions WHERE site_id = ? AND first_seen BETWEEN ? AND ?"
    )
      .bind(siteId, start, end)
      .first(),
    env.DB.prepare(
      "SELECT COUNT(*) as count FROM sessions WHERE site_id = ? AND page_count = 1 AND first_seen BETWEEN ? AND ?"
    )
      .bind(siteId, start, end)
      .first(),
    env.DB.prepare(
      "SELECT COUNT(*) as count FROM sessions WHERE site_id = ? AND first_seen BETWEEN ? AND ?"
    )
      .bind(siteId, start, end)
      .first(),
  ]);

  const online = await countOnline(env.CACHE, siteId);

  const totalSessions = totalSessionsRow?.count || 0;
  const bounceRate = totalSessions > 0 ? Math.round((singlePageSessionsRow.count / totalSessions) * 100) : 0;
  const avgTimeSeconds = avgDurationRow?.avg_ms ? Math.round(avgDurationRow.avg_ms / 1000) : 0;

  const result = {
    site_id: siteId,
    period,
    unique_visitors: visitorsRow?.count || 0,
    page_views: viewsRow?.count || 0,
    hits: viewsRow?.count || 0,
    online,
    avg_time_seconds: avgTimeSeconds,
    bounce_rate: bounceRate,
    cached: false,
  };

  // Online count must always be fresh, everything else can come from cache
  if (cached) {
    return json({ ...cached, online, cached: true });
  }

  await cacheSet(env.CACHE, cacheKey, result);
  return json(result);
}
