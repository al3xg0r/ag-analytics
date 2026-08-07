// Thin wrapper around Cloudflare D1.
// Keeping all raw SQL access here makes it easy to see every query the project runs,
// and guarantees every query is a prepared statement (protects against SQL injection).

export async function getSiteById(db, siteId) {
  return db.prepare("SELECT * FROM sites WHERE id = ?").bind(siteId).first();
}

export async function getSiteByApiKey(db, apiKey) {
  return db.prepare("SELECT * FROM sites WHERE api_key = ?").bind(apiKey).first();
}

export async function listSites(db) {
  const { results } = await db
    .prepare("SELECT id, name, domain, description, status, created_at FROM sites ORDER BY created_at DESC")
    .all();
  return results;
}

export async function insertSite(db, site) {
  await db
    .prepare(
      `INSERT INTO sites (id, name, domain, description, api_key, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`
    )
    .bind(site.id, site.name, site.domain, site.description || null, site.apiKey, Date.now())
    .run();
  return site;
}

export async function deleteSite(db, siteId) {
  await db.prepare("DELETE FROM visits WHERE site_id = ?").bind(siteId).run();
  await db.prepare("DELETE FROM sessions WHERE site_id = ?").bind(siteId).run();
  await db.prepare("DELETE FROM sites WHERE id = ?").bind(siteId).run();
}

export async function updateSiteStatus(db, siteId, status) {
  await db.prepare("UPDATE sites SET status = ? WHERE id = ?").bind(status, siteId).run();
}

export async function renameSite(db, siteId, name) {
  await db.prepare("UPDATE sites SET name = ? WHERE id = ?").bind(name, siteId).run();
}

export async function regenerateApiKey(db, siteId, newApiKey) {
  await db.prepare("UPDATE sites SET api_key = ? WHERE id = ?").bind(newApiKey, siteId).run();
}

export async function insertVisit(db, visit) {
  await db
    .prepare(
      `INSERT INTO visits (
        site_id, session_id, visitor_hash, url, page_title, referrer, referrer_domain,
        search_engine, search_query, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
        browser, os, device_type, screen_resolution, language, timezone, country, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      visit.siteId,
      visit.sessionId,
      visit.visitorHash,
      visit.url,
      visit.pageTitle,
      visit.referrer,
      visit.referrerDomain,
      visit.searchEngine,
      visit.searchQuery,
      visit.utmSource,
      visit.utmMedium,
      visit.utmCampaign,
      visit.utmTerm,
      visit.utmContent,
      visit.browser,
      visit.os,
      visit.deviceType,
      visit.screenResolution,
      visit.language,
      visit.timezone,
      visit.country,
      Date.now()
    )
    .run();
}

export async function upsertSession(db, siteId, sessionId, visitorHash) {
  const now = Date.now();
  const existing = await db.prepare("SELECT id FROM sessions WHERE id = ?").bind(sessionId).first();
  if (existing) {
    await db
      .prepare("UPDATE sessions SET last_seen = ?, page_count = page_count + 1 WHERE id = ?")
      .bind(now, sessionId)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO sessions (id, site_id, visitor_hash, page_count, first_seen, last_seen)
         VALUES (?, ?, ?, 1, ?, ?)`
      )
      .bind(sessionId, siteId, visitorHash, now, now)
      .run();
  }
}

// Called on every heartbeat beacon (roughly every 45s while a tab stays open).
// Only touches last_seen, does not count as a new page view.
export async function touchSession(db, sessionId) {
  await db.prepare("UPDATE sessions SET last_seen = ? WHERE id = ?").bind(Date.now(), sessionId).run();
}

// Records one custom event (e.g. "signup", "purchase"), reported manually by
// the site owner via window.agEvent(name, props). Kept separate from visits:
// not every page load is an event, and an event can fire without a page load.
export async function insertEvent(db, event) {
  await db
    .prepare(
      `INSERT INTO events (site_id, session_id, visitor_hash, name, url, props, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      event.siteId,
      event.sessionId || null,
      event.visitorHash,
      event.name,
      event.url || null,
      event.props || null,
      Date.now()
    )
    .run();
}

// "Online now" = a session whose last_seen falls inside a short rolling window.
// This replaces the old KV-based counter: no extra writes are needed here at
// all, since collect/heartbeat already update sessions.last_seen for other
// reasons. Reads are cheap and generous on Cloudflare D1's free plan.
const ONLINE_WINDOW_MS = 90 * 1000; // 2x the tracker's heartbeat interval

export async function countOnline(db, siteId) {
  const row = await db
    .prepare("SELECT COUNT(DISTINCT visitor_hash) as count FROM sessions WHERE site_id = ? AND last_seen > ?")
    .bind(siteId, Date.now() - ONLINE_WINDOW_MS)
    .first();
  return row?.count || 0;
}

// Deletes visits/sessions/events older than the configured retention window,
// across every site. Called from the weekly cron trigger in src/index.js.
// Keeps D1 storage (5GB on the free plan) from growing forever, since "All
// time" is the longest period the dashboard ever queries anyway beyond 12
// months there's no UI that would show the older rows regardless.
export async function pruneOldData(db, retentionDays) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const [visits, sessions, events] = await Promise.all([
    db.prepare("DELETE FROM visits WHERE created_at < ?").bind(cutoff).run(),
    db.prepare("DELETE FROM sessions WHERE last_seen < ?").bind(cutoff).run(),
    db.prepare("DELETE FROM events WHERE created_at < ?").bind(cutoff).run(),
  ]);
  return {
    visitsDeleted: visits.meta?.changes || 0,
    sessionsDeleted: sessions.meta?.changes || 0,
    eventsDeleted: events.meta?.changes || 0,
  };
}

// Returns { start, end } timestamps (ms) in UTC for a named period.
// "today" and "yesterday" are calendar-day boundaries; the rest are rolling windows.
export function getPeriodRange(period) {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const startOfToday = Math.floor(now / day) * day;

  switch (period) {
    case "today":
      return { start: startOfToday, end: now };
    case "yesterday":
      return { start: startOfToday - day, end: startOfToday };
    case "7d":
      return { start: now - day * 7, end: now };
    case "30d":
      return { start: now - day * 30, end: now };
    case "12m":
      return { start: now - day * 365, end: now };
    case "all":
    default:
      return { start: 0, end: now };
  }
}

// The immediately preceding window of the same length, used for "vs last period"
// comparisons on the dashboard. "all" has no meaningful previous window.
export function getPreviousPeriodRange(period) {
  if (period === "all") return null;
  const { start, end } = getPeriodRange(period);
  const length = end - start;
  return { start: start - length, end: start };
}
