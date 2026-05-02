// ── Finance module ────────────────────────────────────────────────────────────

let _finCats = [];
let _finAccts = [];
let _finView = 'overview';

// Persisted filter state for the Transactions tab — survives tab switches and modal saves
let _ftxState  = { from: null, to: null, cats: [], acct: '', uncl: false, sortCol: 'date', sortDir: 'desc' };
// Persisted range for the Income tab
let _fincState = { preset: '12m', from: null, to: null };
// Planning tab state — loaded is false so we re-read API defaults on first visit
let _finPlanState = {
  loaded: false,
  // Income
  salaryIncome: null, otherIncome: null,
  // Spend & investment
  monthlySpend: null, returnRate: null, inflationRate: null, investmentFrac: null,
  // Life
  birthDate: '', targetRetireAge: 62, planMode: 'safe',
  // Horizon
  yearsForward: 30,
  // Raise step-up
  annualRaiseRate: 3, raiseCap: 8, savingsOfRaise: 50,
  // Read-only from API
  netWorth: null, expenditures: [],
  monthlyDebtPayments: 0, cashBalance: 0, investmentsBalance: 0,
};

function _fmtMoney(n) {
  if (n == null || isNaN(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function _fmtMoneyCompact(n) {
  if (n == null || isNaN(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs  = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs/1_000_000).toFixed(1)}M`;
  if (abs >= 10_000)    return `${sign}$${Math.round(abs/1000)}k`;
  if (abs >= 1000)      return `${sign}$${(abs/1000).toFixed(1)}k`;
  return `${sign}$${Math.round(abs)}`;
}

registerPage('finance', async function(content) {
  content.innerHTML = `
    <div class="finance-page">
      <div class="page-header">
        <h1 class="page-title">Finance</h1>
        <div class="fin-tabs">
          <button class="fin-tab" data-view="overview">Overview</button>
          <button class="fin-tab" data-view="transactions">Transactions</button>
          <button class="fin-tab" data-view="reconcile">Reconcile <span id="fin-uncl-badge" class="fin-badge"></span></button>
          <button class="fin-tab" data-view="income">Income</button>
          <button class="fin-tab" data-view="wealth">Wealth</button>
          <button class="fin-tab" data-view="planning">Planning</button>
          <button class="fin-tab" data-view="manage">Manage</button>
        </div>
      </div>
      <div id="fin-content" class="finance-content"></div>
    </div>`;

  // Pre-fetch shared data
  try {
    const [cats, accts] = await Promise.all([
      apiFetch('GET', '/finance/categories'),
      apiFetch('GET', '/finance/accounts'),
    ]);
    _finCats  = cats.items || [];
    _finAccts = accts.items || [];
  } catch (e) {}

  content.querySelectorAll('.fin-tab').forEach(t => {
    t.addEventListener('click', () => _setFinView(t.dataset.view));
  });

  _setFinView('overview');
});

function _setFinView(v) {
  _finView = v;
  document.querySelectorAll('.fin-tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  const c = document.getElementById('fin-content');
  c.innerHTML = `<div class="loading-state">Loading…</div>`;
  if      (v === 'overview')     _renderFinOverview(c);
  else if (v === 'transactions') _renderFinTransactions(c);
  else if (v === 'reconcile')    _renderFinReconcile(c);
  else if (v === 'income')       _renderFinIncome(c);
  else if (v === 'wealth')       _renderFinWealth(c);
  else if (v === 'planning')     _renderFinPlanning(c);
  else if (v === 'manage')       _renderFinManage(c);
}

// ── Overview ─────────────────────────────────────────────────────────────────
const FIN_RANGE_PRESETS = [
  { key: 'last-month', label: 'Last month' },
  { key: '3m',         label: 'Last 3 months' },
  { key: '6m',         label: 'Last 6 months' },
  { key: 'ytd',        label: 'YTD' },
  { key: '12m',        label: 'Last 12 months' },
];

function _isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _finRangeFor(key) {
  const today = new Date();
  let start, end;
  if (key === 'last-month') {
    // Previous calendar month — first to last day
    const firstOfThis = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastOfPrev  = new Date(firstOfThis.getTime() - 86400000);
    const firstOfPrev = new Date(lastOfPrev.getFullYear(), lastOfPrev.getMonth(), 1);
    start = _isoLocal(firstOfPrev);
    end   = _isoLocal(lastOfPrev);
  } else if (key === '6m') {
    end = _isoLocal(today);
    const d = new Date(today); d.setMonth(d.getMonth() - 6); d.setDate(d.getDate() + 1);
    start = _isoLocal(d);
  } else if (key === 'ytd') {
    end = _isoLocal(today);
    start = _isoLocal(new Date(today.getFullYear(), 0, 1));
  } else if (key === '12m') {
    end = _isoLocal(today);
    const d = new Date(today); d.setFullYear(d.getFullYear() - 1); d.setDate(d.getDate() + 1);
    start = _isoLocal(d);
  } else {
    // default: 3m
    end = _isoLocal(today);
    const d = new Date(today); d.setMonth(d.getMonth() - 3); d.setDate(d.getDate() + 1);
    start = _isoLocal(d);
  }
  return { start, end };
}

async function _renderFinOverview(c) {
  const rangeKey = localStorage.getItem('fin_range') || '3m';
  const { start, end } = _finRangeFor(rangeKey);

  let d;
  try { d = await apiFetch('GET', `/finance/dashboard?start=${start}&end=${end}`); }
  catch (e) { c.innerHTML = `<div class="empty-state"><div class="empty-state-title">Couldn't load</div><p>${e.message}</p></div>`; return; }

  const badge = document.getElementById('fin-uncl-badge');
  if (badge) {
    badge.textContent = d.unclassified_count > 0 ? d.unclassified_count : '';
    badge.style.display = d.unclassified_count > 0 ? '' : 'none';
  }

  // Sane delta vs prior period — guard against tiny baselines that produce silly percents
  const spendDelta = d.spend - d.spend_prev;
  let spendDeltaLbl, spendAccent;
  if (d.spend_prev <= 0) {
    spendDeltaLbl = 'no prior period';
    spendAccent = 'blue';
  } else if (d.spend_prev < 100) {
    spendDeltaLbl = (spendDelta > 0 ? '↑ ' : '↓ ') + _fmtMoneyCompact(Math.abs(spendDelta)) + ' vs prior';
    spendAccent = spendDelta > 0 ? 'red' : 'green';
  } else {
    const pct = Math.round(spendDelta / d.spend_prev * 100);
    const capped = Math.min(Math.abs(pct), 999);
    spendDeltaLbl = (pct > 0 ? '↑ ' : pct < 0 ? '↓ ' : '') + capped + '% vs prior';
    spendAccent = pct > 0 ? 'red' : pct < 0 ? 'green' : 'blue';
  }

  const monthsInRange = Math.max(1, d.span_days / 30);
  const avgMonthlySpend = d.spend / monthsInRange;
  // Savings rate clamped to [-99, 100]; can be negative if dipping into savings
  let savingsRate = null;
  if (d.income > 0) {
    savingsRate = Math.round((d.income - d.spend) / d.income * 100);
    savingsRate = Math.max(-99, Math.min(100, savingsRate));
  }

  const wb = d.wealth_breakdown || {};
  const kpis = [
    { label: 'Total spent',           value: _fmtMoneyCompact(d.spend),         sub: spendDeltaLbl,                                                accent: spendAccent },
    { label: 'Avg monthly spend',     value: _fmtMoneyCompact(avgMonthlySpend), sub: `over ${monthsInRange.toFixed(1)} months`,                    accent: 'blue' },
    { label: 'Net (income − spend)',  value: _fmtMoneyCompact(d.net),           sub: (d.income_projected || 0) > 0 ? `income ${_fmtMoneyCompact(d.income)} (incl. sources)` : `income ${_fmtMoneyCompact(d.income)}`, accent: d.net >= 0 ? 'green' : 'red' },
    { label: 'Savings rate',          value: savingsRate != null ? `${savingsRate}%` : '—', sub: savingsRate != null ? 'kept of income' : 'add income sources', accent: savingsRate == null ? 'gray' : savingsRate >= 20 ? 'green' : savingsRate >= 0 ? 'amber' : 'red' },
    { label: 'Net worth',             value: _fmtMoneyCompact(d.net_worth),     sub: `${_fmtMoneyCompact(wb.assets || 0)} assets · ${_fmtMoneyCompact(wb.liabilities || 0)} debt`, accent: (d.net_worth || 0) >= 0 ? 'blue' : 'red' },
  ];
  if (d.age != null) {
    kpis.push({ label: 'Age', value: d.age, sub: d.years_to_retire != null ? `${d.years_to_retire}y to retirement` : 'set retirement age', accent: 'purple' });
  }
  if (d.unclassified_count > 0) {
    kpis.push({ label: 'To reconcile', value: d.unclassified_count, sub: 'click Reconcile tab', accent: 'amber' });
  }

  const kpisHTML = kpis.map(k => `
    <div class="stat-card stat-card--${k.accent}">
      <div class="stat-label">${escHtml(k.label)}</div>
      <div class="stat-value">${typeof k.value === 'string' ? escHtml(k.value) : k.value}</div>
      ${k.sub ? `<div class="stat-sub">${escHtml(k.sub)}</div>` : ''}
    </div>`).join('');

  // Range pills
  const pillsHTML = FIN_RANGE_PRESETS.map(p =>
    `<button class="fin-range-pill${p.key === rangeKey ? ' active' : ''}" data-range="${p.key}">${escHtml(p.label)}</button>`
  ).join('');

  // By-category breakdown (spending only — exclude income/savings/excluded)
  const spendCats = (d.by_category || []).filter(r => !r.is_income && !r.is_savings && !r.is_excluded && r.total < 0);
  const totalSpend = spendCats.reduce((s, r) => s + Math.abs(r.total), 0) || 1;
  const catRowsHTML = spendCats.length ? spendCats.map(r => {
    const v = Math.abs(r.total);
    const pct = Math.round(v / totalSpend * 100);
    return `
      <div class="fin-cat-row">
        <span class="fin-cat-icon">${escHtml(r.icon || '•')}</span>
        <span class="fin-cat-name">${escHtml(r.name)}</span>
        <div class="fin-cat-bar"><div class="fin-cat-bar-fill tag-${r.color}" style="width:${pct}%"></div></div>
        <span class="fin-cat-amt">${_fmtMoney(v)}</span>
        <span class="fin-cat-pct">${pct}%</span>
      </div>`;
  }).join('') : `<div class="di-empty">No spending data in this range.</div>`;

  const flowHTML        = _renderFlowsSVG(d.monthly_flows || []);
  const catTrends       = d.category_trends || [];
  const catTrendHTML    = _renderCategoryTrendSVG(catTrends, d.range_start, d.range_end, d.span_days || 90);
  const catTrendLegend  = catTrends.map(ct => {
    const col = CAT_COLOR_VIVID[ct.color] || '#888';
    return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--text-muted)">
      <svg width="20" height="3" viewBox="0 0 20 3"><line x1="0" y1="1.5" x2="20" y2="1.5" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/></svg>
      ${escHtml(ct.name)}
    </span>`;
  }).join('');

  // Top merchants (replaces "Recent transactions")
  const merchTotal = (d.top_merchants || []).reduce((s, m) => s + (m.total || 0), 0) || 1;
  const merchHTML = (d.top_merchants || []).length ? (d.top_merchants).map(m => {
    const pct = Math.round((m.total / merchTotal) * 100);
    const cleaned = (m.name || '').slice(0, 32);
    return `
      <div class="fin-merch-row">
        <div class="fin-merch-name" title="${escHtml(m.name)}">${escHtml(cleaned)}</div>
        <div class="fin-merch-cnt">${m.cnt}×</div>
        <div class="fin-cat-bar"><div class="fin-cat-bar-fill" style="width:${pct}%"></div></div>
        <div class="fin-merch-amt">${_fmtMoney(m.total)}</div>
      </div>`;
  }).join('') : `<div class="di-empty">No spending in this range.</div>`;

  // Finance goals
  const goalsHTML = (d.finance_goals || []).map(g => {
    const pct = g.target_amount > 0 ? Math.round(g.current_amount / g.target_amount * 100) : 0;
    return `
      <div class="fin-goal-row">
        <div class="fin-goal-name">${escHtml(g.name)}</div>
        <div class="fin-goal-bar"><div class="fin-goal-bar-fill" style="width:${Math.min(100,pct)}%"></div></div>
        <div class="fin-goal-amts">${_fmtMoney(g.current_amount)} / ${_fmtMoney(g.target_amount)} (${pct}%)</div>
      </div>`;
  }).join('') || `<div class="di-empty">No financial goals yet — add one in the Goals tab.</div>`;

  c.innerHTML = `
    <div class="fin-range-bar">
      <div class="fin-range-pills">${pillsHTML}</div>
      <span class="fin-range-dates">${_fmtRangeLabel(d.range_start, d.range_end)}</span>
    </div>

    <div class="stats-row" style="grid-template-columns:repeat(${kpis.length},1fr)">${kpisHTML}</div>

    <div class="fin-grid-2">
      <div class="fin-panel">
        <div class="fin-panel-header">
          <h3>Income vs spending — last 12 months</h3>
          <div class="fin-flow-legend">
            <span><i class="fin-flow-dot fin-flow-dot--income"></i>Income</span>
            <span><i class="fin-flow-dot fin-flow-dot--spend"></i>Spending</span>
          </div>
        </div>
        <div class="fin-panel-body">${flowHTML}</div>
      </div>
      <div class="fin-panel">
        <div class="fin-panel-header">
          <h3>Spending by category</h3>
          <span style="color:var(--text-muted);font-size:13px">${_fmtMoney(totalSpend)} total</span>
        </div>
        <div class="fin-panel-body" style="max-height:420px;overflow:auto">${catRowsHTML}</div>
      </div>
    </div>

    <div class="fin-grid-2">
      <div class="fin-panel">
        <div class="fin-panel-header">
          <h3>Spending trends</h3>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">${catTrendLegend}</div>
        </div>
        <div class="fin-panel-body" style="padding:10px 14px">${catTrendHTML}</div>
      </div>
      <div class="fin-panel">
        <div class="fin-panel-header">
          <h3>Top merchants</h3>
          <span class="fin-link" id="fin-go-txns">View all transactions →</span>
        </div>
        <div class="fin-panel-body">${merchHTML}</div>
      </div>
    </div>

    <div class="fin-grid-2">
      <div class="fin-panel">
        <div class="fin-panel-header">
          <h3>Wealth breakdown</h3>
          <span class="fin-link" id="fin-go-wealth">Manage →</span>
        </div>
        <div class="fin-panel-body">${_wealthBreakdownHTML(wb)}</div>
      </div>
      <div class="fin-panel">
        <div class="fin-panel-header">
          <h3>Financial goals</h3>
          <span class="fin-link" id="fin-go-goals">View planning →</span>
        </div>
        <div class="fin-panel-body">${goalsHTML}</div>
      </div>
    </div>`;

  c.querySelectorAll('.fin-range-pill').forEach(p =>
    p.addEventListener('click', () => {
      localStorage.setItem('fin_range', p.dataset.range);
      _renderFinOverview(c);
    }));
  c.querySelector('#fin-go-txns')?.addEventListener('click', () => _setFinView('transactions'));
  c.querySelector('#fin-go-goals')?.addEventListener('click', () => _setFinView('planning'));
  c.querySelector('#fin-go-wealth')?.addEventListener('click', () => _setFinView('wealth'));
}

function _wealthBreakdownHTML(wb) {
  const cash = wb.cash || 0, inv = wb.investments || 0, priv = wb.private || 0;
  const debt = wb.liabilities || 0;
  const totalAssets = Math.max(cash + inv + priv, 1);
  const row = (label, val, color, denom) => {
    const pct = denom ? Math.round(val / denom * 100) : 0;
    return `
      <div class="fin-cat-row">
        <span class="fin-cat-icon">•</span>
        <span class="fin-cat-name">${label}</span>
        <div class="fin-cat-bar"><div class="fin-cat-bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <span class="fin-cat-amt">${_fmtMoney(val)}</span>
        <span class="fin-cat-pct">${pct}%</span>
      </div>`;
  };
  let html = '';
  html += row('Cash',         cash, '#00FF88', totalAssets);
  html += row('Investments',  inv,  '#00E5FF', totalAssets);
  html += row('Private',      priv, '#BF5FFF', totalAssets);
  if (debt > 0) {
    html += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border-subtle)"></div>`;
    html += row('Liabilities (debt)', debt, '#FF2D55', debt);
  }
  return html;
}

function _renderFlowsSVG(flows) {
  if (!flows.length) return `<div class="di-empty" style="padding:40px 0">No data — import transactions or add income</div>`;
  // Pad to last 12 calendar months so the chart always has 12 slots
  const today = new Date();
  const buckets = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    buckets.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  const map = {};
  flows.forEach(f => { map[f.bucket] = f; });
  const rows = buckets.map(b => ({
    bucket: b,
    income: map[b]?.income || 0,
    spend:  map[b]?.spend  || 0,
  }));
  const max = Math.max(...rows.map(r => Math.max(r.income, r.spend)), 50);

  // Tighter padding so bars fill the container edge-to-edge
  const W = 600, H = 210, PAD_L = 44, PAD_R = 6, PAD_T = 10, PAD_B = 24;
  const innerW = W - PAD_L - PAD_R, innerH = H - PAD_T - PAD_B;
  const n = rows.length;
  const slot = innerW / n;
  const barW = Math.max(8, slot * 0.38);

  const yFor = v => PAD_T + innerH * (1 - v / max);

  // Distinct gridlines at 5 evenly-spaced levels, solid, higher opacity
  const grid = [0.2, 0.4, 0.6, 0.8, 1.0].map(p => {
    const y = PAD_T + innerH * (1 - p);
    return `<line x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${W - PAD_R}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.11)" stroke-width="1"/>`;
  }).join('');

  // Vibrant neon bars
  const bars = rows.map((r, i) => {
    const cx  = PAD_L + slot * (i + 0.5);
    const incX = cx - barW - 1, spdX = cx + 1;
    const incY = yFor(r.income), spdY = yFor(r.spend);
    const incH = (PAD_T + innerH) - incY, spdH = (PAD_T + innerH) - spdY;
    return `
      <rect x="${incX.toFixed(1)}" y="${incY.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1,incH).toFixed(1)}" rx="2" fill="#00FF88" fill-opacity="0.80"/>
      <rect x="${spdX.toFixed(1)}" y="${spdY.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1,spdH).toFixed(1)}" rx="2" fill="#FF2D55" fill-opacity="0.85"/>`;
  }).join('');

  // Y-axis labels at 0, 50%, 100%
  const yLbls = [0, 0.5, 1].map(p => {
    const v = max * p;
    return `<text x="${PAD_L-5}" y="${yFor(v)+4}" text-anchor="end" fill="rgba(255,255,255,0.38)" font-size="11">$${_fmtAxisNum(v)}</text>`;
  }).join('');

  // X labels: every other month to avoid overlap
  const xLbls = rows.map((r, i) => {
    if (i % 2 !== 0 && i !== n - 1) return '';
    const [y, m] = r.bucket.split('-');
    const txt = new Date(parseInt(y), parseInt(m)-1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const x = PAD_L + slot * (i + 0.5);
    return `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle" fill="rgba(255,255,255,0.38)" font-size="11">${escHtml(txt)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
    ${grid}${bars}${yLbls}${xLbls}
  </svg>`;
}

function _fmtRangeLabel(s, e) {
  if (!s || !e) return '';
  const sd = new Date(s + 'T00:00:00');
  const ed = new Date(e + 'T00:00:00');
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(sd)} – ${fmt(ed)}`;
}

function _monthLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

const CAT_COLOR_VIVID = {
  blue:   '#4A9EFF',
  green:  '#00D084',
  red:    '#FF3B5C',
  purple: '#9B59F5',
  teal:   '#00CEC9',
  amber:  '#FFB800',
  coral:  '#FF6B6B',
  pink:   '#FF69B4',
  gray:   '#A0A0B0',
};

function _renderCategoryTrendSVG(catTrends, rangeStart, rangeEnd, spanDays) {
  if (!catTrends || !catTrends.length) {
    return `<div class="di-empty" style="padding:40px 0">No spending data in this range</div>`;
  }

  const monthly = spanDays > 60;

  // Build the complete ordered list of buckets across the range
  const buckets = [];
  if (monthly) {
    const s = new Date((rangeStart || '2000-01-01') + 'T00:00:00');
    const e = new Date((rangeEnd   || new Date().toISOString().slice(0,10)) + 'T00:00:00');
    const cur = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cur <= e) {
      buckets.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`);
      cur.setMonth(cur.getMonth() + 1);
    }
  } else {
    const s = new Date((rangeStart || '2000-01-01') + 'T00:00:00');
    const e = new Date((rangeEnd   || new Date().toISOString().slice(0,10)) + 'T00:00:00');
    const cur = new Date(s);
    while (cur <= e) {
      buckets.push(_isoLocal(cur));
      cur.setDate(cur.getDate() + 1);
    }
  }

  if (!buckets.length) return `<div class="di-empty" style="padding:40px 0">No data</div>`;

  // Build per-category value arrays (zeros for missing buckets)
  const series = catTrends.map(ct => {
    const bmap = {};
    (ct.buckets || []).forEach(b => { bmap[b.bucket] = b.total; });
    return {
      name:   ct.name,
      color:  CAT_COLOR_VIVID[ct.color] || '#888',
      values: buckets.map(b => bmap[b] || 0),
    };
  });

  const allVals = series.flatMap(s => s.values);
  const maxVal  = Math.max(...allVals, 1);

  const W = 600, H = 200, PAD_L = 46, PAD_R = 12, PAD_T = 14, PAD_B = 28;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const n = buckets.length;
  const xFor = i  => PAD_L + (n > 1 ? i / (n - 1) : 0.5) * innerW;
  const yFor = v  => PAD_T + innerH * (1 - v / maxVal);

  // Grid lines
  const grid = [0.25, 0.5, 0.75, 1.0].map(p => {
    const y = PAD_T + innerH * (1 - p);
    return `<line x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${W - PAD_R}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.09)" stroke-width="1"/>`;
  }).join('');

  // Lines per category
  const lines = series.map(s => {
    const pts = s.values.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>`;
  }).join('');

  // Dots on data points (only if few buckets)
  const dots = n <= 24 ? series.map(s =>
    s.values.map((v, i) => {
      if (v === 0) return '';
      return `<circle cx="${xFor(i).toFixed(1)}" cy="${yFor(v).toFixed(1)}" r="3" fill="${s.color}" opacity="0.9"><title>${escHtml(s.name)}: ${_fmtMoney(v)}</title></circle>`;
    }).join('')
  ).join('') : '';

  // Y-axis labels at 3 levels
  const yLbls = [0, 0.5, 1].map(p => {
    const v = maxVal * p;
    return `<text x="${PAD_L - 5}" y="${yFor(v) + 4}" text-anchor="end" fill="rgba(255,255,255,0.38)" font-size="11">$${_fmtAxisNum(v)}</text>`;
  }).join('');

  // X-axis labels: show ~5 evenly spaced ticks
  const step = Math.max(1, Math.ceil(n / 5));
  const xLbls = buckets.map((b, i) => {
    if (i % step !== 0 && i !== n - 1) return '';
    let lbl;
    if (monthly) {
      const [yr, mo] = b.split('-');
      lbl = new Date(parseInt(yr), parseInt(mo) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    } else {
      const d = new Date(b + 'T00:00:00');
      lbl = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return `<text x="${xFor(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" fill="rgba(255,255,255,0.38)" font-size="11">${escHtml(lbl)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
    ${grid}${lines}${dots}${yLbls}${xLbls}
  </svg>`;
}

function _fmtAxisNum(v) {
  if (v >= 1000) return `${Math.round(v/1000)}k`;
  return Math.round(v);
}

// ── Transactions list ────────────────────────────────────────────────────────
async function _renderFinTransactions(c) {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10);

  // Restore persisted state (defaults on first visit)
  const fromVal = _ftxState.from || monthStart;
  const toVal   = _ftxState.to   || today.toISOString().slice(0,10);

  let _items = [];
  let _sortCol = _ftxState.sortCol || 'date';
  let _sortDir = _ftxState.sortDir || 'desc';

  c.innerHTML = `
    <div class="fin-toolbar">
      <label>From <input type="date" id="ftx-from" value="${fromVal}"></label>
      <label>To <input type="date" id="ftx-to" value="${toVal}"></label>
      <div class="fin-ms-wrap" id="ftx-cat-wrap">
        <button class="fin-ms-btn" id="ftx-cat-btn" type="button">All categories</button>
        <div class="fin-ms-panel" id="ftx-cat-panel" style="display:none">
          ${_finCats.map(cat => `<label class="fin-ms-item"><input type="checkbox" class="fin-ms-cb" value="${cat.id}"> <span>${escHtml((cat.icon||'')+' '+cat.name)}</span></label>`).join('')}
        </div>
      </div>
      <select id="ftx-acct">
        <option value="">All accounts</option>
        ${_finAccts.map(a => `<option value="${a.id}">${escHtml(a.name)}</option>`).join('')}
      </select>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px">
        <input type="checkbox" id="ftx-uncl"> Unclassified only
      </label>
      <button class="btn btn-secondary btn-sm" id="ftx-reload">Reload</button>
    </div>
    <div class="fin-panel">
      <div class="fin-panel-header"><h3 id="ftx-count">Loading…</h3><div id="ftx-totals" style="font-size:13px;color:var(--text-muted)"></div></div>
      <div class="fin-txn-row fin-txn-row--hdr">
        <span class="fin-sort-hdr" data-col="date">Date<span class="fin-sort-ind"></span></span>
        <span class="fin-sort-hdr" data-col="name">Name<span class="fin-sort-ind"></span></span>
        <span class="fin-sort-hdr" data-col="category">Category<span class="fin-sort-ind"></span></span>
        <span class="fin-sort-hdr fin-txn-amt" data-col="amount">Amount<span class="fin-sort-ind"></span></span>
        <span></span>
      </div>
      <div class="fin-panel-body fin-txn-list" id="ftx-list"></div>
    </div>`;

  // Restore select / checkbox state after innerHTML is set
  if (_ftxState.acct) c.querySelector('#ftx-acct').value  = _ftxState.acct;
  if (_ftxState.uncl) c.querySelector('#ftx-uncl').checked = true;

  // Multi-select category: restore checked state and wire toggle
  const _updateCatLabel = () => {
    const checked = c.querySelectorAll('.fin-ms-cb:checked');
    const btn = c.querySelector('#ftx-cat-btn');
    if (!btn) return;
    if (checked.length === 0) { btn.textContent = 'All categories'; return; }
    if (checked.length === 1) {
      const cat = _finCats.find(ct => String(ct.id) === checked[0].value);
      btn.textContent = cat ? ((cat.icon || '') + ' ' + cat.name).trim() : '1 category';
    } else {
      btn.textContent = `${checked.length} categories`;
    }
  };

  if (_ftxState.cats.length) {
    const cbSet = new Set(_ftxState.cats.map(String));
    c.querySelectorAll('.fin-ms-cb').forEach(cb => { if (cbSet.has(cb.value)) cb.checked = true; });
    _updateCatLabel();
  }

  c.querySelector('#ftx-cat-btn').addEventListener('click', e => {
    e.stopPropagation();
    const panel = c.querySelector('#ftx-cat-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  // Close panel when clicking outside — self-removes once element is gone
  const _closeCatPanel = () => {
    const panel = document.querySelector('#ftx-cat-panel');
    if (!panel) { document.removeEventListener('click', _closeCatPanel); return; }
    panel.style.display = 'none';
  };
  document.addEventListener('click', _closeCatPanel);

  c.querySelector('#ftx-cat-panel').addEventListener('change', e => {
    if (e.target.classList.contains('fin-ms-cb')) { _updateCatLabel(); reload(); }
  });
  c.querySelector('#ftx-cat-panel').addEventListener('click', e => e.stopPropagation());

  const _updateSortHdrs = () => {
    c.querySelectorAll('.fin-sort-hdr').forEach(el => {
      const ind = el.querySelector('.fin-sort-ind');
      if (ind) ind.textContent = el.dataset.col === _sortCol ? (_sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    });
  };

  const _renderList = () => {
    const sorted = [..._items].sort((a, b) => {
      let va, vb;
      if      (_sortCol === 'date')     { va = a.date;                              vb = b.date; }
      else if (_sortCol === 'name')     { va = (a.name||'').toLowerCase();          vb = (b.name||'').toLowerCase(); }
      else if (_sortCol === 'category') { va = (a.category_name||'').toLowerCase(); vb = (b.category_name||'').toLowerCase(); }
      else                              { va = a.amount;                            vb = b.amount; }
      if (va < vb) return _sortDir === 'asc' ? -1 : 1;
      if (va > vb) return _sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    c.querySelector('#ftx-list').innerHTML = sorted.length
      ? sorted.map(t => _txnRow(t)).join('')
      : `<div class="di-empty">No transactions match your filters.</div>`;
    _wireTxnRows(c);
    _updateSortHdrs();
  };

  c.querySelectorAll('.fin-sort-hdr').forEach(el => {
    el.addEventListener('click', () => {
      const col = el.dataset.col;
      if (_sortCol === col) {
        _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        _sortCol = col;
        _sortDir = (col === 'date' || col === 'amount') ? 'desc' : 'asc';
      }
      _ftxState.sortCol = _sortCol;
      _ftxState.sortDir = _sortDir;
      _renderList();
    });
  });

  const reload = async () => {
    const params = new URLSearchParams();
    const f = getDateVal(c.querySelector('#ftx-from'));
    const e = getDateVal(c.querySelector('#ftx-to'));
    const cats = Array.from(c.querySelectorAll('.fin-ms-cb:checked')).map(cb => cb.value);
    const acct = c.querySelector('#ftx-acct').value;
    const uncl = c.querySelector('#ftx-uncl').checked;
    // Persist filter state so it survives tab switches and modal saves
    _ftxState.from = f; _ftxState.to = e; _ftxState.cats = cats; _ftxState.acct = acct; _ftxState.uncl = uncl;
    if (f) params.set('start', f);
    if (e) params.set('end', e);
    if (cats.length) params.set('category_ids', cats.join(','));
    if (acct) params.set('account_id', acct);
    if (uncl) params.set('only_unclassified', 'true');
    let res;
    try { res = await apiFetch('GET', '/finance/transactions?' + params.toString()); }
    catch(err) { c.querySelector('#ftx-list').innerHTML = `<div class="empty-state">${err.message}</div>`; return; }
    _items = res.items || [];
    const total   = res.total  ?? _items.length;
    const loaded  = res.loaded ?? _items.length;
    const income  = res.income ?? 0;
    const spend   = res.spend  ?? 0;
    const net     = income - spend;
    const excl    = res.excluded_count ?? 0;
    const exclNote   = excl > 0 ? ` <span style="color:var(--text-muted);font-size:12px">(${excl} excluded from totals)</span>` : '';
    const cappedNote = loaded < total ? ` <span style="color:var(--neon-amber);font-size:12px">⚠ showing ${loaded.toLocaleString()} of ${total.toLocaleString()}</span>` : '';
    c.querySelector('#ftx-count').textContent = `${total.toLocaleString()} transactions`;
    c.querySelector('#ftx-totals').innerHTML = `Income ${_fmtMoney(income)} · Spend ${_fmtMoney(spend)} · Net ${_fmtMoney(net)}${exclNote}${cappedNote}`;
    _renderList();
  };

  c.querySelector('#ftx-reload').addEventListener('click', reload);
  ['ftx-from','ftx-to','ftx-acct','ftx-uncl'].forEach(id =>
    c.querySelector('#'+id).addEventListener('change', reload));
  _updateSortHdrs();
  reload();
}

function _txnRow(t) {
  const amt = t.amount;
  const amtClass = amt < 0 ? 'fin-amt-neg' : amt > 0 ? 'fin-amt-pos' : '';
  const catCls = t.category_color ? ` tag-${t.category_color}` : '';
  const catLabel = t.category_name ? `${t.category_icon || ''} ${t.category_name}` : 'Unclassified';
  const excludedNote = t.category_is_excluded ? ' <span class="fin-excluded-mark" title="Excluded from totals">∅</span>' : '';
  const catBadge = t.category_id
    ? `<span class="fin-cat-badge${catCls}">${escHtml(catLabel)}${excludedNote}</span>`
    : `<span class="fin-cat-badge fin-cat-badge--unclassified">⚠ Unclassified</span>`;
  return `
    <div class="fin-txn-row" data-id="${t.id}" data-cat-id="${t.category_id || ''}">
      <span class="fin-txn-date">${formatDateShort(t.date)}</span>
      <span class="fin-txn-name" title="${escHtml(t.name)}">${escHtml(t.name)}</span>
      ${catBadge}
      <span class="fin-txn-amt ${amtClass}">${_fmtMoney(amt)}</span>
      <button class="fin-txn-edit" data-id="${t.id}" data-cat-id="${t.category_id || ''}" title="Edit / reclassify">⋯</button>
    </div>`;
}

function _wireTxnRows(c) {
  c.querySelectorAll('.fin-txn-edit').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _openTxnEditModal(parseInt(btn.dataset.id), parseInt(btn.dataset.catId) || null);
    });
  });
  c.querySelectorAll('.fin-txn-row:not(.fin-txn-row--hdr)').forEach(row => {
    row.style.cursor = 'pointer';
    row.addEventListener('click', e => {
      if (e.target.closest('.fin-txn-edit')) return;
      _openTxnEditModal(parseInt(row.dataset.id), parseInt(row.dataset.catId) || null);
    });
  });
}

function _openTxnEditModal(tid, currentCatId) {
  const c = document.getElementById('fin-content');
  const row = c.querySelector(`.fin-txn-row[data-id="${tid}"]`);
  const name = row?.querySelector('.fin-txn-name')?.textContent || '';
  const defaultPattern = _suggestMerchantPattern(name) || name.slice(0, 20).toUpperCase();
  const catOptions = _finCats.map(ct =>
    `<option value="${ct.id}"${ct.id === currentCatId ? ' selected' : ''}>${escHtml((ct.icon||'')+' '+ct.name)}</option>`
  ).join('');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:500px">
      <div class="modal-header">
        <span class="modal-title">Edit transaction</span>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Name</label>
          <input class="form-input" id="ftx-edit-name" value="${escHtml(name)}">
        </div>
        <div class="form-group">
          <label class="form-label">Category</label>
          <select class="form-select" id="ftx-edit-cat">
            <option value="">— Unclassified —</option>
            ${catOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Auto-classification rule</label>
          <div style="display:flex;flex-direction:column;gap:6px;font-size:13px">
            <label style="display:flex;align-items:center;gap:6px">
              <input type="checkbox" id="ftx-edit-rule">
              Create rule to auto-categorize future matches
            </label>
            <div id="ftx-rule-opts" style="display:none;margin-left:20px;padding:8px;background:var(--bg-hover);border-radius:var(--radius-el)">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <span style="white-space:nowrap;color:var(--text-muted)">Name contains</span>
                <input class="form-input" id="ftx-edit-rule-pattern" value="${escHtml(defaultPattern)}" style="flex:1">
              </div>
              <label style="display:flex;align-items:center;gap:6px">
                <input type="checkbox" id="ftx-edit-overwrite" checked>
                <span>Also reclassify <strong>all existing</strong> transactions matching this pattern</span>
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-danger btn-sm" id="ftx-edit-delete">Delete</button>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary modal-cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="ftx-edit-save">Save</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  const dismiss = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 150); };
  overlay.querySelector('.modal-close').addEventListener('click', dismiss);
  overlay.querySelector('.modal-cancel-btn').addEventListener('click', dismiss);
  overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });

  overlay.querySelector('#ftx-edit-rule').addEventListener('change', function() {
    overlay.querySelector('#ftx-rule-opts').style.display = this.checked ? '' : 'none';
  });

  overlay.querySelector('#ftx-edit-save').addEventListener('click', async () => {
    const newName = overlay.querySelector('#ftx-edit-name').value.trim();
    const cid = overlay.querySelector('#ftx-edit-cat').value;
    const createRule = overlay.querySelector('#ftx-edit-rule').checked;
    const pattern = overlay.querySelector('#ftx-edit-rule-pattern').value.trim();
    const overwrite = overlay.querySelector('#ftx-edit-overwrite').checked;
    try {
      if (createRule && cid && pattern) {
        await apiFetch('POST', '/finance/reconcile/assign', {
          transaction_id: tid,
          category_id: parseInt(cid),
          create_rule: true, rule_type: 'merchant', rule_pattern: pattern,
          overwrite_classified: overwrite,
        });
      } else {
        await apiFetch('PUT', `/finance/transactions/${tid}`, {
          category_id: cid ? parseInt(cid) : null,
          clear_category: !cid,
          name: newName,
        });
      }
      dismiss();
      _setFinView(_finView);
    } catch(e) { alert('Error: ' + e.message); }
  });
  overlay.querySelector('#ftx-edit-delete').addEventListener('click', async () => {
    if (!confirm('Delete this transaction?')) return;
    try { await apiFetch('DELETE', `/finance/transactions/${tid}`); dismiss(); _setFinView(_finView); }
    catch(e) { alert('Error: ' + e.message); }
  });
}

// ── Reconciliation (grouped by merchant) ─────────────────────────────────────
async function _renderFinReconcile(c) {
  let res;
  try { res = await apiFetch('GET', '/finance/reconcile'); }
  catch (e) { c.innerHTML = `<div class="empty-state">${e.message}</div>`; return; }
  const items = res.items || [];
  if (!items.length) {
    c.innerHTML = `
      <div class="empty-state" style="padding:60px 0">
        <div class="empty-state-title" style="font-size:18px">✓ All transactions categorized</div>
        <p class="empty-state-text">Import a CSV in the Manage tab to add more.</p>
      </div>`;
    return;
  }

  // Group by exact merchant name (trimmed)
  const groupMap = new Map();
  for (const t of items) {
    const key = (t.name || '').trim();
    if (!groupMap.has(key)) {
      groupMap.set(key, { name: key, items: [], total: 0, dates: [], mccs: new Set() });
    }
    const g = groupMap.get(key);
    g.items.push(t);
    g.total += t.amount;
    g.dates.push(t.date);
    if (t.mcc) g.mccs.add(t.mcc);
  }
  const groups = [...groupMap.values()].sort((a, b) => b.items.length - a.items.length);
  const groupCount = groups.length;
  const totalCount = items.length;

  const catOptions = _finCats.map(cat =>
    `<option value="${cat.id}">${escHtml((cat.icon||'')+' '+cat.name)}</option>`
  ).join('');

  const groupRow = (g, idx) => {
    const sortedDates = g.dates.slice().sort();
    const dateRange = sortedDates.length === 1
      ? formatDateShort(sortedDates[0])
      : `${formatDateShort(sortedDates[0])} – ${formatDateShort(sortedDates[sortedDates.length - 1])}`;
    const mccs = [...g.mccs];
    const singleMcc = mccs.length === 1 ? mccs[0] : null;
    const ruleTypeOpts = singleMcc
      ? `<option value="merchant">By merchant</option><option value="mcc">By MCC ${escHtml(singleMcc)}</option>`
      : `<option value="merchant">By merchant</option>`;
    const items = g.items;
    const sample = items.slice(0, 3).map(t => `${formatDateShort(t.date)} · ${_fmtMoney(t.amount)}`).join(' · ');
    const more = items.length > 3 ? ` (+${items.length - 3} more)` : '';
    return `
      <div class="fin-rec-row" data-idx="${idx}">
        <div class="fin-rec-summary">
          <input type="checkbox" class="fin-rec-check" data-idx="${idx}">
          <span class="fin-txn-date">${escHtml(dateRange)}</span>
          <span class="fin-txn-name">
            ${escHtml(g.name)}
            <span class="fin-rec-count-badge">×${items.length}</span>
          </span>
          <span class="fin-txn-amt ${g.total < 0 ? 'fin-amt-neg' : 'fin-amt-pos'}">${_fmtMoney(g.total)}</span>
        </div>
        <div class="fin-rec-meta">
          ${singleMcc ? `<span class="fin-rec-chip">MCC ${escHtml(singleMcc)}</span>` : (mccs.length ? `<span class="fin-rec-chip">${mccs.length} MCCs</span>` : '')}
          <span class="fin-rec-chip" style="opacity:0.85">${escHtml(sample)}${more}</span>
        </div>
        <div class="fin-rec-actions">
          <select class="form-select fin-rec-cat" data-idx="${idx}">
            <option value="">— Pick category —</option>
            ${catOptions}
          </select>
          <label class="fin-rec-rule-toggle">
            <input type="checkbox" class="fin-rec-rule" data-idx="${idx}" checked>
            <span>Save rule</span>
          </label>
          <select class="form-select fin-rec-rule-type" data-idx="${idx}">
            ${ruleTypeOpts}
          </select>
          <input class="form-input fin-rec-pattern" data-idx="${idx}" value="${escHtml(_suggestMerchantPattern(g.name))}" placeholder="pattern">
          <button class="btn btn-primary btn-sm fin-rec-apply" data-idx="${idx}" title="Apply category to all ${items.length} transaction(s) in this group${' & save a rule for future matches'}">Apply to all</button>
          <button class="btn btn-secondary btn-sm fin-rec-skip" data-idx="${idx}" title="Categorize the ${items.length} transaction(s) without saving a rule">No rule</button>
        </div>
      </div>`;
  };

  c.innerHTML = `
    <div class="fin-panel">
      <div class="fin-panel-header">
        <h3>${groupCount} merchant${groupCount === 1 ? '' : 's'} · ${totalCount} transaction${totalCount === 1 ? '' : 's'} need a category</h3>
        <span style="font-size:13px;color:var(--text-muted)">Transactions are grouped by exact merchant — categorize the whole group at once.</span>
      </div>
      <div class="fin-rec-bulk-bar" id="fin-rec-bulk">
        <label class="fin-rec-bulk-master">
          <input type="checkbox" id="fin-rec-select-all">
          <span><span id="fin-rec-bulk-count">0</span> groups selected</span>
        </label>
        <select class="form-select" id="fin-rec-bulk-cat" disabled>
          <option value="">— Bulk category —</option>
          ${catOptions}
        </select>
        <button class="btn btn-primary btn-sm" id="fin-rec-bulk-apply" disabled>Apply to selected groups</button>
        <span style="margin-left:auto;font-size:12px;color:var(--text-muted)">Bulk apply categorizes without creating rules.</span>
      </div>
      <div class="fin-panel-body fin-rec-list">
        ${groups.map((g, i) => groupRow(g, i)).join('')}
      </div>
    </div>`;

  // Pattern auto-fill when rule type changes
  c.querySelectorAll('.fin-rec-rule-type').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = sel.dataset.idx;
      const g   = groups[parseInt(idx)];
      const patEl = c.querySelector(`.fin-rec-pattern[data-idx="${idx}"]`);
      if (sel.value === 'mcc') patEl.value = [...g.mccs][0] || '';
      else patEl.value = _suggestMerchantPattern(g.name);
    });
  });

  const applyGroup = async (idx, withRule) => {
    const g = groups[parseInt(idx)];
    if (!g) return;
    const cid = c.querySelector(`.fin-rec-cat[data-idx="${idx}"]`).value;
    if (!cid) { alert('Pick a category first.'); return; }
    const ruleType = c.querySelector(`.fin-rec-rule-type[data-idx="${idx}"]`).value;
    const pattern  = c.querySelector(`.fin-rec-pattern[data-idx="${idx}"]`).value.trim();
    try {
      if (withRule) {
        // The reconcile/assign endpoint creates the rule and retroactively
        // categorizes ALL unclassified transactions matching the pattern,
        // so calling once with the first transaction handles the whole group.
        await apiFetch('POST', '/finance/reconcile/assign', {
          transaction_id: g.items[0].id,
          category_id: parseInt(cid),
          create_rule: true,
          rule_type: ruleType,
          rule_pattern: pattern,
        });
      } else {
        // Bulk-categorize all transactions in the group
        for (const t of g.items) {
          await apiFetch('PUT', `/finance/transactions/${t.id}`, { category_id: parseInt(cid) });
        }
      }
      _renderFinReconcile(c);
    } catch(e) { alert('Error: ' + e.message); }
  };

  c.querySelectorAll('.fin-rec-apply').forEach(btn =>
    btn.addEventListener('click', () => applyGroup(btn.dataset.idx, true)));
  c.querySelectorAll('.fin-rec-skip').forEach(btn =>
    btn.addEventListener('click', () => applyGroup(btn.dataset.idx, false)));

  // ── Bulk selection across groups ──
  const bulkCat   = c.querySelector('#fin-rec-bulk-cat');
  const bulkBtn   = c.querySelector('#fin-rec-bulk-apply');
  const bulkCount = c.querySelector('#fin-rec-bulk-count');
  const masterCB  = c.querySelector('#fin-rec-select-all');

  const updateBulkUI = () => {
    const checked = c.querySelectorAll('.fin-rec-check:checked');
    const n = checked.length;
    bulkCount.textContent = n;
    bulkCat.disabled = n === 0;
    bulkBtn.disabled = n === 0 || !bulkCat.value;
    const all = c.querySelectorAll('.fin-rec-check');
    masterCB.checked = n > 0 && n === all.length;
    masterCB.indeterminate = n > 0 && n < all.length;
    c.querySelectorAll('.fin-rec-row').forEach(r => {
      const cb = r.querySelector('.fin-rec-check');
      r.classList.toggle('fin-rec-row--selected', cb?.checked);
    });
  };

  c.querySelectorAll('.fin-rec-check').forEach(cb => cb.addEventListener('change', updateBulkUI));
  masterCB.addEventListener('change', () => {
    c.querySelectorAll('.fin-rec-check').forEach(cb => { cb.checked = masterCB.checked; });
    updateBulkUI();
  });
  bulkCat.addEventListener('change', updateBulkUI);

  bulkBtn.addEventListener('click', async () => {
    const cid = parseInt(bulkCat.value);
    const idxs = [...c.querySelectorAll('.fin-rec-check:checked')].map(cb => parseInt(cb.dataset.idx));
    if (!cid || !idxs.length) return;
    const txnTotal = idxs.reduce((s, i) => s + groups[i].items.length, 0);
    bulkBtn.disabled = true;
    bulkBtn.textContent = `Applying to ${txnTotal} txns…`;
    let ok = 0, fail = 0;
    for (const i of idxs) {
      for (const t of groups[i].items) {
        try { await apiFetch('PUT', `/finance/transactions/${t.id}`, { category_id: cid }); ok++; }
        catch(e) { fail++; }
      }
    }
    if (fail) alert(`Bulk applied to ${ok} transactions; ${fail} failed.`);
    _renderFinReconcile(c);
  });
}

function _suggestMerchantPattern(name) {
  if (!name) return '';
  // Take first significant word of the merchant
  const cleaned = name.replace(/^(SQ \*|TST\*|DD \*|APF\*|DRI\*)/i, '').trim();
  const w = cleaned.split(/\s+/)[0];
  return (w || cleaned).slice(0, 20).toUpperCase();
}

// ── Income ───────────────────────────────────────────────────────────────────
async function _renderFinIncome(c) {
  const rangeKey = _fincState.preset || '12m';
  let start, end;
  if (rangeKey === 'custom' && _fincState.from && _fincState.to) {
    start = _fincState.from;
    end   = _fincState.to;
  } else {
    const r = _finRangeFor(rangeKey === 'custom' ? '12m' : rangeKey);
    start = r.start;
    end   = r.end;
  }

  c.innerHTML = `<div class="loading-state">Loading…</div>`;

  let hist, sources;
  try {
    [hist, sources] = await Promise.all([
      apiFetch('GET', `/finance/income/history?start=${start}&end=${end}`),
      apiFetch('GET', '/finance/income'),
    ]);
  } catch(e) {
    c.innerHTML = `<div class="empty-state">${e.message}</div>`;
    return;
  }

  const srcItems = sources.items || [];
  const monthlyPlanned = srcItems.filter(i => i.is_active).reduce((s, i) => {
    if (i.frequency === 'monthly')  return s + i.amount;
    if (i.frequency === 'biweekly') return s + i.amount * 26 / 12;
    if (i.frequency === 'weekly')   return s + i.amount * 52 / 12;
    if (i.frequency === 'annual')   return s + i.amount / 12;
    return s;
  }, 0);

  const { total, txn_count, monthly_avg, by_category, by_month } = hist;
  const maxCat   = by_category.length ? by_category[0].total : 1;
  const maxMonth = by_month.length ? Math.max(...by_month.map(m => m.total)) : 1;

  const incRangePills = [...FIN_RANGE_PRESETS, { key: 'custom', label: 'Custom' }];
  const pillsHTML = incRangePills.map(p =>
    `<button class="fin-range-pill${rangeKey === p.key ? ' active' : ''}" data-range="${p.key}">${escHtml(p.label)}</button>`
  ).join('');

  const catRowsHTML = by_category.length ? by_category.map(r => `
    <div class="fin-income-cat-row">
      <span class="fin-cat-icon">${escHtml(r.icon || '•')}</span>
      <span class="fin-income-cat-name">${escHtml(r.name)}</span>
      <div class="fin-cat-bar"><div class="fin-cat-bar-fill ${r.color ? 'tag-'+r.color : 'tag-green'}" style="width:${maxCat > 0 ? Math.round(r.total / maxCat * 100) : 0}%"></div></div>
      <span class="fin-cat-amt">${_fmtMoney(r.total)}</span>
      <span class="fin-cat-pct">${r.pct}%</span>
      <span class="fin-income-txn-ct">${r.txn_count} txn${r.txn_count !== 1 ? 's' : ''}</span>
    </div>`).join('') : `<div class="di-empty">No income transactions found in this period.</div>`;

  const monthRowsHTML = by_month.map(r => {
    const [yr, mo] = r.bucket.split('-');
    const label = new Date(parseInt(yr), parseInt(mo) - 1, 1).toLocaleString('default', { month: 'short', year: 'numeric' });
    const pct = maxMonth > 0 ? Math.round(r.total / maxMonth * 100) : 0;
    return `
      <div class="fin-income-month-row">
        <span class="fin-income-month-label">${escHtml(label)}</span>
        <div class="fin-cat-bar" style="flex:1"><div class="fin-cat-bar-fill tag-green" style="width:${pct}%"></div></div>
        <span class="fin-cat-amt">${_fmtMoney(r.total)}</span>
        <span class="fin-income-txn-ct">${r.txn_count} txn${r.txn_count !== 1 ? 's' : ''}</span>
      </div>`;
  }).join('');

  const srcRowsHTML = srcItems.length ? srcItems.map(i => `
    <div class="fin-list-row" data-id="${i.id}">
      <div class="fin-list-main">
        <div class="fin-list-title">${escHtml(i.name)}${i.is_active ? '' : ' <span style="color:var(--text-muted);font-size:12px">(inactive)</span>'}</div>
        <div class="fin-list-sub">${_fmtMoney(i.amount)} ${escHtml(i.frequency)}${i.start_date ? ` · since ${formatDateShort(i.start_date)}` : ''}</div>
      </div>
      <div class="fin-list-actions">
        <button class="btn btn-secondary btn-sm fin-inc-edit" data-id="${i.id}">Edit</button>
        <button class="goal-metric-del fin-inc-del" data-id="${i.id}">×</button>
      </div>
    </div>`).join('') : `<div class="di-empty">No manual income sources yet.</div>`;

  c.innerHTML = `
    <div class="fin-income-wrap">
      <div class="fin-toolbar" style="margin-bottom:16px">
        ${pillsHTML}
        <span id="finc-custom-range" style="display:${rangeKey === 'custom' ? 'flex' : 'none'};align-items:center;gap:6px">
          <label style="font-size:13px;color:var(--text-muted)">From <input type="date" id="finc-from" value="${start}"></label>
          <label style="font-size:13px;color:var(--text-muted)">To <input type="date" id="finc-to" value="${end}"></label>
          <button class="btn btn-secondary btn-sm" id="finc-load">Load</button>
        </span>
      </div>

      <div class="stats-row" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">
        <div class="stat-card stat-card--green">
          <div class="stat-label">Total income</div>
          <div class="stat-value">${_fmtMoneyCompact(total)}</div>
          <div class="stat-sub">${txn_count} transaction${txn_count !== 1 ? 's' : ''}</div>
        </div>
        <div class="stat-card stat-card--blue">
          <div class="stat-label">Monthly average</div>
          <div class="stat-value">${_fmtMoneyCompact(monthly_avg)}</div>
          <div class="stat-sub">over ${hist.months_count} month${hist.months_count !== 1 ? 's' : ''}</div>
        </div>
        <div class="stat-card stat-card--purple">
          <div class="stat-label">Planned monthly</div>
          <div class="stat-value">${_fmtMoneyCompact(monthlyPlanned)}</div>
          <div class="stat-sub">from income sources</div>
        </div>
      </div>

      ${total > 0 ? `
      <div class="fin-panel" style="margin-bottom:16px">
        <div class="fin-panel-header"><h3>By category</h3></div>
        <div class="fin-panel-body fin-income-cats">${catRowsHTML}</div>
      </div>

      <div class="fin-panel" style="margin-bottom:16px">
        <div class="fin-panel-header"><h3>By month</h3></div>
        <div class="fin-panel-body fin-income-months">${monthRowsHTML}</div>
      </div>` : `
      <div class="fin-panel" style="margin-bottom:16px">
        <div class="fin-panel-body"><div class="di-empty">No income transactions found in this period. Try a wider date range or import transactions with positive amounts.</div></div>
      </div>`}

      <div class="fin-panel">
        <div class="fin-panel-header">
          <h3>Income sources</h3>
          <div style="display:flex;gap:8px;align-items:center">
            ${monthlyPlanned > 0 ? `<span style="color:var(--text-muted);font-size:13px">Monthly equiv:</span><span style="font-weight:600;color:var(--neon-green)">${_fmtMoney(monthlyPlanned)}</span>` : ''}
            <button class="btn btn-primary btn-sm" id="fin-inc-add">+ New source</button>
          </div>
        </div>
        <div class="fin-panel-body">${srcRowsHTML}</div>
      </div>
    </div>`;

  // Wire range pills
  c.querySelectorAll('.fin-range-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.range;
      _fincState.preset = key;
      if (key !== 'custom') { _fincState.from = null; _fincState.to = null; }
      _renderFinIncome(c);
    });
  });

  // Wire custom date load
  c.querySelector('#finc-load')?.addEventListener('click', () => {
    _fincState.from = getDateVal(c.querySelector('#finc-from'));
    _fincState.to   = getDateVal(c.querySelector('#finc-to'));
    _renderFinIncome(c);
  });

  // Wire income sources
  c.querySelector('#fin-inc-add').addEventListener('click', () => _openIncomeModal(null));
  c.querySelectorAll('.fin-inc-edit').forEach(btn =>
    btn.addEventListener('click', () => _openIncomeModal(srcItems.find(i => i.id === parseInt(btn.dataset.id)))));
  c.querySelectorAll('.fin-inc-del').forEach(btn =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this income source?')) return;
      await apiFetch('DELETE', `/finance/income/${btn.dataset.id}`);
      _renderFinIncome(c);
    }));
}

function _isoDateOnly(s) {
  // Normalize a wide range of inputs to "YYYY-MM-DD"; return '' if unparseable.
  if (s == null) return '';
  const str = String(s).trim();
  if (!str) return '';
  // ISO: 2026-05-01 (with optional time)
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // US slash: 5/1/2026 or 05/01/2026
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  // Last resort: Date.parse (handles "May 1, 2026", etc.)
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  return '';
}

function _openIncomeModal(existing) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const e = existing || { name: '', amount: '', frequency: 'monthly', is_active: 1 };
  const startVal = _isoDateOnly(e.start_date);
  const endVal   = _isoDateOnly(e.end_date);
  overlay.innerHTML = `
    <div class="modal" style="width:460px">
      <div class="modal-header">
        <span class="modal-title">${existing ? 'Edit' : 'New'} income source</span>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="inc-name" value="${escHtml(e.name)}" placeholder="Salary, Side gig, …" style="width:100%"></div>
        <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="form-label">Amount</label><input class="form-input" id="inc-amount" type="number" step="0.01" value="${e.amount}" style="width:100%"></div>
          <div><label class="form-label">Frequency</label>
            <select class="form-select" id="inc-freq" style="width:100%">
              ${['monthly','biweekly','weekly','annual','one-time'].map(f => `<option value="${f}"${e.frequency===f?' selected':''}>${f}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="form-label">Start date <span style="color:var(--text-muted);font-weight:400">(optional)</span></label><input class="form-input" id="inc-start" type="date" value="${startVal}" style="width:100%"></div>
          <div><label class="form-label">End date <span style="color:var(--text-muted);font-weight:400">(optional)</span></label><input class="form-input" id="inc-end" type="date" value="${endVal}" style="width:100%"></div>
        </div>
        <div class="settings-hint" style="margin-bottom:8px">If both dates are blank, the source is assumed to be active for the whole reporting range.</div>
        <div class="form-group ev-checkbox-row"><input type="checkbox" id="inc-active"${e.is_active ? ' checked' : ''}><label class="form-label" for="inc-active">Active</label></div>
        <div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" id="inc-notes" rows="2" style="width:100%">${escHtml(e.notes || '')}</textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="inc-save">${existing ? 'Save' : 'Create'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  const dismiss = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 150); };
  overlay.querySelector('.modal-close').addEventListener('click', dismiss);
  overlay.querySelector('.modal-cancel-btn').addEventListener('click', dismiss);
  overlay.addEventListener('click', ev => { if (ev.target === overlay) dismiss(); });
  overlay.querySelector('#inc-save').addEventListener('click', async () => {
    const body = {
      name: overlay.querySelector('#inc-name').value.trim(),
      amount: parseFloat(overlay.querySelector('#inc-amount').value) || 0,
      frequency: overlay.querySelector('#inc-freq').value,
      start_date: _isoDateOnly(overlay.querySelector('#inc-start').value) || null,
      end_date:   _isoDateOnly(overlay.querySelector('#inc-end').value)   || null,
      is_active: overlay.querySelector('#inc-active').checked ? 1 : 0,
      notes: overlay.querySelector('#inc-notes').value.trim() || null,
    };
    if (!body.name || !body.amount) { alert('Name and amount are required.'); return; }
    if (body.start_date && body.end_date && body.start_date > body.end_date) {
      alert('Start date must be before end date.'); return;
    }
    try {
      if (existing) await apiFetch('PUT',  `/finance/income/${existing.id}`, body);
      else          await apiFetch('POST', '/finance/income', body);
      dismiss();
      _setFinView('income');
    } catch(err) { alert('Error: ' + err.message); }
  });
}

// ── Wealth (Holdings + Liabilities, sectioned) ───────────────────────────────
const HOLDING_SECTIONS = [
  { key: 'cash',        label: 'Cash & savings',  types: ['cash'],                          color: '#22C55E' },
  { key: 'investments', label: 'Investments',     types: ['stock','etf','bond','crypto'],   color: '#00BFFF' },
  { key: 'private',     label: 'Private holdings', types: ['real_estate','private','other'], color: '#9D4EDD' },
];

async function _renderFinWealth(c) {
  let holdings, liabilities;
  try {
    [holdings, liabilities] = await Promise.all([
      apiFetch('GET', '/finance/holdings'),
      apiFetch('GET', '/finance/liabilities'),
    ]);
  } catch(e) { c.innerHTML = `<div class="empty-state">${e.message}</div>`; return; }
  const items = holdings.items || [];
  const liabs = liabilities.items || [];

  const sectionTotals = {};
  HOLDING_SECTIONS.forEach(s => {
    sectionTotals[s.key] = items.filter(h => s.types.includes(h.type))
      .reduce((sum, h) => sum + (h.market_value || 0), 0);
  });
  const totalAssets = Object.values(sectionTotals).reduce((a, b) => a + b, 0);
  const totalDebt   = liabs.reduce((s, l) => s + (l.current_balance || 0), 0);
  const netWorth    = totalAssets - totalDebt;

  // Hero
  const heroHTML = `
    <div class="fin-net-hero">
      <div class="fin-net-hero-row">
        <div>
          <div class="fin-net-hero-label">Net worth</div>
          <div class="fin-net-hero-value" style="color:${netWorth >= 0 ? 'var(--neon-green)' : 'var(--neon-red)'}">${_fmtMoney(netWorth)}</div>
        </div>
        <div class="fin-net-hero-split">
          <div><div class="fin-net-hero-sub">Assets</div><div class="fin-net-hero-amt">${_fmtMoney(totalAssets)}</div></div>
          <div><div class="fin-net-hero-sub">Liabilities</div><div class="fin-net-hero-amt" style="color:var(--neon-red)">${_fmtMoney(totalDebt)}</div></div>
        </div>
      </div>
      <div class="fin-net-hero-bars">
        ${HOLDING_SECTIONS.map(s => {
          const v = sectionTotals[s.key];
          const pct = totalAssets > 0 ? Math.round(v / totalAssets * 100) : 0;
          return `<div class="fin-cat-row">
            <span class="fin-cat-name">${escHtml(s.label)}</span>
            <div class="fin-cat-bar"><div class="fin-cat-bar-fill" style="width:${pct}%;background:${s.color}"></div></div>
            <span class="fin-cat-amt">${_fmtMoney(v)}</span>
            <span class="fin-cat-pct">${pct}%</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;

  // Asset sections
  const sectionsHTML = HOLDING_SECTIONS.map(s => {
    const ofType = items.filter(h => s.types.includes(h.type));
    return `
      <div class="fin-panel">
        <div class="fin-panel-header">
          <h3>${escHtml(s.label)} <span style="color:var(--text-muted);font-weight:400;font-size:13px">· ${_fmtMoney(sectionTotals[s.key])}</span></h3>
          <button class="btn btn-primary btn-sm fin-h-add" data-section="${s.key}">+ Add</button>
        </div>
        <div class="fin-panel-body">
          ${ofType.length ? ofType.map(h => _holdingRowHTML(h)).join('') : `<div class="di-empty">No ${s.label.toLowerCase()} yet.</div>`}
        </div>
      </div>`;
  }).join('');

  // Liabilities section
  const liabsHTML = `
    <div class="fin-panel">
      <div class="fin-panel-header">
        <h3>Liabilities (debt) <span style="color:var(--text-muted);font-weight:400;font-size:13px">· ${_fmtMoney(totalDebt)}</span></h3>
        <button class="btn btn-primary btn-sm" id="fin-l-add">+ Add liability</button>
      </div>
      <div class="fin-panel-body">
        ${liabs.length ? liabs.map(l => `
          <div class="fin-list-row" data-id="${l.id}">
            <div class="fin-list-main">
              <div class="fin-list-title">${escHtml(l.name)} <span style="color:var(--text-muted);font-size:12px">(${escHtml(l.kind || 'loan')})</span></div>
              <div class="fin-list-sub">
                Balance ${_fmtMoney(l.current_balance)}
                ${l.interest_rate != null ? ` · ${l.interest_rate}% APR` : ''}
                ${l.monthly_interest_est != null ? ` · ~${_fmtMoney(l.monthly_interest_est)}/mo interest` : ''}
                ${l.payment_amount != null ? ` · ${_fmtMoney(l.payment_amount)} ${l.payment_frequency || ''}` : ''}
                ${l.lender ? ` · ${escHtml(l.lender)}` : ''}
              </div>
            </div>
            <div class="fin-list-actions">
              <button class="btn btn-secondary btn-sm fin-l-edit" data-id="${l.id}">Edit</button>
              <button class="goal-metric-del fin-l-del" data-id="${l.id}">×</button>
            </div>
          </div>
        `).join('') : `<div class="di-empty">No debts yet — add a loan, mortgage, or credit-card balance.</div>`}
      </div>
    </div>`;

  c.innerHTML = `${heroHTML}<div class="fin-grid-2">${sectionsHTML}</div>${liabsHTML}`;

  c.querySelectorAll('.fin-h-add').forEach(b =>
    b.addEventListener('click', () => _openHoldingModal(null, b.dataset.section)));
  c.querySelectorAll('.fin-h-edit').forEach(b =>
    b.addEventListener('click', () => _openHoldingModal(items.find(i => i.id === parseInt(b.dataset.id)))));
  c.querySelectorAll('.fin-h-del').forEach(b =>
    b.addEventListener('click', async () => {
      if (!confirm('Delete this holding?')) return;
      await apiFetch('DELETE', `/finance/holdings/${b.dataset.id}`);
      _renderFinWealth(c);
    }));

  c.querySelector('#fin-l-add').addEventListener('click', () => _openLiabilityModal(null));
  c.querySelectorAll('.fin-l-edit').forEach(b =>
    b.addEventListener('click', () => _openLiabilityModal(liabs.find(l => l.id === parseInt(b.dataset.id)))));
  c.querySelectorAll('.fin-l-del').forEach(b =>
    b.addEventListener('click', async () => {
      if (!confirm('Delete this liability?')) return;
      await apiFetch('DELETE', `/finance/liabilities/${b.dataset.id}`);
      _renderFinWealth(c);
    }));
}

function _holdingRowHTML(h) {
  const gain = (h.shares != null && h.cost_basis != null && h.current_price != null)
    ? h.shares * h.current_price - h.cost_basis : null;
  const detail = [
    h.shares != null ? `${h.shares} ${h.symbol || 'shares'}` : null,
    h.current_price != null ? `@ ${_fmtMoney(h.current_price)}` : null,
    gain != null ? `<span style="color:${gain >= 0 ? 'var(--neon-green)' : 'var(--neon-red)'}">${gain >= 0 ? '↑' : '↓'} ${_fmtMoney(Math.abs(gain))}</span>` : null,
  ].filter(Boolean).join(' · ');
  return `
    <div class="fin-list-row" data-id="${h.id}">
      <div class="fin-list-main">
        <div class="fin-list-title">${h.symbol ? `<span style="font-family:monospace;color:var(--text-muted);margin-right:8px">${escHtml(h.symbol)}</span>` : ''}${escHtml(h.name)}</div>
        <div class="fin-list-sub">${_fmtMoney(h.market_value || 0)}${detail ? ' · ' + detail : ''}</div>
      </div>
      <div class="fin-list-actions">
        <button class="btn btn-secondary btn-sm fin-h-edit" data-id="${h.id}">Edit</button>
        <button class="goal-metric-del fin-h-del" data-id="${h.id}">×</button>
      </div>
    </div>`;
}

function _openHoldingModal(existing, defaultSection) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  // Pick a sensible default type given the section
  const defaultType = defaultSection === 'cash' ? 'cash'
    : defaultSection === 'investments' ? 'stock'
    : defaultSection === 'private' ? 'private' : 'cash';
  const e = existing || { type: defaultType, name: '' };
  const hasAdvanced = !!(e.shares || e.cost_basis || e.current_price || e.symbol);
  overlay.innerHTML = `
    <div class="modal" style="width:520px">
      <div class="modal-header"><span class="modal-title">${existing ? 'Edit' : 'New'} holding</span><button class="modal-close">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Name</label>
          <input class="form-input" id="h-name" value="${escHtml(e.name||'')}" placeholder="e.g., Chase Savings, Vanguard Brokerage, Rental property">
        </div>
        <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="form-label">Type</label>
            <select class="form-select" id="h-type">
              <optgroup label="Cash">
                <option value="cash"${e.type==='cash'?' selected':''}>Cash / Savings</option>
              </optgroup>
              <optgroup label="Investments">
                <option value="stock"${e.type==='stock'?' selected':''}>Stock</option>
                <option value="etf"${e.type==='etf'?' selected':''}>ETF / Mutual fund</option>
                <option value="bond"${e.type==='bond'?' selected':''}>Bond</option>
                <option value="crypto"${e.type==='crypto'?' selected':''}>Crypto</option>
              </optgroup>
              <optgroup label="Private">
                <option value="real_estate"${e.type==='real_estate'?' selected':''}>Real estate</option>
                <option value="private"${e.type==='private'?' selected':''}>Private holding</option>
                <option value="other"${e.type==='other'?' selected':''}>Other</option>
              </optgroup>
            </select>
          </div>
          <div><label class="form-label">Current value</label>
            <input class="form-input" id="h-value" type="number" step="0.01" value="${e.value ?? (e.market_value ?? '')}" placeholder="$ total">
          </div>
        </div>
        <div class="form-group">
          <button type="button" class="btn btn-secondary btn-sm" id="h-adv-toggle" style="font-size:12px">
            ${hasAdvanced ? '− Hide' : '+ Show'} share / cost-basis details (optional)
          </button>
          <div id="h-adv" style="${hasAdvanced ? '' : 'display:none'};margin-top:10px;padding:10px;background:var(--bg-hover);border-radius:var(--radius-el)">
            <div class="settings-hint" style="margin-bottom:8px">Optional. Filling these enables gain/loss tracking. If "Current value" is blank, it'll be computed as shares × price.</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px">
              <div><label class="form-label" style="font-size:11px">Symbol</label><input class="form-input" id="h-symbol" value="${escHtml(e.symbol||'')}" placeholder="VOO"></div>
              <div><label class="form-label" style="font-size:11px">Shares</label><input class="form-input" id="h-shares" type="number" step="0.0001" value="${e.shares ?? ''}"></div>
              <div><label class="form-label" style="font-size:11px">Cost basis</label><input class="form-input" id="h-cost" type="number" step="0.01" value="${e.cost_basis ?? ''}"></div>
              <div><label class="form-label" style="font-size:11px">Current price</label><input class="form-input" id="h-price" type="number" step="0.01" value="${e.current_price ?? ''}"></div>
            </div>
          </div>
        </div>
        <div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" id="h-notes" rows="2">${escHtml(e.notes || '')}</textarea></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary modal-cancel-btn">Cancel</button><button class="btn btn-primary" id="h-save">${existing ? 'Save' : 'Create'}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  const dismiss = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 150); };
  overlay.querySelector('.modal-close').addEventListener('click', dismiss);
  overlay.querySelector('.modal-cancel-btn').addEventListener('click', dismiss);
  overlay.addEventListener('click', ev => { if (ev.target === overlay) dismiss(); });
  const advBtn = overlay.querySelector('#h-adv-toggle');
  advBtn.addEventListener('click', () => {
    const adv = overlay.querySelector('#h-adv');
    const open = adv.style.display !== 'none';
    adv.style.display = open ? 'none' : '';
    advBtn.textContent = open ? '+ Show share / cost-basis details (optional)' : '− Hide share / cost-basis details (optional)';
  });
  overlay.querySelector('#h-save').addEventListener('click', async () => {
    const valVal    = parseFloat(overlay.querySelector('#h-value').value);
    const sharesVal = parseFloat(overlay.querySelector('#h-shares').value);
    const priceVal  = parseFloat(overlay.querySelector('#h-price').value);
    const body = {
      type:   overlay.querySelector('#h-type').value,
      symbol: overlay.querySelector('#h-symbol').value.trim() || null,
      name:   overlay.querySelector('#h-name').value.trim(),
      value:  isFinite(valVal) ? valVal : null,
      shares: isFinite(sharesVal) ? sharesVal : null,
      cost_basis: parseFloat(overlay.querySelector('#h-cost').value) || null,
      current_price: isFinite(priceVal) ? priceVal : null,
      notes:  overlay.querySelector('#h-notes').value.trim() || null,
    };
    if (!body.name) { alert('Name is required.'); return; }
    if (body.value == null && (body.shares == null || body.current_price == null) && body.cost_basis == null) {
      alert('Enter a Current value, or Shares × Current price, or a Cost basis.');
      return;
    }
    if ((body.value || 0) < 0) { alert('Value must be ≥ 0. For debt, use Liabilities.'); return; }
    try {
      if (existing) await apiFetch('PUT',  `/finance/holdings/${existing.id}`, body);
      else          await apiFetch('POST', '/finance/holdings', body);
      dismiss();
      _setFinView('wealth');
    } catch(err) { alert('Error: ' + err.message); }
  });
}

function _openLiabilityModal(existing) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const l = existing || { kind: 'loan' };
  overlay.innerHTML = `
    <div class="modal" style="width:520px">
      <div class="modal-header"><span class="modal-title">${existing ? 'Edit' : 'New'} liability</span><button class="modal-close">×</button></div>
      <div class="modal-body">
        <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="form-label">Name</label><input class="form-input" id="l-name" value="${escHtml(l.name||'')}" placeholder="Student loan, Auto loan, …"></div>
          <div><label class="form-label">Kind</label>
            <select class="form-select" id="l-kind">
              ${['loan','credit_card','mortgage','student_loan','line_of_credit','other'].map(k => `<option value="${k}"${l.kind===k?' selected':''}>${k.replace('_',' ')}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div><label class="form-label">Original principal</label><input class="form-input" id="l-principal" type="number" step="0.01" value="${l.principal ?? ''}"></div>
          <div><label class="form-label">Current balance</label><input class="form-input" id="l-balance" type="number" step="0.01" value="${l.current_balance ?? ''}"></div>
          <div><label class="form-label">Interest rate (APR%)</label><input class="form-input" id="l-rate" type="number" step="0.001" value="${l.interest_rate ?? ''}"></div>
        </div>
        <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div><label class="form-label">Payment amount</label><input class="form-input" id="l-payment" type="number" step="0.01" value="${l.payment_amount ?? ''}"></div>
          <div><label class="form-label">Frequency</label>
            <select class="form-select" id="l-freq">
              <option value="">—</option>
              ${['monthly','biweekly','weekly','annual','one-time'].map(f => `<option value="${f}"${l.payment_frequency===f?' selected':''}>${f}</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Next payment</label><input class="form-input" id="l-next" type="date" value="${l.next_payment_date || ''}"></div>
        </div>
        <div class="form-group"><label class="form-label">Lender</label><input class="form-input" id="l-lender" value="${escHtml(l.lender||'')}"></div>
        <div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" id="l-notes" rows="2">${escHtml(l.notes || '')}</textarea></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary modal-cancel-btn">Cancel</button><button class="btn btn-primary" id="l-save">${existing ? 'Save' : 'Create'}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  const dismiss = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 150); };
  overlay.querySelector('.modal-close').addEventListener('click', dismiss);
  overlay.querySelector('.modal-cancel-btn').addEventListener('click', dismiss);
  overlay.addEventListener('click', ev => { if (ev.target === overlay) dismiss(); });
  overlay.querySelector('#l-save').addEventListener('click', async () => {
    const body = {
      name: overlay.querySelector('#l-name').value.trim(),
      kind: overlay.querySelector('#l-kind').value,
      principal: parseFloat(overlay.querySelector('#l-principal').value) || null,
      current_balance: parseFloat(overlay.querySelector('#l-balance').value) || 0,
      interest_rate: parseFloat(overlay.querySelector('#l-rate').value) || null,
      payment_amount: parseFloat(overlay.querySelector('#l-payment').value) || null,
      payment_frequency: overlay.querySelector('#l-freq').value || null,
      next_payment_date: overlay.querySelector('#l-next').value || null,
      lender: overlay.querySelector('#l-lender').value.trim() || null,
      notes: overlay.querySelector('#l-notes').value.trim() || null,
    };
    if (!body.name) { alert('Name is required.'); return; }
    try {
      if (existing) await apiFetch('PUT',  `/finance/liabilities/${existing.id}`, body);
      else          await apiFetch('POST', '/finance/liabilities', body);
      dismiss();
      _setFinView('wealth');
    } catch(err) { alert('Error: ' + err.message); }
  });
}

// ── Financial Goals ──────────────────────────────────────────────────────────
async function _renderFinGoals(c) {
  let res;
  try { res = await apiFetch('GET', '/finance/goals'); }
  catch(e) { c.innerHTML = `<div class="empty-state">${e.message}</div>`; return; }
  const items = res.items || [];
  c.innerHTML = `
    <div class="fin-panel">
      <div class="fin-panel-header"><h3>Financial goals</h3>
        <button class="btn btn-primary btn-sm" id="fin-g-add">+ New goal</button>
      </div>
      <div class="fin-panel-body">
        ${items.length ? items.map(g => {
          const pct = g.target_amount > 0 ? Math.round(g.current_amount / g.target_amount * 100) : 0;
          return `
            <div class="fin-list-row" data-id="${g.id}">
              <div class="fin-list-main" style="flex:1;min-width:0">
                <div class="fin-list-title">${escHtml(g.name)} <span style="color:var(--text-muted);font-size:12px">(${escHtml(g.kind)})</span></div>
                <div class="fin-goal-bar"><div class="fin-goal-bar-fill" style="width:${Math.min(100,pct)}%"></div></div>
                <div class="fin-list-sub">${_fmtMoney(g.current_amount)} / ${_fmtMoney(g.target_amount)} (${pct}%)${g.target_date ? ` · by ${formatDateShort(g.target_date)}` : ''}</div>
              </div>
              <div class="fin-list-actions">
                <button class="btn btn-secondary btn-sm fin-g-edit" data-id="${g.id}">Edit</button>
                <button class="goal-metric-del fin-g-del" data-id="${g.id}">×</button>
              </div>
            </div>`;
        }).join('') : `<div class="di-empty">No financial goals yet — create one to start tracking progress.</div>`}
      </div>
    </div>`;
  c.querySelector('#fin-g-add').addEventListener('click', () => _openFinGoalModal(null));
  c.querySelectorAll('.fin-g-edit').forEach(btn =>
    btn.addEventListener('click', () => _openFinGoalModal(items.find(g => g.id === parseInt(btn.dataset.id)))));
  c.querySelectorAll('.fin-g-del').forEach(btn =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this goal?')) return;
      await apiFetch('DELETE', `/finance/goals/${btn.dataset.id}`);
      _renderFinGoals(c);
    }));
}

function _openFinGoalModal(existing) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const g = existing || { kind: 'savings', current_amount: 0 };
  overlay.innerHTML = `
    <div class="modal" style="width:440px">
      <div class="modal-header"><span class="modal-title">${existing ? 'Edit' : 'New'} financial goal</span><button class="modal-close">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="fg-name" value="${escHtml(g.name||'')}" placeholder="Emergency fund, House down payment, …"></div>
        <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="form-label">Kind</label>
            <select class="form-select" id="fg-kind">
              ${['savings','debt_payoff','investment','retirement','emergency','other'].map(k => `<option value="${k}"${g.kind===k?' selected':''}>${k}</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Target date</label><input class="form-input" id="fg-target-date" type="date" value="${g.target_date || ''}"></div>
        </div>
        <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="form-label">Target amount</label><input class="form-input" id="fg-target" type="number" step="0.01" value="${g.target_amount ?? ''}"></div>
          <div><label class="form-label">Current amount</label><input class="form-input" id="fg-current" type="number" step="0.01" value="${g.current_amount ?? 0}"></div>
        </div>
        <div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" id="fg-notes" rows="2">${escHtml(g.notes || '')}</textarea></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary modal-cancel-btn">Cancel</button><button class="btn btn-primary" id="fg-save">${existing ? 'Save' : 'Create'}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  const dismiss = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 150); };
  overlay.querySelector('.modal-close').addEventListener('click', dismiss);
  overlay.querySelector('.modal-cancel-btn').addEventListener('click', dismiss);
  overlay.addEventListener('click', ev => { if (ev.target === overlay) dismiss(); });
  overlay.querySelector('#fg-save').addEventListener('click', async () => {
    const body = {
      name: overlay.querySelector('#fg-name').value.trim(),
      kind: overlay.querySelector('#fg-kind').value,
      target_amount: parseFloat(overlay.querySelector('#fg-target').value) || 0,
      current_amount: parseFloat(overlay.querySelector('#fg-current').value) || 0,
      target_date: overlay.querySelector('#fg-target-date').value || null,
      notes: overlay.querySelector('#fg-notes').value.trim() || null,
    };
    if (!body.name || !body.target_amount) { alert('Name and target are required.'); return; }
    try {
      if (existing) await apiFetch('PUT',  `/finance/goals/${existing.id}`, body);
      else          await apiFetch('POST', '/finance/goals', body);
      dismiss();
      _setFinView('goals');
    } catch(err) { alert('Error: ' + err.message); }
  });
}

// ── Planning ─────────────────────────────────────────────────────────────────
async function _renderFinPlanning(c) {
  let plan;
  try { plan = await apiFetch('GET', '/finance/planning'); }
  catch(e) { c.innerHTML = `<div class="empty-state">${e.message}</div>`; return; }

  if (!_finPlanState.loaded) {
    _finPlanState.salaryIncome   = plan.salary_last_month || plan.monthly_income;
    _finPlanState.otherIncome    = plan.other_income_6mo  || 0;
    _finPlanState.monthlySpend   = plan.monthly_spend;
    _finPlanState.returnRate     = plan.return_rate;
    _finPlanState.inflationRate  = plan.inflation_rate;
    _finPlanState.investmentFrac = Math.round(plan.investment_frac * 100);
    _finPlanState.birthDate      = plan.birth_date        || '';
    _finPlanState.targetRetireAge = plan.target_retire_age || 62;
    _finPlanState.planMode       = plan.plan_mode         || 'safe';
    _finPlanState.loaded = true;
  }
  _finPlanState.netWorth            = plan.net_worth;
  _finPlanState.expenditures        = plan.expenditures        || [];
  _finPlanState.monthlyDebtPayments = plan.monthly_debt_payments || 0;
  _finPlanState.cashBalance         = plan.cash_balance         || 0;
  _finPlanState.investmentsBalance  = plan.investments_balance  || 0;

  const s   = _finPlanState;
  const age = _calcAge(s.birthDate);
  const glide       = age !== null ? _calcGlide(age, s.planMode) : null;
  const fireMultiple = s.planMode === 'aggressive' ? 25 : 28.57;
  const totalIncome = (s.salaryIncome || 0) + (s.otherIncome || 0);
  const fireNumber  = Math.round((s.monthlySpend || 0) * 12 * fireMultiple);
  const monthlyNet  = totalIncome - (s.monthlySpend || 0);
  const savingsRate = totalIncome > 0 ? (monthlyNet / totalIncome * 100) : 0;
  const yrsToTarget = age !== null ? Math.max(0, (s.targetRetireAge || 62) - age) : null;

  c.innerHTML = `
    <div class="fin-plan-wrap">
      <div class="fin-panel" style="margin-bottom:16px">
        <div class="fin-panel-header">
          <h3>Planning assumptions</h3>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="tf-group">
              <button class="tf-pill btn-sm plan-mode-btn${s.planMode !== 'aggressive' ? ' active' : ''}" data-mode="safe">Safe</button>
              <button class="tf-pill btn-sm plan-mode-btn${s.planMode === 'aggressive' ? ' active' : ''}" data-mode="aggressive">Aggressive</button>
            </div>
            <button class="btn btn-secondary btn-sm" id="plan-save-btn">Save</button>
          </div>
        </div>
        <div class="fin-panel-body">

          <div class="fin-plan-section-row"><span>Income</span><div class="fin-plan-section-rule"></div></div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:0">
            <div class="fin-plan-kv">
              <div class="fin-plan-label">Salary / mo</div>
              <div class="fin-plan-input-wrap"><span class="fin-plan-prefix">$</span><input class="fin-plan-input" id="plan-salary" type="number" step="1" value="${Math.round(s.salaryIncome || 0)}"></div>
              <div class="fin-plan-hint">last month</div>
            </div>
            <div class="fin-plan-kv">
              <div class="fin-plan-label">Other income</div>
              <div class="fin-plan-input-wrap"><span class="fin-plan-prefix">$</span><input class="fin-plan-input" id="plan-other-income" type="number" step="1" value="${Math.round(s.otherIncome || 0)}"></div>
              <div class="fin-plan-hint">6-mo avg</div>
            </div>
            <div class="fin-plan-kv">
              <div class="fin-plan-label">Annual raise</div>
              <div class="fin-plan-input-wrap"><input class="fin-plan-input" id="plan-raise-rate" type="number" step="0.5" min="0" max="30" value="${s.annualRaiseRate ?? 3}"><span class="fin-plan-suffix">%</span></div>
              <div class="fin-plan-hint">expected / yr</div>
            </div>
            <div class="fin-plan-kv">
              <div class="fin-plan-label">Raise cap</div>
              <div class="fin-plan-input-wrap"><input class="fin-plan-input" id="plan-raise-cap" type="number" step="0.5" min="0" max="30" value="${s.raiseCap ?? 8}"><span class="fin-plan-suffix">%</span></div>
              <div class="fin-plan-hint">max per year</div>
            </div>
            <div class="fin-plan-kv">
              <div class="fin-plan-label">% raise saved</div>
              <div class="fin-plan-input-wrap"><input class="fin-plan-input" id="plan-raise-saved" type="number" step="5" min="0" max="100" value="${s.savingsOfRaise ?? 50}"><span class="fin-plan-suffix">%</span></div>
              <div class="fin-plan-hint">rest is lifestyle</div>
            </div>
          </div>

          <div class="fin-plan-section-row"><span>Life &amp; Horizon</span><div class="fin-plan-section-rule"></div></div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:0">
            <div class="fin-plan-kv">
              <div class="fin-plan-label">Monthly spend</div>
              <div class="fin-plan-input-wrap"><span class="fin-plan-prefix">$</span><input class="fin-plan-input" id="plan-spend" type="number" step="1" value="${Math.round(s.monthlySpend || 0)}"></div>
              <div class="fin-plan-hint">90-day avg</div>
            </div>
            <div class="fin-plan-kv">
              <div class="fin-plan-label">Birth date</div>
              <div class="fin-plan-input-wrap"><input class="fin-plan-input" id="plan-birth-date" type="date" value="${s.birthDate || ''}" style="font-size:14px;font-weight:600;min-width:0;width:100%"></div>
              <div class="fin-plan-hint">${age !== null ? `age ${age}` : 'unlocks glide path'}</div>
            </div>
            <div class="fin-plan-kv">
              <div class="fin-plan-label">Target retire age</div>
              <div class="fin-plan-input-wrap"><input class="fin-plan-input" id="plan-retire-age" type="number" step="1" min="40" max="85" value="${s.targetRetireAge || 62}"></div>
              <div class="fin-plan-hint">${yrsToTarget !== null ? `${yrsToTarget} yrs away` : 'set birth date first'}</div>
            </div>
            <div class="fin-plan-kv">
              <div class="fin-plan-label">Invested %</div>
              <div class="fin-plan-input-wrap"><input class="fin-plan-input" id="plan-inv-frac" type="number" step="1" min="0" max="100" value="${s.investmentFrac || 0}"><span class="fin-plan-suffix">%</span></div>
              <div class="fin-plan-hint">of net worth</div>
            </div>
            <div class="fin-plan-kv">
              <div class="fin-plan-label">Years forward</div>
              <div class="fin-plan-input-wrap"><input class="fin-plan-input" id="plan-years" type="number" step="1" min="1" max="60" value="${s.yearsForward || 30}"></div>
              <div class="fin-plan-hint">projection length</div>
            </div>
          </div>

          <div class="fin-plan-section-row"><span>Investment model</span><div class="fin-plan-section-rule"></div></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 2fr;gap:0">
            <div class="fin-plan-kv">
              <div class="fin-plan-label">Annual return</div>
              <div class="fin-plan-input-wrap"><input class="fin-plan-input" id="plan-return" type="number" step="0.1" min="0" max="30" value="${s.returnRate || 7}"><span class="fin-plan-suffix">%</span></div>
              <div class="fin-plan-hint">${glide ? `glide path suggests ${(glide.annualReturn * 100).toFixed(1)}%` : 'investment growth rate'}</div>
            </div>
            <div class="fin-plan-kv">
              <div class="fin-plan-label">Inflation</div>
              <div class="fin-plan-input-wrap"><input class="fin-plan-input" id="plan-inflation" type="number" step="0.1" min="0" max="20" value="${s.inflationRate || 2.5}"><span class="fin-plan-suffix">%</span></div>
              <div class="fin-plan-hint">annual rate</div>
            </div>
            <div class="fin-plan-kv" style="border-left:1px solid var(--border-subtle);padding-left:16px">
              <div class="fin-plan-label">${s.planMode === 'aggressive' ? 'Aggressive' : 'Safe'} allocation${age !== null ? ` — age ${age}` : ''}</div>
              ${glide ? `
              <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin:3px 0;letter-spacing:-.01em">
                ${Math.round(glide.stocksPct * 100)}% <span style="color:rgba(77,159,255,0.9)">stocks</span>
                &nbsp;/&nbsp;
                ${Math.round(glide.bondsPct * 100)}% <span style="color:rgba(0,229,255,0.7)">bonds</span>
              </div>
              <div class="fin-plan-hint">${(glide.annualReturn * 100).toFixed(1)}% blended return · FIRE at ${fireMultiple}× annual spend</div>
              ` : `<div class="fin-plan-hint" style="margin-top:6px;font-size:12px">Enter birth date to see recommended stock/bond split · FIRE at ${fireMultiple}× annual spend</div>`}
            </div>
          </div>

          <div class="fin-plan-derived">
            Net worth: <strong>${_fmtMoneyCompact(s.netWorth)}</strong>
            &nbsp;·&nbsp; Monthly net: <strong style="color:${monthlyNet >= 0 ? 'var(--neon-green)' : 'var(--neon-red)'}">${_fmtMoney(monthlyNet)}</strong>
            &nbsp;·&nbsp; Savings rate: <strong style="color:${savingsRate >= 20 ? 'var(--neon-green)' : savingsRate >= 10 ? 'var(--neon-amber)' : 'var(--neon-red)'}">${savingsRate.toFixed(1)}%</strong>
            &nbsp;·&nbsp; FIRE #: <strong style="color:var(--neon-cyan)">${_fmtMoneyCompact(fireNumber)}</strong>
          </div>
        </div>
      </div>

      <div id="plan-kpis" style="margin-bottom:16px"></div>

      <div class="fin-panel" style="margin-bottom:16px">
        <div class="fin-panel-header">
          <h3>Net worth projection</h3>
          <div style="display:flex;gap:14px;align-items:center;font-size:13px;color:var(--text-secondary)">
            <span style="display:flex;align-items:center;gap:5px"><svg width="22" height="3"><line x1="0" y1="1.5" x2="22" y2="1.5" stroke="#00FF88" stroke-width="2.5"/></svg> Growth + raises</span>
            <span style="display:flex;align-items:center;gap:5px"><svg width="22" height="3"><line x1="0" y1="1.5" x2="22" y2="1.5" stroke="#00E5FF" stroke-width="2" stroke-dasharray="5,3"/></svg> Growth only</span>
            <span style="display:flex;align-items:center;gap:5px"><svg width="22" height="3"><line x1="0" y1="1.5" x2="22" y2="1.5" stroke="rgba(255,184,0,0.7)" stroke-width="1.5" stroke-dasharray="3,4"/></svg> No growth</span>
          </div>
        </div>
        <div class="fin-panel-body" id="plan-chart-wrap" style="padding:10px 14px"></div>
      </div>

      <div id="plan-milestones" style="margin-bottom:16px"></div>

      <div id="plan-glide" style="margin-bottom:16px"></div>

      <div class="fin-panel">
        <div class="fin-panel-header">
          <h3>Planned expenditures</h3>
          <button class="btn btn-primary btn-sm" id="plan-exp-add">+ Add</button>
        </div>
        <div class="fin-panel-body" id="plan-exp-list"></div>
      </div>
    </div>`;

  // Safe / Aggressive mode toggle
  c.querySelectorAll('.plan-mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.mode;
      if (mode === _finPlanState.planMode) return;
      // Snapshot current DOM inputs into state before re-render
      const inp = _readPlanInputs(c);
      Object.assign(_finPlanState, {
        salaryIncome: inp.salary, otherIncome: inp.otherIncome,
        monthlySpend: inp.spend,  returnRate: inp.ret, inflationRate: inp.inf,
        investmentFrac: Math.round(inp.invFrac * 100), yearsForward: inp.years,
        annualRaiseRate: inp.raiseRate, raiseCap: inp.raiseCap, savingsOfRaise: inp.raiseSaved,
        birthDate: inp.birthDate, targetRetireAge: inp.targetRetireAge,
        planMode: mode,
      });
      try { await apiFetch('PATCH', '/finance/planning/assumptions', { plan_mode: mode }); }
      catch(e) { /* non-critical */ }
      _setFinView('planning');
    });
  });

  // Save persistent settings
  c.querySelector('#plan-save-btn').addEventListener('click', async () => {
    const inp = _readPlanInputs(c);
    try {
      await apiFetch('PATCH', '/finance/planning/assumptions', {
        return_rate: inp.ret, inflation_rate: inp.inf,
        birth_date: inp.birthDate || null, target_retire_age: inp.targetRetireAge,
      });
      Object.assign(_finPlanState, { returnRate: inp.ret, inflationRate: inp.inf, birthDate: inp.birthDate, targetRetireAge: inp.targetRetireAge });
    } catch(e) { alert('Error: ' + e.message); }
  });

  // Live-update on any input change
  ['plan-salary','plan-other-income','plan-spend','plan-return','plan-inflation',
   'plan-inv-frac','plan-years','plan-raise-rate','plan-raise-cap','plan-raise-saved',
   'plan-birth-date','plan-retire-age'].forEach(id => {
    c.querySelector('#' + id)?.addEventListener('input', () => _redrawProjection(c));
  });

  c.querySelector('#plan-exp-add').addEventListener('click', () =>
    _openExpModal(null, () => { _finPlanState.loaded = false; _setFinView('planning'); }));

  _renderExpList(c);
  _redrawProjection(c);
}

function _calcAge(birthDate) {
  if (!birthDate) return null;
  const bd = new Date(birthDate + 'T00:00:00');
  if (isNaN(bd.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age >= 0 ? age : null;
}

function _calcGlide(age, mode) {
  const stocksPct = mode === 'aggressive'
    ? Math.max(0.40, Math.min(0.95, (110 - age) / 100))
    : Math.max(0.30, Math.min(0.90, (100 - age) / 100));
  const bondsPct    = 1 - stocksPct;
  const stockReturn = mode === 'aggressive' ? 0.09 : 0.07;
  const bondReturn  = mode === 'aggressive' ? 0.04 : 0.035;
  return { stocksPct, bondsPct, annualReturn: stocksPct * stockReturn + bondsPct * bondReturn };
}

function _readPlanInputs(c) {
  const salary      = parseFloat(c.querySelector('#plan-salary')?.value)       || 0;
  const otherIncome = parseFloat(c.querySelector('#plan-other-income')?.value) || 0;
  const spend       = parseFloat(c.querySelector('#plan-spend')?.value)        || 0;
  const ret         = parseFloat(c.querySelector('#plan-return')?.value)       || 7;
  const inf         = parseFloat(c.querySelector('#plan-inflation')?.value)    || 2.5;
  const invFrac     = (parseFloat(c.querySelector('#plan-inv-frac')?.value)    || 0) / 100;
  const years       = Math.min(60, Math.max(1, parseInt(c.querySelector('#plan-years')?.value) || 30));
  const raiseRate   = Math.max(0, parseFloat(c.querySelector('#plan-raise-rate')?.value)  || 0);
  const raiseCap    = Math.max(0, parseFloat(c.querySelector('#plan-raise-cap')?.value)   || 8);
  const raiseSaved  = Math.max(0, Math.min(100, parseFloat(c.querySelector('#plan-raise-saved')?.value) ?? 50));
  const birthDate   = c.querySelector('#plan-birth-date')?.value || '';
  const targetRetireAge = Math.max(40, Math.min(85, parseInt(c.querySelector('#plan-retire-age')?.value) || 62));
  const planMode    = _finPlanState.planMode || 'safe';
  const currentAge  = _calcAge(birthDate);
  return { salary, otherIncome, totalIncome: salary + otherIncome, spend, ret, inf, invFrac, years, raiseRate, raiseCap, raiseSaved, birthDate, targetRetireAge, planMode, currentAge };
}

function _redrawProjection(c) {
  const inp = _readPlanInputs(c);
  const { salary, otherIncome, totalIncome, spend, ret, inf, invFrac, years, raiseRate, raiseCap, raiseSaved, planMode, currentAge, targetRetireAge } = inp;
  Object.assign(_finPlanState, { annualRaiseRate: raiseRate, raiseCap, savingsOfRaise: raiseSaved });
  const nw   = _finPlanState.netWorth || 0;
  const exps = _finPlanState.expenditures || [];

  const result = _projectNetWorth({
    netWorth: nw, investmentFrac: invFrac,
    salaryIncome: salary, otherIncome,
    monthlySpend: spend, returnRate: ret,
    planMode, currentAge, expenditures: exps, yearsForward: years,
    annualRaiseRate: raiseRate, raiseCap, savingsOfRaise: raiseSaved,
  });

  const chartWrap = c.querySelector('#plan-chart-wrap');
  if (chartWrap) chartWrap.innerHTML = _renderProjectionSVG({ ...result, expenditures: exps, yearsForward: years, annualRaiseRate: raiseRate });

  const milestonesEl = c.querySelector('#plan-milestones');
  if (milestonesEl) milestonesEl.innerHTML = _planMilestonesHTML(result, { nw, monthlySpend: spend, yearsForward: years, annualRaiseRate: raiseRate, planMode });

  const kpisEl = c.querySelector('#plan-kpis');
  if (kpisEl) kpisEl.innerHTML = _renderKPICards({
    totalIncome, spend,
    netWorth: nw,
    cashBalance:         _finPlanState.cashBalance         || 0,
    investmentsBalance:  _finPlanState.investmentsBalance  || 0,
    monthlyDebtPayments: _finPlanState.monthlyDebtPayments || 0,
    fireNumber: result.fireNumber,
    retireYear: result.retireYear, retireYearStep: result.retireYearStep,
    currentAge, targetRetireAge, planMode,
  });

  const glideEl = c.querySelector('#plan-glide');
  if (glideEl) glideEl.innerHTML = _renderGlideTable(currentAge, targetRetireAge, planMode, years);
}

function _projectNetWorth({ netWorth, investmentFrac, salaryIncome = 0, otherIncome = 0, monthlySpend, returnRate, planMode = 'safe', currentAge = null, expenditures, yearsForward, annualRaiseRate = 0, raiseCap = 8, savingsOfRaise = 50 }) {
  const fireMultiple   = planMode === 'aggressive' ? 25 : 28.57;
  const fireNumber     = monthlySpend * 12 * fireMultiple;
  const monthlyIncome  = salaryIncome + otherIncome;
  const today          = new Date();

  // Return rate per month: use glide path if age known, else fixed returnRate
  const getMonthlyReturn = (yearN) => {
    if (currentAge !== null) {
      const { annualReturn } = _calcGlide(currentAge + yearN, planMode);
      return annualReturn / 12;
    }
    return (returnRate / 100) / 12;
  };
  let currentMR = getMonthlyReturn(0);

  let nw = netWorth, nwFlat = netWorth, nwStep = netWorth;
  let stepSalary  = salaryIncome;
  let stepSavings = monthlyIncome - monthlySpend;

  const points = [{ year: 0, nw: Math.round(nw), nwFlat: Math.round(nwFlat), nwStep: Math.round(nwStep) }];
  let retireYear = null, retireYearStep = null;
  let millionYear = null, millionYearStep = null;

  for (let month = 1; month <= yearsForward * 12; month++) {
    // Update blended return at start of each new year
    if (month % 12 === 1) currentMR = getMonthlyReturn(Math.ceil(month / 12));
    const curDate = new Date(today.getFullYear(), today.getMonth() + month, 1);
    const isoMonth = `${curDate.getFullYear()}-${String(curDate.getMonth()+1).padStart(2,'0')}`;

    const net = monthlyIncome - monthlySpend;
    nw     += net;
    nwFlat += net;
    nwStep += stepSavings;

    // Investment compound growth (glide-path-adjusted when birth date is set)
    nw     += nw     * investmentFrac * currentMR;
    nwStep += nwStep * investmentFrac * currentMR;

    // One-time expenditures
    for (const exp of expenditures) {
      if (exp.expected_date && exp.expected_date.startsWith(isoMonth)) {
        nw     -= exp.amount;
        nwFlat -= exp.amount;
        nwStep -= exp.amount;
      }
    }

    // Annual step-up: apply capped raise to salary, split savings vs. lifestyle
    if (month % 12 === 0 && annualRaiseRate > 0) {
      const cap          = raiseCap > 0 ? raiseCap : 30;
      const effectiveRate = Math.min(annualRaiseRate, cap) / 100;
      const raise        = stepSalary * effectiveRate;
      stepSalary        += raise;
      stepSavings       += raise * (savingsOfRaise / 100);
    }

    if (month % 12 === 0) {
      const year = month / 12;
      if (fireNumber > 0 && retireYear === null     && nw     >= fireNumber) retireYear     = year;
      if (fireNumber > 0 && retireYearStep === null && nwStep >= fireNumber) retireYearStep = year;
      if (millionYear     === null && nw     >= 1_000_000) millionYear     = year;
      if (millionYearStep === null && nwStep >= 1_000_000) millionYearStep = year;
      points.push({ year, nw: Math.round(nw), nwFlat: Math.round(nwFlat), nwStep: Math.round(nwStep) });
    }
  }

  return { points, retireYear, millionYear, retireYearStep, millionYearStep, fireNumber };
}

function _planNiceNum(range) {
  if (range <= 0) return 1;
  const exp = Math.floor(Math.log10(range));
  const f   = range / Math.pow(10, exp);
  const nf  = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return nf * Math.pow(10, exp);
}

function _fmtPlanAxis(v) {
  const sign = v < 0 ? '-' : '';
  const abs  = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1000)      return `${sign}$${Math.round(abs / 1000)}k`;
  return `${sign}$${Math.round(abs)}`;
}

function _renderProjectionSVG({ points, retireYear, millionYear, retireYearStep, millionYearStep, expenditures, yearsForward, annualRaiseRate = 0 }) {
  if (!points || points.length < 2) {
    return `<div class="di-empty">Set income and return rate to see your projection.</div>`;
  }

  const hasStepUp = annualRaiseRate > 0;
  const W = 680, H = 300, PAD_L = 66, PAD_R = 16, PAD_T = 36, PAD_B = 32;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const allNW  = hasStepUp
    ? points.flatMap(p => [p.nw, p.nwFlat, p.nwStep])
    : points.flatMap(p => [p.nw, p.nwFlat]);
  const rawMin = Math.min(0, ...allNW);
  const rawMax = Math.max(...allNW, 1000);

  // Target ~5 evenly-spaced nice ticks
  const rawRange = rawMax - rawMin;
  const tickInt  = _planNiceNum(rawRange / 5);
  const niceMin  = Math.floor(rawMin / tickInt) * tickInt;
  const niceMax  = niceMin + Math.ceil((rawMax - niceMin) / tickInt + 1) * tickInt;
  const span     = niceMax - niceMin;

  const xFor = yr => PAD_L + (yr / yearsForward) * innerW;
  const yFor = v  => PAD_T + innerH * (1 - (v - niceMin) / span);

  // Grid lines + Y-axis labels
  const grid = [];
  for (let v = niceMin; v <= niceMax + tickInt * 0.01; v += tickInt) {
    const y = yFor(v).toFixed(1);
    grid.push(`<line x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`);
    grid.push(`<text x="${PAD_L - 5}" y="${parseFloat(y) + 4}" text-anchor="end" fill="rgba(255,255,255,0.40)" font-size="10.5">${_fmtPlanAxis(v)}</text>`);
  }
  // Zero baseline (slightly brighter)
  const y0 = yFor(0).toFixed(1);
  if (rawMin < 0) {
    grid.push(`<line x1="${PAD_L}" y1="${y0}" x2="${W - PAD_R}" y2="${y0}" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>`);
  }

  // Expenditure vertical markers
  const today = new Date();
  const expLines = (expenditures || []).filter(e => e.expected_date).map(e => {
    const d = new Date(e.expected_date + 'T00:00:00');
    const yrFrac = (d.getFullYear() - today.getFullYear()) + (d.getMonth() - today.getMonth()) / 12;
    if (yrFrac < 0 || yrFrac > yearsForward) return '';
    const x = xFor(yrFrac).toFixed(1);
    return `<line x1="${x}" y1="${PAD_T}" x2="${x}" y2="${H - PAD_B}" stroke="rgba(255,45,85,0.38)" stroke-width="1" stroke-dasharray="3,3"/>`;
  }).join('');

  // Path builder
  const toPath = (pts, key) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.year).toFixed(1)},${yFor(p[key]).toFixed(1)}`).join(' ');

  // Gradient fill under the top line (step-up when enabled, else growth)
  const topKey    = hasStepUp ? 'nwStep' : 'nw';
  const topColor  = hasStepUp ? '#00FF88' : '#00E5FF';
  const topD      = toPath(points, topKey);
  const firstPt   = points[0];
  const lastPt    = points[points.length - 1];
  const baselineY = yFor(Math.max(niceMin, 0)).toFixed(1);
  const fillD     = `${topD} L${xFor(lastPt.year).toFixed(1)},${baselineY} L${xFor(firstPt.year).toFixed(1)},${baselineY} Z`;

  const defs = `<defs>
    <linearGradient id="planFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="${topColor}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${topColor}" stop-opacity="0"/>
    </linearGradient>
  </defs>`;

  const growthFill = `<path d="${fillD}" fill="url(#planFill)"/>`;
  const flatLine   = `<path d="${toPath(points,'nwFlat')}" fill="none" stroke="rgba(255,184,0,0.55)" stroke-width="1.4" stroke-dasharray="3,4"/>`;
  const growthLine = `<path d="${toPath(points,'nw')}" fill="none" stroke="#00E5FF" stroke-width="${hasStepUp ? 1.8 : 2.5}" stroke-dasharray="${hasStepUp ? '5,4' : 'none'}" stroke-linejoin="round" opacity="${hasStepUp ? 0.7 : 1}"/>`;
  const stepLine   = hasStepUp
    ? `<path d="${topD}" fill="none" stroke="#00FF88" stroke-width="2.5" stroke-linejoin="round"/>`
    : '';

  // FIRE retirement milestone — two markers when step-up differs
  let retireMarker = '';
  if (retireYear && retireYear <= yearsForward) {
    const rx    = xFor(retireYear).toFixed(1);
    const rpt   = points.find(p => p.year >= retireYear);
    const ry    = rpt ? yFor(rpt.nw).toFixed(1) : y0;
    const anchor = parseFloat(rx) > W * 0.75 ? 'end' : parseFloat(rx) < W * 0.2 ? 'start' : 'middle';
    retireMarker = `
      <line x1="${rx}" y1="${PAD_T}" x2="${rx}" y2="${H - PAD_B}" stroke="rgba(191,95,255,0.30)" stroke-width="1" stroke-dasharray="4,3"/>
      <circle cx="${rx}" cy="${ry}" r="5" fill="#BF5FFF" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>
      <text x="${rx}" y="${PAD_T - 10}" text-anchor="${anchor}" fill="#BF5FFF" font-size="11" font-weight="600">FIRE yr ${retireYear}</text>`;
  }
  if (hasStepUp && retireYearStep && retireYearStep <= yearsForward && retireYearStep !== retireYear) {
    const rx    = xFor(retireYearStep).toFixed(1);
    const rpt   = points.find(p => p.year >= retireYearStep);
    const ry    = rpt ? yFor(rpt.nwStep).toFixed(1) : y0;
    const anchor = parseFloat(rx) > W * 0.75 ? 'end' : parseFloat(rx) < W * 0.2 ? 'start' : 'middle';
    const labelY = Math.max(parseFloat(ry) - 10, PAD_T + 2);
    retireMarker += `
      <circle cx="${rx}" cy="${ry}" r="5" fill="#00FF88" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>
      <text x="${rx}" y="${labelY}" text-anchor="${anchor}" fill="#00FF88" font-size="11" font-weight="600">FIRE yr ${retireYearStep} ↑</text>`;
  }

  // $1M milestone
  let millionMarker = '';
  if (millionYear && millionYear <= yearsForward) {
    const mx  = xFor(millionYear).toFixed(1);
    const mpt = points.find(p => p.year >= millionYear);
    const my  = mpt ? yFor(mpt.nw).toFixed(1) : y0;
    const labelY = Math.max(parseFloat(my) - 9, PAD_T + 4);
    millionMarker = `
      <circle cx="${mx}" cy="${my}" r="4.5" fill="${hasStepUp ? '#00E5FF' : '#00FF88'}" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>
      <text x="${mx}" y="${labelY}" text-anchor="middle" fill="${hasStepUp ? '#00E5FF' : '#00FF88'}" font-size="11" font-weight="600">$1M</text>`;
  }
  if (hasStepUp && millionYearStep && millionYearStep <= yearsForward && millionYearStep !== millionYear) {
    const mx  = xFor(millionYearStep).toFixed(1);
    const mpt = points.find(p => p.year >= millionYearStep);
    const my  = mpt ? yFor(mpt.nwStep).toFixed(1) : y0;
    const labelY = Math.max(parseFloat(my) - 9, PAD_T + 4);
    millionMarker += `
      <circle cx="${mx}" cy="${my}" r="4.5" fill="#00FF88" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>
      <text x="${mx}" y="${labelY}" text-anchor="middle" fill="#00FF88" font-size="11" font-weight="600">$1M ↑</text>`;
  }

  // X-axis year labels (every 5 years)
  const xStep = yearsForward <= 20 ? 5 : yearsForward <= 40 ? 5 : 10;
  const xLbls = [];
  for (let yr = 0; yr <= yearsForward; yr += xStep) {
    const x = xFor(yr).toFixed(1);
    const label = new Date(today.getFullYear() + yr, 0, 1).getFullYear();
    xLbls.push(`<text x="${x}" y="${H - 10}" text-anchor="middle" fill="rgba(255,255,255,0.40)" font-size="11">${label}</text>`);
  }

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
    ${defs}
    ${grid.join('')}
    ${expLines}
    ${growthFill}
    ${flatLine}${growthLine}${stepLine}
    ${retireMarker}${millionMarker}
    ${xLbls.join('')}
  </svg>`;
}

function _planMilestonesHTML({ points, retireYear, millionYear, retireYearStep, millionYearStep, fireNumber: fn }, { nw, monthlySpend, yearsForward, annualRaiseRate = 0, planMode = 'safe' }) {
  const fireMultiple = planMode === 'aggressive' ? 25 : 28.57;
  const fireNumber   = fn || Math.round(monthlySpend * 12 * fireMultiple);
  const hasStepUp    = annualRaiseRate > 0;
  const getAt = (yr, key = 'nw') => {
    const p = points.find(p => p.year >= yr);
    return p ? p[key] : (points[points.length - 1]?.[key] || 0);
  };

  const yr5base  = getAt(5, 'nw'), yr5step  = getAt(5,  'nwStep');
  const yr10base = getAt(10,'nw'), yr10step = getAt(10, 'nwStep');

  const fireSub = (() => {
    if (!retireYear && !retireYearStep) return 'not in window';
    if (!hasStepUp || !retireYearStep)  return retireYear ? `reached yr ${retireYear}` : 'not in window';
    if (retireYearStep === retireYear)  return `reached yr ${retireYear}`;
    return retireYear
      ? `yr ${retireYear} → ${retireYearStep} w/ raises`
      : `yr ${retireYearStep} w/ raises`;
  })();
  const fireColor = (retireYear || retireYearStep) ? 'purple' : 'gray';

  const millionSub = (() => {
    if (!millionYear && !millionYearStep) return `beyond ${yearsForward}yr`;
    if (!hasStepUp || !millionYearStep)   return millionYear ? 'milestone reached' : `beyond ${yearsForward}yr`;
    if (millionYearStep === millionYear)  return 'milestone reached';
    return millionYear
      ? `yr ${millionYear} → ${millionYearStep} w/ raises`
      : `yr ${millionYearStep} w/ raises`;
  })();
  const millionVal = (() => {
    if (hasStepUp && millionYearStep) return `Year ${millionYearStep}`;
    return millionYear ? `Year ${millionYear}` : 'Beyond window';
  })();
  const millionColor = (millionYear || millionYearStep) ? 'green' : 'gray';

  const milestones = [
    { label: 'Today',
      value: _fmtMoneyCompact(nw),
      sub:   'current net worth',
      color: 'blue' },
    { label: 'Year 5',
      value: hasStepUp ? _fmtMoneyCompact(yr5step) : _fmtMoneyCompact(yr5base),
      sub:   hasStepUp && yr5step !== yr5base ? `w/ raises (${_fmtMoneyCompact(yr5base)} base)` : 'w/ investment growth',
      color: 'teal' },
    { label: 'Year 10',
      value: hasStepUp ? _fmtMoneyCompact(yr10step) : _fmtMoneyCompact(yr10base),
      sub:   hasStepUp && yr10step !== yr10base ? `w/ raises (${_fmtMoneyCompact(yr10base)} base)` : 'w/ investment growth',
      color: 'teal' },
    { label: 'FIRE #',
      value: _fmtMoneyCompact(fireNumber),
      sub:   fireSub,
      color: fireColor },
    { label: '$1M',
      value: millionVal,
      sub:   millionSub,
      color: millionColor },
  ];

  return `<div class="stats-row" style="grid-template-columns:repeat(${milestones.length},1fr)">
    ${milestones.map(m => `
      <div class="stat-card stat-card--${m.color}">
        <div class="stat-label">${escHtml(m.label)}</div>
        <div class="stat-value">${escHtml(m.value)}</div>
        <div class="stat-sub">${escHtml(m.sub)}</div>
      </div>`).join('')}
  </div>`;
}

function _renderKPICards({ totalIncome, spend, netWorth, cashBalance, investmentsBalance, monthlyDebtPayments, fireNumber, retireYear, retireYearStep, currentAge, targetRetireAge, planMode }) {
  const today = new Date();
  const savingsRate = totalIncome > 0 ? ((totalIncome - spend) / totalIncome * 100) : 0;
  const efMonths    = spend > 0 ? cashBalance / spend : 0;
  const dtiPct      = totalIncome > 0 ? (monthlyDebtPayments / totalIncome * 100) : 0;
  const firePct     = fireNumber > 0 ? Math.min(200, netWorth / fireNumber * 100) : 0;
  const investYears = spend * 12 > 0 ? investmentsBalance / (spend * 12) : 0;

  const fireRetireYear  = retireYearStep || retireYear;
  const retireCal       = fireRetireYear ? today.getFullYear() + fireRetireYear : null;
  const retireAtAge     = currentAge !== null && fireRetireYear ? currentAge + fireRetireYear : null;
  const targetRetireCal = currentAge !== null && targetRetireAge ? today.getFullYear() + Math.max(0, targetRetireAge - currentAge) : null;
  const retireEarly     = retireCal && targetRetireCal && retireCal < targetRetireCal;
  const retireLate      = retireCal && targetRetireCal && retireCal > targetRetireCal;

  const card = (label, value, sub, color, opp) => `
    <div class="fin-kpi-card stat-card stat-card--${color}">
      <div class="fin-kpi-label">${escHtml(label)}</div>
      <div class="fin-kpi-value">${escHtml(String(value))}</div>
      <div class="fin-kpi-sub">${escHtml(sub)}</div>
      ${opp ? `<div class="fin-kpi-opp">💡 ${escHtml(opp)}</div>` : ''}
    </div>`;

  // Savings rate
  const srColor = savingsRate >= 20 ? 'green' : savingsRate >= 10 ? 'amber' : 'red';
  const srSub   = savingsRate >= 25 ? '✓ Excellent — ahead of schedule' : savingsRate >= 20 ? '✓ At the 20% target' : savingsRate >= 10 ? 'Good — push toward 20%' : 'Below the 10% floor';
  const srOpp   = savingsRate < 20 && totalIncome > 0 ? `+${_fmtMoney(Math.max(1, totalIncome * 0.20 - (totalIncome - spend)))}/mo reaches 20%` : '';

  // Emergency fund
  const efColor = efMonths >= 6 ? 'green' : efMonths >= 3 ? 'amber' : 'red';
  const efSub   = efMonths >= 6 ? '✓ 6+ months covered' : efMonths >= 3 ? '3–6 months (target: 6)' : 'Under 3 months — priority';
  const efOpp   = efMonths < 6 ? `+${_fmtMoneyCompact(Math.max(0, (6 - efMonths) * spend))} to reach 6-month cushion` : '';

  // Debt load
  const dtiColor = dtiPct < 15 ? 'green' : dtiPct < 28 ? 'amber' : 'red';
  const dtiSub   = monthlyDebtPayments === 0 ? 'No liabilities tracked' : dtiPct < 15 ? '✓ Low burden' : dtiPct < 28 ? 'Manageable — under 28%' : 'Above safe limit (28%)';
  const dtiOpp   = dtiPct >= 28 ? 'High ratio — focus extra cash on debt payoff' : '';

  // FIRE progress
  const fpColor = firePct >= 100 ? 'green' : firePct >= 50 ? 'cyan' : firePct >= 25 ? 'blue' : 'gray';
  const fpSub   = firePct >= 100 ? '✓ FIRE number reached!' : firePct >= 50 ? 'Halfway to FIRE' : firePct >= 25 ? 'Building momentum' : 'Early stage';
  const fpOpp   = firePct < 25 ? 'Savings rate is the biggest lever at this stage' : '';

  // Retire year
  let retVal, retSub, retColor, retOpp = '';
  if (retireCal) {
    retVal = `${retireCal}`;
    const ageStr = retireAtAge ? ` (age ${retireAtAge})` : '';
    if (retireEarly) {
      const yrsEarly = targetRetireCal - retireCal;
      retSub = `${yrsEarly} yr${yrsEarly !== 1 ? 's' : ''} early${ageStr}`;
      retColor = 'green';
    } else if (retireLate) {
      const yrsLate = retireCal - targetRetireCal;
      retSub = `${yrsLate} yr${yrsLate !== 1 ? 's' : ''} past target${ageStr}`;
      retColor = 'amber';
      retOpp = `Raise savings rate to reach FIRE by target age ${targetRetireAge}`;
    } else {
      retSub = `On target${ageStr}`;
      retColor = 'cyan';
    }
  } else if (targetRetireCal) {
    retVal = `${targetRetireCal}`; retSub = 'Target — FIRE not in window'; retColor = 'gray';
    retOpp = 'Extend projection window or increase savings rate';
  } else {
    retVal = '—'; retSub = 'Set birth date + target age'; retColor = 'gray';
  }

  // Investment coverage
  const ivColor = investYears >= 10 ? 'green' : investYears >= 5 ? 'cyan' : investYears >= 2 ? 'amber' : 'gray';
  const ivSub   = `${_fmtMoneyCompact(investmentsBalance)} in investments`;
  const ivOpp   = investYears < 5 && investYears >= 0 ? `${(5 - investYears).toFixed(1)} more yrs of expenses to add` : '';

  return `<div class="fin-kpi-grid">
    ${card('Savings Rate',    `${savingsRate.toFixed(1)}%`,               srSub,          srColor, srOpp)}
    ${card('Emergency Fund',  `${efMonths.toFixed(1)} mo`,               efSub,          efColor, efOpp)}
    ${card('Debt Load',       monthlyDebtPayments > 0 ? `${dtiPct.toFixed(1)}%` : 'None', dtiSub, dtiColor, dtiOpp)}
    ${card('FIRE Progress',   `${Math.round(firePct)}%`,                 fpSub,          fpColor, fpOpp)}
    ${card('Retire Year',     retVal,                                     retSub,         retColor, retOpp)}
    ${card('Invest Coverage', investYears >= 0.1 ? `${investYears.toFixed(1)} yr` : '—', ivSub, ivColor, ivOpp)}
  </div>`;
}

function _renderGlideTable(currentAge, targetRetireAge, mode, yearsForward) {
  if (currentAge === null) return '';
  const today = new Date();
  const currentYear = today.getFullYear();
  const maxYears = Math.max(yearsForward, Math.max(0, (targetRetireAge || 62) - currentAge) + 5);
  const rows = [];

  for (let yr = 0; yr <= maxYears; yr += 5) {
    const age = currentAge + yr;
    if (age > 100) break;
    const { stocksPct, bondsPct, annualReturn } = _calcGlide(age, mode);
    rows.push({ yr, age, year: currentYear + yr, stocksPct, bondsPct, annualReturn, isRetire: false });
  }

  // Insert exact retirement age row if not already present
  if (targetRetireAge && targetRetireAge > currentAge) {
    const retYr = targetRetireAge - currentAge;
    if (!rows.find(r => r.age === targetRetireAge)) {
      const { stocksPct, bondsPct, annualReturn } = _calcGlide(targetRetireAge, mode);
      const row = { yr: retYr, age: targetRetireAge, year: currentYear + retYr, stocksPct, bondsPct, annualReturn, isRetire: true };
      const idx = rows.findIndex(r => r.age > targetRetireAge);
      if (idx >= 0) rows.splice(idx, 0, row);
      else rows.push(row);
    } else {
      const r = rows.find(r => r.age === targetRetireAge);
      if (r) r.isRetire = true;
    }
  }

  const stockRet  = mode === 'aggressive' ? '9%' : '7%';
  const bondRet   = mode === 'aggressive' ? '4%' : '3.5%';
  const modeLabel = mode === 'aggressive' ? 'Aggressive: stocks = 110 − age' : 'Safe: stocks = 100 − age';

  return `
    <div class="fin-panel">
      <div class="fin-panel-header">
        <h3>Portfolio glide path</h3>
        <span style="font-size:12px;color:var(--text-muted)">${escHtml(modeLabel)} · stocks ${stockRet} · bonds ${bondRet}</span>
      </div>
      <div class="fin-panel-body" style="padding:0">
        <table class="fin-glide-table">
          <thead><tr><th>Year</th><th>Age</th><th>Allocation</th><th>Stocks</th><th>Bonds</th><th>Est. return / yr</th></tr></thead>
          <tbody>
            ${rows.map(r => {
              const sp = Math.round(r.stocksPct * 100), bp = Math.round(r.bondsPct * 100);
              const isNow = r.yr === 0;
              return `<tr${r.isRetire ? ' class="fin-glide-retire-row"' : isNow ? ' class="fin-glide-now-row"' : ''}>
                <td>${r.year}</td>
                <td><strong>${r.age}</strong>${r.isRetire ? ' <span style="color:var(--neon-purple)">← target</span>' : isNow ? ' <span style="color:var(--neon-green)">← now</span>' : ''}</td>
                <td><div class="fin-glide-bar-wrap"><div class="fin-glide-bar-s" style="width:${sp}%"></div><div class="fin-glide-bar-b" style="width:${bp}%"></div></div></td>
                <td>${sp}%</td>
                <td>${bp}%</td>
                <td>${(r.annualReturn * 100).toFixed(1)}%</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function _renderExpList(c) {
  const exps = _finPlanState.expenditures || [];
  const el = c.querySelector('#plan-exp-list');
  if (!el) return;
  el.innerHTML = exps.length ? exps.map(e => `
    <div class="fin-list-row" data-id="${e.id}">
      <div class="fin-list-main">
        <div class="fin-list-title">${escHtml(e.name)} <span style="color:var(--neon-red)">${_fmtMoney(e.amount)}</span></div>
        <div class="fin-list-sub">${e.expected_date ? `Expected ${formatDateShort(e.expected_date)}` : 'No date set'}${e.notes ? ' · ' + escHtml(e.notes) : ''}</div>
      </div>
      <div class="fin-list-actions">
        <button class="btn btn-secondary btn-sm plan-exp-edit" data-id="${e.id}">Edit</button>
        <button class="goal-metric-del plan-exp-del" data-id="${e.id}">×</button>
      </div>
    </div>`).join('') : `<div class="di-empty">No planned expenditures yet — add one-time future costs here to see their impact on your projection.</div>`;

  el.querySelectorAll('.plan-exp-edit').forEach(btn =>
    btn.addEventListener('click', () => {
      const exp = exps.find(e => e.id === parseInt(btn.dataset.id));
      _openExpModal(exp, () => { _finPlanState.loaded = false; _setFinView('planning'); });
    }));
  el.querySelectorAll('.plan-exp-del').forEach(btn =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this expenditure?')) return;
      try {
        await apiFetch('DELETE', `/finance/planning/expenditures/${btn.dataset.id}`);
        _finPlanState.loaded = false;
        _setFinView('planning');
      } catch(e) { alert('Error: ' + e.message); }
    }));
}

function _openExpModal(existing, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const e = existing || { name: '', amount: '', expected_date: '', notes: '' };
  overlay.innerHTML = `
    <div class="modal" style="width:440px">
      <div class="modal-header">
        <span class="modal-title">${existing ? 'Edit' : 'New'} planned expenditure</span>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Name</label>
          <input class="form-input" id="exp-name" value="${escHtml(e.name || '')}" placeholder="House down payment, New car, …" style="width:100%">
        </div>
        <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="form-label">Amount</label>
            <input class="form-input" id="exp-amount" type="number" step="0.01" value="${e.amount || ''}" style="width:100%"></div>
          <div><label class="form-label">Expected date</label>
            <input class="form-input" id="exp-date" type="date" value="${e.expected_date || ''}" style="width:100%"></div>
        </div>
        <div class="form-group"><label class="form-label">Notes <span style="color:var(--text-muted);font-weight:400">(optional)</span></label>
          <textarea class="form-input" id="exp-notes" rows="2" style="width:100%">${escHtml(e.notes || '')}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="exp-save">${existing ? 'Save' : 'Add'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  const dismiss = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 150); };
  overlay.querySelector('.modal-close').addEventListener('click', dismiss);
  overlay.querySelector('.modal-cancel-btn').addEventListener('click', dismiss);
  overlay.addEventListener('click', ev => { if (ev.target === overlay) dismiss(); });
  overlay.querySelector('#exp-save').addEventListener('click', async () => {
    const body = {
      name:          overlay.querySelector('#exp-name').value.trim(),
      amount:        parseFloat(overlay.querySelector('#exp-amount').value) || 0,
      expected_date: overlay.querySelector('#exp-date').value || null,
      notes:         overlay.querySelector('#exp-notes').value.trim() || null,
    };
    if (!body.name || !body.amount) { alert('Name and amount are required.'); return; }
    try {
      if (existing) await apiFetch('PUT',  `/finance/planning/expenditures/${existing.id}`, body);
      else          await apiFetch('POST', '/finance/planning/expenditures', body);
      dismiss();
      if (onSave) onSave();
    } catch(err) { alert('Error: ' + err.message); }
  });
}

// ── Manage (accounts, import, rules) ─────────────────────────────────────────
async function _renderFinManage(c) {
  c.innerHTML = `
    <div class="fin-grid-2">
      <div class="fin-panel">
        <div class="fin-panel-header"><h3>Import transactions</h3></div>
        <div class="fin-panel-body">
          <p style="color:var(--text-muted);font-size:13px;margin-top:0">
            Upload a CSV with columns Date / Name / Amount (Memo and Transaction columns enrich auto-classification — MCC codes are extracted from the Memo).
          </p>
          <div class="form-group">
            <label class="form-label">Account (optional)</label>
            <select class="form-select" id="imp-account">
              <option value="">— No account —</option>
              ${_finAccts.map(a => `<option value="${a.id}">${escHtml(a.name)}</option>`).join('')}
            </select>
          </div>
          <input type="file" accept=".csv" id="imp-file">
          <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
            <button class="btn btn-primary btn-sm" id="imp-go">Import</button>
            <button class="btn btn-secondary btn-sm" id="imp-reclassify" title="Re-run classifier on all unclassified transactions">Re-classify all</button>
          </div>
          <div id="imp-result" style="margin-top:10px;font-size:13px"></div>
        </div>
      </div>

      <div class="fin-panel">
        <div class="fin-panel-header"><h3>Accounts</h3>
          <button class="btn btn-primary btn-sm" id="acct-add">+ New account</button>
        </div>
        <div class="fin-panel-body" id="acct-list"></div>
      </div>

      <div class="fin-panel" style="grid-column:1/-1">
        <div class="fin-panel-header">
          <h3>Import history</h3>
          <span style="font-size:13px;color:var(--text-muted)">Each row is one CSV import. Delete to undo a load.</span>
        </div>
        <div class="fin-panel-body" id="imp-list"></div>
      </div>

      <div class="fin-panel" style="grid-column:1/-1">
        <div class="fin-panel-header"><h3>Categories</h3>
          <button class="btn btn-primary btn-sm" id="cat-add">+ New category</button>
        </div>
        <div class="fin-panel-body" id="cat-list"></div>
      </div>

      <div class="fin-panel" style="grid-column:1/-1">
        <div class="fin-panel-header"><h3>Classification rules</h3>
          <span style="font-size:13px;color:var(--text-muted)">Higher priority and merchant rules win over MCC defaults.</span>
        </div>
        <div class="fin-panel-body" id="rule-list"></div>
      </div>
    </div>`;
  await _refreshAccountList(c);
  await _refreshImportList(c);
  await _refreshCategoryList(c);
  await _refreshRuleList(c);

  c.querySelector('#cat-add').addEventListener('click', () => _openCategoryModal(null));

  c.querySelector('#acct-add').addEventListener('click', () => _openAccountModal(null));
  c.querySelector('#imp-go').addEventListener('click', async () => {
    const file = c.querySelector('#imp-file').files[0];
    if (!file) { alert('Choose a CSV file first.'); return; }
    const acctId = c.querySelector('#imp-account').value;
    const fd = new FormData();
    fd.append('file', file);
    const url = acctId ? `/api/finance/import?account_id=${acctId}` : '/api/finance/import';
    const resEl = c.querySelector('#imp-result');
    resEl.textContent = 'Uploading…';
    try {
      const r = await fetch(url, { method: 'POST', body: fd });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      resEl.innerHTML = `<span style="color:var(--neon-green)">✓</span> Inserted ${data.inserted} · auto-classified ${data.classified} · need review ${data.unclassified} · skipped duplicates ${data.skipped_duplicates}`;
      if (data.unclassified > 0) {
        resEl.innerHTML += ` · <a href="#" id="imp-go-rec">Reconcile now →</a>`;
        c.querySelector('#imp-go-rec')?.addEventListener('click', e => { e.preventDefault(); _setFinView('reconcile'); });
      }
      _refreshImportList(c);
    } catch(e) {
      resEl.innerHTML = `<span style="color:var(--neon-red)">Failed:</span> ${e.message}`;
    }
  });
  c.querySelector('#imp-reclassify').addEventListener('click', async () => {
    try {
      const r = await apiFetch('POST', '/finance/transactions/reclassify-all');
      c.querySelector('#imp-result').textContent = `Re-classified ${r.updated} of ${r.scanned} transactions.`;
    } catch(e) { alert('Error: ' + e.message); }
  });
}

async function _refreshAccountList(c) {
  const res = await apiFetch('GET', '/finance/accounts');
  _finAccts = res.items || [];
  c.querySelector('#acct-list').innerHTML = _finAccts.length ? _finAccts.map(a => `
    <div class="fin-list-row" data-id="${a.id}">
      <div class="fin-list-main">
        <div class="fin-list-title">${escHtml(a.name)}${a.is_active ? '' : ' <span style="color:var(--text-muted);font-size:12px">(inactive)</span>'}</div>
        <div class="fin-list-sub">${escHtml(a.type)}${a.institution ? ' · ' + escHtml(a.institution) : ''}</div>
      </div>
      <div class="fin-list-actions">
        <button class="btn btn-secondary btn-sm acct-edit" data-id="${a.id}">Edit</button>
        <button class="goal-metric-del acct-del" data-id="${a.id}">×</button>
      </div>
    </div>
  `).join('') : `<div class="di-empty">No accounts yet — add one to associate with imports.</div>`;
  c.querySelectorAll('.acct-edit').forEach(b =>
    b.addEventListener('click', () => _openAccountModal(_finAccts.find(a => a.id === parseInt(b.dataset.id)))));
  c.querySelectorAll('.acct-del').forEach(b =>
    b.addEventListener('click', async () => {
      if (!confirm('Delete this account?')) return;
      await apiFetch('DELETE', `/finance/accounts/${b.dataset.id}`);
      _refreshAccountList(c);
    }));
}

function _openAccountModal(existing) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const a = existing || { type: 'credit', is_active: 1 };
  overlay.innerHTML = `
    <div class="modal" style="width:440px">
      <div class="modal-header"><span class="modal-title">${existing ? 'Edit' : 'New'} account</span><button class="modal-close">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="a-name" value="${escHtml(a.name||'')}" placeholder="Chase Sapphire, Checking, …"></div>
        <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="form-label">Type</label>
            <select class="form-select" id="a-type">
              ${['credit','checking','savings','brokerage','cash','other'].map(t => `<option value="${t}"${a.type===t?' selected':''}>${t}</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Institution</label><input class="form-input" id="a-inst" value="${escHtml(a.institution||'')}"></div>
        </div>
        <div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" id="a-notes" rows="2">${escHtml(a.notes || '')}</textarea></div>
        <div class="form-group ev-checkbox-row"><input type="checkbox" id="a-active"${a.is_active ? ' checked' : ''}><label class="form-label" for="a-active">Active</label></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary modal-cancel-btn">Cancel</button><button class="btn btn-primary" id="a-save">${existing ? 'Save' : 'Create'}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  const dismiss = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 150); };
  overlay.querySelector('.modal-close').addEventListener('click', dismiss);
  overlay.querySelector('.modal-cancel-btn').addEventListener('click', dismiss);
  overlay.addEventListener('click', ev => { if (ev.target === overlay) dismiss(); });
  overlay.querySelector('#a-save').addEventListener('click', async () => {
    const body = {
      name: overlay.querySelector('#a-name').value.trim(),
      type: overlay.querySelector('#a-type').value,
      institution: overlay.querySelector('#a-inst').value.trim() || null,
      notes: overlay.querySelector('#a-notes').value.trim() || null,
      is_active: overlay.querySelector('#a-active').checked ? 1 : 0,
    };
    if (!body.name) { alert('Name is required.'); return; }
    try {
      if (existing) await apiFetch('PUT',  `/finance/accounts/${existing.id}`, body);
      else          await apiFetch('POST', '/finance/accounts', body);
      dismiss();
      _setFinView('manage');
    } catch(err) { alert('Error: ' + err.message); }
  });
}

async function _refreshCategoryList(c) {
  const res = await apiFetch('GET', '/finance/categories');
  _finCats = res.items || [];
  const COLOR_NAMES = ['teal','amber','purple','blue','green','coral','pink','gray','red'];
  c.querySelector('#cat-list').innerHTML = `
    <div class="fin-cat-grid">
      ${_finCats.map(cat => {
        const typeLbl = cat.is_income ? 'Income' : cat.is_savings ? 'Savings' : 'Expense';
        const usedAsDefault = cat.is_default ? ' · Default' : '';
        const excludedLbl = cat.is_excluded ? ' · <span class="fin-excluded-badge" title="Excluded from totals">∅ Excluded</span>' : '';
        return `
          <div class="fin-cat-card" data-id="${cat.id}">
            <div class="fin-cat-card-main">
              <span class="fin-cat-icon" style="font-size:18px">${escHtml(cat.icon || '•')}</span>
              <div style="flex:1;min-width:0">
                <div class="fin-cat-card-name">
                  <span class="fin-cat-badge tag-${escHtml(cat.color || 'gray')}">${escHtml(cat.name)}</span>
                </div>
                <div class="fin-cat-card-sub">${typeLbl}<span style="color:var(--text-muted);font-size:11px">${escHtml(usedAsDefault)}</span>${excludedLbl}</div>
              </div>
            </div>
            <div class="fin-list-actions">
              <button class="btn btn-secondary btn-sm cat-edit" data-id="${cat.id}">Edit</button>
              ${!cat.is_default ? `<button class="goal-metric-del cat-del" data-id="${cat.id}">×</button>` : ''}
            </div>
          </div>`;
      }).join('')}
    </div>`;
  c.querySelectorAll('.cat-edit').forEach(b =>
    b.addEventListener('click', () => _openCategoryModal(_finCats.find(x => x.id === parseInt(b.dataset.id)))));
  c.querySelectorAll('.cat-del').forEach(b =>
    b.addEventListener('click', async () => {
      if (!confirm('Delete this category? Transactions in it will become unclassified.')) return;
      try { await apiFetch('DELETE', `/finance/categories/${b.dataset.id}`); _refreshCategoryList(c); }
      catch(e) { alert('Error: ' + e.message); }
    }));
}

function _openCategoryModal(existing) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const cat = existing || { color: 'blue', icon: '', is_income: 0, is_savings: 0, is_excluded: 0 };
  const COLORS = ['teal','amber','purple','blue','green','coral','pink','gray','red'];
  const swatches = COLORS.map(col =>
    `<span class="s-color-swatch tag-${col}${cat.color === col ? ' selected' : ''}" data-color="${col}" title="${col}"></span>`
  ).join('');
  // Common emoji choices
  const ICONS = ['🛒','🍽','☕','🍺','🛵','⛽','🚗','✈','📦','🛍','✂','📺','💡','🏠','⚕','💊','🛡','🎬','🎵','🚙','💳','💰','💼','↩','🏦','📈','🎮','📱','📚','🎁','🐾','🎓','🧾','•'];
  const iconBtns = ICONS.map(ic =>
    `<button type="button" class="cat-icon-btn${cat.icon === ic ? ' selected' : ''}" data-icon="${escHtml(ic)}">${escHtml(ic)}</button>`
  ).join('');
  overlay.innerHTML = `
    <div class="modal" style="width:520px">
      <div class="modal-header"><span class="modal-title">${existing ? 'Edit' : 'New'} category</span><button class="modal-close">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Name</label>
          <input class="form-input" id="cat-name" value="${escHtml(cat.name||'')}" placeholder="e.g., Pet Care">
        </div>
        <div class="form-group">
          <label class="form-label">Color</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${swatches}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Icon</label>
          <div class="cat-icon-grid">${iconBtns}</div>
          <input class="form-input" id="cat-icon-custom" placeholder="Or type your own emoji" value="${escHtml(cat.icon || '')}" style="margin-top:6px;max-width:200px">
        </div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <div style="display:flex;gap:14px;flex-wrap:wrap">
            <label style="display:flex;align-items:center;gap:5px"><input type="radio" name="cat-type" value="expense"${!cat.is_income && !cat.is_savings ? ' checked' : ''}> Expense</label>
            <label style="display:flex;align-items:center;gap:5px"><input type="radio" name="cat-type" value="income"${cat.is_income ? ' checked' : ''}> Income</label>
            <label style="display:flex;align-items:center;gap:5px"><input type="radio" name="cat-type" value="savings"${cat.is_savings ? ' checked' : ''}> Savings/Transfer</label>
          </div>
          <div class="settings-hint" style="margin-top:4px">Income &amp; Savings are excluded from "spending" totals on the dashboard.</div>
        </div>
        <div class="form-group ev-checkbox-row">
          <input type="checkbox" id="cat-excluded"${cat.is_excluded ? ' checked' : ''}>
          <label class="form-label" for="cat-excluded">Exclude from all totals</label>
        </div>
        <div class="settings-hint" style="margin-top:-8px;margin-bottom:8px">When checked, transactions in this category won't count toward any spend, income, or savings totals. Useful for credit card payments, loan payments, and internal transfers that would otherwise double-count spending.</div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary modal-cancel-btn">Cancel</button><button class="btn btn-primary" id="cat-save">${existing ? 'Save' : 'Create'}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  const dismiss = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 150); };
  overlay.querySelector('.modal-close').addEventListener('click', dismiss);
  overlay.querySelector('.modal-cancel-btn').addEventListener('click', dismiss);
  overlay.addEventListener('click', ev => { if (ev.target === overlay) dismiss(); });

  overlay.querySelectorAll('.s-color-swatch').forEach(s =>
    s.addEventListener('click', () => {
      overlay.querySelectorAll('.s-color-swatch').forEach(x => x.classList.remove('selected'));
      s.classList.add('selected');
    }));
  overlay.querySelectorAll('.cat-icon-btn').forEach(b =>
    b.addEventListener('click', () => {
      overlay.querySelectorAll('.cat-icon-btn').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
      overlay.querySelector('#cat-icon-custom').value = b.dataset.icon;
    }));

  overlay.querySelector('#cat-save').addEventListener('click', async () => {
    const name = overlay.querySelector('#cat-name').value.trim();
    if (!name) { alert('Name is required.'); return; }
    const color = overlay.querySelector('.s-color-swatch.selected')?.dataset.color || 'blue';
    const icon  = overlay.querySelector('#cat-icon-custom').value.trim() || null;
    const typeVal = overlay.querySelector('input[name="cat-type"]:checked').value;
    const body = {
      name,
      color,
      icon,
      is_income:   typeVal === 'income'  ? 1 : 0,
      is_savings:  typeVal === 'savings' ? 1 : 0,
      is_excluded: overlay.querySelector('#cat-excluded').checked ? 1 : 0,
    };
    try {
      if (existing) await apiFetch('PUT',  `/finance/categories/${existing.id}`, body);
      else          await apiFetch('POST', '/finance/categories', body);
      dismiss();
      _setFinView('manage');
    } catch(err) { alert('Error: ' + err.message); }
  });
}

async function _refreshImportList(c) {
  const res = await apiFetch('GET', '/finance/imports');
  const items = res.items || [];
  const el = c.querySelector('#imp-list');
  if (!el) return;
  if (!items.length) {
    el.innerHTML = `<div class="di-empty">No imports yet.</div>`;
    return;
  }
  el.innerHTML = `
    <table class="fin-rule-table">
      <thead><tr><th>Imported</th><th>File</th><th>Account</th><th style="text-align:right">Inserted</th><th style="text-align:right">Auto-classified</th><th style="text-align:right">Unclassified</th><th style="text-align:right">Still present</th><th></th></tr></thead>
      <tbody>
        ${items.map(i => {
          const dt = i.imported_at ? new Date(i.imported_at.replace(' ', 'T')) : null;
          const dateLbl = dt ? dt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
          return `
            <tr data-id="${i.id}">
              <td>${escHtml(dateLbl)}</td>
              <td><code>${escHtml(i.filename || '—')}</code></td>
              <td>${escHtml(i.account_name || '—')}</td>
              <td style="text-align:right">${i.inserted_count}</td>
              <td style="text-align:right">${i.classified_count}</td>
              <td style="text-align:right">${i.unclassified_count}</td>
              <td style="text-align:right">${i.still_present}</td>
              <td><button class="goal-metric-del imp-del" data-id="${i.id}" title="Delete this import and all its transactions">×</button></td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  el.querySelectorAll('.imp-del').forEach(b =>
    b.addEventListener('click', async () => {
      const item = items.find(i => i.id === parseInt(b.dataset.id));
      if (!confirm(`Delete this import? This removes ${item.still_present} transaction(s) loaded by it. This cannot be undone.`)) return;
      try { await apiFetch('DELETE', `/finance/imports/${b.dataset.id}`); _refreshImportList(c); }
      catch(e) { alert('Error: ' + e.message); }
    }));
}

async function _refreshRuleList(c) {
  const res = await apiFetch('GET', '/finance/rules');
  const rules = res.items || [];
  c.querySelector('#rule-list').innerHTML = rules.length ? `
    <table class="fin-rule-table">
      <thead><tr><th>Type</th><th>Pattern</th><th>Category</th><th>Priority</th><th>Source</th><th></th></tr></thead>
      <tbody>
        ${rules.map(r => `
          <tr data-id="${r.id}">
            <td>${escHtml(r.rule_type)}</td>
            <td><code>${escHtml(r.pattern)}</code></td>
            <td><span class="fin-cat-badge tag-${escHtml(r.category_color || 'gray')}">${escHtml(r.category_name)}</span></td>
            <td>${r.priority}</td>
            <td>${r.is_default ? '<span style="color:var(--text-muted);font-size:12px">Default</span>' : '<span style="color:var(--neon-cyan);font-size:12px">User</span>'}</td>
            <td>${!r.is_default ? `<button class="goal-metric-del rule-del" data-id="${r.id}">×</button>` : ''}</td>
          </tr>`).join('')}
      </tbody>
    </table>` : `<div class="di-empty">No rules yet.</div>`;
  c.querySelectorAll('.rule-del').forEach(b =>
    b.addEventListener('click', async () => {
      if (!confirm('Delete this rule?')) return;
      await apiFetch('DELETE', `/finance/rules/${b.dataset.id}`);
      _refreshRuleList(c);
    }));
}
