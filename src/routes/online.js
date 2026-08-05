import { countOnline } from "../lib/db.js";
import { json, error } from "../lib/response.js";

// A tiny, cache-free endpoint used for the live "online now" indicator.
// Kept separate from /dashboard so the frequent poll (every 60s) only runs
// a single cheap D1 query instead of the whole dashboard aggregation.
export async function handleOnline(request, env) {
  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  if (!siteId) return error("site_id is required");

  const online = await countOnline(env.DB, siteId);
  return json({ site_id: siteId, online });
}
