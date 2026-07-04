import { hashPassword, verifyPassword, signJwt } from "../lib/auth.js";
import { json, error } from "../lib/response.js";

// POST /auth/setup
// Creates the very first administrator account. Only works while the admins
// table is empty, so this endpoint safely disables itself after first use.
export async function handleSetup(request, env) {
  const existing = await env.DB.prepare("SELECT id FROM admins LIMIT 1").first();
  if (existing) {
    return error("Setup already completed. Use /auth/login instead.", 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON body");
  }

  const { login, password, email } = body;
  if (!login || !password || password.length < 8) {
    return error("login and password (min 8 characters) are required");
  }

  const passwordHash = await hashPassword(password);
  await env.DB.prepare(
    "INSERT INTO admins (login, password_hash, email, created_at) VALUES (?, ?, ?, ?)"
  )
    .bind(login, passwordHash, email || null, Date.now())
    .run();

  const token = await signJwt({ login }, env.JWT_SECRET);
  return json({ ok: true, token });
}

// GET /auth/status
// Tells the dashboard whether first-run setup is still needed.
export async function handleAuthStatus(request, env) {
  const existing = await env.DB.prepare("SELECT id FROM admins LIMIT 1").first();
  return json({ setup_required: !existing });
}

// POST /auth/login
export async function handleLogin(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON body");
  }

  const { login, password } = body;
  if (!login || !password) return error("login and password are required");

  const admin = await env.DB.prepare("SELECT * FROM admins WHERE login = ?").bind(login).first();
  if (!admin) return error("Invalid credentials", 401);

  const valid = await verifyPassword(password, admin.password_hash);
  if (!valid) return error("Invalid credentials", 401);

  const token = await signJwt({ login: admin.login }, env.JWT_SECRET);
  return json({ ok: true, token });
}
