# yftt — Project Context

> **Purpose of this file:** the single, complete context document for any future agentic chat about the yftt project. A new agent reading only this file should be able to pick up work without re-asking the user about goals, architecture, or scope.
>
> **Last updated:** 2026-04-27
> **Owner:** tsiitd (GitHub username)
> **Status:** greenfield — repo is currently blank, target is to ship v1 within hours

---

## 1. What this project is

A free, public, mobile-first website that surfaces **Yahoo Finance stocks that are currently within 1% of (or above) their 52-week high**, drawn from two source lists: **Trending** (top 25) and **Most Active** (top 50). The user wants to spot momentum / breakout candidates from these popular-attention lists at a glance.

**Live URL:** `https://tsiitd.github.io/yftt/`
**GitHub repo:** `https://github.com/tsiitd/yftt` (personal account, public)
**Access:** public but unlisted — no auth, but `robots.txt` + `<meta name="robots" content="noindex">` to keep it out of search engines. Share-by-URL only.

---

## 2. Core user flow

1. User opens the site on a mobile browser.
2. Sees the **Trending** tab by default with its table immediately rendered. Behind the scenes the page loads the live data file for the active tab plus the shared `data/historic_highs.json`, then joins them in JS.
3. Sees a "Last updated: HH:MM ago" timestamp at the top.
   - **Smart-stale banner logic:** warning banner appears ONLY if last-updated is >1hr old AND US markets are currently open (Mon–Fri, 9:30am–4pm ET). Outside market hours, a neutral banner shows: *"Markets closed — data shown is from the last update."*
4. User can:
   - **Switch tabs** between "Trending" and "Most Active" at the top. Tabs share the historic_highs cache (loaded once); only the live file is fetched per tab. Each tab keeps its own sort/filter state.
   - Tap the **Refresh** button → re-fetches the live JSON for both tabs + the historic file.
   - Toggle the **"Exclude Yest 52w Hi"** and **"Exclude T-2D 52w Hi"** filters (default: OFF).
   - Use the **"Cols" dropdown** (top right) to show/hide any of the 15 columns.
   - Tap any column header to sort ascending/descending.
   - Toggle dark/light mode (default: dark).
   - Tap a ticker → opens `https://finance.yahoo.com/quote/{TICKER}` in a new tab.

---

## 3. Data definitions (precise)

Let `T` = today (the moment data is computed).

- **Two source lists** — fetched independently each Action run:
  - **Trending (25 stocks):** `yahooFinance.trendingSymbols('US', { count: 25 })`.
  - **Most Active (50 stocks):** `yahooFinance.screener({ scrIds: 'most_actives', count: 50 })`.
- **Rank:** the order Yahoo returns the stock in (1-indexed), preserved per-list.
- **52wk High till T-1D:** `max(daily_close)` over `[T-252, T-1]` inclusive.
- **52wk High till T-2D:** `max(daily_close)` over `[T-253, T-2]`.
- **52wk High till T-3D:** `max(daily_close)` over `[T-254, T-3]`.
- **Current Price:** latest regular-session price.
- **T-1D Close:** yesterday's regular-session close.
- **T-2D Close:** day-before-yesterday's regular-session close.
- **Distance (%):** `(CurrentPrice - 52wkHigh_T-1D) / 52wkHigh_T-1D * 100`. (Values rounding to 0.00% are treated as positive).
- **Chg (%):** `(CurrentPrice / T-1D Close - 1) * 100`.
- **Ext (%):** `(Outside-RTH Price / T-1D Close - 1) * 100`.
- **Yest 52w Hi? (T/F):** `True` if `T-1D Close >= 52wkHigh_T-2D`.
- **T-2D 52w Hi? (T/F):** `True` if `T-2D Close >= 52wkHigh_T-3D`.
- **Filter rules:** 
  1. Keep stock if `Distance% >= -1.0`.
  2. (Optional) Exclude if `Yest 52w Hi?` is True.
  3. (Optional) Exclude if `T-2D 52w Hi?` is True.

