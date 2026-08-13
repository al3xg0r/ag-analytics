// AG Analytics dashboard frontend.
// Plain JavaScript on purpose: this stays a single small file with no build step,
// consistent with the "lightweight, easy deploy" spirit of the whole project.

const API = ""; // same-origin: the Worker serves both the API and this file
const TOKEN_KEY = "ag_admin_token";
const THEME_KEY = "ag_theme";
const PANELS_KEY = "ag_visible_panels";
const PANEL_ORDER_KEY = "ag_panel_order";
const ALL_PANELS = ["pages", "referrers", "search-engines", "campaigns", "countries", "browsers", "os", "devices", "events"];

let state = {
  sites: [],
  currentSiteId: null,
  currentPeriod: "today",
};

// ---------- small helpers ----------

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(API + path, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    showView("login");
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

function show(id) {
  document.getElementById(id).classList.remove("hidden");
}
function hide(id) {
  document.getElementById(id).classList.add("hidden");
}

function showView(view) {
  hide("view-setup");
  hide("view-login");
  document.getElementById("view-app").classList.add("hidden");
  if (view === "setup") show("view-setup");
  if (view === "login") show("view-login");
  if (view === "app") document.getElementById("view-app").classList.remove("hidden");
}

function formatSeconds(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

// ---------- boot ----------

async function boot() {
  applyStoredTheme();

  const status = await api("/auth/status").catch(() => null);
  renderVersionTag(status);

  if (!getToken()) {
    showView(status?.setup_required ? "setup" : "login");
    return;
  }

  try {
    await loadSites();
    showView("app");
    applyPanelOrder();
    initPanelDragAndDrop();
    applyVisiblePanels();
    await refreshAll();
  } catch (e) {
    showView("login");
  }
}

// Shows "vX.Y.Z-betaN · Aug 11, 2026" (or just the version, if no date is
// configured) in the sidebar footer. Mainly useful for telling at a glance
// whether the browser is showing a freshly deployed version or a stale
// cached copy of the frontend after a deploy.
function renderVersionTag(status) {
  const el = document.getElementById("app-version");
  if (!el || !status?.version) return;
  const date = status.release_date
    ? new Date(status.release_date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : null;
  el.textContent = date ? `v${status.version} · ${date}` : `v${status.version}`;
}

// ---------- auth forms ----------

document.getElementById("form-setup").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const errorEl = document.getElementById("setup-error");
  errorEl.textContent = "";
  try {
    const data = await api("/auth/setup", {
      method: "POST",
      body: JSON.stringify({
        login: form.get("login"),
        password: form.get("password"),
        email: form.get("email") || undefined,
      }),
    });
    setToken(data.token);
    await boot();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";
  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ login: form.get("login"), password: form.get("password") }),
    });
    setToken(data.token);
    await boot();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById("btn-logout").addEventListener("click", () => {
  clearToken();
  showView("login");
});

// ---------- theme ----------

function applyStoredTheme() {
  // Light is the default look; dark is opt-in and remembered per browser.
  const theme = localStorage.getItem(THEME_KEY) || "light";
  document.documentElement.setAttribute("data-theme", theme);
}

document.getElementById("btn-theme").addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
});

// ---------- sites ----------

// Shows the site's favicon next to its name in the header, fetched via
// Google's favicon service so we never have to store or proxy the image
// ourselves (and it still works for sites without a /favicon.ico).
function updateSiteFavicon(site) {
  const img = document.getElementById("site-favicon");
  if (!site) {
    img.classList.add("hidden");
    return;
  }
  const cleanDomain = site.domain.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/.*$/, "");
  img.src = `https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=64`;
  img.classList.remove("hidden");
}

