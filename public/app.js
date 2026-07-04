// AG Analytics dashboard frontend.
// Plain JavaScript on purpose: this stays a single small file with no build step,
// consistent with the "lightweight, easy deploy" spirit of the whole project.

const API = ""; // same-origin: the Worker serves both the API and this file
const TOKEN_KEY = "ag_admin_token";
const THEME_KEY = "ag_theme";

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
  const theme = localStorage.getItem(THEME_KEY) || "dark";
  document.documentElement.setAttribute("data-theme", theme);
}

document.getElementById("btn-theme").addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
});

// ---------- sites ----------

async function loadSites() {
  const { sites } = await api("/sites");
  state.sites = sites;
  const select = document.getElementById("site-select");
  select.innerHTML = sites.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
  if (sites.length > 0) {
    state.currentSiteId = sites[0].id;
    select.value = state.currentSiteId;
    document.getElementById("site-name").textContent = sites[0].name;
  }
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
  await Promise.all([loadDashboard(), loadChart(), loadBreakdowns()]);
}

async function loadDashboard() {
  const data = await api(`/dashboard?site_id=${state.currentSiteId}&period=${state.currentPeriod}`);
  document.getElementById("stat-visitors").textContent = data.unique_visitors;
  document.getElementById("stat-views").textContent = data.page_views;
  document.getElementById("stat-time").textContent = formatSeconds(data.avg_time_seconds);
  document.getElementById("stat-bounce").textContent = `${data.bounce_rate}%`;
  document.getElementById("online-count").textContent = data.online;
}

async function loadChart() {
  const data = await api(`/stats?site_id=${state.currentSiteId}&period=${state.currentPeriod}`);
  drawChart(data.buckets);
}

function drawChart(buckets) {
  const svg = document.getElementById("chart");
  svg.innerHTML = "";
  if (!buckets || buckets.length === 0) return;

  const width = 800;
  const height = 220;
  const padding = 20;
  const max = Math.max(...buckets.map((b) => b.views), 1);

  const stepX = (width - padding * 2) / Math.max(buckets.length - 1, 1);
  const points = buckets.map((b, i) => {
    const x = padding + i * stepX;
    const y = height - padding - (b.views / max) * (height - padding * 2);
    return `${x},${y}`;
  });

  const linePath = `M ${points.join(" L ")}`;
  const areaPath = `${linePath} L ${padding + (buckets.length - 1) * stepX},${height - padding} L ${padding},${height - padding} Z`;

  const ns = "http://www.w3.org/2000/svg";

  const area = document.createElementNS(ns, "path");
  area.setAttribute("d", areaPath);
  area.setAttribute("fill", "var(--accent-dim)");
  area.setAttribute("opacity", "0.35");
  svg.appendChild(area);

  const line = document.createElementNS(ns, "path");
  line.setAttribute("d", linePath);
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", "var(--accent)");
  line.setAttribute("stroke-width", "2");
  svg.appendChild(line);
}

function renderTable(tableId, items, formatLabel) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td class="label muted" colspan="2">No data yet</td></tr>`;
    return;
  }
  tbody.innerHTML = items
    .map(
      (item) =>
        `<tr><td class="label" title="${item.label}">${formatLabel ? formatLabel(item.label) : item.label}</td><td class="value">${item.views}</td></tr>`
    )
    .join("");
}

async function loadBreakdowns() {
  const q = `site_id=${state.currentSiteId}&period=${state.currentPeriod}&limit=8`;
  const [pages, referrers, countries, browsers, os, devices] = await Promise.all([
    api(`/pages?${q}`),
    api(`/referrers?${q}`),
    api(`/countries?${q}`),
    api(`/browsers?${q}`),
    api(`/devices?${q}&dimension=os`),
    api(`/devices?${q}&dimension=device_type`),
  ]);

  renderTable("table-pages", pages.items, (label) => new URL(label, "https://x.invalid").pathname || label);
  renderTable("table-referrers", referrers.items);
  renderTable("table-countries", countries.items);
  renderTable("table-browsers", browsers.items);
  renderTable("table-os", os.items);
  renderTable("table-devices", devices.items);
}

// Refresh the online count every 20 seconds without reloading everything else
setInterval(() => {
  if (state.currentSiteId) loadDashboard().catch(() => {});
}, 20000);

boot();
