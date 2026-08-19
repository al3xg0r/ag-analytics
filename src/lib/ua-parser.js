// Minimal User-Agent parser.
// A full library like ua-parser-js would add unnecessary weight to the Worker,
// so this covers the browsers/systems/devices listed in the project spec only.

export function parseBrowser(ua) {
  if (!ua) return "Unknown";
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Brave/.test(ua)) return "Brave";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/CriOS/.test(ua)) return "Chrome"; // Chrome on iOS
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "Safari";
  return "Other";
}

export function parseOS(ua) {
  if (!ua) return "Unknown";
  if (/Windows/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Other";
}

export function parseDeviceType(ua) {
  if (!ua) return "Desktop";
  if (/iPad|Tablet/.test(ua)) return "Tablet";
  if (/Mobi|Android.*Mobile|iPhone/.test(ua)) return "Phone";
  return "Desktop";
}

// Matches the common crawlers, monitoring bots, and HTTP libraries that would
// otherwise inflate visitor counts. This is not exhaustive (no list ever is),
// but covers the traffic that actually shows up in most sites' logs: search
// engine crawlers, social-media link previewers, SEO tools, and generic
// scripted clients. Anything matching here is dropped before it's recorded.
const BOT_PATTERN =
  /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|whatsapp|telegrambot|discordbot|slackbot|embedly|quora link preview|pingdom|uptimerobot|monitor|headlesschrome|phantomjs|puppeteer|playwright|python-requests|python-urllib|curl|wget|go-http-client|libwww-perl|scrapy|ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|bytespider|applebot|yandexbot|baiduspider|duckduckbot|bingpreview/i;

export function isBot(ua) {
  if (!ua) return true; // no User-Agent at all is almost always a script, not a browser
  return BOT_PATTERN.test(ua);
}

// A friendly label for the bot stats panel — checked in roughly "most
// specific first" order so e.g. "Googlebot" wins over the generic "bot"
// match. Falls back to "Other bot" for anything the pattern above caught
// but that isn't one of these named ones (generic scripts, unlisted crawlers).
const BOT_LABELS = [
  [/googlebot/i, "Googlebot"],
  [/bingpreview|bingbot/i, "Bing"],
  [/yandexbot/i, "YandexBot"],
  [/baiduspider/i, "Baidu"],
  [/duckduckbot/i, "DuckDuckBot"],
  [/applebot/i, "Applebot"],
  [/petalbot/i, "PetalBot"],
  [/bytespider/i, "Bytespider"],
  [/ahrefsbot/i, "AhrefsBot"],
  [/semrushbot/i, "SemrushBot"],
  [/mj12bot/i, "MJ12bot"],
  [/dotbot/i, "DotBot"],
  [/facebookexternalhit/i, "Facebook"],
  [/whatsapp/i, "WhatsApp"],
  [/telegrambot/i, "Telegram"],
  [/discordbot/i, "Discord"],
  [/slackbot/i, "Slack"],
  [/embedly/i, "Embedly"],
  [/quora link preview/i, "Quora"],
  [/pingdom/i, "Pingdom"],
  [/uptimerobot/i, "UptimeRobot"],
  [/headlesschrome|phantomjs|puppeteer|playwright/i, "Headless browser"],
  [/python-requests|python-urllib/i, "Python script"],
  [/curl/i, "curl"],
  [/wget/i, "Wget"],
  [/go-http-client/i, "Go script"],
  [/libwww-perl/i, "Perl script"],
  [/scrapy/i, "Scrapy"],
  [/monitor/i, "Monitoring service"],
  [/spider|crawl|slurp|mediapartners/i, "Other crawler"],
];

export function botLabel(ua) {
  if (!ua) return "Unknown (no UA)";
  for (const [pattern, label] of BOT_LABELS) {
    if (pattern.test(ua)) return label;
  }
  return "Other bot";
}
