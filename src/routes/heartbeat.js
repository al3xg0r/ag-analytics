import { getSiteById } from "../lib/db.js";
import { buildVisitorHash } from "../lib/visitor.js";
import { markOnline } from "../lib/kv.js";
import { json, noContent } from "../lib/response.js";

export async function handleHeartbeat(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { site } = body;
  if (!site) return json({ error: "site is required" }, 400);

  const siteRow = await getSiteById(env.DB, site);
  if (!siteRow || siteRow.status !== "active") return noContent();

  const userAgent = request.headers.get("User-Agent") || "";
  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
  const visitorHash = await buildVisitorHash({ ip, userAgent, siteId: site });

  await markOnline(env.CACHE, site, visitorHash);
  return noContent();
}
