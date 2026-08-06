// AG Analytics dashboard frontend.
// Plain JavaScript on purpose: this stays a single small file with no build step,
// consistent with the "lightweight, easy deploy" spirit of the whole project.

const API = ""; // same-origin: the Worker serves both the API and this file
const TOKEN_KEY = "ag_admin_token";
const THEME_KEY = "ag_theme";
const PANELS_KEY = "ag_visible_panels";
const ALL_PANELS = ["pages", "referrers", "search-engines", "countries", "browsers", "os", "devices"];

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

  if (!getToken()) {
    const status = await api("/auth/status");
    showView(status.setup_required ? "setup" : "login");
    return;
  }

  try {
    await loadSites();
    showView("app");
    applyVisiblePanels();
    await refreshAll();
  } catch (e) {
    showView("login");
  }
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

async function loadSites() {
  const { sites } = await api("/sites");
  state.sites = sites;
  const select = document.getElementById("site-select");
  select.innerHTML = sites.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");

  const deleteButton = document.getElementById("btn-delete-site");
  const codeButton = document.getElementById("btn-view-code");

  if (sites.length === 0) {
    state.currentSiteId = null;
    document.getElementById("site-name").textContent = "No sites yet";
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
  document.getElementById("site-name").textContent = current ? current.name : "—";
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
  document.getElementById("site-name").textContent = site ? site.name : "—";
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
  return `<script defer src="${location.origin}/tracker.js" data-site="${siteId}"></scr` + `ipt>`;
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
  const { formatLabel, linkHref } = options;
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td class="label muted" colspan="2">No data yet</td></tr>`;
    return;
  }
  tbody.innerHTML = items
    .map((item) => {
      const text = formatLabel ? formatLabel(item.label) : item.label;
      const cellContent = linkHref
        ? `<a href="${linkHref(item.label)}" target="_blank" rel="noopener noreferrer">${text}</a>`
        : text;
      return `<tr><td class="label" title="${item.label}">${cellContent}</td><td class="value">${item.views}</td></tr>`;
    })
    .join("");
}

async function loadBreakdowns() {
  const q = `site_id=${state.currentSiteId}&period=${state.currentPeriod}&limit=8`;
  const [pages, referrers, searchEngines, countries, browsers, os, devices] = await Promise.all([
    api(`/pages?${q}`),
    api(`/referrers?${q}`),
    api(`/search-engines?${q}`),
    api(`/countries?${q}`),
    api(`/browsers?${q}`),
    api(`/devices?${q}&dimension=os`),
    api(`/devices?${q}&dimension=device_type`),
  ]);

  renderTable("table-pages", pages.items, {
    formatLabel: (label) => {
      try {
        return new URL(label).pathname || label;
      } catch {
        return label;
      }
    },
    linkHref: (label) => label,
  });
  renderTable("table-referrers", referrers.items, {
    linkHref: (label) => `https://${label}`,
  });
  renderTable("table-search-engines", searchEngines.items);
  renderTable("table-countries", countries.items);
  renderTable("table-browsers", browsers.items);
  renderTable("table-os", os.items);
  renderTable("table-devices", devices.items);
}

// Refresh only the "online now" number regularly. Everything else only
// reloads when the site or period selection changes, which keeps request
// volume (and free-tier quota usage) low.
setInterval(() => {
  if (state.currentSiteId) loadOnline().catch(() => {});
}, 60000);

boot();
