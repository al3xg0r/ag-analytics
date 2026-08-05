# AG Analytics

Lightweight • Privacy-first • Serverless • Multi-site web analytics, built entirely on Cloudflare.

No VPS. No Docker. No PHP. No MySQL. No Google Analytics. No cookies.
Just a Cloudflare Worker, a D1 database, and a KV cache.

---

## 1. What this project is

AG Analytics is a self-hosted alternative to Google Analytics / Umami / GoatCounter, designed
to be deployed by someone with **zero Cloudflare experience** in about 5 minutes.

- One Worker handles the tracking API, the admin API, and serves the dashboard.
- One D1 database (SQLite, serverless) stores everything.
- One KV namespace caches expensive dashboard queries for 15 minutes.
- One tiny `tracker.js` script (no cookies, no fingerprinting) is pasted into any website.
- One dashboard (plain HTML/CSS/JS, no build step) lets you view the stats and manage sites.

```
GitHub  →  Cloudflare Worker  →  D1 (data)  +  KV (cache)
                 ▲
                 │
     tracker.js on your websites
```

### What data is collected

URL, page title, referrer, browser, OS, device type, screen resolution, language, timezone,
country (from Cloudflare's edge, no external GeoIP call needed), UTM tags, and timestamp.

### What is never collected

Cookies, browser fingerprinting, canvas/audio fingerprinting, form contents, passwords,
email addresses, or precise GPS location. The visitor's IP address is used for one millisecond
to compute an anonymous, **daily-rotating** hash and is never written to the database.

---

## 2. Before you start

You will need:

1. A free [Cloudflare account](https://dash.cloudflare.com/sign-up).
2. [Node.js](https://nodejs.org) 18 or newer installed on your computer.
3. A terminal (Command Prompt, PowerShell, or macOS/Linux Terminal — any of these works).
4. This project's code, either forked on GitHub or downloaded as a folder.

You do **not** need to know how to code to follow these steps — just copy and paste the commands.

---

## 3. Step-by-step deployment

### Step 1 — Get the code onto your computer

If you forked this repository on GitHub:

```bash
git clone https://github.com/YOUR-USERNAME/ag-analytics.git
cd ag-analytics
```

If you downloaded a ZIP file instead, unzip it and open a terminal inside the resulting folder.

### Step 2 — Install the tools

```bash
npm install
```

This installs `wrangler`, Cloudflare's command-line tool, which is what actually creates and
deploys everything on your Cloudflare account.

### Step 3 — Log in to Cloudflare

```bash
npx wrangler login
```

A browser tab opens. Click **Allow** to connect Wrangler to your Cloudflare account.

### Step 4 — Create the database

```bash
npx wrangler d1 create ag_analytics_db
```

This prints something like:

```
[[d1_databases]]
binding = "DB"
database_name = "ag_analytics_db"
database_id = "11111111-2222-3333-4444-555555555555"
```

Copy the `database_id` value.

### Step 5 — Create the cache namespace

```bash
npx wrangler kv namespace create CACHE
```

This prints something like:

```
[[kv_namespaces]]
binding = "CACHE"
id = "abcdef1234567890abcdef1234567890"
```

Copy the `id` value.

### Step 6 — Fill in `wrangler.toml`

Open `wrangler.toml` in any text editor and replace the two placeholder values:

```toml
[[d1_databases]]
binding = "DB"
database_name = "ag_analytics_db"
database_id = "PASTE_YOUR_D1_DATABASE_ID_HERE"

[[kv_namespaces]]
binding = "CACHE"
id = "PASTE_YOUR_KV_NAMESPACE_ID_HERE"
```

Save the file.

### Step 7 — Create the database tables

```bash
npm run db:migrate:remote
```

This runs `migrations/0001_init.sql` against your new D1 database — it creates the `sites`,
`visits`, `sessions`, and `admins` tables. You never have to write or run SQL by hand again.

### Step 8 — Set your login secret

The dashboard signs login sessions with a secret key. Generate one and store it:

```bash
npx wrangler secret put JWT_SECRET
```

When prompted, paste any long random string (32+ characters). A quick way to generate one:

- macOS/Linux: `openssl rand -base64 32`
- Windows PowerShell: `[Convert]::ToBase64String((1..32|%{Get-Random -Max 256}))`

### Step 9 — Deploy

```bash
npm run deploy
```

Wrangler prints a URL such as `https://ag-analytics.your-subdomain.workers.dev`. That is your
entire analytics platform — API, dashboard, and tracker script, all on one URL.

---

## 4. First run

1. Open your Worker's URL in a browser.
2. You will land on **Create your admin account** — this only appears once. Choose a login and
   a password (minimum 8 characters) and submit.
3. You are now signed in to the dashboard.
4. Click **+ Add site**, enter a name and domain, and submit.
5. Copy the tracking snippet shown, for example:

   ```html
   <script defer
     src="https://ag-analytics.your-subdomain.workers.dev/tracker.js"
     data-site="my-site-ab12cd">
   </script>
   ```

6. Paste it into your website's HTML, right before the closing `</body>` tag.
7. Visit your website once. Within a few seconds, refresh the AG Analytics dashboard — you
   should see 1 visitor and 1 page view for "Today".

That's it. No terminal, no SQL, no Docker, no VPS from this point on.

---

## 5. Using the dashboard

- **Site selector** (top of the sidebar) switches between every site you've added.
- **Period tabs** switch between Today, Yesterday, 7 days, 30 days, 12 months, and All time.
- **Online now** (top right, with the pulsing dot) is the only number that updates in real time
  (polled every 60 seconds); everything else refreshes when you change the site or period.
- **Top pages / Referrers / Search engines / Countries / Browsers / Operating systems / Devices**
  are ranked tables for the selected site and period. Search engine traffic (Google, Bing,
  DuckDuckGo, Brave Search, Yahoo, Yandex) is shown in its own panel, separate from regular
  referring websites, so you can see at a glance where search traffic comes from.
- The **theme toggle** switches between the default light theme and a dark theme; your choice is
  remembered in the browser.

---

## 6. API reference

All endpoints live on your Worker's URL. Admin endpoints require a `Bearer` token obtained
from `/auth/login`, sent as an `Authorization: Bearer <token>` header.

| Method | Path             | Auth   | Purpose                                   |
|--------|------------------|--------|--------------------------------------------|
| POST   | `/collect`       | none   | Records one page view (called by tracker.js) |
| POST   | `/heartbeat`     | none   | Keeps a visitor's session marked "online" |
| GET    | `/auth/status`   | none   | Tells the frontend if first-run setup is needed |
| POST   | `/auth/setup`    | none*  | Creates the first admin account (works once) |
| POST   | `/auth/login`    | none   | Returns a JWT for the dashboard           |
| GET    | `/dashboard`     | admin  | Summary numbers for a site + period (cached) |
| GET    | `/online`        | admin  | Visitors online right now (never cached, cheap) |
| GET    | `/stats`         | admin  | Time-series data for the chart            |
| GET    | `/pages`         | admin  | Top pages                                 |
| GET    | `/countries`     | admin  | Visits by country                         |
| GET    | `/referrers`     | admin  | Visits by referring website (search engines excluded) |
| GET    | `/search-engines`| admin  | Visits by search engine (Google, Bing, DuckDuckGo, etc.) |
| GET    | `/browsers`      | admin  | Visits by browser                         |
| GET    | `/devices`       | admin  | Visits by `device_type`, `os`, or `screen_resolution` (`?dimension=`) |
| GET    | `/sites`         | admin  | List all sites                            |
| POST   | `/sites`         | admin  | Create a site, returns its tracking snippet |
| PATCH  | `/sites/:id`     | admin  | Rename, enable/disable, or regenerate the API key |
| DELETE | `/sites/:id`     | admin  | Delete a site and all of its data         |

`*` `/auth/setup` disables itself automatically once the first admin account exists.

Every `GET` endpoint above (except `/sites` and `/online`) accepts `site_id` and `period` query
parameters, where `period` is one of `today`, `yesterday`, `7d`, `30d`, `12m`, `all`.

---

## 7. Project structure

```
ag-analytics/
├── wrangler.toml          Cloudflare configuration (D1, KV, static assets)
├── package.json           npm scripts (dev, deploy, migrate)
├── migrations/
│   └── 0001_init.sql      Database schema
├── src/
│   ├── index.js           Worker entry point / router
│   ├── lib/                Shared helpers (auth, db, kv, parsing)
│   └── routes/              One file per API endpoint
└── public/
    ├── tracker.js         The script embedded on tracked websites
    ├── index.html         Dashboard shell
    ├── style.css          Dashboard design
    └── app.js             Dashboard logic
```

---

## 8. Local development

```bash
npm run db:migrate:local   # creates the schema in a local, on-disk D1 copy
npm run dev                 # starts the Worker on http://localhost:8787
```

`wrangler dev` runs the whole stack (Worker + local D1 + local KV) on your machine, so you can
test changes before deploying.

---

## 9. Performance, limits, and staying inside the free plan

Designed to comfortably handle up to **100,000 page views per day** on Cloudflare's free/paid
Workers plan without any architecture changes.

An earlier version of this project tracked "online now" visitors by writing to KV on every
heartbeat (roughly every 30 seconds per open tab). Cloudflare's free plan allows only
**1,000 KV writes per day per namespace**, so even a handful of visitors could exhaust that
quota within minutes — the online counter would silently stop updating, and everything else
sharing that KV namespace would be affected too. That has been fixed:

- **Online tracking now lives entirely in D1** (`sessions.last_seen`), not KV. D1's free plan
  allows 100,000 writes and 5,000,000 reads per day, so this is essentially free at small scale.
  No KV writes happen for online tracking at all anymore.
- **The tracker's heartbeat interval was increased from 30s to 45s**, further reducing write volume.
- **Dashboard aggregate queries (visitors, pages, referrers, etc.) are cached in KV for 15 minutes**
  by default (up from 5). You can change this in `src/lib/kv.js` (`CACHE_TTL_SECONDS`) — raise it
  further if you're close to a quota, lower it if you want fresher numbers and have headroom.
- **The dashboard only polls `/online`** (a single cheap query) every 60 seconds while open; it no
  longer re-fetches the full dashboard just to refresh that one number.

If you are on Cloudflare's free plan and expect meaningful traffic, KV writes are now the least of
your concerns — watch your **D1 row reads/writes** and **Worker request count** instead, both of
which have generous free-tier allowances for a small-to-medium site.

---

## 10. Security

- All SQL queries are prepared statements — no string concatenation, no SQL injection surface.
- Passwords are hashed with PBKDF2 (SHA-256, 100,000 iterations, random salt per password).
- Dashboard sessions are signed JWTs (HMAC-SHA256) using your own `JWT_SECRET`.
- Site API keys are only used server-side to identify a site's tracker script; they are never
  treated as a secret the visitor's browser must protect (the `data-site` id is public by design,
  just like every analytics tracker's site id).
- CORS is open on `/collect` and `/heartbeat` since any website using the tracker must be able
  to call them; every admin endpoint requires a valid token regardless of origin.

---

## 11. Roadmap (v2 ideas)

Live visitors map, an Events API, Goals/Conversions, uptime monitoring, Telegram and email
notifications, a public dashboard mode, and framework plugins (WordPress, Hugo, Astro,
Next.js, Vue, React).

---

## 12. License

MIT License — use it, fork it, self-host it, modify it freely.

---

> **Minimum configuration. Maximum control. Full ownership of your data.**
