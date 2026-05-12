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
  // Income — from exponential trend
  monthlyIncome: null, incomeByMonth: [], incomeTrendAnnualRate: 0, incomeTrendSlope: 0,
  // Spend & investment
  monthlySpend: null, returnRate: null, inflationRate: null, investmentFrac: null,
  // Life
  birthDate: '', targetRetireAge: 62, riskPreset: 'balanced',
  // Horizon
  yearsForward: 30,
  // Raise step-up
  annualRaiseRate: 3, salaryCap: 0, savingsOfRaise: 50,
  // Read-only from API
  netWorth: null, expenditures: [],
  monthlyDebtPayments: 0, cashBalance: 0, investmentsBalance: 0, minCashBalance: 0,
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
          <button class="fin-tab" data-view="investments">Investments</button>
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

  if (window.setFabContext) window.setFabContext({ page: 'finance' });
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
  else if (v === 'investments')  _renderFinInvestments(c);
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
  let start, end;
  if (rangeKey === 'custom') {
    start = _isoDateOnly(localStorage.getItem('fin_range_from') || '');
    end   = _isoDateOnly(localStorage.getItem('fin_range_to')   || '');
    if (!start || !end) {
      // Fall back to 3m until the user fills in dates
      const fb = _finRangeFor('3m');
      start = fb.start; end = fb.end;
    }
  } else {
    ({ start, end } = _finRangeFor(rangeKey));
  }

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

  // Range pills (presets + custom)
  const customFrom = localStorage.getItem('fin_range_from') || start;
  const customTo   = localStorage.getItem('fin_range_to')   || end;
  const pillsHTML = [...FIN_RANGE_PRESETS, { key: 'custom', label: 'Custom' }].map(p =>
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

  const flowHTML        = _renderFlowsSVG(d.monthly_flows || [], d.range_start, d.range_end);
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
      <span id="fin-ov-custom" style="display:${rangeKey === 'custom' ? 'flex' : 'none'};align-items:center;gap:6px">
        <label style="font-size:13px;color:var(--text-muted)">From <input type="date" id="fin-ov-from" class="form-input" style="width:150px;padding:3px 8px" value="${customFrom}"></label>
        <label style="font-size:13px;color:var(--text-muted)">To <input type="date" id="fin-ov-to" class="form-input" style="width:150px;padding:3px 8px" value="${customTo}"></label>
        <button class="btn btn-secondary btn-sm" id="fin-ov-load">Load</button>
      </span>
      <span class="fin-range-dates">${rangeKey !== 'custom' ? _fmtRangeLabel(d.range_start, d.range_end) : _fmtRangeLabel(start, end)}</span>
    </div>

    <div class="stats-row" style="grid-template-columns:repeat(${kpis.length},1fr)">${kpisHTML}</div>

    <div class="fin-grid-2" style="align-items:start">
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="fin-panel">
          <div class="fin-panel-header">
            <h3>Income vs spending</h3>
            <div class="fin-flow-legend">
              <span><i class="fin-flow-dot fin-flow-dot--income"></i>Income</span>
              <span><i class="fin-flow-dot fin-flow-dot--spend"></i>Spending</span>
            </div>
          </div>
          <div class="fin-panel-body" style="padding:0 0 4px">${flowHTML}</div>
        </div>
        <div class="fin-panel">
          <div class="fin-panel-header">
            <h3>Spending trends</h3>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">${catTrendLegend}</div>
          </div>
          <div class="fin-panel-body" style="padding:10px 14px">${catTrendHTML}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="fin-panel">
          <div class="fin-panel-header">
            <h3>Spending by category</h3>
            <span style="color:var(--text-muted);font-size:13px">${_fmtMoney(totalSpend)} total</span>
          </div>
          <div class="fin-panel-body">${catRowsHTML}</div>
        </div>
        <div class="fin-panel">
          <div class="fin-panel-header">
            <h3>Wealth breakdown</h3>
            <span class="fin-link" id="fin-go-wealth">Manage →</span>
          </div>
          <div class="fin-panel-body">${_wealthBreakdownHTML(wb)}</div>
        </div>
      </div>
    </div>

    <div class="fin-grid-2">
      <div class="fin-panel">
        <div class="fin-panel-header">
          <h3>Top merchants</h3>
          <span class="fin-link" id="fin-go-txns">View all transactions →</span>
        </div>
        <div class="fin-panel-body">${merchHTML}</div>
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
      if (p.dataset.range !== 'custom') {
        _renderFinOverview(c);
      } else {
        c.querySelectorAll('.fin-range-pill').forEach(b => b.classList.toggle('active', b === p));
        c.querySelector('#fin-ov-custom').style.display = 'flex';
        c.querySelector('.fin-range-dates').textContent = '';
      }
    }));
  c.querySelector('#fin-ov-load')?.addEventListener('click', () => {
    const from = _isoDateOnly(c.querySelector('#fin-ov-from').value);
    const to   = _isoDateOnly(c.querySelector('#fin-ov-to').value);
    if (!from || !to) { alert('Please select both a start and end date.'); return; }
    if (from > to) { alert('Start date must be before end date.'); return; }
    localStorage.setItem('fin_range_from', from);
    localStorage.setItem('fin_range_to',   to);
    _renderFinOverview(c);
  });
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

