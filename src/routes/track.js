import { getSiteById, insertEvent } from "../lib/db.js";
import { isBot } from "../lib/ua-parser.js";
import { buildVisitorHash } from "../lib/visitor.js";
import { json, noContent } from "../lib/response.js";

// Custom events are opt-in and manually fired by the site owner's own code,
// e.g. `agEvent("signup", { plan: "pro" })` — see public/tracker.js. This is
// how goals/conversions are tracked, as opposed to /event which fires
// automatically on every page view.
const MAX_NAME_LENGTH = 100;
const MAX_PROPS_LENGTH = 2000; // JSON-encoded string length, keeps D1 rows small

export async function handleTrackEvent(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { site, sessionId, name, url, props } = body;
  if (!site || !name) {
    return json({ error: "site and name are required" }, 400);
  }
  if (typeof name !== "string" || name.length === 0 || name.length > MAX_NAME_LENGTH) {
    return json({ error: `name must be a string up to ${MAX_NAME_LENGTH} characters` }, 400);
  }

  const siteRow = await getSiteById(env.DB, site);
  if (!siteRow || siteRow.status !== "active") return noContent();

  const userAgent = request.headers.get("User-Agent") || "";
  if (isBot(userAgent)) return noContent();

  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
  const visitorHash = await buildVisitorHash({ ip, userAgent, siteId: site });

  let propsJson = null;
  if (props !== undefined && props !== null) {
    try {
      propsJson = JSON.stringify(props).slice(0, MAX_PROPS_LENGTH);
    } catch {
      propsJson = null;
    }
  }

  await insertEvent(env.DB, {
    siteId: site,
    sessionId: sessionId || null,
    visitorHash,
    name,
    url: url || null,
    props: propsJson,
  });

  return noContent();
}
