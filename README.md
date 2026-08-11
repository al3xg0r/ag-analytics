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
- One tiny `widget.js` script (no cookies, no fingerprinting) is pasted into any website.
- One dashboard (plain HTML/CSS/JS, no build step) lets you view the stats and manage sites.

```
GitHub  →  Cloudflare Worker  →  D1 (data)  +  KV (cache)
                 ▲
                 │
     widget.js on your websites
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
npx wrangler kv namespace create AGANALITICS_CACHE
```

This prints something like:

```
[[kv_namespaces]]
binding = "AGANALITICS_CACHE"
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
binding = "AGANALITICS_CACHE"
id = "PASTE_YOUR_KV_NAMESPACE_ID_HERE"
```

Save the file.

> `wrangler.toml` also ships with a `[triggers]` section (a weekly cleanup job, see section 9) —
> that part is already complete and doesn't need editing, it's unrelated to the two IDs above.

### Step 7 — Create the database tables

```bash
npm run db:migrate:remote
```

This runs `migrations/0001_init.sql` against your new D1 database — it creates the `sites`,
`visits`, `sessions`, `events`, and `admins` tables. You never have to write or run SQL by hand
again.

> **Already deployed before and upgrading?** This file only ever *creates* tables/indexes that
> don't exist yet (`CREATE TABLE IF NOT EXISTS`), so it's always safe to re-run — it won't touch
> or delete your existing data. Re-run it any time you pull a newer version of this project to
> pick up new tables (like `events`, added for the custom-events feature).

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
     src="https://ag-analytics.your-subdomain.workers.dev/widget.js"
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
- **Code** button (next to Delete, under the site selector) shows the tracking snippet for the
  currently selected site at any time — not just right after creating it — with a one-click copy
  button.
- **Delete** removes the selected site and all of its collected data, after a confirmation prompt.
- **Period tabs** switch between Today, Yesterday, 7 days, 30 days, 12 months, and All time.
- **Online now** (top right, with the pulsing dot) is the only number that updates in real time
  (polled every 60 seconds, and never affected by the 15-minute dashboard cache — see section 9);
  everything else refreshes when you change the site or period.
- **Stat cards** each show a small delta underneath (e.g. "↑ 12% vs previous period"), comparing
  the selected period to the immediately preceding window of the same length. There's no
  comparison for "All time", since there's no "previous" window to compare it to.
- **Chart**: hover anywhere on it to see the exact time bucket, page views, and unique visitors at
  that point, with a crosshair and gridlines for scale.
- **⚙ Customize** (top right) lets you show or hide individual panels (Top pages, Referrers,
  Search engines, Campaigns, Countries, Browsers, Operating systems, Devices, Custom events). Your
  choice is saved in the browser, per device.
- **Top pages** entries are clickable links that open the actual page; **Referrers** entries link
  to the referring site and show its favicon (fetched from DuckDuckGo's icon service when you view
  the dashboard — this is a request from your own browser, as the admin, and has no effect on
  visitor privacy or tracking); **Countries** show a flag and the full country name.
