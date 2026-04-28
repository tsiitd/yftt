// ── State ──────────────────────────────────────────────────────────────────
const STATE = {
  activeTab: 'trending',
  sort: {
    trending:     { col: 'distance_pct', dir: 'desc' },
    most_actives: { col: 'distance_pct', dir: 'desc' },
  },
  filterYestHigh: {
    trending:     true,
    most_actives: true,
  },
  historic: null,
  live: { trending: null, most_actives: null },
};

// ── Data loading ────────────────────────────────────────────────────────────
async function loadData(tab) {
  const fetches = [];

  if (!STATE.live[tab]) {
    fetches.push(
      fetch(`data/live/${tab}.json`)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status} loading ${tab}.json`); return r.json(); })
        .then(d => { STATE.live[tab] = d; })
    );
  }

  if (!STATE.historic) {
    fetches.push(
      fetch('data/historic_highs.json')
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status} loading historic_highs.json`); return r.json(); })
        .then(d => { STATE.historic = d; })
    );
  }

  await Promise.all(fetches);
}

// ── Data processing ─────────────────────────────────────────────────────────
function joinAndFilter(tab) {
  const live = STATE.live[tab];
  const hist = STATE.historic;
  const rows = [];

  for (const row of live.rows) {
    const h = hist.tickers[row.ticker];
    if (!h) {
      console.warn(`No historic entry for ${row.ticker} — skipped`);
      continue;
    }
    const distance_pct = ((row.current_price - h.high_52wk_t1) / h.high_52wk_t1) * 100;
    if (distance_pct < -1.0) continue;
    if (STATE.filterYestHigh[tab] && h.yesterday_was_52w_high) continue;
    rows.push({ ...row, ...h, distance_pct });
  }
  return rows;
}

function sortRows(rows, tab) {
  const { col, dir } = STATE.sort[tab];
  return [...rows].sort((a, b) => {
    let av = a[col], bv = b[col];
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'boolean') { av = av ? 1 : 0; bv = bv ? 1 : 0; }
    if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return dir === 'asc' ? av - bv : bv - av;
  });
}

// ── Rendering ───────────────────────────────────────────────────────────────
function fmt(val, dec = 2) {
  return val == null ? '—' : Number(val).toFixed(dec);
}

function renderTable(rows, tab) {
  const sorted = sortRows(rows, tab);
  const tbody = document.getElementById('table-body');

  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="msg-cell">No stocks match the current filter.</td></tr>';
    document.getElementById('row-count').textContent = '';
    return;
  }

  const frag = document.createDocumentFragment();
  for (const row of sorted) {
    const tr = document.createElement('tr');

    let rthHtml = '—';
    if (row.outside_rth_price != null) {
      const side = row.outside_rth_side || '';
      rthHtml = `${fmt(row.outside_rth_price)}<span class="rth-pill ${side.toLowerCase()}">${side}</span>`;
    }

    const dc = row.distance_pct >= 0 ? 'dist-pos' : row.distance_pct >= -0.5 ? 'dist-near' : '';

    tr.innerHTML = `
      <td class="col-ticker"><a href="${row.yahoo_url}" target="_blank" rel="noopener noreferrer">${row.ticker}</a></td>
      <td>${row.rank}</td>
      <td>${row.name}</td>
      <td>${fmt(row.market_cap_bn)}</td>
      <td>${fmt(row.current_price)}</td>
      <td class="col-rth">${rthHtml}</td>
      <td>${fmt(row.high_52wk_t1)}</td>
      <td class="${dc}">${fmt(row.distance_pct)}%</td>
      <td>${fmt(row.t1_close)}</td>
      <td>${fmt(row.high_52wk_t2)}</td>
      <td>${row.yesterday_was_52w_high ? '✓' : '✗'}</td>
    `.trim();
    frag.appendChild(tr);
  }

  tbody.innerHTML = '';
  tbody.appendChild(frag);
  document.getElementById('row-count').textContent =
    `${sorted.length} stock${sorted.length !== 1 ? 's' : ''} shown`;
}

function updateSortHeaders(tab) {
  const { col, dir } = STATE.sort[tab];
  document.querySelectorAll('th[data-col]').forEach(th => {
    th.classList.toggle('sort-asc',  th.dataset.col === col && dir === 'asc');
    th.classList.toggle('sort-desc', th.dataset.col === col && dir === 'desc');
  });
}

function updateLastUpdated(tab) {
  const live = STATE.live[tab];
  if (!live) return;
  const ageMs = Date.now() - new Date(live.last_updated_iso).getTime();
  const ageMin = Math.floor(ageMs / 60000);
  let label;
  if (ageMin < 1)       label = 'just now';
  else if (ageMin < 60) label = `${ageMin}m ago`;
  else                  label = `${Math.floor(ageMin / 60)}h ${ageMin % 60}m ago`;
  document.getElementById('last-updated').textContent = `Last updated: ${label}`;
}

