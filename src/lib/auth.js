// Authentication helpers.
// Two different mechanisms are used on purpose:
//  - Site API Key: a random string, checked on every /collect call from the public tracker.
//  - Admin JWT: signed with HMAC-SHA256, checked on every dashboard/management call.
// Only Web Crypto (built into Workers) is used, no external dependency is required.

const encoder = new TextEncoder();

function toBase64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function generateApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return "agk_" + toBase64Url(bytes);
}

export function generateSiteId(name) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const suffix = toBase64Url(crypto.getRandomValues(new Uint8Array(3))).toLowerCase();
  return `${slug || "site"}-${suffix}`;
}

// Passwords are hashed with PBKDF2 (100k iterations, SHA-256), a random salt per password.
// The stored string format is: pbkdf2$<iterations>$<salt-b64url>$<hash-b64url>
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 100000;
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  const hash = toBase64Url(new Uint8Array(derivedBits));
  return `pbkdf2$${iterations}$${toBase64Url(salt)}$${hash}`;
}

export async function verifyPassword(password, stored) {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1], 10);
  const salt = fromBase64Url(parts[2]);
  const expectedHash = parts[3];

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  const actualHash = toBase64Url(new Uint8Array(derivedBits));
  return actualHash === expectedHash;
}

async function hmacSign(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toBase64Url(new Uint8Array(signature));
}

// Minimal JWT (HS256) implementation: header.payload.signature
export async function signJwt(payload, secret, expiresInSeconds = 60 * 60 * 12) {
  const header = { alg: "HS256", typ: "JWT" };
  const fullPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
  const encodedHeader = toBase64Url(encoder.encode(JSON.stringify(header)));
  const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(fullPayload)));
  const signature = await hmacSign(`${encodedHeader}.${encodedPayload}`, secret);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export async function verifyJwt(token, secret) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;

  const expectedSignature = await hmacSign(`${encodedHeader}.${encodedPayload}`, secret);
  if (expectedSignature !== signature) return null;

  const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedPayload)));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function getBearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer (.+)$/);
  return match ? match[1] : null;
}

// Guards a route so it only runs for a logged-in admin.
// Returns the decoded JWT payload, or null if the request is not authorized.
export async function requireAdmin(request, env) {
  const token = getBearerToken(request);
  if (!token) return null;
  return verifyJwt(token, env.JWT_SECRET);
}
