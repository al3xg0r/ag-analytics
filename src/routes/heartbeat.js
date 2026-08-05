import { getSiteById, touchSession } from "../lib/db.js";
import { json, noContent } from "../lib/response.js";

// Keeps a visitor's session "fresh" so it counts as online. This used to write
// to KV on every call (expensive on the free plan); now it only updates the
// existing D1 session row, which is essentially free on Cloudflare's free tier.
export async function handleHeartbeat(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { site, sessionId } = body;
  if (!site || !sessionId) return json({ error: "site and sessionId are required" }, 400);

  const siteRow = await getSiteById(env.DB, site);
  if (!siteRow || siteRow.status !== "active") return noContent();

  await touchSession(env.DB, sessionId);
  return noContent();
}
