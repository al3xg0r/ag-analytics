import {
  listSites,
  insertSite,
  deleteSite,
  updateSiteStatus,
  renameSite,
  updateSiteDomain,
  regenerateApiKey,
  getSiteById,
} from "../lib/db.js";
import { generateApiKey, generateSiteId, normalizeDomain } from "../lib/auth.js";
import { json, error } from "../lib/response.js";

// GET /sites
export async function handleListSites(request, env) {
  const sites = await listSites(env.DB);
  return json({ sites });
}

// POST /sites  { name, domain, description }
export async function handleCreateSite(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON body");
  }

  const { name, domain, description } = body;
  if (!name || !domain) return error("name and domain are required");

  const site = {
    id: generateSiteId(name),
    name,
    domain: normalizeDomain(domain),
    description,
    apiKey: generateApiKey(),
  };

  await insertSite(env.DB, site);

  return json({
    id: site.id,
    name: site.name,
    domain: site.domain,
    api_key: site.apiKey,
    tracking_snippet: `<script defer src="${new URL(request.url).origin}/widget.js" data-site="${site.id}"></script>`,
  });
}

// DELETE /sites/:id
export async function handleDeleteSite(request, env, siteId) {
  const site = await getSiteById(env.DB, siteId);
  if (!site) return error("Site not found", 404);
  await deleteSite(env.DB, siteId);
  return json({ ok: true });
}

// PATCH /sites/:id  { name?, status?, regenerate_key? }
export async function handleUpdateSite(request, env, siteId) {
  const site = await getSiteById(env.DB, siteId);
  if (!site) return error("Site not found", 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON body");
  }

  if (body.name) await renameSite(env.DB, siteId, body.name);
  if (body.domain) await updateSiteDomain(env.DB, siteId, normalizeDomain(body.domain));
  if (body.status && ["active", "disabled"].includes(body.status)) {
    await updateSiteStatus(env.DB, siteId, body.status);
  }

  let newApiKey = null;
  if (body.regenerate_key) {
    newApiKey = generateApiKey();
    await regenerateApiKey(env.DB, siteId, newApiKey);
  }

  return json({ ok: true, api_key: newApiKey || undefined });
}