function _renderFlowsSVG(flows, rangeStart, rangeEnd) {
  // Build monthly buckets from the actual selected range
  const s = rangeStart ? new Date(rangeStart + 'T00:00:00') : (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - 11, 1); })();
  const e = rangeEnd   ? new Date(rangeEnd   + 'T00:00:00') : new Date();
  const buckets = [];
  let cur = new Date(s.getFullYear(), s.getMonth(), 1);
  while (cur <= e && buckets.length < 36) {
    buckets.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`);
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  if (!buckets.length) buckets.push(`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,'0')}`);

  const map = {};
  flows.forEach(f => { map[f.bucket] = f; });

  // Only include months that have actual data — skip zero-value months to avoid empty bars
  const rows = buckets
    .map(b => ({ bucket: b, income: map[b]?.income || 0, spend: map[b]?.spend || 0 }))
    .filter(r => r.income > 0 || r.spend > 0);

  if (!rows.length) return `<div class="di-empty" style="padding:40px 0">No data — import transactions or add income</div>`;

  const max = Math.max(...rows.map(r => Math.max(r.income, r.spend)), 50);
  const n   = rows.length;

  const W = 600, PAD_L = 44, PAD_R = 6, PAD_T = 10, PAD_B = 20;
  const CHART_H = 176;  // fixed chart area height
  const H = PAD_T + CHART_H + PAD_B;
  const innerW = W - PAD_L - PAD_R;
  const slot = innerW / n;
  const barW = Math.max(4, Math.min(slot * 0.38, 30));

  const baseline = PAD_T + CHART_H;
  const yFor = v => PAD_T + CHART_H * (1 - v / max);

  const grid = [0.25, 0.5, 0.75, 1.0].map(p => {
    const y = (PAD_T + CHART_H * (1 - p)).toFixed(1);
    return `<line x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>`;
  }).join('');

  // Baseline (x-axis)
  const axisLine = `<line x1="${PAD_L}" y1="${baseline}" x2="${W - PAD_R}" y2="${baseline}" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>`;

  const bars = rows.map((r, i) => {
    const cx   = PAD_L + slot * (i + 0.5);
    const incX = cx - barW - 1, spdX = cx + 1;
    const incY = yFor(r.income), spdY = yFor(r.spend);
    const incH = baseline - incY, spdH = baseline - spdY;
    return `
      <rect x="${incX.toFixed(1)}" y="${incY.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, incH).toFixed(1)}" rx="2" fill="#00FF88" fill-opacity="0.80"/>
      <rect x="${spdX.toFixed(1)}" y="${spdY.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, spdH).toFixed(1)}" rx="2" fill="#FF2D55" fill-opacity="0.85"/>`;
  }).join('');

  const yLbls = [0.5, 1].map(p => {
    const v = max * p;
    return `<text x="${PAD_L - 5}" y="${yFor(v) + 4}" text-anchor="end" fill="rgba(255,255,255,0.38)" font-size="11">$${_fmtAxisNum(v)}</text>`;
  }).join('');

  // Adaptive label density
  const every = n > 18 ? 3 : n > 9 ? 2 : 1;
  const xLbls = rows.map((r, i) => {
    if (i % every !== 0 && i !== n - 1) return '';
    const [yr, mo] = r.bucket.split('-');
    const txt = new Date(parseInt(yr), parseInt(mo) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: n > 12 ? '2-digit' : undefined });
    const x = PAD_L + slot * (i + 0.5);
    return `<text x="${x.toFixed(1)}" y="${baseline + 14}" text-anchor="middle" fill="rgba(255,255,255,0.38)" font-size="11">${escHtml(txt)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
    ${grid}${axisLine}${bars}${yLbls}${xLbls}
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
  addOverlayDismiss(overlay, dismiss);

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
let _planSaveTimer = null;
async function _debouncedPlanSave(c) {
  clearTimeout(_planSaveTimer);
  _planSaveTimer = setTimeout(async () => {
    const inp = _readPlanInputs(c);
    try {
      await apiFetch('PATCH', '/finance/planning/assumptions', {
        return_rate: inp.ret, inflation_rate: inp.inf,
        target_retire_age: inp.targetRetireAge,
        years_forward: inp.years, annual_raise_rate: inp.raiseRate,
        salary_cap: inp.salaryCap, savings_of_raise: inp.raiseSaved,
        investment_frac: inp.invFrac,
      });
    } catch(e) { /* silent */ }
  }, 800);
}

async function _renderFinPlanning(c) {
  let plan;
  try { plan = await apiFetch('GET', '/finance/planning'); }
  catch(e) { c.innerHTML = `<div class="empty-state">${e.message}</div>`; return; }

  if (!_finPlanState.loaded) {
    _finPlanState.returnRate      = plan.return_rate;
    _finPlanState.inflationRate   = plan.inflation_rate;
    _finPlanState.riskPreset      = plan.plan_mode    || 'balanced';
    _finPlanState.annualRaiseRate = plan.annual_raise_rate ?? 3;
    _finPlanState.salaryCap       = plan.salary_cap   ?? 0;
    _finPlanState.savingsOfRaise  = plan.savings_of_raise ?? 50;
    _finPlanState.yearsForward    = plan.years_forward ?? 30;
    _finPlanState.loaded = true;
  }
  // Always refresh — these come from live data or user settings that can change between visits
  _finPlanState.birthDate           = plan.birth_date   || '';
  _finPlanState.targetRetireAge     = plan.target_retire_age || 62;
  _finPlanState.monthlyIncome       = plan.monthly_income;
  _finPlanState.monthlySpend        = plan.monthly_spend;
  _finPlanState.netWorth            = plan.net_worth;
  _finPlanState.investmentFrac      = plan.investment_frac;
  _finPlanState.actualStocksPct     = plan.actual_stocks_pct ?? null;
  _finPlanState.actualBondsPct      = plan.actual_bonds_pct  ?? null;
  _finPlanState.actualCashPct       = plan.actual_cash_pct   ?? null;
  _finPlanState.expenditures        = (plan.expenditures || []).map(e => ({ ...e, expected_date: _normDateISO(e.expected_date) || e.expected_date }));
  _finPlanState.monthlyDebtPayments = plan.monthly_debt_payments || 0;
  _finPlanState.cashBalance         = plan.cash_balance         || 0;
  _finPlanState.investmentsBalance  = plan.investments_balance  || 0;
  _finPlanState.minCashBalance      = plan.min_cash_balance     ?? 0;
  _finPlanState.incomeByMonth       = plan.income_by_month      || [];
  _finPlanState.incomeTrendAnnualRate = plan.income_trend_annual_rate || 0;
  _finPlanState.incomeTrendSlope    = plan.income_trend_slope   || 0;

  const s          = _finPlanState;
  const age        = _calcAge(s.birthDate);
  const preset     = s.riskPreset || 'balanced';
  const glide      = age !== null ? _calcGlide(age, preset, (s.returnRate || 7) / 100) : null;
  const fireMultiple = preset === 'conservative' ? 30 : preset === 'optimistic' ? 25 : 28.57;
  const fireNumber = Math.round((s.monthlySpend || 0) * 12 * fireMultiple);
  const monthlyNet = (s.monthlyIncome || 0) - (s.monthlySpend || 0);
  const yrsToTarget = age !== null ? Math.max(0, (s.targetRetireAge || 62) - age) : null;
  const trendRate  = s.incomeTrendAnnualRate || 0;
  const trendResult = _fitIncomeTrend(s.incomeByMonth);

  const presetBtn = (p, label) =>
    `<button class="fin-plan-preset-btn${preset === p ? ' active' : ''}" data-preset="${p}">${label}</button>`;

  c.innerHTML = `
    <div class="fin-plan-wrap">

      <div style="display:flex;align-items:center;margin-bottom:12px">
        <div class="fin-plan-preset-group">
          ${presetBtn('conservative', 'Conservative')}
          ${presetBtn('balanced', 'Balanced')}
          ${presetBtn('optimistic', 'Optimistic')}
        </div>
      </div>

      <div class="fin-panel" style="margin-bottom:14px">
        <div class="fin-panel-body">

          <details open>
          <summary class="fin-plan-section-row" style="cursor:pointer;list-style:none"><span>Income</span><div class="fin-plan-section-rule"></div></summary>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0">
            <div class="fin-plan-kv">
              <div class="fin-plan-label">Projected income / mo</div>
              <div style="display:flex;align-items:flex-end;gap:10px;margin:3px 0">
                <div>
                  <div style="font-size:20px;font-weight:700;line-height:1.1">${_fmtMoneyCompact(s.monthlyIncome || 0)}</div>
                  <div class="fin-plan-hint" style="color:${trendRate >= 0 ? 'var(--neon-green)' : 'var(--neon-red)'}">
                    trend: ${trendRate >= 0 ? '+' : ''}${trendRate.toFixed(1)}%/yr
                    ${plan.income_source === 'sources' ? '(from income sources)' : ''}
                  </div>
                </div>
                <div id="plan-income-spark">${_renderIncomeSpark(s.incomeByMonth, trendResult)}</div>
              </div>
            </div>
            <div class="fin-plan-kv">
              <div class="fin-plan-label">Monthly spend</div>
              <div class="fin-plan-input-wrap"><span class="fin-plan-prefix">$</span>
                <input class="fin-plan-input" id="plan-spend" type="number" step="1" value="${Math.round(s.monthlySpend || 0)}">
              </div>
              <div class="fin-plan-hint">90-day avg</div>
            </div>
            <div class="fin-plan-kv">
              <div class="fin-plan-label">Target retire age</div>
              <div class="fin-plan-input-wrap">
                <input class="fin-plan-input" id="plan-retire-age" type="number" step="1" min="40" max="85" value="${s.targetRetireAge || 62}">
              </div>
              <div class="fin-plan-hint">${yrsToTarget !== null ? `${yrsToTarget} yrs away` : age !== null ? '' : '<span style="color:var(--neon-blue);cursor:pointer" onclick="loadPage(\'settings\')">set birthday in Settings →</span>'}</div>
            </div>
            <div class="fin-plan-kv">
              <div class="fin-plan-label">Years forward</div>
              <div class="fin-plan-input-wrap">
                <input class="fin-plan-input" id="plan-years" type="number" step="1" min="1" max="60" value="${s.yearsForward || 30}">
              </div>
              <div class="fin-plan-hint">projection length</div>
            </div>
          </div>
          </details>

          <details open style="margin-top:12px">
          <summary class="fin-plan-section-row" style="cursor:pointer;list-style:none"><span>Investment model</span><div class="fin-plan-section-rule"></div></summary>
          ${s.cashBalance > 0 && !(s.minCashBalance > 0) ? `<div style="font-size:12px;color:var(--neon-amber);margin-bottom:8px">Min cash on hand not set — <span style="cursor:pointer;text-decoration:underline" onclick="loadPage('settings')">configure in Settings → Financial Profile</span> to improve Invested % accuracy.</div>` : ''}
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 2fr;gap:0">
            <div class="fin-plan-kv">
              <div class="fin-plan-label">Stock return</div>
              <div class="fin-plan-input-wrap">
                <input class="fin-plan-input" id="plan-return" type="number" step="0.1" min="0" max="30" value="${s.returnRate || 7}">
                <span class="fin-plan-suffix">%</span>
              </div>
              <div class="fin-plan-hint" title="Expected annual stock market return. Bond return = half this. Allocation by preset + age.">${glide ? `blended age ${age}: ${(glide.annualReturn * 100).toFixed(1)}%` : 'bonds earn half · allocation varies by age'}</div>
            </div>
            <div class="fin-plan-kv">
              <div class="fin-plan-label">Inflation</div>
              <div class="fin-plan-input-wrap">
                <input class="fin-plan-input" id="plan-inflation" type="number" step="0.1" min="0" max="20" value="${s.inflationRate || 2.5}">
                <span class="fin-plan-suffix">%</span>
              </div>
              <div class="fin-plan-hint">applied to spend</div>
            </div>
            <div class="fin-plan-kv">
              <div class="fin-plan-label">Invested %</div>
              <div class="fin-plan-input-wrap">
                <input class="fin-plan-input" id="plan-inv-frac" type="number" step="1" min="0" max="100" value="${Math.round(s.investmentFrac || 0)}">
                <span class="fin-plan-suffix">%</span>
              </div>
              <div class="fin-plan-hint">${_fmtMoneyCompact(s.investmentsBalance || 0)} invested · ${_fmtMoneyCompact(s.cashBalance || 0)} cash${s.minCashBalance > 0 ? ` · ${_fmtMoneyCompact(s.minCashBalance)} reserved` : ''}</div>
            </div>
            <div class="fin-plan-kv" style="border-left:1px solid var(--border-subtle);padding-left:14px">
              <div class="fin-plan-label">${preset} allocation${age !== null ? ` — age ${age}` : ''}</div>
              ${glide ? `
              <div style="font-size:16px;font-weight:700;margin:3px 0">
                ${Math.round(glide.stocksPct * 100)}% <span style="color:rgba(77,159,255,0.9)">stocks</span>
                &nbsp;/&nbsp;
                ${Math.round(glide.bondsPct * 100)}% <span style="color:rgba(0,229,255,0.7)">bonds</span>
              </div>
              <div class="fin-plan-hint">${(glide.annualReturn * 100).toFixed(1)}% blended · FIRE at ${fireMultiple}× spend</div>
              ` : `<div class="fin-plan-hint" style="margin-top:6px">
                Enter birth date in <span style="color:var(--neon-blue);cursor:pointer" onclick="loadPage('settings')">Settings</span> to see age-based allocation · FIRE at ${fireMultiple}× spend
              </div>`}
            </div>
          </div>
          </details>

          <details class="fin-plan-advanced" style="margin-top:12px">
            <summary>Income growth assumptions</summary>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;margin-top:8px">
              <div class="fin-plan-kv">
                <div class="fin-plan-label">Annual raise</div>
                <div class="fin-plan-input-wrap">
                  <input class="fin-plan-input" id="plan-raise-rate" type="number" step="0.5" min="0" max="30" value="${s.annualRaiseRate ?? 3}">
                  <span class="fin-plan-suffix">%</span>
                </div>
                <div class="fin-plan-hint">expected / yr</div>
              </div>
              <div class="fin-plan-kv">
                <div class="fin-plan-label">Salary cap / mo</div>
                <div class="fin-plan-input-wrap"><span class="fin-plan-prefix">$</span>
                  <input class="fin-plan-input" id="plan-salary-cap" type="number" step="100" min="0" value="${s.salaryCap ?? 0}">
                </div>
                <div class="fin-plan-hint">${(s.salaryCap ?? 0) > 0 ? `raises stop at $${(s.salaryCap).toLocaleString()}/mo` : 'no ceiling'}</div>
              </div>
              <div class="fin-plan-kv">
                <div class="fin-plan-label">% of raise saved</div>
                <div class="fin-plan-input-wrap">
                  <input class="fin-plan-input" id="plan-raise-saved" type="number" step="5" min="0" max="100" value="${s.savingsOfRaise ?? 50}">
                  <span class="fin-plan-suffix">%</span>
                </div>
                <div class="fin-plan-hint">rest is lifestyle</div>
              </div>
            </div>
          </details>

          <div class="fin-plan-derived" style="margin-top:10px">
            Net worth: <strong>${_fmtMoneyCompact(s.netWorth)}</strong>
            &nbsp;·&nbsp; Monthly net: <strong style="color:${monthlyNet >= 0 ? 'var(--neon-green)' : 'var(--neon-red)'}">${_fmtMoney(monthlyNet)}</strong>
            &nbsp;·&nbsp; FIRE #: <strong style="color:var(--neon-cyan)">${_fmtMoneyCompact(fireNumber)}</strong>
          </div>
        </div>
      </div>

      <div id="plan-kpis" style="margin-bottom:14px"></div>

      <div class="fin-panel" style="margin-bottom:14px">
        <div class="fin-panel-header">
          <h3>Net worth projection</h3>
          <div style="display:flex;gap:12px;align-items:center;font-size:12px;color:var(--text-secondary);flex-wrap:wrap">
            <span style="display:flex;align-items:center;gap:4px">
              <svg width="14" height="10"><rect width="14" height="10" rx="2" fill="rgba(0,229,255,0.45)"/></svg>
              Contributions
            </span>
            <span style="display:flex;align-items:center;gap:4px">
              <svg width="14" height="10"><rect width="14" height="10" rx="2" fill="rgba(0,255,136,0.50)"/></svg>
              Investment gains
            </span>
            <span title="When monthly investment returns first exceed your monthly income — your portfolio earns more than your job" style="display:flex;align-items:center;gap:4px;cursor:default">
              <svg width="14" height="10"><line x1="0" y1="5" x2="14" y2="5" stroke="rgba(0,255,136,0.7)" stroke-width="1.5" stroke-dasharray="3,2"/></svg>
              Compounding ⓘ
            </span>
            <span title="Planned retirement — salary contributions stop; portfolio grows or draws down on its own" style="display:flex;align-items:center;gap:4px;cursor:default">
              <svg width="14" height="10"><line x1="0" y1="5" x2="14" y2="5" stroke="rgba(0,229,255,0.7)" stroke-width="1.5" stroke-dasharray="4,2"/></svg>
              Retire ⓘ
            </span>
            <span title="Financial independence — net worth reaches your FI number (annual spend × FI multiple). You could live off investments indefinitely." style="display:flex;align-items:center;gap:4px;cursor:default">
              <svg width="10" height="10"><circle cx="5" cy="5" r="4.5" fill="#BF5FFF"/></svg>
              FI reached ⓘ
            </span>
            <span title="Net worth hits $1M" style="display:flex;align-items:center;gap:4px;cursor:default">
              <svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="var(--neon-amber)"/></svg>
              $1M ⓘ
            </span>
            <span style="display:flex;align-items:center;gap:4px">
              <svg width="14" height="10"><line x1="0" y1="5" x2="14" y2="5" stroke="rgba(255,80,80,0.7)" stroke-width="1.5" stroke-dasharray="4,3"/></svg>
              Expenditure
            </span>
          </div>
        </div>
        <div class="fin-panel-body" id="plan-chart-wrap" style="padding:10px 14px"></div>
      </div>

      <div id="plan-milestones" style="margin-bottom:14px"></div>

      <div id="plan-glide" style="margin-bottom:14px"></div>

      <div class="fin-panel">
        <div class="fin-panel-header">
          <h3>Planned expenditures</h3>
          <button class="btn btn-primary btn-sm" id="plan-exp-add">+ Add</button>
        </div>
        <div class="fin-panel-body" id="plan-exp-list"></div>
      </div>
    </div>`;

  // Risk preset buttons
  c.querySelectorAll('.fin-plan-preset-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newPreset = btn.dataset.preset;
      if (newPreset === _finPlanState.riskPreset) return;
      const inp = _readPlanInputs(c);
      Object.assign(_finPlanState, {
        monthlySpend: inp.spend, returnRate: inp.ret, inflationRate: inp.inf,
        investmentFrac: inp.invFrac, yearsForward: inp.years,
        annualRaiseRate: inp.raiseRate, salaryCap: inp.salaryCap,
        savingsOfRaise: inp.raiseSaved, targetRetireAge: inp.targetRetireAge,
        riskPreset: newPreset,
      });
      try { await apiFetch('PATCH', '/finance/planning/assumptions', { plan_mode: newPreset }); }
      catch(e) { /* non-critical */ }
      _setFinView('planning');
    });
  });

  // Auto-save + live-update on any input change
  ['plan-spend','plan-return','plan-inflation','plan-inv-frac','plan-years',
   'plan-raise-rate','plan-salary-cap','plan-raise-saved','plan-retire-age'].forEach(id => {
    c.querySelector('#' + id)?.addEventListener('input', () => {
      _redrawProjection(c);
      _debouncedPlanSave(c);
    });
  });

  c.querySelector('#plan-exp-add').addEventListener('click', () =>
    _openExpModal(null, () => _refreshExpenditures(c)));

  _renderExpList(c);
  _redrawProjection(c);
}

