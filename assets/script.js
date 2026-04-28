// ── State ──────────────────────────────────────────────────────────────────
const STATE = {
  activeTab: 'trending',
  sort: {
    trending:     { col: 'rank', dir: 'asc' },
    most_actives: { col: 'rank', dir: 'asc' },
  },
  filterYestHigh: {
    trending:     false,
    most_actives: false,
  },
  filterT2High: {
    trending:     false,
    most_actives: false,
  },
  hiddenCols: new Set(['high_52wk_t2', 'high_52wk_t3']),
  historic: null,
  live: { trending: null, most_actives: null },
};

// ── Data loading ────────────────────────────────────────────────────────────
async function loadData(tab, force = false) {
  const fetches = [];

  if (force || !STATE.live[tab]) {
    fetches.push(
      fetch(`data/live/${tab}.json?t=${Date.now()}`)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status} loading ${tab}.json`); return r.json(); })
        .then(d => { STATE.live[tab] = d; })
    );
  }

  if (force || !STATE.historic) {
    fetches.push(
      fetch(`data/historic_highs.json?t=${Date.now()}`)
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
  if (!live || !hist) return [];
  const rows = [];

  for (const row of live.rows) {
    const h = hist.tickers[row.ticker];
    if (!h) {
      console.warn(`No historic entry for ${row.ticker} — skipped`);
      continue;
    }
    
    // Distance %: (CurrentPrice - 52wkHigh_T-1D) / 52wkHigh_T-1D * 100
    const distance_pct = ((row.current_price - h.high_52wk_t1) / h.high_52wk_t1) * 100;
    
    // Change %: (Current Price / T-1D Close) - 1
    const change_pct = ((row.current_price / h.t1_close) - 1) * 100;
    
    // Ext-Hr Change %: (Ext-Hr Price / T-1D Close) - 1
    let ext_hr_change_pct = null;
    if (row.outside_rth_price != null) {
      ext_hr_change_pct = ((row.outside_rth_price / h.t1_close) - 1) * 100;
    }

    // Filter by Distance
    if (distance_pct < -1.0) continue;
    
    // Filter by Yesterday was 52w High
    if (STATE.filterYestHigh[tab] && h.yesterday_was_52w_high) continue;
    
    // Filter by T-2D was 52w High
    if (STATE.filterT2High[tab] && h.t2_was_52w_high) continue;

    rows.push({ 
      ...row, 
      ...h, 
      distance_pct, 
      change_pct, 
      ext_hr_change_pct 
    });
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
  if (val == null) return '—';
  const num = Number(val);
  // Fix for negative zero (-0.00 -> 0.00)
  if (Math.abs(num) < 0.00001) return (0).toFixed(dec);
  return num.toFixed(dec);
}

function fmtPct(val) {
  if (val == null) return '—';
  return fmt(val) + '%';
}

function renderTable(rows, tab) {
  const sorted = sortRows(rows, tab);
  const tbody = document.getElementById('table-body');
  const headers = Array.from(document.querySelectorAll('th[data-col]'));

  // Update header visibility
  headers.forEach(th => {
    th.classList.toggle('hidden-col', STATE.hiddenCols.has(th.dataset.col));
  });

  if (sorted.length === 0) {
    const colSpan = headers.filter(th => !th.classList.contains('hidden-col')).length + 1; // +1 for Ext-Hrs
    tbody.innerHTML = `<tr><td colspan="${colSpan}" class="msg-cell">No stocks match the current filters.</td></tr>`;
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

    const EPS = 0.00001;
    const distClass = row.distance_pct >= -EPS ? 'val-pos' : row.distance_pct >= -0.5 ? 'val-near' : '';
    const chgClass = row.change_pct >= -EPS ? 'val-pos' : 'val-neg';
    const extChgClass = row.ext_hr_change_pct == null ? '' : (row.ext_hr_change_pct >= -EPS ? 'val-pos' : 'val-neg');

    const cells = [
      { col: 'ticker', html: `<a href="${row.yahoo_url}" target="_blank" rel="noopener noreferrer">${row.ticker}</a>`, class: 'col-ticker sticky-col' },
      { col: 'rank', val: row.rank },
      { col: 'name', val: row.name },
      { col: 'market_cap_bn', val: fmt(row.market_cap_bn) },
      { col: 'current_price', val: fmt(row.current_price) },
      { col: 'change_pct', val: fmtPct(row.change_pct), class: chgClass },
      { col: 'ext_hrs', html: rthHtml, class: 'col-rth' },
      { col: 'ext_hr_change_pct', val: fmtPct(row.ext_hr_change_pct), class: extChgClass },
      { col: 'high_52wk_t1', val: fmt(row.high_52wk_t1) },
      { col: 'distance_pct', val: fmtPct(row.distance_pct), class: distClass },
      { col: 't1_close', val: fmt(row.t1_close) },
      { col: 'high_52wk_t2', val: fmt(row.high_52wk_t2) },
      { col: 'yesterday_was_52w_high', html: row.yesterday_was_52w_high ? '<span class="flag-true">✓</span>' : '<span class="flag-false">✗</span>' },
      { col: 't2_close', val: fmt(row.t2_close) },
      { col: 'high_52wk_t3', val: fmt(row.high_52wk_t3) },
      { col: 't2_was_52w_high', html: row.t2_was_52w_high ? '<span class="flag-true">✓</span>' : '<span class="flag-false">✗</span>' },
    ];

    tr.innerHTML = cells
      .filter(c => !STATE.hiddenCols.has(c.col))
      .map(c => `<td class="${c.class || ''}">${c.html !== undefined ? c.html : c.val}</td>`)
      .join('');
      
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
  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('yf-theme', next);
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
      
      // Sync filter checkboxes to tab state
      document.getElementById('filter-yest-high').checked = STATE.filterYestHigh[tab];
      document.getElementById('filter-t2-high').checked   = STATE.filterT2High[tab];

      try {
        await loadData(tab);
        updateLastUpdated(tab);
        updateSortHeaders(tab);
        checkStale(tab);
        renderTable(joinAndFilter(tab), tab);
      } catch (err) {
        document.getElementById('table-body').innerHTML =
          `<tr><td colspan="16" class="msg-cell">Error loading data: ${err.message}</td></tr>`;
      }
    });
  });
}

function setupRefresh() {
  document.getElementById('refresh-btn').addEventListener('click', async () => {
    const oldLabel = document.getElementById('last-updated').textContent;
    document.getElementById('last-updated').textContent = 'Refreshing…';

    try {
      // Refresh BOTH tabs and historic data
      await Promise.all([
        loadData('trending', true),
        loadData('most_actives', true)
      ]);
      
      updateLastUpdated(STATE.activeTab);
      checkStale(STATE.activeTab);
      renderTable(joinAndFilter(STATE.activeTab), STATE.activeTab);
    } catch (err) {
      document.getElementById('last-updated').textContent = oldLabel;
      alert(`Error refreshing: ${err.message}`);
    }
  });
}

function setupFilters() {
  document.getElementById('filter-yest-high').addEventListener('change', e => {
    STATE.filterYestHigh[STATE.activeTab] = e.target.checked;
    renderTable(joinAndFilter(STATE.activeTab), STATE.activeTab);
  });
  
  document.getElementById('filter-t2-high').addEventListener('change', e => {
    STATE.filterT2High[STATE.activeTab] = e.target.checked;
    renderTable(joinAndFilter(STATE.activeTab), STATE.activeTab);
  });
}

function setupSort() {
  document.getElementById('main-table').addEventListener('click', e => {
    const th = e.target.closest('th[data-col]');
    if (!th) return;
    
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
}

function setupColPicker() {
  const btn = document.getElementById('col-picker-btn');
  const menu = document.getElementById('col-picker-menu');
  
  // Close menu when clicking outside
  document.addEventListener('click', e => {
    if (!btn.contains(e.target) && !menu.contains(e.target)) {
      menu.hidden = true;
    }
  });
  
  btn.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    if (!menu.hidden) renderColMenu();
  });
}

function renderColMenu() {
  const menu = document.getElementById('col-picker-menu');
  const ths = Array.from(document.querySelectorAll('th[data-col]'));
  
  menu.innerHTML = ths.map(th => {
    const id = th.dataset.col;
    const label = th.textContent.trim();
    const checked = !STATE.hiddenCols.has(id);
    return `
      <label class="col-item">
        <input type="checkbox" data-col="${id}" ${checked ? 'checked' : ''}>
        <span>${label}</span>
      </label>
    `;
  }).join('');
  
  menu.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', () => {
      const id = input.dataset.col;
      if (input.checked) STATE.hiddenCols.delete(id);
      else STATE.hiddenCols.add(id);
      renderTable(joinAndFilter(STATE.activeTab), STATE.activeTab);
    });
  });
}

// ── Init ────────────────────────────────────────────────────────────────────
async function init() {
  setupTheme();
  setupTabs();
  setupRefresh();
  setupFilters();
  setupSort();
  setupColPicker();

  try {
    // Initial load: trending data + historic
    await loadData('trending');
    updateLastUpdated('trending');
    updateSortHeaders('trending');
    checkStale('trending');
    renderTable(joinAndFilter('trending'), 'trending');
  } catch (err) {
    document.getElementById('table-body').innerHTML =
      `<tr><td colspan="16" class="msg-cell">Failed to load data. Run <code>npm run refresh:eod</code> first. (${err.message})</td></tr>`;
  }
}

init();
