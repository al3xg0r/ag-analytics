// Small helpers for consistent JSON responses and CORS handling.
// Every API route uses these so headers stay identical everywhere.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

export function noContent() {
  // Used by /collect and /heartbeat: the tracker script ignores the response body,
  // so a tiny 204 keeps the beacon request as cheap as possible.
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function error(message, status = 400) {
  return json({ error: message }, status);
}

export function handleOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