function _calcAge(birthDate) {
  if (!birthDate) return null;
  // Normalise MM/DD/YYYY → YYYY-MM-DD so the T suffix parses correctly
  const iso = /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(birthDate)
    ? birthDate.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, '$3-$1-$2')
    : birthDate;
  const bd = new Date(iso + 'T00:00:00');
  if (isNaN(bd.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age >= 0 ? age : null;
}

function _fitIncomeTrend(byMonth) {
  // byMonth is [{bucket, total}] newest-first; returns {slope, annualRate, projectedCurrent, points}
  // points is [{t, value, trend}] oldest-first; trend is 6-month trailing MA to match backend
  if (!byMonth || byMonth.length === 0) {
    return { slope: 0, annualRate: 0, projectedCurrent: 0, points: [] };
  }
  const ordered = [...byMonth].reverse();  // oldest-first
  const n = ordered.length;

  // 6-month trailing MA at each position
  const points = ordered.map((m, i) => {
    const win = ordered.slice(Math.max(0, i - 5), i + 1);
    const trend = win.reduce((s, w) => s + w.total, 0) / win.length;
    return { t: i, value: m.total, trend };
  });

  // projectedCurrent = avg of last 6 months (matches backend anchor logic)
  const recent = ordered.slice(Math.max(0, n - 6));
  const prior  = ordered.slice(Math.max(0, n - 12), Math.max(0, n - 6));
  const recentAvg = recent.length ? recent.reduce((s, m) => s + m.total, 0) / recent.length : 0;
  const priorAvg  = prior.length  ? prior.reduce((s, m) => s + m.total, 0)  / prior.length  : 0;
  const annualRate = (priorAvg > 0 && recentAvg > 0)
    ? (((recentAvg / priorAvg) ** 2) - 1) * 100 : 0;

  return { slope: 0, annualRate, projectedCurrent: recentAvg, points };
}

function _renderIncomeSpark(byMonth, trendResult) {
  if (!byMonth || byMonth.length < 2) return '';
  const pts = trendResult.points;
  if (!pts || !pts.length) return '';
  const W = 120, H = 40, BAR_GAP = 1;
  const n = pts.length;
  const recentStart = Math.max(0, n - 6);  // bars contributing to the MA estimate
  const maxVal = Math.max(...pts.map(p => Math.max(p.value, p.trend)), 1);
  const barW = Math.max(1, (W - BAR_GAP * (n - 1)) / n);
  const yFor = v => H - Math.max(2, Math.round((v / maxVal) * (H - 4))) - 2;
  const bars = pts.map((p, i) => {
    const x = (i * (barW + BAR_GAP)).toFixed(1);
    const h = Math.max(2, Math.round((p.value / maxVal) * (H - 4)));
    const fill = i >= recentStart ? 'rgba(0,255,136,0.50)' : 'rgba(0,255,136,0.20)';
    return `<rect x="${x}" y="${(H - h - 2).toFixed(1)}" width="${barW.toFixed(1)}" height="${h}" rx="1" fill="${fill}"/>`;
  }).join('');
  // Only draw the MA line where the window is full (i >= 5) so the ramp-up isn't misleading
  const maPath = pts.filter((_, i) => i >= Math.min(5, n - 1)).map((p, j, arr) => {
    const i = pts.indexOf(p);
    const x = (i * (barW + BAR_GAP) + barW / 2).toFixed(1);
    const y = yFor(p.trend).toFixed(1);
    return `${j === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:${W}px;height:${H}px;display:block;flex-shrink:0">
    ${bars}
    ${maPath ? `<path d="${maPath}" fill="none" stroke="var(--neon-cyan)" stroke-width="1.5" stroke-linejoin="round"/>` : ''}
  </svg>`;
}

// stockReturn = user's market return assumption (from plan-return field, default 7%).
// Bond return = stockReturn * 0.5 — a stable rule of thumb (bonds earn ~half the equity risk premium).
// Presets change ONLY allocation formula — they represent risk tolerance, not market outlook.
function _calcGlide(age, preset, stockReturn = 0.07) {
  let stocksPct;
  if (preset === 'optimistic') {
    stocksPct = Math.max(0.40, Math.min(0.95, (110 - age) / 100));
  } else if (preset === 'conservative') {
    stocksPct = Math.max(0.20, Math.min(0.70, (90 - age) / 100));
  } else {
    stocksPct = Math.max(0.30, Math.min(0.85, (100 - age) / 100));
  }
  const bondReturn = stockReturn * 0.5;
  const bondsPct = 1 - stocksPct;
  return { stocksPct, bondsPct, stockReturn, bondReturn, annualReturn: stocksPct * stockReturn + bondsPct * bondReturn };
}

function _readPlanInputs(c) {
  const spend           = parseFloat(c.querySelector('#plan-spend')?.value)       || 0;
  const ret             = parseFloat(c.querySelector('#plan-return')?.value)      || 7;
  const inf             = parseFloat(c.querySelector('#plan-inflation')?.value)   || 2.5;
  const invFrac         = parseFloat(c.querySelector('#plan-inv-frac')?.value)    ?? (_finPlanState.investmentFrac || 0);
  const years           = Math.min(60, Math.max(1, parseInt(c.querySelector('#plan-years')?.value) || 30));
  const raiseRate       = Math.max(0, parseFloat(c.querySelector('#plan-raise-rate')?.value)  || 0);
  const salaryCap       = Math.max(0, parseFloat(c.querySelector('#plan-salary-cap')?.value)  || 0);
  const raiseSaved      = Math.max(0, Math.min(100, parseFloat(c.querySelector('#plan-raise-saved')?.value) ?? 50));
  const birthDate       = _finPlanState.birthDate || '';
  const targetRetireAge = Math.max(40, Math.min(85, parseInt(c.querySelector('#plan-retire-age')?.value) || 62));
  const riskPreset      = _finPlanState.riskPreset || 'balanced';
  const currentAge      = _calcAge(birthDate);
  const monthlyIncome   = _finPlanState.monthlyIncome || 0;
  return { monthlyIncome, spend, ret, inf, invFrac, years, raiseRate, salaryCap, raiseSaved, birthDate, targetRetireAge, riskPreset, currentAge };
}

function _redrawProjection(c) {
  const inp = _readPlanInputs(c);
  const { monthlyIncome, spend, ret, inf, invFrac, years, raiseRate, salaryCap, raiseSaved, riskPreset, currentAge, targetRetireAge } = inp;
  Object.assign(_finPlanState, { annualRaiseRate: raiseRate, salaryCap, savingsOfRaise: raiseSaved });
  const nw             = _finPlanState.netWorth || 0;
  const investmentFrac = invFrac / 100;
  const exps           = _finPlanState.expenditures || [];
  const plannedRetireYear = currentAge !== null && targetRetireAge
    ? Math.max(0, targetRetireAge - currentAge) : null;
  const effectiveYears = years;

  const result = _projectNetWorth({
    netWorth: nw, investmentFrac,
    monthlyIncome, monthlySpend: spend, returnRate: ret, inflationRate: inf,
    riskPreset, currentAge, targetRetireAge, expenditures: exps, yearsForward: effectiveYears,
    annualRaiseRate: raiseRate, salaryCap, savingsOfRaise: raiseSaved,
    cashBalance:         _finPlanState.cashBalance         || 0,
    investmentsBalance:  _finPlanState.investmentsBalance  || 0,
    minCashBalance:      _finPlanState.minCashBalance       || 0,
  });

  const chartWrap = c.querySelector('#plan-chart-wrap');
  if (chartWrap) chartWrap.innerHTML = _renderProjectionSVG({ ...result, plannedRetireYear, expenditures: exps, yearsForward: effectiveYears });

  const milestonesEl = c.querySelector('#plan-milestones');
  if (milestonesEl) milestonesEl.innerHTML = _planMilestonesHTML(result, { nw, monthlySpend: spend, yearsForward: years, annualRaiseRate: raiseRate, riskPreset });

  const kpisEl = c.querySelector('#plan-kpis');
  if (kpisEl) kpisEl.innerHTML = _renderKPICards({
    totalIncome: monthlyIncome, spend,
    netWorth: nw,
    cashBalance:         _finPlanState.cashBalance         || 0,
    investmentsBalance:  _finPlanState.investmentsBalance  || 0,
    fireNumber: result.fireNumber,
    retireYear: result.retireYear, crossoverYear: result.crossoverYear,
    nwAtRetireYear: result.nwAtRetireYear,
    currentAge, targetRetireAge, riskPreset,
  });

  const glideEl = c.querySelector('#plan-glide');
  if (glideEl) glideEl.innerHTML = _renderGlideTable(currentAge, targetRetireAge, riskPreset, years, ret / 100);
}

function _projectNetWorth({ netWorth, investmentFrac, monthlyIncome = 0, monthlySpend, returnRate,
                            riskPreset = 'balanced', currentAge = null, targetRetireAge = null,
                            expenditures = [], yearsForward, annualRaiseRate = 0, salaryCap = 0,
                            savingsOfRaise = 50, inflationRate = 2.5,
                            cashBalance = 0, investmentsBalance = 0, minCashBalance = 0 }) {
  const fireMultiple = riskPreset === 'conservative' ? 30 : riskPreset === 'optimistic' ? 25 : 28.57;
  const fireNumber   = monthlySpend * 12 * fireMultiple;
  const today        = new Date();

  const getMonthlyReturn = (yearN) => {
    if (currentAge !== null) {
      const { annualReturn } = _calcGlide(currentAge + yearN, riskPreset, returnRate / 100);
      return annualReturn / 12;
    }
    return (returnRate / 100) / 12;
  };

  // Split NW into tracked liquid components + static illiquid (home equity, etc.)
  // Use actual balances when available so drawdown logic is accurate.
  const hasBalances = cashBalance + investmentsBalance > 0;
  let investNW  = hasBalances ? investmentsBalance       : netWorth * investmentFrac;
  let cashNW    = hasBalances ? cashBalance               : netWorth * (1 - investmentFrac);
  const otherNW = netWorth - investNW - cashNW;  // illiquid — static, no return in this model

  let currentSalary  = monthlyIncome;
  let currentSpend   = monthlySpend;
  let currentSavings = monthlyIncome - monthlySpend;
  let cumulContribs  = 0;
  let cumulGains     = 0;

  const snapNW = () => Math.round(investNW + cashNW + otherNW);
  const points = [{ year: 0, nw: Math.round(netWorth), contributions: 0, gains: 0 }];
  let retireYear = null, millionYear = null, crossoverYear = null, nwAtRetireYear = null;

  const plannedRetireYear = (currentAge !== null && targetRetireAge !== null)
    ? Math.max(0, targetRetireAge - currentAge)
    : null;

  for (let month = 1; month <= yearsForward * 12; month++) {
    const yearN     = Math.ceil(month / 12);
    const isRetired = plannedRetireYear !== null && (month / 12) >= plannedRetireYear;
    const mr        = getMonthlyReturn(yearN);

    // Inflate spending once per year
    if (month % 12 === 1 && month > 1) {
      currentSpend *= (1 + inflationRate / 100);
      if (!isRetired) currentSavings = currentSalary - currentSpend;
    }

    // Annual raise step-up (pre-retirement only)
    if (month % 12 === 0 && annualRaiseRate > 0 && !isRetired) {
      const capHit = salaryCap > 0 && currentSalary >= salaryCap;
      if (!capHit) {
        const prev    = currentSalary;
        currentSalary = salaryCap > 0
          ? Math.min(currentSalary * (1 + annualRaiseRate / 100), salaryCap)
          : currentSalary * (1 + annualRaiseRate / 100);
        currentSavings += (currentSalary - prev) * (savingsOfRaise / 100);
      }
    }

    // Net flow: pre-retirement = income − spend; post-retirement = −spend (pure drawdown)
    const netFlow      = isRetired ? -currentSpend : currentSavings;
    const monthContrib = Math.max(0, netFlow);
    cumulContribs     += monthContrib;

    // Route savings by investmentFrac; drawdowns use available cash first (above minCash buffer)
    if (netFlow >= 0) {
      investNW += netFlow * investmentFrac;
      cashNW   += netFlow * (1 - investmentFrac);
    } else {
      const need       = -netFlow;
      const availCash  = Math.max(0, cashNW - minCashBalance);
      const fromCash   = Math.min(availCash, need);
      cashNW   -= fromCash;
      investNW -= (need - fromCash);
    }

    // Investment growth on invested portion only
    const investGrowth = Math.max(0, investNW) * mr;
    cumulGains        += investGrowth;
    investNW          += investGrowth;

    // Expenditures — one-time and recurring
    const curDate  = new Date(today.getFullYear(), today.getMonth() + month, 1);
    const isoMonth = `${curDate.getFullYear()}-${String(curDate.getMonth() + 1).padStart(2, '0')}`;
    for (const exp of expenditures) {
      let applies = false;
      if (exp.is_recurring && exp.recurrence_months > 0 && exp.expected_date) {
        const startDate = new Date(exp.expected_date + 'T00:00:00');
        const endDate   = exp.recurrence_end_date ? new Date(exp.recurrence_end_date + 'T00:00:00') : null;
        if (curDate >= startDate && (!endDate || curDate <= endDate)) {
          const monthsDiff = (curDate.getFullYear() - startDate.getFullYear()) * 12
                           + (curDate.getMonth() - startDate.getMonth());
          applies = monthsDiff >= 0 && monthsDiff % exp.recurrence_months === 0;
        }
      } else {
        applies = !!(exp.expected_date && exp.expected_date.startsWith(isoMonth));
      }
      if (applies) {
        const availCash  = Math.max(0, cashNW - minCashBalance);
        const fromCash   = Math.min(availCash, exp.amount);
        const fromInvest = exp.amount - fromCash;
        cashNW   -= fromCash;
        investNW -= fromInvest;
      }
    }

    // Rebalance to target investmentFrac — assumes user keeps allocation constant
    const liquidNW    = investNW + cashNW;
    const aboveFloor  = Math.max(0, liquidNW - minCashBalance);
    investNW = aboveFloor * investmentFrac;
    cashNW   = liquidNW - investNW;

    // Crossover: monthly investment return ≥ monthly income (pre-retirement only)
    if (!isRetired && crossoverYear === null && currentSalary > 0 && investGrowth >= currentSalary) {
      crossoverYear = month / 12;
    }

    const year  = month / 12;
    const nwNow = snapNW();
    if (nwAtRetireYear === null && isRetired) {
      nwAtRetireYear = nwNow;
    }
    if (fireNumber > 0 && retireYear  === null && nwNow >= fireNumber)  retireYear  = year;
    if (millionYear === null && nwNow >= 1_000_000) millionYear = year;
    const contribsForPoint = Math.round(Math.max(0, Math.min(cumulContribs, nwNow)));
    points.push({ year, nw: nwNow, contributions: contribsForPoint, gains: Math.round(cumulGains) });
  }

  return { points, retireYear, millionYear, crossoverYear, fireNumber, nwAtRetireYear };
}

function _normDateISO(str) {
  if (!str) return '';
  const s = String(str).trim();
  // Already YYYY-MM-DD (possibly with time suffix — strip time)
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  // Delegate all other formats (MM/DD/YYYY, MM/DD, m/d, relative, etc.) to the shared parser
  return parseSmartDate(s) || '';
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

function _renderProjectionSVG({ points, retireYear, millionYear, crossoverYear, fireNumber, plannedRetireYear, expenditures, yearsForward }) {
  if (!points || points.length < 2) {
    return `<div class="di-empty">Set income and return rate to see your projection.</div>`;
  }

  const W = 680, H = 300, PAD_L = 66, PAD_R = 16, PAD_T = 36, PAD_B = 32;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const allNW  = points.map(p => p.nw);
  const rawMin = Math.min(0, ...allNW);
  const rawMax = Math.max(...allNW, 1000);
  const rawRange = rawMax - rawMin;
  const tickInt  = _planNiceNum(rawRange / 5);
  const niceMin  = Math.floor(rawMin / tickInt) * tickInt;
  const niceMax  = niceMin + Math.ceil((rawMax - niceMin) / tickInt + 1) * tickInt;
  const span     = niceMax - niceMin;

  const xFor = yr => PAD_L + (yr / yearsForward) * innerW;
  const yFor = v  => PAD_T + innerH * (1 - (v - niceMin) / span);
  const baselineY = yFor(Math.max(niceMin, 0)).toFixed(1);

  const grid = [];
  for (let v = niceMin; v <= niceMax + tickInt * 0.01; v += tickInt) {
    const y = yFor(v).toFixed(1);
    grid.push(`<line x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>`);
    grid.push(`<text x="${PAD_L - 5}" y="${parseFloat(y) + 4}" text-anchor="end" fill="rgba(255,255,255,0.38)" font-size="10.5">${_fmtPlanAxis(v)}</text>`);
  }
  if (rawMin < 0) {
    grid.push(`<line x1="${PAD_L}" y1="${baselineY}" x2="${W - PAD_R}" y2="${baselineY}" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>`);
  }

  // Stacked area paths
  const contribAreaD = points.map((p, i) => {
    const x = xFor(p.year).toFixed(1);
    const y = yFor(Math.max(niceMin, p.contributions)).toFixed(1);
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ') +
    ` L${xFor(points[points.length - 1].year).toFixed(1)},${baselineY}` +
    ` L${xFor(points[0].year).toFixed(1)},${baselineY} Z`;

  const gainsAreaD = points.map((p, i) => {
    const x = xFor(p.year).toFixed(1);
    const y = yFor(Math.max(niceMin, p.nw)).toFixed(1);
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ') +
    points.slice().reverse().map(p => {
      const x = xFor(p.year).toFixed(1);
      const y = yFor(Math.max(niceMin, p.contributions)).toFixed(1);
      return `L${x},${y}`;
    }).join(' ') + ' Z';

  const nwLinePath = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${xFor(p.year).toFixed(1)},${yFor(p.nw).toFixed(1)}`).join(' ');

  const defs = `<defs>
    <linearGradient id="planContribFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#00E5FF" stop-opacity="0.50"/>
      <stop offset="100%" stop-color="#00E5FF" stop-opacity="0.12"/>
    </linearGradient>
    <linearGradient id="planGainsFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#00FF88" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#00FF88" stop-opacity="0.10"/>
    </linearGradient>
  </defs>`;

  const contribArea = `<path d="${contribAreaD}" fill="url(#planContribFill)"/>`;
  const gainsArea   = `<path d="${gainsAreaD}"   fill="url(#planGainsFill)"/>`;
  const nwLine      = `<path d="${nwLinePath}" fill="none" stroke="rgba(255,255,255,0.80)" stroke-width="1.5" stroke-linejoin="round"/>`;

  // Crossover year marker — event occurred within yearN, best estimate is mid-segment
  const today = new Date();
  let crossoverMarker = '';
  if (crossoverYear && crossoverYear <= yearsForward) {
    const cx = xFor(crossoverYear).toFixed(1);
    crossoverMarker = `<line x1="${cx}" y1="${PAD_T}" x2="${cx}" y2="${H - PAD_B}" stroke="rgba(0,255,136,0.45)" stroke-width="1" stroke-dasharray="3,3"/>`;
  }

  // Planned retirement marker
  let planRetireMarker = '';
  if (plannedRetireYear !== null && plannedRetireYear <= yearsForward) {
    const rx = xFor(plannedRetireYear).toFixed(1);
    planRetireMarker = `<line x1="${rx}" y1="${PAD_T}" x2="${rx}" y2="${H - PAD_B}" stroke="rgba(0,229,255,0.55)" stroke-width="1.5" stroke-dasharray="5,3"/>`;
  }

  // FI marker — interpolate exact x where NW crosses fireNumber; y pinned to fireNumber level
  let fireMarker = '';
  if (retireYear && retireYear <= yearsForward) {
    const prevFIPt  = points.find(p => p.year === retireYear - 1) || points[0];
    const crossFIPt = points.find(p => p.year === retireYear);
    let fiX;
    if (crossFIPt && prevFIPt && crossFIPt.nw !== prevFIPt.nw) {
      const t = (fireNumber - prevFIPt.nw) / (crossFIPt.nw - prevFIPt.nw);
      fiX = xFor((retireYear - 1) + Math.max(0, Math.min(1, t))).toFixed(1);
    } else {
      fiX = xFor(retireYear).toFixed(1);
    }
    const fiY = yFor(fireNumber).toFixed(1);
    fireMarker = `
      <line x1="${fiX}" y1="${PAD_T}" x2="${fiX}" y2="${H - PAD_B}" stroke="rgba(191,95,255,0.30)" stroke-width="1" stroke-dasharray="4,3"/>
      <circle cx="${fiX}" cy="${fiY}" r="5" fill="#BF5FFF" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>`;
  }

  // $1M milestone — interpolate exact x crossing; y pinned to threshold level
  let millionMarker = '';
  if (millionYear && millionYear <= yearsForward) {
    const prevPt = points.find(p => p.year === millionYear - 1) || points[0];
    const crossPt = points.find(p => p.year === millionYear);
    let milX;
    if (crossPt && prevPt && crossPt.nw !== prevPt.nw) {
      const t = (1_000_000 - prevPt.nw) / (crossPt.nw - prevPt.nw);
      milX = xFor((millionYear - 1) + Math.max(0, Math.min(1, t))).toFixed(1);
    } else {
      milX = xFor(millionYear).toFixed(1);
    }
    const milY = yFor(1_000_000).toFixed(1);
    millionMarker = `<circle cx="${milX}" cy="${milY}" r="4.5" fill="var(--neon-amber)" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>`;
  }

  // Expenditure markers — one-time only; recurring costs are modeled in the curve, not marked
  const expMarkers = (expenditures || []).filter(e => e.expected_date && !e.is_recurring).map((e, idx) => {
    const rawDate = _normDateISO(e.expected_date);
    if (!rawDate) return '';
    const d = new Date(rawDate + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    const yrFrac = (d.getFullYear() - today.getFullYear()) + (d.getMonth() - today.getMonth()) / 12;
    if (isNaN(yrFrac) || yrFrac < 0 || yrFrac > yearsForward) return '';
    const x      = parseFloat(xFor(yrFrac).toFixed(1));
    const anchor = x > W * 0.72 ? 'end' : 'start';
    const lx     = anchor === 'start' ? x + 3 : x - 3;
    const ly     = PAD_T + 10 + (idx % 4) * 11;
    const rawName = String(e.name || '');
    const label  = escHtml(rawName.length > 12 ? rawName.slice(0, 11) + '…' : rawName);
    const labelW = label.length * 5 + 4;
    return `
      <line x1="${x}" y1="${PAD_T}" x2="${x}" y2="${H - PAD_B}" stroke="rgba(255,80,80,0.50)" stroke-width="1.5" stroke-dasharray="4,3"/>
      <rect x="${anchor === 'start' ? lx - 2 : lx - labelW}" y="${ly - 8}" width="${labelW}" height="10" rx="2" fill="rgba(0,0,0,0.55)"/>
      <text x="${lx}" y="${ly}" text-anchor="${anchor}" fill="rgba(255,120,120,0.90)" font-size="9">${label}</text>`;
  }).join('');

  const xStep = yearsForward <= 15 ? 2 : yearsForward <= 35 ? 5 : 10;
  const xLbls = [];
  for (let yr = 0; yr <= yearsForward; yr += xStep) {
    const x = xFor(yr).toFixed(1);
    xLbls.push(`<text x="${x}" y="${H - 10}" text-anchor="middle" fill="rgba(255,255,255,0.38)" font-size="11">${today.getFullYear() + yr}</text>`);
  }

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
    ${defs}
    ${grid.join('')}
    ${contribArea}${gainsArea}${nwLine}
    ${expMarkers}${crossoverMarker}${planRetireMarker}${fireMarker}${millionMarker}
    ${xLbls.join('')}
  </svg>`;
}

function _planMilestonesHTML({ points, retireYear, millionYear, crossoverYear, fireNumber: fn }, { nw, monthlySpend, yearsForward, annualRaiseRate = 0, riskPreset = 'balanced' }) {
  const fireMultiple = riskPreset === 'conservative' ? 30 : riskPreset === 'optimistic' ? 25 : 28.57;
  const fireNumber   = fn || Math.round(monthlySpend * 12 * fireMultiple);
  const getAt = (yr) => {
    const p = points.find(p => p.year >= yr);
    return p ? p.nw : (points[points.length - 1]?.nw || 0);
  };

  const yr5nw  = getAt(5);
  const yr10nw = getAt(10);

  const today = new Date();
  const crossoverCal = crossoverYear ? today.getFullYear() + Math.round(crossoverYear) : null;

  const milestones = [
    { label: 'Today',
      value: _fmtMoneyCompact(nw),
      sub:   'current net worth',
      color: 'blue' },
    { label: 'Year 5',
      value: _fmtMoneyCompact(yr5nw),
      sub:   'projected net worth',
      color: 'teal' },
    { label: 'Year 10',
      value: _fmtMoneyCompact(yr10nw),
      sub:   'projected net worth',
      color: 'teal' },
    { label: 'FI Number',
      value: _fmtMoneyCompact(fireNumber),
      sub:   retireYear ? `FI reached yr ${Math.round(retireYear)} · ${fireMultiple}× spend` : `${fireMultiple}× annual spend · not in window`,
      color: retireYear ? 'purple' : 'gray' },
    { label: 'Compounding',
      value: crossoverCal ? `${crossoverCal}` : 'Beyond window',
      sub:   crossoverCal ? `yr ${Math.round(crossoverYear)} — returns exceed income` : 'raise savings or invested %',
      color: crossoverCal ? 'green' : 'gray' },
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

function _renderKPICards({ totalIncome, spend, netWorth, cashBalance, investmentsBalance, fireNumber, retireYear, crossoverYear, nwAtRetireYear, currentAge, targetRetireAge, riskPreset }) {
  const today       = new Date();
  const savingsRate = totalIncome > 0 ? ((totalIncome - spend) / totalIncome * 100) : 0;
  const firePct     = fireNumber > 0 ? Math.min(200, netWorth / fireNumber * 100) : 0;

  const retireCal       = retireYear ? today.getFullYear() + Math.round(retireYear) : null;
  const retireAtAge     = currentAge !== null && retireYear ? Math.round(currentAge + retireYear) : null;
  const targetRetireCal = currentAge !== null && targetRetireAge
    ? today.getFullYear() + Math.max(0, targetRetireAge - currentAge) : null;

  const card = (label, value, sub, color, opp) => `
    <div class="fin-kpi-card stat-card stat-card--${color}">
      <div class="fin-kpi-label">${escHtml(label)}</div>
      <div class="fin-kpi-value">${escHtml(String(value))}</div>
      <div class="fin-kpi-sub">${escHtml(sub)}</div>
      ${opp ? `<div class="fin-kpi-opp">${escHtml(opp)}</div>` : ''}
    </div>`;

  // 1. Crossover Year — when compounding overtakes your savings contributions
  const crossoverCal = crossoverYear ? today.getFullYear() + Math.round(crossoverYear) : null;
  const crossoverAge = currentAge !== null && crossoverYear ? Math.round(currentAge + crossoverYear) : null;
  let cvVal, cvSub, cvColor, cvOpp = '';
  if (crossoverCal) {
    cvVal   = String(crossoverCal);
    cvSub   = crossoverAge ? `age ${crossoverAge} — returns exceed income` : 'returns exceed monthly income';
    cvColor = crossoverYear <= 10 ? 'green' : crossoverYear <= 20 ? 'cyan' : 'blue';
  } else {
    cvVal   = 'Beyond window';
    cvSub   = 'Compounding not yet dominant';
    cvColor = 'gray';
    cvOpp   = 'Increase invested % or savings rate to accelerate';
  }

  // 2. FIRE Progress
  const fpColor = firePct >= 100 ? 'green' : firePct >= 50 ? 'cyan' : firePct >= 25 ? 'blue' : 'gray';
  const fpSub   = firePct >= 100 ? 'FIRE number reached!'
                : `${_fmtMoneyCompact(netWorth)} of ${_fmtMoneyCompact(fireNumber)}`;
  const fpOpp   = firePct < 50 && totalIncome > 0
    ? `Each +1% savings rate = ~${_fmtMoneyCompact(totalIncome * 0.01 * 12)}/yr more` : '';

  // 3. Retire Year — shows target retirement year and whether portfolio will be funded
  let retVal, retSub, retColor, retOpp = '';
  if (targetRetireCal) {
    retVal = String(targetRetireCal);
    const ageStr = ` (age ${targetRetireAge})`;
    if (nwAtRetireYear !== null && fireNumber > 0) {
      const fundedPct = Math.round(nwAtRetireYear / fireNumber * 100);
      retSub = `${_fmtMoneyCompact(nwAtRetireYear)} · ${fundedPct}% funded${ageStr}`;
      if (fundedPct >= 100) {
        retColor = 'green';
      } else if (fundedPct >= 75) {
        retColor = 'cyan';
      } else if (fundedPct >= 50) {
        retColor = 'amber';
        const yearsLeft = Math.max(1, targetRetireCal - today.getFullYear());
        retOpp = `+${_fmtMoneyCompact(Math.max(0, fireNumber - nwAtRetireYear) / (yearsLeft * 12))}/mo to fully fund`;
      } else {
        retColor = 'red';
        const yearsLeft = Math.max(1, targetRetireCal - today.getFullYear());
        retOpp = `+${_fmtMoneyCompact(Math.max(0, fireNumber - nwAtRetireYear) / (yearsLeft * 12))}/mo to fully fund`;
      }
    } else {
      retSub = `Target retirement${ageStr}`;
      retColor = 'gray';
      retOpp = 'Set monthly spend to see funding status';
    }
  } else if (retireCal) {
    retVal = String(retireCal);
    retSub = retireAtAge ? `FIRE year (age ${retireAtAge})` : 'FIRE year';
    retColor = 'green';
  } else {
    retVal = '—'; retSub = 'Set birth date + target age'; retColor = 'gray';
  }

  // 4. Savings Rate
  const srColor = savingsRate >= 25 ? 'green' : savingsRate >= 15 ? 'cyan' : savingsRate >= 5 ? 'amber' : 'red';
  const srSub   = savingsRate >= 25 ? 'Excellent — on track for early FIRE'
                : savingsRate >= 15 ? 'Good — push to 25% for FIRE acceleration'
                : savingsRate >= 5  ? 'Below target — every +1% matters'
                : 'Spending exceeds income — course correct now';
  const srOpp   = savingsRate < 25 && totalIncome > 0
    ? `+${_fmtMoney(Math.max(1, totalIncome * 0.25 - (totalIncome - spend)))}/mo reaches the 25% threshold` : '';

  return `<div class="fin-kpi-grid">
    ${card('Compounding Year', cvVal, cvSub, cvColor, cvOpp)}
    ${card('FI Progress',     `${Math.round(firePct)}%`, fpSub, fpColor, fpOpp)}
    ${card('Retire Year',     retVal, retSub, retColor, retOpp)}
    ${card('Savings Rate',    `${savingsRate.toFixed(1)}%`, srSub, srColor, srOpp)}
  </div>`;
}

function _renderGlideTable(currentAge, targetRetireAge, preset, yearsForward, stockReturn = 0.07) {
  if (currentAge === null) return '';
  const today = new Date();
  const currentYear = today.getFullYear();
  const maxYears = Math.max(yearsForward, Math.max(0, (targetRetireAge || 62) - currentAge) + 5);
  const rows = [];

  for (let yr = 0; yr <= maxYears; yr += 5) {
    const age = currentAge + yr;
    if (age > 100) break;
    const { stocksPct, bondsPct, annualReturn } = _calcGlide(age, preset, stockReturn);
    rows.push({ yr, age, year: currentYear + yr, stocksPct, bondsPct, annualReturn, isRetire: false });
  }

  // Insert exact retirement age row if not already present
  if (targetRetireAge && targetRetireAge > currentAge) {
    const retYr = targetRetireAge - currentAge;
    if (!rows.find(r => r.age === targetRetireAge)) {
      const { stocksPct, bondsPct, annualReturn } = _calcGlide(targetRetireAge, preset, stockReturn);
      const row = { yr: retYr, age: targetRetireAge, year: currentYear + retYr, stocksPct, bondsPct, annualReturn, isRetire: true };
      const idx = rows.findIndex(r => r.age > targetRetireAge);
      if (idx >= 0) rows.splice(idx, 0, row);
      else rows.push(row);
    } else {
      const r = rows.find(r => r.age === targetRetireAge);
      if (r) r.isRetire = true;
    }
  }

  const bondRet  = (stockReturn * 0.5 * 100).toFixed(1);
  const formula  = preset === 'optimistic' ? '110 − age' : preset === 'conservative' ? '90 − age' : '100 − age';
  const modeLabel = `${preset.charAt(0).toUpperCase() + preset.slice(1)}: stocks = ${formula}`;

  return `
    <div class="fin-panel">
      <div class="fin-panel-header">
        <h3>Portfolio glide path</h3>
        <span style="font-size:12px;color:var(--text-muted)">${escHtml(modeLabel)} · stocks ${(stockReturn*100).toFixed(1)}% · bonds ${bondRet}%</span>
      </div>
      <div class="fin-panel-body" style="padding:0">
        <table class="fin-glide-table">
          <thead><tr><th>Year</th><th>Age</th><th><span style="display:inline-flex;align-items:center;gap:6px">Allocation <span style="width:8px;height:8px;border-radius:2px;background:rgba(0,229,255,.85);display:inline-block"></span>stocks <span style="width:8px;height:8px;border-radius:2px;background:rgba(255,184,0,.70);display:inline-block"></span>bonds</span></th><th>Stocks %</th><th>Bonds %</th><th>Est. return / yr</th></tr></thead>
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

async function _refreshExpenditures(c) {
  try {
    const { items } = await apiFetch('GET', '/finance/planning/expenditures');
    _finPlanState.expenditures = (items || []).map(e => ({ ...e, expected_date: _normDateISO(e.expected_date) || e.expected_date }));
  } catch(e) { /* keep existing */ }
  _renderExpList(c);
  _redrawProjection(c);
}

function _expRecurLabel(e) {
  if (!e.is_recurring || !e.recurrence_months) return '';
  const freq = e.recurrence_months === 1 ? 'monthly' : e.recurrence_months === 3 ? 'quarterly'
             : e.recurrence_months === 6 ? 'semi-annual' : `every ${e.recurrence_months}mo`;
  const until = e.recurrence_end_date ? ` until ${formatDateShort(e.recurrence_end_date)}` : '';
  return ` · ${freq}${until}`;
}

function _renderExpList(c) {
  const exps = _finPlanState.expenditures || [];
  const el = c.querySelector('#plan-exp-list');
  if (!el) return;
  el.innerHTML = exps.length ? exps.map(e => `
    <div class="fin-list-row" data-id="${e.id}">
      <div class="fin-list-main">
        <div class="fin-list-title">${escHtml(e.name)} <span style="color:var(--neon-red)">${_fmtMoney(e.amount)}</span></div>
        <div class="fin-list-sub">${e.expected_date ? `${e.is_recurring ? 'Starting' : 'Expected'} ${formatDateShort(e.expected_date)}` : 'No date set'}${_expRecurLabel(e)}${e.notes ? ' · ' + escHtml(e.notes) : ''}</div>
      </div>
      <div class="fin-list-actions">
        <button class="btn btn-secondary btn-sm plan-exp-edit" data-id="${e.id}">Edit</button>
        <button class="goal-metric-del plan-exp-del" data-id="${e.id}">×</button>
      </div>
    </div>`).join('') : `<div class="di-empty">No planned expenditures yet — add one-time future costs here to see their impact on your projection.</div>`;

  el.querySelectorAll('.plan-exp-edit').forEach(btn =>
    btn.addEventListener('click', () => {
      const exp = exps.find(e => e.id === parseInt(btn.dataset.id));
      _openExpModal(exp, () => _refreshExpenditures(c));
    }));
  el.querySelectorAll('.plan-exp-del').forEach(btn =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this expenditure?')) return;
      try {
        await apiFetch('DELETE', `/finance/planning/expenditures/${btn.dataset.id}`);
        await _refreshExpenditures(c);
      } catch(e) { alert('Error: ' + e.message); }
    }));
}

function _openExpModal(existing, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const e = existing || { name: '', amount: '', expected_date: '', notes: '', is_recurring: 0, recurrence_months: 1, recurrence_end_date: '' };
  const isRecur = !!e.is_recurring;
  const recurMonths = e.recurrence_months || 1;
  overlay.innerHTML = `
    <div class="modal" style="width:440px">
      <div class="modal-header">
        <span class="modal-title">${existing ? 'Edit' : 'New'} planned expenditure</span>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Name</label>
          <input class="form-input" id="exp-name" value="${escHtml(e.name || '')}" placeholder="Mortgage, Car payment, Vacation, …" style="width:100%">
        </div>
        <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="form-label">Amount</label>
            <input class="form-input" id="exp-amount" type="number" step="0.01" value="${e.amount || ''}" style="width:100%"></div>
          <div><label class="form-label" id="exp-date-label">${isRecur ? 'Start date' : 'Expected date'}</label>
            <input class="form-input" id="exp-date" type="date" value="${_normDateISO(e.expected_date)}" style="width:100%"></div>
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="exp-recurring"${isRecur ? ' checked' : ''}>
          <label class="form-label" for="exp-recurring" style="margin:0;cursor:pointer">Recurring payment</label>
        </div>
        <div id="exp-recur-fields" style="${isRecur ? '' : 'display:none'}">
          <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div><label class="form-label">Frequency</label>
              <select class="form-select" id="exp-freq">
                <option value="1"${recurMonths===1?' selected':''}>Monthly</option>
                <option value="3"${recurMonths===3?' selected':''}>Quarterly</option>
                <option value="6"${recurMonths===6?' selected':''}>Semi-annual</option>
                <option value="12"${recurMonths===12?' selected':''}>Annual</option>
              </select>
            </div>
            <div><label class="form-label">End date <span style="color:var(--text-muted);font-weight:400">(optional)</span></label>
              <input class="form-input" id="exp-end-date" type="date" value="${_normDateISO(e.recurrence_end_date)}" style="width:100%">
            </div>
          </div>
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
  overlay.querySelector('#exp-recurring').addEventListener('change', function() {
    overlay.querySelector('#exp-recur-fields').style.display = this.checked ? '' : 'none';
    overlay.querySelector('#exp-date-label').textContent = this.checked ? 'Start date' : 'Expected date';
  });
  overlay.querySelector('#exp-save').addEventListener('click', async () => {
    const recurring = overlay.querySelector('#exp-recurring').checked;
    const body = {
      name:                overlay.querySelector('#exp-name').value.trim(),
      amount:              parseFloat(overlay.querySelector('#exp-amount').value) || 0,
      expected_date:       _normDateISO(overlay.querySelector('#exp-date').value) || null,
      notes:               overlay.querySelector('#exp-notes').value.trim() || null,
      is_recurring:        recurring ? 1 : 0,
      recurrence_months:   recurring ? parseInt(overlay.querySelector('#exp-freq').value) : null,
      recurrence_end_date: recurring ? (_normDateISO(overlay.querySelector('#exp-end-date').value) || null) : null,
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