async function loadSites() {
  const { sites } = await api("/sites");
  state.sites = sites;
  const select = document.getElementById("site-select");
  select.innerHTML = sites.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");

  const deleteButton = document.getElementById("btn-delete-site");
  const codeButton = document.getElementById("btn-view-code");

  if (sites.length === 0) {
    state.currentSiteId = null;
    document.getElementById("site-name-text").textContent = "No sites yet";
    updateSiteFavicon(null);
    deleteButton.disabled = true;
    codeButton.disabled = true;
    setContentVisible(false);
    return;
  }

  deleteButton.disabled = false;
  codeButton.disabled = false;
  setContentVisible(true);

  // Keep the previously selected site if it still exists, otherwise fall back to the first one
  const stillExists = state.currentSiteId && sites.some((s) => s.id === state.currentSiteId);
  state.currentSiteId = stillExists ? state.currentSiteId : sites[0].id;
  select.value = state.currentSiteId;
  const current = sites.find((s) => s.id === state.currentSiteId);
  document.getElementById("site-name-text").textContent = current ? current.name : "—";
  updateSiteFavicon(current);
}

// Hides the stat cards / chart / breakdown tables when there is nothing to show yet
function setContentVisible(visible) {
  document.querySelector(".stat-cards").classList.toggle("hidden", !visible);
  document.querySelector(".chart-panel").classList.toggle("hidden", !visible);
  document.querySelector(".breakdown-grid").classList.toggle("hidden", !visible);
}

document.getElementById("site-select").addEventListener("change", async (e) => {
  state.currentSiteId = e.target.value;
  const site = state.sites.find((s) => s.id === state.currentSiteId);
  document.getElementById("site-name-text").textContent = site ? site.name : "—";
  updateSiteFavicon(site);
  await refreshAll();
});

document.getElementById("btn-add-site").addEventListener("click", () => {
  document.getElementById("form-add-site").reset();
  show("modal-add-site");
  show("form-add-site");
  hide("new-site-result");
});

document.getElementById("btn-cancel-add-site").addEventListener("click", () => {
  hide("modal-add-site");
});

document.getElementById("form-add-site").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const site = await api("/sites", {
    method: "POST",
    body: JSON.stringify({
      name: form.get("name"),
      domain: form.get("domain"),
      description: form.get("description") || undefined,
    }),
  });
  document.getElementById("new-site-snippet").textContent = site.tracking_snippet;
  hide("form-add-site");
  show("new-site-result");
  await loadSites();
});

document.getElementById("btn-close-new-site").addEventListener("click", async () => {
  hide("modal-add-site");
  await refreshAll();
});

document.getElementById("btn-delete-site").addEventListener("click", async () => {
  if (!state.currentSiteId) return;
  const site = state.sites.find((s) => s.id === state.currentSiteId);
  const siteName = site ? site.name : state.currentSiteId;

  // A native confirm() is deliberately used here: deleting a site permanently
  // removes all of its visits, so an accidental click must not be one click away.
  const confirmed = window.confirm(
    `Delete "${siteName}"? This permanently removes all of its collected analytics data. This cannot be undone.`
  );
  if (!confirmed) return;

  await api(`/sites/${state.currentSiteId}`, { method: "DELETE" });
  state.currentSiteId = null;
  await loadSites();
  if (state.currentSiteId) await refreshAll();
});

// ---------- view tracking code (available any time, not just right after creating a site) ----------

function buildTrackingSnippet(siteId) {
  return `<script defer src="${location.origin}/widget.js" data-site="${siteId}"></scr` + `ipt>`;
}

document.getElementById("btn-view-code").addEventListener("click", () => {
  if (!state.currentSiteId) return;
  const site = state.sites.find((s) => s.id === state.currentSiteId);
  document.getElementById("code-site-name").textContent = site ? site.name : "this site";
  document.getElementById("view-code-snippet").textContent = buildTrackingSnippet(state.currentSiteId);
  show("modal-view-code");
});

document.getElementById("btn-close-view-code").addEventListener("click", () => {
  hide("modal-view-code");
});

document.getElementById("btn-copy-code").addEventListener("click", async () => {
  const text = document.getElementById("view-code-snippet").textContent;
  const button = document.getElementById("btn-copy-code");
  try {
    await navigator.clipboard.writeText(text);
    const original = button.textContent;
    button.textContent = "Copied!";
    setTimeout(() => (button.textContent = original), 1500);
  } catch {
    // Clipboard API can be blocked (permissions, insecure context); the snippet
    // is still visible and selectable in the <pre> block as a fallback.
  }
});

