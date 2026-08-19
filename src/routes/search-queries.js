import { handleBreakdown } from "../lib/aggregate.js";

// Breaks visits down by the actual search phrase, when the search engine's
// referrer exposes it. IMPORTANT CAVEAT (not a bug in this tool — every
// analytics product has this limitation): Google has sent organic search
// referrers without the query string since 2013 ("search term (not
// provided)" in every analytics tool, Google's own included). In practice
// this panel will show real phrases from Bing, DuckDuckGo, Brave Search and
// Yandex reasonably often, but will show almost nothing for Google — that's
// expected, not something this endpoint or its query can fix. Google Search
// Console (a separate, free Google product tied to domain ownership) is the
// only way to see Google's own search terms.
export async function handleSearchQueries(request, env) {
  return handleBreakdown(request, env, { cacheName: "search-queries", groupByExpr: "search_query" });
}