### Table columns (in order)

| # | Column | Source | Sortable | Default |
|---|---|---|---|---|
| 1 | Ticker | live | yes | visible |
| 2 | Rank | live | yes | visible |
| 3 | Name | live | yes | visible |
| 4 | Mkt Cap $Bn | live | yes | visible |
| 5 | Price | live | yes | visible |
| 6 | Chg % | computed | yes | visible |
| 7 | Ext-Hrs | live | no | visible |
| 8 | Ext % | computed | yes | visible |
| 9 | 52w Hi T-1D | historic | yes | visible |
| 10 | Dist % | computed | yes | visible |
| 11 | T-1D Close | historic | yes | visible |
| 12 | 52w Hi T-2D | historic | yes | **hidden** |
| 13 | Yest 52w Hi? | historic | yes | visible |
| 14 | T-2D Close | historic | yes | visible |
| 15 | 52w Hi T-3D | historic | yes | **hidden** |
| 16 | T-2D 52w Hi? | historic | yes | visible |


**Outside-RTH column logic:** if both `postMarketPrice` and `preMarketPrice` exist, pick whichever has the larger of `postMarketTime` / `preMarketTime` (Unix timestamp). If only one exists, show that. If neither exists, show "—". Add a small "Pre" / "Post" pill next to the value so the user knows which session it's from.

---

## 4. Architecture

The site is **fully static**. There is **no backend server**. Two separate scheduled GitHub Actions write JSON files that the browser joins client-side at render time.

### Two-tier data model

| Tier | File(s) | Refresh cadence | What it holds | Volatility |
|---|---|---|---|---|
| **Live** | `data/live/trending.json`, `data/live/most_actives.json` | Every 15 min, weekdays 02:00–22:00 UTC | rank, ticker, name, current_price, market_cap, outside-RTH price+side+timestamp | Changes intraday — must always reflect current Yahoo state |
| **Historic** | `data/historic_highs.json` | Daily 01:00 UTC, weekdays | per-ticker: `high_52wk_t1`, `high_52wk_t2`, `t1_close`, `cached_for_trading_date` | Changes once per trading day |

Tickers in the live file but NOT in the historic file (i.e. brand-new appearances during intraday) trigger an inline historic fetch in the same intraday run, so the joined render is never missing rows. The frontend ALWAYS displays the live file's tickers exactly — it never shows a cached ticker that has dropped from Yahoo's current list.

### Workflow 1: EOD historic refresh

```
Cron: 0 1 * * 1-5  (01:00 UTC, Mon–Fri)
Runs: scripts/refresh_historic.mjs
  1. Call yahoo-finance2 for both source lists (trending + most_actives)
  2. Build a deduped ticker set across both lists
  3. WIPE data/historic_highs.json entirely (full nuke + repopulate)
  4. For each ticker (deduped, fetched only once even if in both lists):
       a. Fetch 1y historical daily closes
       b. Compute high_52wk_t1, high_52wk_t2, t1_close
       c. Stamp cached_for_trading_date = today's T-1D date
  5. Write data/historic_highs.json
  6. Commit + push if changed
```

### Workflow 2: Intraday refresh (live + new-ticker historic top-up)

```
Cron: */15 2-21 * * 1-5  (every 15 min, 02:00–21:45 UTC, Mon–Fri)
Runs: scripts/refresh_live.mjs
  Step A (live):
    For each source (trending, most_actives):
      1. Call yahoo-finance2 for the ticker list with all live fields
      2. Write data/live/<source>.json with rows + last_updated_iso
  Step B (top-up):
    3. Read data/historic_highs.json
    4. Find tickers in live files NOT in historic file
    5. For each new ticker:
         a. Fetch 1y history, compute fields
         b. Stamp cached_for_trading_date
         c. Append to historic_highs.json
  Step C (commit):
    6. git commit + push if any file changed
```