// ---------- customize which breakdown panels are shown ----------

function getVisiblePanels() {
  try {
    const stored = JSON.parse(localStorage.getItem(PANELS_KEY));
    if (Array.isArray(stored)) return stored;
  } catch {
    // fall through to default
  }
  return [...ALL_PANELS];
}

function applyVisiblePanels() {
  const visible = getVisiblePanels();
  document.querySelectorAll("#breakdown-grid .panel").forEach((panel) => {
    panel.classList.toggle("hidden", !visible.includes(panel.dataset.panel));
  });
  document.querySelectorAll('#form-customize input[name="panel"]').forEach((checkbox) => {
    checkbox.checked = visible.includes(checkbox.value);
  });
}

// ---------- drag-and-drop reordering of breakdown panels ----------

// Reads the saved panel order from this browser. Falls back to ALL_PANELS
// (and is validated against it) so a future added/removed panel, or a
// leftover order from an older version, never leaves a panel un-rendered.
function getPanelOrder() {
  try {
    const stored = JSON.parse(localStorage.getItem(PANEL_ORDER_KEY));
    if (Array.isArray(stored) && ALL_PANELS.every((p) => stored.includes(p)) && stored.length === ALL_PANELS.length) {
      return stored;
    }
  } catch {
    // fall through to default
  }
  return [...ALL_PANELS];
}

// Re-orders the actual .panel elements in the DOM to match the saved order.
// appendChild on an element already in the DOM moves it rather than cloning
// it, so this is enough to reorder without touching any panel's content.
function applyPanelOrder() {
  const grid = document.getElementById("breakdown-grid");
  const panels = Array.from(grid.querySelectorAll(".panel"));
  const byKey = Object.fromEntries(panels.map((p) => [p.dataset.panel, p]));
  getPanelOrder().forEach((key) => {
    if (byKey[key]) grid.appendChild(byKey[key]);
  });
}

let dragSource = null;

function initPanelDragAndDrop() {
  const grid = document.getElementById("breakdown-grid");

  grid.querySelectorAll(".panel").forEach((panel) => {
    panel.addEventListener("dragstart", () => {
      dragSource = panel;
      panel.classList.add("dragging");
    });

    panel.addEventListener("dragend", () => {
      panel.classList.remove("dragging");
      dragSource = null;
      grid.querySelectorAll(".panel").forEach((p) => p.classList.remove("drag-over"));
      // Persist whatever order the panels ended up in.
      const order = Array.from(grid.querySelectorAll(".panel")).map((p) => p.dataset.panel);
      localStorage.setItem(PANEL_ORDER_KEY, JSON.stringify(order));
    });

    panel.addEventListener("dragover", (e) => {
      e.preventDefault(); // required to allow dropping
      if (!dragSource || dragSource === panel) return;
      panel.classList.add("drag-over");
      const rect = panel.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      grid.insertBefore(dragSource, before ? panel : panel.nextSibling);
    });

    panel.addEventListener("dragleave", () => panel.classList.remove("drag-over"));

    panel.addEventListener("drop", (e) => e.preventDefault());
  });
}

document.getElementById("btn-customize").addEventListener("click", () => {
  applyVisiblePanels();
  show("modal-customize");
});

document.getElementById("btn-close-customize").addEventListener("click", () => {
  hide("modal-customize");
});

document.getElementById("form-customize").addEventListener("change", (e) => {
  if (e.target.name !== "panel") return;
  const checked = Array.from(document.querySelectorAll('#form-customize input[name="panel"]:checked')).map(
    (el) => el.value
  );
  localStorage.setItem(PANELS_KEY, JSON.stringify(checked));
  applyVisiblePanels();
});

// ---------- period selector ----------

document.getElementById("period-tabs").addEventListener("click", async (e) => {
  const button = e.target.closest("button[data-period]");
  if (!button) return;
  document.querySelectorAll("#period-tabs button").forEach((b) => b.classList.remove("active"));
  button.classList.add("active");
  state.currentPeriod = button.dataset.period;
  await refreshAll();
});

