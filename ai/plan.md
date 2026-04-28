# Yf_TrendTop — Build Plan (Resumable)

> **Purpose:** ordered execution plan for an agent (or the user) to build and ship Yf_TrendTop v1. Each step is **atomic and idempotent** so execution can be resumed at any point if interrupted.
>
> **Read first:** [`context.md`](./context.md) — the architectural source of truth. This plan implements what context.md describes.
>
> **How to resume:** scan the checkboxes below from top to bottom. The first unchecked item is where to pick up. Each step has a "Verify" line so you can confirm it actually completed even if the previous chat ended mid-step.

---

## Status legend

- `[ ]` not started
- `[~]` in progress (partially done — see notes)
- `[x]` complete and verified

# yftt — Build Plan (Resumable)

...

- [x] **0.1 Repo created on GitHub:** `https://github.com/tsiitd/yftt` (public, personal account)
  - Verify: `gh repo view tsiitd/yftt` succeeds
- [x] **0.2 Local folder is a git repo with origin pointing to personal repo**
  - Verify: `cd D:/trading_analysis/yftt && git remote -v` shows `origin = https://github.com/tsiitd/yftt.git`
- [x] **0.3 `.gitignore` written** (Node-aware, ignores `ai/raw_idea.md` and secrets)
- [x] **0.4 `ai/context.md` written** (full architectural spec)
- [x] **0.5 `ai/plan.md` written** (this file)

### Pre-flight environment assumptions

The build agent should assume (and verify if anything fails):
- **OS:** Windows 11, bash shell (Git Bash). Use forward-slash paths in commands.
- **`git`** is installed and the local repo's `origin` already points to `tsiitd/Yf_TrendTop`.
- **`gh` CLI** is installed and authenticated to user `tsiitd` (confirm via `gh auth status`). If not authenticated, stop and ask the user to run `gh auth login`.
- **Node.js** v20+ installed locally.
- **`ai/raw_idea.md`** exists and is gitignored — leave it alone. Do not commit it.

---

## Phase 1 — Project skeleton & dependencies

- [x] **1.1 Verify Node.js is installed locally**
  - Run: `node --version` (need v20+)
- [x] **1.2 Initialize `package.json`**
  - Run from project root: `npm init -y`
  - Set `"type": "module"`, `"private": true`, and add refresh scripts.
- [x] **1.3 Install `yahoo-finance2`**
  - Run: `npm install yahoo-finance2`
- [x] **1.4 Smoke-test `yahoo-finance2` once**
  - Verified: `node -e "import('yahoo-finance2').then(m => { const yf = new m.default(); return yf.trendingSymbols('US').then(r => console.log(r.quotes.slice(0,3))); })"`
- [x] **1.5 Create the directory skeleton**
  - Run: `mkdir -p assets data/live scripts/lib .github/workflows`

---

## Phase 2 — Backend / data refresh scripts

- [x] **2.1 `scripts/lib/yahoo.mjs`** — shared YahooFinance singleton
  - `import YahooFinance from 'yahoo-finance2'; export const yahooFinance = new YahooFinance();`
- [x] **2.2 `scripts/lib/sources.mjs`** — static config of the two sources
- [x] **2.3 `scripts/lib/fetch_list.mjs`** — fetch a source list + quote data → live JSON
  1. Call `SOURCES[key].fetcher(count)` → `[{rank, ticker}]`
  2. Batch-call `yahooFinance.quote(tickers)` → array of quotes
  3. Map each ticker to a row: `{ rank, ticker, name, current_price, market_cap_bn, outside_rth_price, outside_rth_side, outside_rth_time_iso, yahoo_url }`
  4. Outside-RTH logic: pick whichever of `postMarketTime` / `preMarketTime` is larger (Unix timestamp); set `side` to `"Pre"` or `"Post"`.
- [x] **2.4 `scripts/lib/fetch_historic.mjs`** — fetch history + compute the 8 historic fields per ticker
  - Updated to include: `high_52wk_t1/t2/t3`, `t1_close`, `t2_close`, `yesterday_was_52w_high`, `t2_was_52w_high`.
  - Corrected slice logic for 252-day windows.
- [x] **2.5 `scripts/lib/trading_date.mjs`** — derive T-1D trading date from a `historical()` response
- [x] **2.6 `scripts/lib/git_push.mjs`** — commit + push `data/` if any file changed
  - Uses `execFileSync` to avoid shell injection.
  - Configures git identity; skips entirely when not in `GITHUB_ACTIONS`.
- [x] **2.7 `scripts/refresh_live.mjs`** — INTRADAY entry point
- [x] **2.8 `scripts/refresh_historic.mjs`** — EOD entry point
- [x] **2.9 Local end-to-end test**
  - EOD then live: both ran cleanly. All three JSON files match schema.

---

## Phase 3 — Frontend

