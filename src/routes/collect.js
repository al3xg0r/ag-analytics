import { getSiteById, insertVisit, upsertSession } from "../lib/db.js";
import { parseBrowser, parseOS, parseDeviceType, isBot } from "../lib/ua-parser.js";
import { parseReferrer, extractUtm, normalizePagePath } from "../lib/utm.js";
import { buildVisitorHash } from "../lib/visitor.js";
import { json, noContent } from "../lib/response.js";

export async function handleCollect(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { site, url, title, referrer, screen, language, timezone } = body;
  if (!site || !url) {
    return json({ error: "site and url are required" }, 400);
  }

  const siteRow = await getSiteById(env.DB, site);
  if (!siteRow || siteRow.status !== "active") {
    // Silently accept-and-drop so a disabled/unknown site never leaks info to the caller
    return noContent();
  }

  const userAgent = request.headers.get("User-Agent") || "";

  // Known crawlers, uptime monitors, and scripted HTTP clients never count as
  // a "visitor" — accept-and-drop, same as the disabled-site case above, so a
  // bot gets no signal either way about whether it was detected.
  if (isBot(userAgent)) {
    return noContent();
  }

  const country = request.cf?.country || "Unknown";
  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";

  const visitorHash = await buildVisitorHash({ ip, userAgent, siteId: site });
  const sessionId = body.sessionId || `${visitorHash}-${new Date().toISOString().slice(0, 10)}`;

  let currentHost = null;
  try {
    currentHost = new URL(url).hostname;
  } catch {
    // keep null if url is not a valid absolute URL
  }

  const referrerInfo = parseReferrer(referrer, currentHost);
  const utm = extractUtm(url);
  const path = normalizePagePath(url);

  await insertVisit(env.DB, {
    siteId: site,
    sessionId,
    visitorHash,
    url: path,
    pageTitle: title || null,
    referrer: referrerInfo.referrer,
    referrerDomain: referrerInfo.referrerDomain,
    searchEngine: referrerInfo.searchEngine,
    searchQuery: referrerInfo.searchQuery,
    utmSource: utm.utmSource,
    utmMedium: utm.utmMedium,
    utmCampaign: utm.utmCampaign,
    utmTerm: utm.utmTerm,
    utmContent: utm.utmContent,
    browser: parseBrowser(userAgent),
    os: parseOS(userAgent),
    deviceType: parseDeviceType(userAgent),
    screenResolution: screen || null,
    language: language || null,
    timezone: timezone || null,
    country,
  });

  await upsertSession(env.DB, site, sessionId, visitorHash);

  return json({ ok: true, sessionId }, 200);
}