// ---------- data loading ----------

async function refreshAll() {
  if (!state.currentSiteId) return;
  await Promise.all([loadDashboard(), loadOnline(), loadChart(), loadBreakdowns()]);
}

async function loadDashboard() {
  const data = await api(`/dashboard?site_id=${state.currentSiteId}&period=${state.currentPeriod}`);
  document.getElementById("stat-visitors").textContent = data.unique_visitors;
  document.getElementById("stat-views").textContent = data.page_views;
  document.getElementById("stat-time").textContent = formatSeconds(data.avg_time_seconds);
  document.getElementById("stat-bounce").textContent = `${data.bounce_rate}%`;
  document.getElementById("online-count").textContent = data.online;

  renderDelta("delta-visitors", data.change?.unique_visitors);
  renderDelta("delta-views", data.change?.page_views);
  renderDelta("delta-time", data.change?.avg_time_seconds);
  renderDelta("delta-bounce", data.change?.bounce_rate, { lowerIsBetter: true });
}

// Shows "↑ 12% vs previous period" (or a down arrow for a drop) under a stat
// card. "vs previous period" always means the immediately preceding window
// of the same length (e.g. 7 days vs the 7 days before that).
//
// The arrow always reflects the actual numeric direction of the change. The
// *color*, however, reflects whether that change is good or bad — and that
// depends on the metric: more visitors/views/time-on-site is good, but a
// LOWER bounce rate is also good, so pass { lowerIsBetter: true } for it.
function renderDelta(elementId, change, { lowerIsBetter = false } = {}) {
  const el = document.getElementById(elementId);
  if (change === null || change === undefined) {
    el.textContent = "";
    el.className = "card-delta";
    return;
  }
  const arrow = change > 0 ? "↑" : change < 0 ? "↓" : "→";
  let sentiment = "flat";
  if (change !== 0) {
    const increased = change > 0;
    const isGood = lowerIsBetter ? !increased : increased;
    sentiment = isGood ? "good" : "bad";
  }
  el.textContent = `${arrow} ${Math.abs(change)}% vs previous period`;
  el.className = `card-delta ${sentiment}`;
}

// Separate, lightweight call: polled far more often than the rest of the
// dashboard, so it stays a single cheap query instead of re-running every
// aggregate on /dashboard.
async function loadOnline() {
  const data = await api(`/online?site_id=${state.currentSiteId}`);
  document.getElementById("online-count").textContent = data.online;
}

async function loadChart() {
  const data = await api(`/stats?site_id=${state.currentSiteId}&period=${state.currentPeriod}`);
  drawChart(data.buckets);
}

