import { handleCollect } from "./routes/collect.js";
import { handleHeartbeat } from "./routes/heartbeat.js";
import { handleTrackEvent } from "./routes/track.js";
import { handleDashboard } from "./routes/dashboard.js";
import { handleOnline } from "./routes/online.js";
import { handleStats } from "./routes/stats.js";
import { handlePages } from "./routes/pages.js";
import { handleCountries } from "./routes/countries.js";
import { handleReferrers } from "./routes/referrers.js";
import { handleDevices } from "./routes/devices.js";
import { handleBrowsers } from "./routes/browsers.js";
import { handleSearchEngines } from "./routes/search-engines.js";
import { handleCampaigns } from "./routes/campaigns.js";
import { handleEvents } from "./routes/events.js";
import { handleSetup, handleAuthStatus, handleLogin } from "./routes/auth.js";
import {
  handleListSites,
  handleCreateSite,
  handleDeleteSite,
  handleUpdateSite,
} from "./routes/sites.js";
import { requireAdmin } from "./lib/auth.js";
import { pruneOldData } from "./lib/db.js";
import { error, handleOptions } from "./lib/response.js";

// Routes that require a valid admin JWT (everything that reads or manages
// private analytics data). /event and /ping stay public on purpose:
// that is what the tracker script on visitors' browsers calls.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/online",
  "/stats",
  "/pages",
  "/countries",
  "/referrers",
  "/search-engines",
  "/campaigns",
  "/events",
  "/devices",
  "/browsers",
  "/sites",
];

function isProtected(pathname) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

// How long visits/sessions/custom events are kept before the weekly cleanup
// removes them. 396 days (13 months) so the "12 months" dashboard period
// always has a full window available. Change this if you want a shorter or
// longer history; see wrangler.toml for how the schedule itself is configured.
const RETENTION_DAYS = 396;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") return handleOptions();

    try {
      // Public, unauthenticated endpoints used by tracker.js in visitors' browsers.
      // "/event" and "/ping" are the primary names: generic analytics/tracking
      // paths like "/collect" and "/heartbeat" are common targets in ad-blocker
      // filter lists (EasyPrivacy and similar), which silently drops visits.
      // "/collect" and "/heartbeat" are kept working as aliases so any
      // already-deployed tracker.js copy (which may still call the old paths
      // if cached) keeps working too.
      if ((pathname === "/event" || pathname === "/collect") && request.method === "POST") {
        return handleCollect(request, env);
      }
      if ((pathname === "/ping" || pathname === "/heartbeat") && request.method === "POST") {
        return handleHeartbeat(request, env);
      }
      // Custom events / goals, called manually by the site owner (e.g. agEvent("signup")).
      if (pathname === "/track" && request.method === "POST") {
        return handleTrackEvent(request, env);
      }

      // Admin auth endpoints
      if (pathname === "/auth/status" && request.method === "GET") return handleAuthStatus(request, env);
      if (pathname === "/auth/setup" && request.method === "POST") return handleSetup(request, env);
      if (pathname === "/auth/login" && request.method === "POST") return handleLogin(request, env);

      // Everything below requires a logged-in admin
      if (isProtected(pathname)) {
        const admin = await requireAdmin(request, env);
        if (!admin) return error("Unauthorized", 401);
      }

      if (pathname === "/dashboard" && request.method === "GET") return handleDashboard(request, env);
      if (pathname === "/online" && request.method === "GET") return handleOnline(request, env);
      if (pathname === "/stats" && request.method === "GET") return handleStats(request, env);
      if (pathname === "/pages" && request.method === "GET") return handlePages(request, env);
      if (pathname === "/countries" && request.method === "GET") return handleCountries(request, env);
      if (pathname === "/referrers" && request.method === "GET") return handleReferrers(request, env);
      if (pathname === "/search-engines" && request.method === "GET") return handleSearchEngines(request, env);
      if (pathname === "/campaigns" && request.method === "GET") return handleCampaigns(request, env);
      if (pathname === "/events" && request.method === "GET") return handleEvents(request, env);
      if (pathname === "/devices" && request.method === "GET") return handleDevices(request, env);
      if (pathname === "/browsers" && request.method === "GET") return handleBrowsers(request, env);

      if (pathname === "/sites" && request.method === "GET") return handleListSites(request, env);
      if (pathname === "/sites" && request.method === "POST") return handleCreateSite(request, env);

      const siteMatch = pathname.match(/^\/sites\/([^/]+)$/);
      if (siteMatch && request.method === "DELETE") return handleDeleteSite(request, env, siteMatch[1]);
      if (siteMatch && request.method === "PATCH") return handleUpdateSite(request, env, siteMatch[1]);

      // Anything else falls back to the static dashboard files (HTML/CSS/JS/tracker.js)
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err);
      return error("Internal server error", 500);
    }
  },

  // Runs on the schedule configured in wrangler.toml ([triggers] crons).
  // Deletes visits/sessions/events older than RETENTION_DAYS, across all sites,
  // to keep D1 storage from growing forever (5GB on the free plan).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      pruneOldData(env.DB, RETENTION_DAYS).then((result) => {
        console.log("Scheduled cleanup:", JSON.stringify(result));
      })
    );
  },
};
