import { resolvePeriod, getPreviousPeriodRange, countOnline } from "../lib/db.js";
import { cacheGet, cacheSet } from "../lib/cache.js";
import { json, error } from "../lib/response.js";

// Runs the four summary queries (visitors, views, avg time, bounce rate) for
// one arbitrary time window. Shared between the current period and the
// previous-period comparison, so both are computed the exact same way.
async function getSummary(db, siteId, start, end) {
  const [visitorsRow, viewsRow, avgDurationRow, singlePageSessionsRow, totalSessionsRow] = await Promise.all([
    db
      .prepare("SELECT COUNT(DISTINCT visitor_hash) as count FROM visits WHERE site_id = ? AND created_at BETWEEN ? AND ?")
      .bind(siteId, start, end)
      .first(),
    db
      .prepare("SELECT COUNT(*) as count FROM visits WHERE site_id = ? AND created_at BETWEEN ? AND ?")
      .bind(siteId, start, end)
      .first(),
    db
      .prepare("SELECT AVG(last_seen - first_seen) as avg_ms FROM sessions WHERE site_id = ? AND first_seen BETWEEN ? AND ?")
      .bind(siteId, start, end)
      .first(),
    db
      .prepare("SELECT COUNT(*) as count FROM sessions WHERE site_id = ? AND page_count = 1 AND first_seen BETWEEN ? AND ?")
      .bind(siteId, start, end)
      .first(),
    db
      .prepare("SELECT COUNT(*) as count FROM sessions WHERE site_id = ? AND first_seen BETWEEN ? AND ?")
      .bind(siteId, start, end)
      .first(),
  ]);

  const totalSessions = totalSessionsRow?.count || 0;
  const bounceRate = totalSessions > 0 ? Math.round((singlePageSessionsRow.count / totalSessions) * 100) : 0;
  const avgTimeSeconds = avgDurationRow?.avg_ms ? Math.round(avgDurationRow.avg_ms / 1000) : 0;

  return {
    unique_visitors: visitorsRow?.count || 0,
    page_views: viewsRow?.count || 0,
    avg_time_seconds: avgTimeSeconds,
    bounce_rate: bounceRate,
  };
}

// Percent change from previous -> current, rounded to a whole number.
// null when there's nothing meaningful to compare against (e.g. previous
// period had zero, or there is no previous period at all for "all time").
function percentChange(previous, current) {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export async function handleDashboard(request, env) {
  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  if (!siteId) return error("site_id is required");

  const { period, start, end, cacheKeyPeriod } = resolvePeriod(url, "today");

  const cacheKey = `dashboard:${siteId}:${cacheKeyPeriod}`;
  const cached = await cacheGet(env.DB, cacheKey);

  // Online count is intentionally never cached (see routes/online.js for the
  // lightweight endpoint the dashboard polls separately every 60s).
  if (cached) {
    const online = await countOnline(env.DB, siteId);
    return json({ ...cached, online, cached: true });
  }

  const previousRange = getPreviousPeriodRange(period);

  const [current, previous, online] = await Promise.all([
    getSummary(env.DB, siteId, start, end),
    previousRange ? getSummary(env.DB, siteId, previousRange.start, previousRange.end) : null,
    countOnline(env.DB, siteId),
  ]);

  const result = {
    site_id: siteId,
    period,
    ...current,
    hits: current.page_views,
    change: previous
      ? {
          unique_visitors: percentChange(previous.unique_visitors, current.unique_visitors),
          page_views: percentChange(previous.page_views, current.page_views),
          avg_time_seconds: percentChange(previous.avg_time_seconds, current.avg_time_seconds),
          bounce_rate: percentChange(previous.bounce_rate, current.bounce_rate),
        }
      : null,
  };

  await cacheSet(env.DB, cacheKey, result);
  return json({ ...result, online, cached: false });
}