### Concurrency

Both workflows share `concurrency: { group: refresh, cancel-in-progress: false }`. The 1-hour gap between EOD (01:00) and first intraday (02:00) is the natural buffer; concurrency group is belt-and-suspenders.

### Why this design

- **Free forever:** GitHub Pages = free hosting; GitHub Actions = unlimited minutes for public repos.
- **Trivial Action minutes:** intraday ~15s × 80 runs/day × 22 weekdays/month = ~5h/month. EOD ~30s × 22 = ~11 min/month. All free.
- **Instant page load:** browser fetches pre-computed JSON, joins in memory.
- **Live state is always current:** the browser displays only what's in the live file. Tickers that drop off Yahoo's list disappear from the table on next refresh. No stale tickers ever shown.
- **Historic data computed once daily, reused 80 times:** dramatically less API load on Yahoo; faster intraday runs.
- **Shared historic cache:** Trending + Most Active overlap heavily (NVDA, TSLA appear in both); each ticker's history is fetched at most once per day across both lists.
- **No browser dependency:** `yahoo-finance2` calls Yahoo's JSON APIs directly; no Playwright/Chromium.

### Known limitations

- **Cron drift:** GitHub Actions cron can be delayed 5–15 minutes during platform load. The smart-stale banner makes this transparent.
- **Inactive repo pause:** GitHub disables scheduled workflows after 60 days of repo inactivity. The 15-min cadence committing data files keeps the repo "active," so this won't trigger.
- **The "Refresh" button is not a forced re-fetch.** It only re-reads files from the repo. Forced fetches deferred to a possible v2 (would need `repository_dispatch` + a PAT or proxy).
- **US holidays:** weekday cron still triggers but Yahoo returns the same data — runs are no-ops with no commit. Smart-stale banner says "Markets closed."

---

## 5. Tech stack

