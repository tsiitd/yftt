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

---

## Phase 0 — Already done (do not redo)

- [x] **0.1 Repo created on GitHub:** `https://github.com/tsiitd/Yf_TrendTop` (public, personal account)
  - Verify: `gh repo view tsiitd/Yf_TrendTop` succeeds
- [x] **0.2 Local folder is a git repo with origin pointing to personal repo**
  - Verify: `cd D:/trading_analysis/Yf_TrendTop && git remote -v` shows `origin = https://github.com/tsiitd/Yf_TrendTop.git`
- [x] **0.3 `.gitignore` written** (Node-aware, ignores `ai/raw_idea.md` and secrets)
- [x] **0.4 `ai/context.md` written** (full architectural spec)
- [x] **0.5 `ai/plan.md` written** (this file)

### Pre-flight environment assumptions

The build agent should assume (and verify if anything fails):
- **OS:** Windows 11, bash shell (Git Bash). Use forward-slash paths in commands.
- **`git`** is installed and the local repo's `origin` already points to `tsiitd/Yf_TrendTop`.
- **`gh` CLI** is installed and authenticated to user `tsiitd` (confirm via `gh auth status`). If not authenticated, stop and ask the user to run `gh auth login`.
- **Node.js** may or may not be installed locally — Phase 1.1 verifies. If missing, ask the user to install Node 20 LTS before proceeding (don't try to install it for them).
- **`ai/raw_idea.md`** exists and is gitignored — leave it alone. Do not commit it.

---

## Phase 1 — Project skeleton & dependencies

- [x] **1.1 Verify Node.js is installed locally**
  - Run: `node --version` (need v20+)
  - If missing: install Node.js LTS from nodejs.org

- [x] **1.2 Initialize `package.json`**
  - Run from project root: `npm init -y`
  - Then edit `package.json` to set:
    - `"name": "yf-trendtop"`
    - `"type": "module"` (so `.mjs` and `.js` both use ES modules)
    - `"private": true`
    - Add `"scripts"`:
      - `"refresh:live": "node scripts/refresh_live.mjs"`
      - `"refresh:eod": "node scripts/refresh_historic.mjs"`
  - Verify: `cat package.json` shows the above

- [x] **1.3 Install `yahoo-finance2`**
  - Run: `npm install yahoo-finance2`
  - Verify: `node_modules/yahoo-finance2/` exists; `package-lock.json` exists

- [x] **1.4 Smoke-test `yahoo-finance2` once**
  - NOTE: v3 API — must use `new YahooFinance()` (i.e. `new m.default()`), not static methods.
  - Verified: `node -e "import('yahoo-finance2').then(m => { const yf = new m.default(); return yf.trendingSymbols('US').then(r => console.log(r.quotes.slice(0,3))); })"` printed 3 tickers.

- [x] **1.5 Create the directory skeleton**
  - Run: `mkdir -p assets data/live scripts/lib .github/workflows`
  - Verify: all directories exist

---

## Phase 2 — Backend / data refresh scripts

> **All scripts use ES module syntax (`import`/`export`), `.mjs` extension, top-level `await` is OK.**
>
> **Modularity principle:** each file has one job. No copy-paste between entry points. See full lib structure below.
>
> **yahoo-finance2 v3 API note:** v3 (installed: ^3.14.0) no longer exports static methods. You must instantiate: `import YahooFinance from 'yahoo-finance2'; const yahooFinance = new YahooFinance();`. All lib modules import the shared instance from `lib/yahoo.mjs` — they do NOT instantiate their own.

### Revised `scripts/lib/` file structure (6 files, each single-responsibility)

```
scripts/lib/
├── yahoo.mjs          # exports singleton YahooFinance instance — imported by all other libs
├── sources.mjs        # static config: source IDs, labels, URLs, counts, fetcher functions
├── fetch_list.mjs     # given a source key → fetches ticker list + quote() data → returns live JSON object
├── fetch_historic.mjs # given tickers[] → fetches historical closes → computes + returns historic fields
├── trading_date.mjs   # derives the T-1D trading date string from a historical() response
└── git_push.mjs       # shared git commit+push helper (used by both entry points — not duplicated)
```

Why two new files vs the original plan:
- **`yahoo.mjs`**: v3 requires instantiation; a shared singleton avoids each module doing `new YahooFinance()` and keeps the upgrade path in one place.
- **`git_push.mjs`**: the commit+push logic is identical in both `refresh_live.mjs` and `refresh_historic.mjs`. Extracting it means one place to fix if the git strategy changes.

---

- [x] **2.1 `scripts/lib/yahoo.mjs`** — shared YahooFinance singleton
  - `import YahooFinance from 'yahoo-finance2'; export const yahooFinance = new YahooFinance();`
  - Verify: `node -e "import('./scripts/lib/yahoo.mjs').then(m => console.log(typeof m.yahooFinance.trendingSymbols))"` prints `function`

- [x] **2.2 `scripts/lib/sources.mjs`** — static config of the two sources
  - NOTE: `screener()` in v3 requires `{}, { validateResult: false }` as 2nd/3rd args — schema is stale in the package but data is correct.
  - Verify: passed ✓

- [x] **2.3 `scripts/lib/fetch_list.mjs`** — fetch a source list + quote data → live JSON
  - Imports `yahooFinance` from `./yahoo.mjs` and `SOURCES` from `./sources.mjs`
  - Steps:
    1. Call `SOURCES[key].fetcher(count)` → `[{rank, ticker}]`
    2. Batch-call `yahooFinance.quote(tickers)` → array of quotes
    3. Map each ticker to a row: `{ rank, ticker, name, current_price, market_cap_bn, outside_rth_price, outside_rth_side, outside_rth_time_iso, yahoo_url }`
    4. Outside-RTH logic: pick whichever of `postMarketTime` / `preMarketTime` is larger (Unix timestamp); set `side` to `"Pre"` or `"Post"`; if neither exists, set price/side/time to `null`
  - Returns: full live JSON object `{ source_id, source_label, source_url, last_updated_iso, fetched_count, rows }`
  - Verify: `node -e "import('./scripts/lib/fetch_list.mjs').then(m => m.fetchList('trending').then(r => console.log(r.rows.slice(0,2))))"` prints 2 rows with all fields

- [ ] **2.4 `scripts/lib/fetch_historic.mjs`** — fetch history + compute the 3 historic fields per ticker
  - NOTE: `historical()` is deprecated in v3 (Yahoo removed underlying API); library auto-maps to `chart()`. Works correctly.
  - NOTE: `tradingDateForCache` is derived internally from the fetched rows — no external parameter needed.
  - Verify: passed ✓ (NVDA: high=216.61, t1_close=216.61, yesterday_was_52w_high=true; TSLA: high=489.88)

- [x] **2.5 `scripts/lib/trading_date.mjs`** — derive T-1D trading date from a `historical()` response
  - Verify: passed ✓

- [x] **2.6 `scripts/lib/git_push.mjs`** — commit + push `data/` if any file changed
  - Uses `execFileSync` (not execSync) to avoid shell injection on the commit message.
  - Configures git identity before committing (required on Actions runners).
  - Skips entirely when `GITHUB_ACTIONS` env var is not set — safe for local test runs.
  - Verify: passed ✓

- [x] **2.7 `scripts/refresh_live.mjs`** — INTRADAY entry point
  - Verify: `npm run refresh:live` → trending: 25 tickers, most_actives: 50 tickers, no top-up needed ✓

- [x] **2.8 `scripts/refresh_historic.mjs`** — EOD entry point
  - Verify: `npm run refresh:eod` → 71 tickers cached (deduped) ✓
  - Warnings for MANE (57 days) and XE (2 days) — expected for recently listed stocks, not errors.

- [x] **2.9 Local end-to-end test**
  - EOD then live: both ran cleanly.
  - All three JSON files match schema in context.md §6.
  - NVDA 52wk high = 216.61 (plausible — matches current price, yesterday was the 52wk high).

---

## Phase 3 — Frontend

- [x] **3.1 `index.html`** — the single page
  - Includes Pico.css from CDN: `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">`
  - `<meta name="robots" content="noindex">`
  - Inline `<script>` in `<head>` sets `data-theme` from localStorage before CSS loads (avoids FOUC)
  - Theme toggle button (top right, icon-only)
  - Tab buttons: "Trending (25)" (default) | "Most Active (50)"
  - Banner area (for stale / market-closed messages)
  - "Last updated" text + Refresh button + filter toggle in controls row
  - Filter: "Exclude if Yesterday was 52wk High" checkbox (default ON, per-tab state)
  - `<table>` with 11-column `<thead>` (Ticker sticky-first); `<tbody>` populated by JS
  - `<script src="assets/script.js" type="module"></script>`
  - Verify: server running at http://localhost:3000 — all assets return 200 ✓

- [x] **3.2 `assets/style.css`** — table-specific tweaks
  - Sticky first column: `position: sticky; left: 0; background: var(--pico-background-color); box-shadow`
  - Sort indicator arrows on `th[data-col]` via `::after` pseudo-element (↕ / ↑ / ↓)
  - Tab styling (active: primary background; inactive: outline border)
  - Banner styles: `.banner.warning` (amber rgba bg + left border), `.banner.neutral` (grey rgba bg)
  - Outside-RTH "Pre" (blue pill) / "Post" (amber pill) styling
  - Mobile-first: `overflow-x: auto` table wrapper, `white-space: nowrap` on table
  - Verify: visual check ✓

- [x] **3.3 `assets/script.js`** — application logic
  - STATE: per-tab sort (`distance_pct` desc default) + per-tab `filterYestHigh` (true default)
  - `loadData(tab)`: parallel fetch of live + historic; both cached in STATE
  - `joinAndFilter(tab)`: merges historic fields, computes `distance_pct`, applies distance + yest-high filters
  - `renderTable(rows, tab)`: DocumentFragment build, RTH pill HTML, distance colour classes
  - `sortRows(rows, tab)`: handles booleans, nulls, strings, numbers
  - `checkStale(tab)`: warning banner if >1hr old AND `isMarketOpen()`; neutral "Markets closed" banner otherwise
  - `isMarketOpen()`: DST-safe via `Intl.DateTimeFormat` with `timeZone: 'America/New_York'`
  - `setupTabs/Refresh/Filter/Sort/Theme()` all wired up; tab switch syncs checkbox + sort headers
  - Error handling: try/catch in all async paths shows error message in table
  - Logic verified: 9 most_actives stocks pass distance filter (all `yesterday_was_52w_high: true`); with filter ON → empty state; with filter OFF → 9 rows ✓

- [x] **3.4 `robots.txt`**
  - Content: `User-agent: *` / `Disallow: /`
  - Verify: file exists at repo root ✓

- [x] **3.5 `README.md`** — minimal: project description, live URL, auto-update note, link to context.md
  - Verify: file exists ✓

---

## Phase 4 — GitHub Actions workflows

- [ ] **4.1 `.github/workflows/refresh-eod.yml`**
  - Triggers: `schedule: cron '0 1 * * 1-5'` + `workflow_dispatch`
  - Concurrency: `group: refresh, cancel-in-progress: false`
  - Steps: checkout → setup-node@v4 (node 20) → `npm ci` → `npm run refresh:eod` → commit + push if `data/` changed (use `stefanzweifel/git-auto-commit-action` or inline git commands)
  - Verify: file syntax valid (`gh workflow list` after push will show it)

- [ ] **4.2 `.github/workflows/refresh-intraday.yml`**
  - Triggers: `schedule: cron '*/15 2-21 * * 1-5'` + `workflow_dispatch`
  - Same concurrency group as EOD
  - Steps: checkout → setup-node@v4 → `npm ci` → `npm run refresh:live` → commit + push if changed
  - Verify: file syntax valid

- [ ] **4.3 Confirm Action permissions allow commit+push**
  - In `gh repo view tsiitd/Yf_TrendTop --json defaultBranchRef`, confirm the workflows have `permissions: contents: write` either inline in the YAML or via repo Settings → Actions → Workflow permissions = "Read and write"

---

## Phase 5 — First commit & deploy

- [ ] **5.1 Stage and commit everything**
  - `git status` to review
  - `git add .` (carefully — `.gitignore` should exclude `node_modules` and `ai/raw_idea.md`)
  - `git commit -m "Initial scaffold: data refresh scripts, frontend, workflows"` (do NOT include Co-Authored-By unless user requests)
  - Verify: `git log` shows the commit

- [ ] **5.2 Push to origin**
  - `git push -u origin main`
  - Verify: `gh repo view tsiitd/Yf_TrendTop --web` opens repo with files visible

- [ ] **5.3 Bootstrap data: manually trigger EOD workflow**
  - `gh workflow run refresh-eod.yml`
  - Wait ~30s
  - `gh run list --workflow=refresh-eod.yml --limit 1` should show success
  - Verify: `data/historic_highs.json` exists in the repo with ~75 tickers

- [ ] **5.4 Trigger first intraday run**
  - `gh workflow run refresh-intraday.yml`
  - Verify: `data/live/trending.json` and `data/live/most_actives.json` exist

- [ ] **5.5 Enable GitHub Pages**
  - `gh api repos/tsiitd/Yf_TrendTop/pages -X POST -f source[branch]=main -f source[path]=/` (or via Settings → Pages → Branch: main, root)
  - Wait ~1 min for first deployment
  - Verify: `https://tsiitd.github.io/Yf_TrendTop/` loads with the table populated

---

## Phase 6 — Verification & polish

- [ ] **6.1 Open the live site on a real mobile device** — verify responsiveness, sticky column, tabs, sort, filter, theme toggle, refresh button
- [ ] **6.2 Verify smart-stale banner**
  - During market hours: deliberately wait >1hr without refresh → banner should appear
  - Outside market hours: should see neutral "Markets closed" banner
- [ ] **6.3 Sanity-check 52wk high values** for 3-5 tickers vs Yahoo Finance website
- [ ] **6.4 Confirm hourly rhythm**: check next morning that intraday + EOD ran on schedule (`gh run list --limit 20`)

---

## Out-of-scope reminder

These are NOT in v1 (per context.md §9). Do NOT scope-creep:
- Custom domain
- Login / auth
- Force-refresh button (true on-demand fetch)
- Historical snapshots / time-series charts
- Email/push alerts
- Pre/Post-market in distance calculations

---

## Rollback / recovery notes

- **If a workflow run fails:** check `gh run view --log <run-id>`. Common causes: Yahoo API hiccup (re-run), Node version mismatch (use Node 20), git push permission denied (fix workflow `permissions:`).
- **If `data/historic_highs.json` gets corrupted:** delete it, manually trigger `refresh-eod.yml` to rebuild.
- **If a deploy breaks the site:** `git revert HEAD && git push`. Pages will redeploy in ~1 min.
- **If you need a clean slate:** the entire project is reproducible from this `plan.md` and `context.md` alone — no external state.
