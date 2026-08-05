import { handleBreakdown } from "../lib/aggregate.js";

// Breaks visits down by which search engine sent the visitor (Google, Bing,
// DuckDuckGo, Brave Search, Yahoo, Yandex). Separate from /referrers so search
// traffic is easy to see at a glance instead of being mixed in with regular
// referring websites.
export async function handleSearchEngines(request, env) {
  return handleBreakdown(request, env, { cacheName: "search-engines", groupByExpr: "search_engine" });
}