// Formats a bucket's ISO timestamp for the tooltip/axis, adapting to whether
// buckets are hourly (Today/Yesterday) or daily (everything else).
function formatBucketLabel(isoString) {
  const date = new Date(isoString);
  const isHourly = state.currentPeriod === "today" || state.currentPeriod === "yesterday";
  return isHourly
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const CHART_WIDTH = 800;
const CHART_HEIGHT = 240;
const CHART_PADDING_X = 20;
const CHART_PADDING_TOP = 16;
const CHART_PADDING_BOTTOM = 32;

function drawChart(buckets) {
  const svg = document.getElementById("chart");
  const tooltip = document.getElementById("chart-tooltip");
  svg.setAttribute("viewBox", `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`);
  svg.innerHTML = "";
  tooltip.classList.add("hidden");

  if (!buckets || buckets.length === 0) {
    const ns = "http://www.w3.org/2000/svg";
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", CHART_WIDTH / 2);
    text.setAttribute("y", CHART_HEIGHT / 2);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("fill", "var(--text-muted)");
    text.setAttribute("font-family", "var(--font-body)");
    text.setAttribute("font-size", "14");
    text.textContent = "No data for this period yet";
    svg.appendChild(text);
    return;
  }

  const innerTop = CHART_PADDING_TOP;
  const innerBottom = CHART_HEIGHT - CHART_PADDING_BOTTOM;
  const innerHeight = innerBottom - innerTop;
  const max = Math.max(...buckets.map((b) => b.views), 1);

  const stepX = (CHART_WIDTH - CHART_PADDING_X * 2) / Math.max(buckets.length - 1, 1);
  const xFor = (i) => CHART_PADDING_X + i * stepX;
  const yFor = (views) => innerBottom - (views / max) * innerHeight;

  const points = buckets.map((b, i) => `${xFor(i)},${yFor(b.views)}`);
  const linePath = `M ${points.join(" L ")}`;
  const areaPath = `${linePath} L ${xFor(buckets.length - 1)},${innerBottom} L ${xFor(0)},${innerBottom} Z`;

  const ns = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  // Horizontal gridlines with a view-count scale on the left, so the chart
  // reads as actual numbers instead of just a vague shape.
  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const y = innerTop + (innerHeight / gridSteps) * i;
    const value = Math.round(max - (max / gridSteps) * i);
    svg.appendChild(
      svgEl("line", {
        x1: CHART_PADDING_X,
        x2: CHART_WIDTH - CHART_PADDING_X,
        y1: y,
        y2: y,
        stroke: "var(--border)",
        "stroke-width": "1",
      })
    );
    svg.appendChild(
      svgEl("text", {
        x: 0,
        y: y - 4,
        fill: "var(--text-muted)",
        "font-family": "var(--font-mono)",
        "font-size": "10",
      })
    ).textContent = value;
  }

  // A handful of evenly spaced x-axis labels (never one per bucket, that gets unreadable)
  const labelCount = Math.min(buckets.length, 6);
  const labelEvery = Math.max(Math.floor(buckets.length / labelCount), 1);
  buckets.forEach((b, i) => {
    if (i % labelEvery !== 0 && i !== buckets.length - 1) return;
    const text = svgEl("text", {
      x: xFor(i),
      y: CHART_HEIGHT - 10,
      fill: "var(--text-muted)",
      "font-family": "var(--font-mono)",
      "font-size": "10",
      "text-anchor": "middle",
    });
    text.textContent = formatBucketLabel(b.bucket);
    svg.appendChild(text);
  });

  const area = svgEl("path", { d: areaPath, fill: "var(--accent)", opacity: "0.18" });
  svg.appendChild(area);

  const line = svgEl("path", { d: linePath, fill: "none", stroke: "var(--accent)", "stroke-width": "2" });
  svg.appendChild(line);

  // Invisible guide elements, moved into place on hover
  const guideLine = svgEl("line", {
    x1: 0,
    x2: 0,
    y1: innerTop,
    y2: innerBottom,
    stroke: "var(--text-muted)",
    "stroke-width": "1",
    "stroke-dasharray": "3,3",
    opacity: "0",
  });
  svg.appendChild(guideLine);

  const guideDot = svgEl("circle", { cx: 0, cy: 0, r: 4, fill: "var(--accent)", stroke: "var(--surface)", "stroke-width": "2", opacity: "0" });
  svg.appendChild(guideDot);

  // A transparent full-height rect per bucket makes hit-testing trivial: no
  // need to compute distances, just which column the cursor is over.
  buckets.forEach((b, i) => {
    const hitX = xFor(i) - stepX / 2;
    const hitRect = svgEl("rect", {
      x: Math.max(hitX, 0),
      y: 0,
      width: stepX,
      height: CHART_HEIGHT,
      fill: "transparent",
    });
    hitRect.addEventListener("mouseenter", () => {
      const x = xFor(i);
      const y = yFor(b.views);
      guideLine.setAttribute("x1", x);
      guideLine.setAttribute("x2", x);
      guideLine.setAttribute("opacity", "1");
      guideDot.setAttribute("cx", x);
      guideDot.setAttribute("cy", y);
      guideDot.setAttribute("opacity", "1");

      tooltip.innerHTML = `<strong>${formatBucketLabel(b.bucket)}</strong><br>${b.views} views &middot; ${b.visitors} visitors`;
      tooltip.style.left = `${(x / CHART_WIDTH) * 100}%`;
      tooltip.style.top = `${(y / CHART_HEIGHT) * 100}%`;
      tooltip.classList.remove("hidden");
    });
    svg.appendChild(hitRect);
  });

  svg.addEventListener("mouseleave", () => {
    guideLine.setAttribute("opacity", "0");
    guideDot.setAttribute("opacity", "0");
    tooltip.classList.add("hidden");
  });
}

