import { handleCollect } from "./routes/collect.js";
import { handleHeartbeat } from "./routes/heartbeat.js";
import { handleDashboard } from "./routes/dashboard.js";
import { handleOnline } from "./routes/online.js";
import { handleStats } from "./routes/stats.js";
import { handlePages } from "./routes/pages.js";
import { handleCountries } from "./routes/countries.js";
import { handleReferrers } from "./routes/referrers.js";
import { handleDevices } from "./routes/devices.js";
import { handleBrowsers } from "./routes/browsers.js";
import { handleSearchEngines } from "./routes/search-engines.js";
import { handleSetup, handleAuthStatus, handleLogin } from "./routes/auth.js";
import {
  handleListSites,
  handleCreateSite,
  handleDeleteSite,
  handleUpdateSite,
} from "./routes/sites.js";
import { requireAdmin } from "./lib/auth.js";
import { error, handleOptions } from "./lib/response.js";

// Routes that require a valid admin JWT (everything that reads or manages
// private analytics data). /collect and /heartbeat stay public on purpose:
// that is what the tracker script on visitors' browsers calls.
const PROTECTED_PREFIXES = ["/dashboard", "/online", "/stats", "/pages", "/countries", "/referrers", "/search-engines", "/devices", "/browsers", "/sites"];

function isProtected(pathname) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") return handleOptions();

    try {
      // Public, unauthenticated endpoints used by tracker.js in visitors' browsers
      if (pathname === "/collect" && request.method === "POST") return handleCollect(request, env);
      if (pathname === "/heartbeat" && request.method === "POST") return handleHeartbeat(request, env);

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
};
