import { getPeriodRange, countOnline } from "../lib/db.js";
import { cacheGet, cacheSet } from "../lib/kv.js";
import { json, error } from "../lib/response.js";

export async function handleDashboard(request, env) {
  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  const period = url.searchParams.get("period") || "today";
  if (!siteId) return error("site_id is required");

  const cacheKey = `dashboard:${siteId}:${period}`;
  const cached = await cacheGet(env.CACHE, cacheKey);

  // Online count is intentionally never cached (see routes/online.js for the
  // lightweight endpoint the dashboard polls separately every 60s).
  if (cached) {
    const online = await countOnline(env.DB, siteId);
    return json({ ...cached, online, cached: true });
  }

  const { start, end } = getPeriodRange(period);

  const [visitorsRow, viewsRow, avgDurationRow, singlePageSessionsRow, totalSessionsRow, online] = await Promise.all([
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
    countOnline(env.DB, siteId),
  ]);

  const totalSessions = totalSessionsRow?.count || 0;
  const bounceRate = totalSessions > 0 ? Math.round((singlePageSessionsRow.count / totalSessions) * 100) : 0;
  const avgTimeSeconds = avgDurationRow?.avg_ms ? Math.round(avgDurationRow.avg_ms / 1000) : 0;

  const result = {
    site_id: siteId,
    period,
    unique_visitors: visitorsRow?.count || 0,
    page_views: viewsRow?.count || 0,
    hits: viewsRow?.count || 0,
    avg_time_seconds: avgTimeSeconds,
    bounce_rate: bounceRate,
  };

  await cacheSet(env.CACHE, cacheKey, result);
  return json({ ...result, online, cached: false });
}
