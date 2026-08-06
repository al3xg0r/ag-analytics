// Parses referrers into a known search engine / social source, and extracts
// the search query when the search engine exposes it in the URL.

const SEARCH_ENGINES = [
  { name: "Google", host: /(^|\.)google\./, queryParam: "q" },
  { name: "Bing", host: /(^|\.)bing\.com/, queryParam: "q" },
  { name: "DuckDuckGo", host: /(^|\.)duckduckgo\.com/, queryParam: "q" },
  { name: "Brave Search", host: /(^|\.)search\.brave\.com/, queryParam: "q" },
  { name: "Yahoo", host: /(^|\.)search\.yahoo\.com/, queryParam: "p" },
  { name: "Yandex", host: /(^|\.)yandex\./, queryParam: "text" },
];

const KNOWN_SOURCES = [
  { name: "Telegram", host: /(^|\.)t\.me$/ },
  { name: "GitHub", host: /(^|\.)github\.com$/ },
  { name: "Reddit", host: /(^|\.)reddit\.com$/ },
  { name: "X", host: /(^|\.)(x\.com|twitter\.com)$/ },
  { name: "Facebook", host: /(^|\.)facebook\.com$/ },
];

export function parseReferrer(referrerRaw, currentHost) {
  const result = {
    referrer: referrerRaw || null,
    referrerDomain: null,
    searchEngine: null,
    searchQuery: null,
    source: "Direct",
  };

  if (!referrerRaw) return result;

  let referrerUrl;
  try {
    referrerUrl = new URL(referrerRaw);
  } catch {
    return result;
  }

  result.referrerDomain = referrerUrl.hostname;

  // Traffic from the same site is not an external referrer
  if (currentHost && referrerUrl.hostname === currentHost) {
    result.source = "Direct";
    result.referrerDomain = null;
    return result;
  }

  for (const engine of SEARCH_ENGINES) {
    if (engine.host.test(referrerUrl.hostname)) {
      result.searchEngine = engine.name;
      result.source = engine.name;
      result.searchQuery = referrerUrl.searchParams.get(engine.queryParam) || null;
      // Cleared on purpose: search engines are shown in their own "Search engines"
      // panel, so they should not also dilute the general "Referrers" breakdown.
      result.referrerDomain = null;
      return result;
    }
  }

  for (const known of KNOWN_SOURCES) {
    if (known.host.test(referrerUrl.hostname)) {
      result.source = known.name;
      return result;
    }
  }

  result.source = "Unknown";
  return result;
}

export function extractUtm(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return {};
  }
  return {
    utmSource: parsed.searchParams.get("utm_source"),
    utmMedium: parsed.searchParams.get("utm_medium"),
    utmCampaign: parsed.searchParams.get("utm_campaign"),
    utmTerm: parsed.searchParams.get("utm_term"),
    utmContent: parsed.searchParams.get("utm_content"),
  };
}

// Reduces an absolute page URL down to just its path (+ non-marketing query
// params). This is what "Top pages" is grouped by, on purpose:
//  - Hosting platforms that serve the same site from more than one hostname
//    (a custom domain plus an auto-generated preview/deployment URL, which is
//    how IPFS hosts like 4everland work) would otherwise fragment every page
//    into multiple separate rows, one per hostname.
//  - UTM tags are already captured in their own columns, so leaving them in
//    the path would fragment "the same page" into one row per campaign too.
const UTM_PARAM_NAMES = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

export function normalizePagePath(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  for (const param of UTM_PARAM_NAMES) parsed.searchParams.delete(param);
  const search = parsed.searchParams.toString();
  return parsed.pathname + (search ? `?${search}` : "");
}