- **Campaigns** breaks visits down by `utm_campaign` (see section 6's "UTM" notes below), so you
  can see whether a specific marketing campaign is actually sending traffic.
- **Custom events** shows counts for any event fired via `agEvent(...)` — see the "Custom events"
  box in section 6.
- Known bots, crawlers, and scripted HTTP clients (search engine crawlers, uptime monitors, SEO
  tools, `curl`/`wget`/headless browsers, etc.) are filtered out **before** they're recorded
  anywhere, so they never inflate any of the numbers above. This isn't perfect — no User-Agent
  filter ever is — but it covers the traffic that actually shows up on most sites.
- The **theme toggle** switches between the default light theme and a dark theme; your choice is
  remembered in the browser.

---

## 6. API reference

All endpoints live on your Worker's URL. Admin endpoints require a `Bearer` token obtained
from `/auth/login`, sent as an `Authorization: Bearer <token>` header.

| Method | Path             | Auth   | Purpose                                   |
|--------|------------------|--------|--------------------------------------------|
| POST   | `/event`         | none   | Records one page view (called by widget.js) |
| POST   | `/ping`          | none   | Keeps a visitor's session marked "online" |
| POST   | `/track`         | none   | Records one custom event (called by `agEvent()`) |
| GET    | `/auth/status`   | none   | Tells the frontend if first-run setup is needed |
| POST   | `/auth/setup`    | none*  | Creates the first admin account (works once) |
| POST   | `/auth/login`    | none   | Returns a JWT for the dashboard           |
| GET    | `/dashboard`     | admin  | Summary numbers for a site + period, with a comparison to the previous period (cached) |
| GET    | `/online`        | admin  | Visitors online right now (never cached, cheap) |
| GET    | `/stats`         | admin  | Time-series data for the chart            |
| GET    | `/pages`         | admin  | Top pages                                 |
| GET    | `/countries`     | admin  | Visits by country                         |
| GET    | `/referrers`     | admin  | Visits by referring website (search engines excluded) |
| GET    | `/search-engines`| admin  | Visits by search engine (Google, Bing, DuckDuckGo, etc.) |
| GET    | `/campaigns`     | admin  | Visits by `utm_campaign`                  |
| GET    | `/events`        | admin  | Custom event counts by name               |
| GET    | `/browsers`      | admin  | Visits by browser                         |
| GET    | `/devices`       | admin  | Visits by `device_type`, `os`, or `screen_resolution` (`?dimension=`) |
| GET    | `/sites`         | admin  | List all sites                            |
| POST   | `/sites`         | admin  | Create a site, returns its tracking snippet |
| PATCH  | `/sites/:id`     | admin  | Rename, enable/disable, or regenerate the API key |
| DELETE | `/sites/:id`     | admin  | Delete a site and all of its data         |

`*` `/auth/setup` disables itself automatically once the first admin account exists.

`/collect` and `/heartbeat` are kept working as aliases for `/event` and `/ping` respectively, for
backward compatibility — new deployments and the current `widget.js` use `/event`/`/ping`.

Likewise, the script file itself was renamed from `tracker.js` to `widget.js` (same reasoning:
avoiding ad-blocker filter-list patterns). `/tracker.js` is still served — internally aliased to
`/widget.js` — so any site with an already-embedded old snippet keeps working without changes.
New sites get a `/widget.js` snippet from the **Code**/**+ Add site** buttons.

Every `GET` endpoint above (except `/sites` and `/online`) accepts `site_id` and `period` query
parameters, where `period` is one of `today`, `yesterday`, `7d`, `30d`, `12m`, `all`.

### Custom events

Beyond automatic page-view tracking, `widget.js` exposes a global `agEvent()` function you can
call from your own site's code to track goals/conversions:

```html
<script>
  // No arguments beyond a name: just counts how many times it fired
  agEvent("newsletter_signup");

  // With optional metadata, stored as JSON and visible per-event in the database
  // (not currently broken down by property in the dashboard — just by event name)
  agEvent("purchase", { plan: "pro", amount: 29 });
</script>
```

`agEvent()` is only defined after `widget.js` has loaded, so call it from your own event
handlers (e.g. a form's submit handler or a button's click handler), not at the top of the page.

### UTM tags and campaign tracking

Standard UTM query parameters on any incoming link (`?utm_source=twitter&utm_medium=social&utm_campaign=launch`)
are captured automatically — no setup needed. `utm_campaign` shows up in the **Campaigns** panel;
`utm_source` and `utm_medium` are stored too (visible via direct D1 queries) but don't have their
own dashboard panel yet.

---

## 7. Project structure

```
ag-analytics/
├── wrangler.toml          Cloudflare configuration (D1, KV, static assets, weekly cleanup cron)
├── package.json           npm scripts (dev, deploy, migrate)
├── migrations/
│   └── 0001_init.sql      Database schema
├── src/
│   ├── index.js           Worker entry point / router
│   ├── lib/                Shared helpers (auth, db, kv, parsing)
│   └── routes/              One file per API endpoint
└── public/
    ├── widget.js         The script embedded on tracked websites
    ├── favicon.svg        Dashboard favicon (drop in your own file to replace it)
    ├── index.html         Dashboard shell
    ├── style.css          Dashboard design
    └── app.js             Dashboard logic
```

Anything placed in `public/` is served as-is at the matching path — e.g. `public/favicon.svg`
becomes `https://your-worker.workers.dev/favicon.svg`. To use your own icon, replace that file
(SVG is recommended; keep the same filename, or update the `<link rel="icon">` tag in
`public/index.html` if you rename it).

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
- **Old data is deleted automatically.** A scheduled Worker (see `scheduled()` in `src/index.js`,
  configured via `[triggers]` in `wrangler.toml`) runs weekly and deletes visits, sessions, and
  custom events older than 396 days (13 months — one full month more than the longest dashboard
  period, "12 months"). Cron triggers are free on every Workers plan, including free. Change the
  `RETENTION_DAYS` constant at the top of `src/index.js` to keep data for a shorter or longer
  window, and adjust the schedule itself in `wrangler.toml` (`crons = ["0 3 * * SUN"]`, currently
  every Sunday at 03:00 UTC) if you want it to run more or less often. D1's free plan includes
  5GB of storage — without cleanup, a high-traffic site could eventually approach that limit.
- **Pages are grouped by path, not by full URL.** If your host serves the same site from more than
  one hostname (a custom domain plus an auto-generated preview/gateway URL — common with static
  site hosts and IPFS-style platforms), a visit to `/blog/post` is recorded as `/blog/post`
  regardless of which hostname it came in on, so it doesn't fragment into separate rows in
  **Top pages**. Links in the dashboard are rebuilt using the site's own registered domain.

If you are on Cloudflare's free plan and expect meaningful traffic, KV writes are now the least of
your concerns — watch your **D1 row reads/writes** and **Worker request count** instead, both of
which have generous free-tier allowances for a small-to-medium site.

---

## 10. Troubleshooting: missing or incomplete visits

If you visit your own site and don't see it show up, check these in order:

1. **Wait up to 15 minutes.** Dashboard numbers (visitors, pages, referrers, etc.) are cached for
   15 minutes to save on database reads (see section 9). The visit itself is recorded instantly —
   only the dashboard's *summary* lags. Switching periods or waiting it out will show it.
2. **Ad blockers and privacy extensions.** This is the most common cause of "missing" visits on
   any self-hosted analytics tool. Many blocklists (EasyPrivacy and similar) specifically target
   generic analytics-looking paths and filenames — `/collect`, `tracker.js`, domains/subdomains
   containing words like "analytics", "track", "stat", "pixel". AG Analytics avoids the obvious
   ones out of the box (`/event`/`/ping` instead of `/collect`/`/heartbeat`, `widget.js` instead of
   `tracker.js`), but a browser with aggressive tracking protection (Brave Shields, uBlock Origin
   with strict lists, Safari ITP, some VPN/DNS-level blockers) can still block a `*.workers.dev`
   subdomain if it happens to contain a flagged word (e.g. a Worker literally named
   `ag-analytics.workers.dev`). If that's happening, the most effective fix is serving the Worker
   from **your own custom domain/subdomain** instead of `*.workers.dev` — see "Custom domains"
   below. Open your browser's DevTools → Network tab, reload the page, and check whether a request
   to `/event` actually happens and returns `200`/`204`. If it's blocked or missing entirely,
   that visitor's browser is filtering it — this is expected, privacy-respecting behavior on their
   end, not a bug in the tracker. No self-hosted (or hosted) analytics tool gets 100% of visits for
   this reason — some level of loss from ad blockers is normal.

   One less obvious case worth knowing about: in Chrome-based DevTools, look at the **Type**
   column for the blocked request. If it says **"ping"** rather than "fetch"/"xhr", the request
   was sent with `navigator.sendBeacon()`, which the browser itself tags as that resource type —
   and several ad-blocker configurations (Brave Shields, some uBlock Origin lists) block *all*
   `ping`-type requests outright, regardless of URL or domain. `widget.js` uses a plain
   `fetch(..., { keepalive: true })` instead of `sendBeacon()` specifically to avoid this
   category-based blocking; if you're testing against an older cached copy of `widget.js` you
   may still see `ping`-type requests — hard-refresh (Ctrl/Cmd+Shift+R) to fetch the current one.
3. **The tracking snippet isn't actually live on the page.** Some site builders/CMSs only save
   custom code in a draft or preview, not the published site. View the page's source (Ctrl+U /
   Cmd+Option+U) on the live URL and confirm the `<script>` tag from **Code** in the dashboard
   sidebar is actually present.
4. **The site is served from more than one domain/URL.** If your host exposes both a custom domain
   and an auto-generated preview/gateway URL (common with static-site and IPFS-style hosts), and a
   visit happens on the second one, it is still recorded — just under that URL. Check whether the
   visit appears under a different entry in **Top pages**/referrers before assuming it wasn't
   recorded at all.

### Custom domains (recommended)

Serving AG Analytics from `*.workers.dev` works, but that shared domain is a generic target for
ad-blocker filter lists. Pointing your own subdomain at the Worker instead — e.g. `st.example.com`
— makes it look like any other first/third-party subdomain of your own site, which meaningfully
reduces (though never eliminates) ad-blocker false positives.

1. Your domain needs to be on Cloudflare already (DNS managed through Cloudflare) — if you're
   using Cloudflare Workers at all, it likely already is.
2. Cloudflare Dashboard → **Workers & Pages → your Worker → Settings → Domains & Routes →
   Custom Domains → Add**. Enter a subdomain, e.g. `st.example.com` (avoid words like "analytics",
   "track", "stat", "pixel", "metric" in the subdomain itself for the same reason).
3. Cloudflare provisions the DNS record and TLS certificate automatically — this can take a minute.
4. From then on, visit the dashboard at your new custom domain instead of the `*.workers.dev` one.
   Every tracking snippet generated from the **Code**/**+ Add site** buttons automatically uses
   whatever domain you're currently viewing the dashboard from, so no code changes are needed —
   just update the `<script src="...">` on each of your tracked sites to point at the new domain.
5. The old `*.workers.dev` URL keeps working side by side unless you explicitly remove it, so you
   can migrate sites one at a time with no downtime.

---

## 11. Security

- All SQL queries are prepared statements — no string concatenation, no SQL injection surface.
- Passwords are hashed with PBKDF2 (SHA-256, 100,000 iterations, random salt per password).
- Dashboard sessions are signed JWTs (HMAC-SHA256) using your own `JWT_SECRET`.
- Site API keys are only used server-side to identify a site's tracker script; they are never
  treated as a secret the visitor's browser must protect (the `data-site` id is public by design,
  just like every analytics tracker's site id).
- CORS is open on `/event` and `/ping` since any website using the tracker must be able
  to call them; every admin endpoint requires a valid token regardless of origin.

---

## 12. Roadmap (v2 ideas)

Live visitors map, an Events API, Goals/Conversions, uptime monitoring, Telegram and email
notifications, a public dashboard mode, and framework plugins (WordPress, Hugo, Astro,
Next.js, Vue, React).

---

## 13. License

MIT License — use it, fork it, self-host it, modify it freely.

---

> **Minimum configuration. Maximum control. Full ownership of your data.**