function renderTable(tableId, items, options = {}) {
  const { formatLabel, linkHref, icon } = options;
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td class="label muted" colspan="2">No data yet</td></tr>`;
    return;
  }
  tbody.innerHTML = items
    .map((item) => {
      const text = formatLabel ? formatLabel(item.label) : item.label;
      const iconHtml = icon ? icon(item.label) : "";
      const inner = iconHtml + text;
      const cellContent = linkHref
        ? `<a href="${linkHref(item.label)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
        : inner;
      return `<tr><td class="label" title="${item.label}">${cellContent}</td><td class="value">${item.views}</td></tr>`;
    })
    .join("");
}

// Converts a 2-letter ISO country code (as returned by Cloudflare, e.g. "US")
// into its flag emoji, purely client-side. Falls back to the code itself for
// anything that isn't a real 2-letter code ("Unknown", etc).
function countryFlag(code) {
  if (!/^[A-Z]{2}$/i.test(code)) return "";
  const base = 127397; // regional indicator symbol offset
  return String.fromCodePoint(...code.toUpperCase().split("").map((c) => c.charCodeAt(0) + base));
}

function countryName(code) {
  try {
    return new Intl.DisplayNames([navigator.language || "en"], { type: "region" }).of(code.toUpperCase());
  } catch {
    return code;
  }
}

async function loadBreakdowns() {
  const q = `site_id=${state.currentSiteId}&period=${state.currentPeriod}&limit=8`;
  const [pages, referrers, searchEngines, countries, browsers, os, devices, campaigns, events] = await Promise.all([
    api(`/pages?${q}`),
    api(`/referrers?${q}`),
    api(`/search-engines?${q}`),
    api(`/countries?${q}`),
    api(`/browsers?${q}`),
    api(`/devices?${q}&dimension=os`),
    api(`/devices?${q}&dimension=device_type`),
    api(`/campaigns?${q}`),
    api(`/events?${q}`),
  ]);

  const currentSite = state.sites.find((s) => s.id === state.currentSiteId);
  // Defensive: older/mistyped data may have a domain stored with a protocol
  // already in it (e.g. "https://example.com" instead of "example.com").
  // Strip it here so links never end up double-prefixed, regardless of
  // what's actually in the database right now.
  const cleanDomain = currentSite ? currentSite.domain.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/.*$/, "") : "";
  const siteOrigin = cleanDomain ? `https://${cleanDomain}` : "";

  renderTable("table-pages", pages.items, {
    // visits.url is stored as a normalized path (e.g. "/blog/post"), not a full
    // URL — see lib/utm.js normalizePagePath for why. Rebuild the real link
    // using the site's own registered domain.
    linkHref: (label) => siteOrigin + label,
  });
  renderTable("table-referrers", referrers.items, {
    icon: (label) => `<img class="favicon" src="https://icons.duckduckgo.com/ip3/${label}.ico" alt="" loading="lazy" />`,
    linkHref: (label) => `https://${label}`,
  });
  renderTable("table-search-engines", searchEngines.items);
  renderTable("table-countries", countries.items, {
    icon: (label) => `<span class="flag">${countryFlag(label)}</span>`,
    formatLabel: (label) => countryName(label) || label,
  });
  renderTable("table-browsers", browsers.items);
  renderTable("table-os", os.items);
  renderTable("table-devices", devices.items);
  renderTable("table-campaigns", campaigns.items);
  renderTable("table-events", events.items);
}

// Refresh only the "online now" number regularly. Everything else only
// reloads when the site or period selection changes, which keeps request
// volume (and free-tier quota usage) low.
setInterval(() => {
  if (state.currentSiteId) loadOnline().catch(() => {});
}, 60000);

boot();