- [x] **3.1 `index.html`** — the single page
  - Includes Pico.css from CDN.
  - `<meta name="robots" content="noindex">`.
  - Inline `<script>` in `<head>` sets `data-theme` from localStorage.
  - Theme toggle button, Tab buttons, Banner area.
  - Controls row: Refresh button, Last updated, Filter group, Column picker.
  - `<table>` with 16-column `<thead>` (Ticker sticky-first).
- [x] **3.2 `assets/style.css`** — table-specific tweaks
  - Sticky first column + sticky header.
  - Sort indicator arrows on `th[data-col]` via `::after`.
  - Tab styling, Banner styles (warning/neutral).
  - Outside-RTH "Pre" (blue) / "Post" (amber) pills.
  - Mobile-first: `overflow-x: auto` table wrapper.
  - Header wrapping (`white-space: normal`) + min/max-width to reduce column widths.
- [x] **3.3 `assets/script.js`** — application logic
  - STATE: per-tab sort (Rank ASC default), per-tab filters, hidden columns set.
  - `loadData(tab, force)`: parallel fetch with cache-busting.
  - `joinAndFilter(tab)`: merges 16 columns, computes `distance_pct`, `change_pct`, `ext_hr_change_pct`.
  - `renderTable(rows, tab)`: dynamic visibility based on `hiddenCols`, color classes with EPS tolerance.
  - `setupTabs/Refresh/Filters/Sort/Theme/ColPicker()` all wired up.
  - Refresh button reloads BOTH tabs.
  - Logic verified: EPS tolerance handles negative zero; flags colored blue/grey.
- [x] **3.4 `robots.txt`** — Disallow: /
- [x] **3.5 `README.md`** — minimal project landing page.

---

## Phase 3.5 — Debug & Polish (Completed)

- [x] **3.5.1 Enhanced Historic Data** — T-2D Close, 52w High T-3D, T-2D flag.
- [x] **3.5.2 Column Picker** — Dropdown menu to toggle visibility of all 16 columns.
- [x] **3.5.3 Advanced Filters** — "Exclude Yest 52w Hi" and "Exclude T-2D 52w Hi" (default OFF).
- [x] **3.5.4 Visual Polish** 
  - Blue/Grey flag icons (✓/✗).
  - EPS tolerance (0.00001) for green/orange/red coloring (no more red 0.00%).
  - Header wrapping to minimize column width.
  - Concise header names (Chg %, Ext %, 52w Hi).
- [x] **3.5.5 Control Layout** — Refresh button left-aligned, filters grouped.

---

## Phase 4 — GitHub Actions workflows

- [x] **4.1 `.github/workflows/refresh-eod.yml`**
  - Triggers: `schedule: cron '0 1 * * 1-5'` + `workflow_dispatch`.
  - Concurrency: `group: refresh, cancel-in-progress: false`.
  - Steps: checkout → setup-node@v4 → `npm ci` → `npm run refresh:eod`.
- [x] **4.2 `.github/workflows/refresh-intraday.yml`**
  - Triggers: `schedule: cron '*/15 2-21 * * 1-5'`.
  - Steps: checkout → setup-node@v4 → `npm ci` → `npm run refresh:live`.
- [x] **4.3 Confirm Action permissions allow commit+push**
  - Verified: `permissions: contents: write` included in YAML.

---

## Phase 5 — First commit & deploy

- [x] **5.1 Stage and commit everything**
  - `git status` reviewed, `git add .` (feedback.md manually excluded/managed).
- [x] **5.2 Push to origin**
  - `git push -u origin main`.
- [x] **5.3 Bootstrap data: manually trigger EOD workflow**
  - `gh workflow run refresh-eod.yml` succeeded.
- [x] **5.4 Trigger first intraday run**
  - `gh workflow run refresh-intraday.yml` succeeded.
- [x] **5.5 Enable GitHub Pages**
  - Branch: main, Folder: /(root).

---

## Phase 6 — Verification & polish

- [ ] **6.1 Open the live site on a real mobile device** — verify responsiveness, sticky column, tabs, sort, filter, theme toggle, refresh button, column picker.
- [ ] **6.2 Verify smart-stale banner**
  - During market hours: check for 1hr+ warning.
  - Outside market hours: check for "Markets closed" banner.
- [ ] **6.3 Sanity-check 52wk high values** for 3-5 tickers vs Yahoo Finance website.
- [ ] **6.4 Confirm hourly rhythm**: check next morning that intraday + EOD ran on schedule.

---

## Out-of-scope reminder

These are NOT in v1 (per context.md §9). Do NOT scope-creep:
- Custom domain, Login / auth, Force-refresh button, Historical snapshots, Email/push alerts.

---

## Rollback / recovery notes

- **If a workflow run fails:** check `gh run view --log <run-id>`.
- **If data gets corrupted:** delete and manually trigger `refresh-eod.yml`.
- **If a deploy breaks the site:** `git revert HEAD && git push`.