// ── Market hours & stale banner ─────────────────────────────────────────────
function isMarketOpen() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour:    '2-digit',
    minute:  '2-digit',
    hour12:  false,
  }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type)?.value ?? '';
  const day = get('weekday');
  const h   = parseInt(get('hour'),   10);
  const m   = parseInt(get('minute'), 10);
  if (!['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(day)) return false;
  const mins = h * 60 + m;
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

function checkStale(tab) {
  const banner = document.getElementById('banner');
  const live   = STATE.live[tab];
  if (!live) { banner.hidden = true; return; }

  const ageMs = Date.now() - new Date(live.last_updated_iso).getTime();

  if (ageMs > 60 * 60 * 1000 && isMarketOpen()) {
    banner.className   = 'banner warning';
    banner.textContent = `⚠ Data is ${Math.round(ageMs / 60000)} minutes old and markets are currently open.`;
    banner.hidden      = false;
  } else if (!isMarketOpen()) {
    const when = new Date(live.last_updated_iso).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month:    'short',
      day:      'numeric',
      hour:     'numeric',
      minute:   '2-digit',
      hour12:   true,
    });
    banner.className   = 'banner neutral';
    banner.textContent = `Markets closed — data from ${when} ET`;
    banner.hidden      = false;
  } else {
    banner.hidden = true;
  }
}

// ── Setup ───────────────────────────────────────────────────────────────────
function setupTheme() {
  const btn = document.getElementById('theme-toggle');
  const sync = () => {
    btn.textContent = document.documentElement.dataset.theme === 'dark' ? '☀' : '🌙';
  };
  sync();
  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('yf-theme', next);
    sync();
  });
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tab = btn.dataset.tab;
      if (tab === STATE.activeTab) return;
      STATE.activeTab = tab;

      document.querySelectorAll('.tab-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === tab)
      );
      document.getElementById('filter-yest-high').checked = STATE.filterYestHigh[tab];
      document.getElementById('table-body').innerHTML =
        '<tr><td colspan="11" class="msg-cell">Loading&hellip;</td></tr>';

      try {
        await loadData(tab);
        updateLastUpdated(tab);
        updateSortHeaders(tab);
        checkStale(tab);
        renderTable(joinAndFilter(tab), tab);
      } catch (err) {
        document.getElementById('table-body').innerHTML =
          `<tr><td colspan="11" class="msg-cell">Error loading data: ${err.message}</td></tr>`;
      }
    });
  });
}

function setupRefresh() {
  document.getElementById('refresh-btn').addEventListener('click', async () => {
    const tab = STATE.activeTab;
    STATE.live[tab] = null;
    STATE.historic   = null;
    document.getElementById('last-updated').textContent = 'Refreshing…';

    try {
      await loadData(tab);
      updateLastUpdated(tab);
      checkStale(tab);
      renderTable(joinAndFilter(tab), tab);
    } catch (err) {
      document.getElementById('table-body').innerHTML =
        `<tr><td colspan="11" class="msg-cell">Error refreshing: ${err.message}</td></tr>`;
    }
  });
}

function setupFilter() {
  document.getElementById('filter-yest-high').addEventListener('change', e => {
    STATE.filterYestHigh[STATE.activeTab] = e.target.checked;
    renderTable(joinAndFilter(STATE.activeTab), STATE.activeTab);
  });
}

function setupSort() {
  document.querySelectorAll('th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      const tab = STATE.activeTab;
      const cur = STATE.sort[tab];
      if (cur.col === col) {
        cur.dir = cur.dir === 'asc' ? 'desc' : 'asc';
      } else {
        STATE.sort[tab] = { col, dir: th.dataset.defaultDir || 'desc' };
      }
      updateSortHeaders(tab);
      renderTable(joinAndFilter(tab), tab);
    });
  });
}

// ── Init ────────────────────────────────────────────────────────────────────
async function init() {
  setupTheme();
  setupTabs();
  setupRefresh();
  setupFilter();
  setupSort();

  try {
    await loadData('trending');
    updateLastUpdated('trending');
    updateSortHeaders('trending');
    checkStale('trending');
    renderTable(joinAndFilter('trending'), 'trending');
  } catch (err) {
    document.getElementById('table-body').innerHTML =
      `<tr><td colspan="11" class="msg-cell">Failed to load data. Run <code>npm run refresh:eod</code> first, then serve from the repo root. (${err.message})</td></tr>`;
  }
}

init();