### Frontend (in repo root + `/assets/`)
- **HTML:** single `index.html`.
- **CSS:** [Pico.css](https://picocss.com/) via CDN (semantic, mobile-first, dark/light theme built in) + a tiny `style.css` for table-specific tweaks (sticky first column, sort arrows, banner, tab styling).
- **JS:** vanilla `script.js` — manage tabs, lazy-fetch live + historic JSONs, join by ticker in memory, render table, handle sort/filter/refresh, dark-mode toggle (persisted to `localStorage`), market-hours detection for smart-stale banner.
- **No build step. No framework. No npm at the frontend.**

### Mobile UX
- Two tabs at the top: **Trending** (default) | **Most Active**.
- Horizontal scroll for the wide 12-column table.
- **First column (Ticker) is sticky** so the user always knows which row they're reading.
- Tap-to-sort on every column header except Outside-RTH; arrow indicator on the active column. Sort + filter state is per-tab.

### Backend / data refresh (in `/scripts/`)
- **Node.js 20+** (pre-installed on GitHub Actions runners — no setup beyond `npm ci`).
- **`yahoo-finance2`** npm package — single dependency that provides:
  - `trendingSymbols('US', { count: 25 })` for the Trending list
  - `screener({ scrIds: 'most_actives', count: 50 })` for the Most Active list
  - `historical(ticker, { period1, period2, interval: '1d' })` for daily closes
  - `quote(tickers)` (accepts an array) for `regularMarketPrice`, `marketCap`, `preMarketPrice/Time`, `postMarketPrice/Time`, `shortName`
- No browser, no Playwright, no Python. Total install time on a fresh runner: ~10 seconds.

### Hosting
- **GitHub Pages** from the `main` branch root.
- Custom domain: NOT used in v1. URL is `https://tsiitd.github.io/Yf_TrendTop/`.

---

## 6. Repository layout

```
Yf_TrendTop/
├── index.html                  # the single page (tabs + table + filters)
├── assets/
│   ├── script.js               # tabs + fetch + join + render + sort + filter + theme + market-hours
│   └── style.css               # tabs, sticky-col, sort arrows, banners on top of Pico.css
├── data/
│   ├── live/
│   │   ├── trending.json       # rank+ticker+name+price+marketCap+ORTH (intraday refresh)
│   │   └── most_actives.json   # same schema
│   └── historic_highs.json     # ticker → high_52wk_t1, high_52wk_t2, t1_close, cached_date (EOD refresh)
├── scripts/
│   ├── refresh_live.mjs        # intraday entry: writes live/*.json + tops up historic for new tickers
│   ├── refresh_historic.mjs    # EOD entry: nukes + rebuilds historic_highs.json
│   ├── lib/
│   │   ├── sources.mjs         # config: { trending: {fetcher, count}, most_actives: {fetcher, count} }
│   │   ├── fetch_list.mjs      # fetches a source list + quote() data, returns live rows
│   │   ├── fetch_historic.mjs  # given tickers, fetches history + computes the 3 historic fields
│   │   └── trading_date.mjs    # computes "today's T-1D trading date" handling weekends/holidays
├── .github/
│   └── workflows/
│       ├── refresh-intraday.yml  # cron */15 2-21 * * 1-5 + workflow_dispatch
│       └── refresh-eod.yml       # cron 0 1 * * 1-5 + workflow_dispatch
├── package.json                # single dep: yahoo-finance2
├── package-lock.json
├── .gitignore                  # node_modules, etc.
├── robots.txt                  # Disallow: /  (unlisted, not searchable)
├── README.md
└── ai/
    ├── raw_idea.md             # original brain dump (already exists)
    ├── context.md              # THIS FILE — single source of truth
    └── plan.md                 # ordered build plan, resumable on interruption
```

### `data/live/<source>.json` schema

```json
{
  "source_id": "trending",
  "source_label": "Trending",
  "source_url": "https://finance.yahoo.com/markets/stocks/trending/",
  "last_updated_iso": "2026-04-27T14:03:11Z",
  "fetched_count": 25,
  "rows": [
    {
      "rank": 1,
      "ticker": "NVDA",
      "name": "NVIDIA Corporation",
      "current_price": 982.40,
      "market_cap_bn": 3210.5,
      "outside_rth_price": 985.20,
      "outside_rth_side": "Post",          // "Pre" | "Post" | null
      "outside_rth_time_iso": "2026-04-27T20:15:00Z",
      "yahoo_url": "https://finance.yahoo.com/quote/NVDA"
    }
  ]
}
```

### `data/historic_highs.json` schema

```json
{
  "last_full_rebuild_iso": "2026-04-27T01:02:33Z",
  "tickers": {
    "NVDA": {
      "high_52wk_t1": 985.10,
      "high_52wk_t2": 985.10,
      "high_52wk_t3": 980.00,
      "t1_close": 980.20,
      "t2_close": 975.00,
      "yesterday_was_52w_high": false,
      "t2_was_52w_high": false,
      "cached_for_trading_date": "2026-04-26"
    },
    "TSLA": { ... }
  }
}
```

### Frontend join logic

For each row in the live file, look up `ticker` in `historic_highs.tickers`. If found, merge the historic fields. Compute `distance_pct = (current_price - high_52wk_t1) / high_52wk_t1 * 100`. Apply the filter `distance_pct >= -1.0`. Render. If a live ticker has no historic entry (extremely rare race condition where a new ticker appeared mid-Action), skip the row and log to console.

---

## 7. Decisions log (locked answers from the user)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Hosting:** GitHub Pages + scheduled GitHub Actions | Free, simple, instant page load, no secrets in browser |
| D2 | **Frontend stack:** plain HTML + vanilla JS + Pico.css CDN | User is not a web developer; zero build step |
| D3 | **Backend stack:** Node.js + `yahoo-finance2` npm package | Single ~5MB dep; no browser/Playwright; ~10s install vs ~3min for Python+Playwright |
| D4 | **Mobile table:** horizontal scroll with sticky first (Ticker) column | Familiar pattern; preserves all 12 columns |
| D5 | **Distance calc:** vs 52wk-high through T-1D, using `regularMarketPrice` | Matches raw_idea.md literally; only RTH price used in calculations |
| D6 | **Cron cadence:** EOD 01:00 UTC + intraday every 15 min from 02:00–22:00 UTC, weekdays only | Captures post-close action up to 17:00 ET; 1h gap avoids EOD/intraday concurrency; weekdays only saves wasted runs |
| D7 | **Refresh button:** just re-reads JSON from repo | No PAT, no security issue, simplest UX |
| D8 | **Access:** public but unlisted (`noindex` + `robots.txt`) | User wants to share by URL but not be indexed |
| D9 | **Sources:** TWO independent lists fetched per run — Trending (25) AND Most Active (50). Each has its own tab. | Two-tab UI; tab-switching instant after first load |
| D10 | **Market Cap source:** `yahoo-finance2.quote()` → `marketCap` field (live, intraday) | Comes back with the live price call; no separate request |
| D11 | **Theme:** dark mode default with light toggle | Mobile-first preference |
| D12 | **Domain:** `tsiitd.github.io/Yf_TrendTop` (no custom domain in v1) | Free, no DNS work |
| D13 | **GitHub repo:** personal account `tsiitd/Yf_TrendTop` (not the TS-Trading org) | GH Pages is free on public personal repos; org repo was private |
| D14 | **Two-list UI:** tabs at top ("Trending" default, "Most Active" second). Each tab has independent sort/filter state. | Cleanest mobile pattern for two related tables |
| D15 | **Two-tier data files:** live JSONs per source + shared `historic_highs.json`; frontend joins client-side | Modular; intraday commits stay tiny; historic computed once/day, reused ~80 times |
| D16 | **Historic cache strategy:** full nuke + repopulate at 01:00 UTC daily; intraday top-up for newly-appeared tickers only | Both T-1D close and 52wk-window shift each day, so partial updates are unsafe; full rebuild keeps logic simple |
| D17 | **Outside-RTH Price column:** show most recent of preMarket/postMarket by Unix timestamp; "Pre"/"Post" pill; display-only (not sortable). Used for display only, never in calculations. | Single glance at extended-hours move regardless of session |
| D18 | **Smart-stale banner:** warn only if >1hr old AND markets currently open (Mon–Fri, 9:30am–4pm ET). Otherwise neutral "Markets closed" banner. | Avoids false alarm on weekends/overnight; warns when it actually matters |
| D19 | **Cron only on weekdays** (`* * * * 1-5`) | Markets closed Sat/Sun; saves wasted runs; US holidays still trigger but produce no-op commits |
| D20 | **Concurrency:** workflows share a single `concurrency: refresh` group | Belt-and-suspenders to prevent EOD/intraday collision |

---

## 8. Reference code in the broader workspace

- **`yahoo-finance2` package docs:** https://github.com/gadicc/node-yahoo-finance2 — the only npm dependency. Methods used: `trendingSymbols`, `screener`, `historical`, `quote`.
- **Historical Python references** (in the broader `D:\trading_analysis\` workspace, NOT used by this project but show prior art on the same data):
  - `D:\trading_analysis\P01_sector_champs\scripts\fetch_screener_lists.py` — Playwright scrape of YF trending in Python (now superseded by `yahoo-finance2.trendingSymbols`).
  - `D:\trading_analysis\Templates\scripts\fetch_mtd_data_generic.py` — `yfinance` usage in Python (now superseded by `yahoo-finance2.historical` + `quote`).
- **This project is fully self-contained.** Do not depend on or import from anything outside the `Yf_TrendTop/` folder.

---

## 9. What's explicitly OUT of scope for v1

- True on-demand fetching (Refresh button just re-reads JSON).
- Custom domain.
- Authentication / login.
- Historical view of past day's snapshots / trend over time.
- Email / push alerts when a stock hits its 52wk high.
- Multiple markets (US only via Yahoo Finance).
- Per-user saved filters / persisted user state beyond dark-mode toggle.
- Pre/Post-market price used in distance calculations (display only).
- US holiday calendar awareness in cron (we just live with no-op runs).

---

## 10. Open questions / known risks

1. **Yahoo unofficial API reliability:** `yahoo-finance2` calls Yahoo's internal JSON APIs which can change without notice. If a fetch fails, the user sees the last good JSON + smart-stale banner. GitHub sends a default email on failed workflows.
2. **`screener({ scrIds: 'most_actives' })` field shape:** the screener endpoint may return slightly different fields than `quote()`. Implementation should normalize both to the same row shape via `lib/fetch_list.mjs`. Verify field names on first run.
3. **Time zone for "today" / T-1D:** the cron runs in UTC. Use `historical()` daily series + `series[series.length - 1]` for T-1D and `series[series.length - 2]` for T-2D rather than calendar arithmetic. This naturally handles weekends and holidays.
4. **First-run bootstrap:** the historic JSON doesn't exist until the EOD workflow runs at least once. Bootstrap by manually firing `refresh-eod.yml` via `workflow_dispatch` from the Actions tab on day 1. The intraday run also has fallback logic to top-up if historic is missing.
5. **Race condition on commits:** if two runs somehow overlap (intraday + manual dispatch), the second push fails. The Action should pull --rebase before push to recover. The `concurrency` group prevents this in the normal case.
6. **`historic_highs.json` size:** with full nuke + repopulate, file size = 75 tickers (max, deduped) × ~200 bytes ≈ 15KB. Trivial.
7. **`pre/postMarket` field absence:** small/illiquid tickers may have no extended-hours prints. Code must tolerate `undefined` and render "—".

---

## 11. Glossary (for any future agent unfamiliar with the domain)

- **52wk high:** the highest closing price over the trailing 365 days. A stock trading at or near its 52wk high is showing strong upward momentum.
- **Yahoo Finance trending:** Yahoo's list of stocks getting the most page-views / search interest right now. A blunt proxy for retail attention.
- **Most Active:** Yahoo's screener of stocks with the highest trading volume that session. Proxy for institutional + retail engagement combined.
- **RTH:** Regular Trading Hours, US: 9:30am–4:00pm Eastern Time. Outside-RTH = pre-market (4:00am–9:30am ET) + post-market (4:00pm–8:00pm ET).
- **The thesis of this site:** "stocks that are both *attention-getting* (trending or most-active) AND *near their 52wk high* (momentum) are interesting breakout candidates." The site doesn't make trading recommendations — it just surfaces the intersection.

---

## 12. User profile (for collaborating agents)

- **Background:** strong in Python and trading-data analysis. Has an existing `D:\trading_analysis\` workspace with multiple projects using `yfinance`, `pandas`, and Playwright scrapers. New to JS/Node — explain JS-specific patterns when they come up.
- **NOT a web developer.** Doesn't know frontend frameworks, CSS layout intricacies, or backend infra (servers, DNS, deployment). Explain web-side decisions in plain language and suggest defaults rather than asking "which framework?"
- **Working environment:** Windows 11, bash shell. Has `git` and `gh` CLI installed and authenticated. This project uses Node.js (not Python) — Node should be installed locally too, but the GH Action runner will install everything fresh anyway via `npm ci`.
- **Shipping mindset:** wants to launch v1 fast and iterate. Prefer "ship the simplest thing that works" over architectural perfection.
- **Collaboration style:** thinks deeply about architecture, asks pushing-back questions, prefers MCQ-style options with a clear recommendation. Confirms or modifies before action.
