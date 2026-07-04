// Generates an anonymous "visitor hash" used only to count unique visitors
// and to detect returning sessions within the same day.
// The IP address is used as ONE input to the hash and is never stored or logged anywhere.
// The hash changes every day, so no long-term cross-day tracking of a person is possible.

export async function buildVisitorHash({ ip, userAgent, siteId }) {
  const dayBucket = new Date().toISOString().slice(0, 10); // e.g. "2026-07-04"
  const raw = `${ip}|${userAgent}|${siteId}|${dayBucket}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex.slice(0, 32);
}
