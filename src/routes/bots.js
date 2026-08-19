import { getPeriodRange } from "../lib/db.js";
import { cacheGet, cacheSet } from "../lib/kv.js";
import { json, error } from "../lib/response.js";

// Same {label, views} shape as the other breakdown endpoints, but querying
// the `events` table for the "bot_blocked" events written by collect.js
// (see there for why: bots never touch visits/sessions, so they don't skew
// pageview/visitor counts, but they're still recorded here for visibility).
// json_extract pulls the friendly bot name back out of the JSON `props`
// column rather than adding a dedicated column just for this.
export async function handleBots(request, env) {
  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  const period = url.searchParams.get("period") || "7d";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
  if (!siteId) return error("site_id is required");

  const cacheKey = `bots:${siteId}:${period}:${limit}`;
  const cached = await cacheGet(env.AGANALITICS_CACHE, cacheKey);
  if (cached) return json(cached);

  const { start, end } = getPeriodRange(period);

  const { results } = await env.DB.prepare(
    `SELECT json_extract(props, '$.bot') as label, COUNT(*) as views
     FROM events
     WHERE site_id = ? AND name = 'bot_blocked' AND created_at BETWEEN ? AND ?
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
