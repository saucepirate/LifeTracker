// ── Investments module (loaded globally, called from finance.js) ──────────────

let _invView = 'overview';
let _invPositions        = [];
let _invOrders           = [];
let _invSP500            = [];
let _invNotes            = [];
let _invAccounts         = [];
let _invPortfolioHistory = [];
let _invDataLoaded       = false;
let _invImportMeta       = null;
let _invAccountFilter    = '';   // '' = all accounts; account_number string = specific account

let _invHoldingsState  = { sortCol: 'current_value', sortDir: 'desc', groupByAccount: false };
let _invActivityState  = { symbol: '', account: '', actionType: '', sortCol: 'run_date', sortDir: 'desc', groupBy: false };
let _invActionsFilter  = 'open';
let _invPerfPeriod     = '3m';   // period for Recent Purchase Performance section

// ── Entry point (called from finance.js _setFinView) ─────────────────────────

async function _renderFinInvestments(c) {
  c.innerHTML = `
    <div class="inv-wrap">
      <div class="inv-sub-tabs">
        <button class="inv-tab active" data-view="overview">Overview</button>
        <button class="inv-tab" data-view="holdings">Holdings</button>
        <button class="inv-tab" data-view="activity">Activity</button>
        <button class="inv-tab" data-view="analysis">Analysis</button>
        <button class="inv-tab" data-view="notes">Notes</button>
        <button class="inv-tab" data-view="actions">Actions</button>
        <div style="flex:1"></div>
        <button class="btn btn-sm btn-secondary" id="inv-import-btn" style="font-size:12px">↑ Import Data</button>
      </div>
      <div id="inv-acct-bar" style="display:none;gap:6px;flex-wrap:wrap;margin-bottom:14px;padding-bottom:12px;border-bottom:var(--border-subtle)"></div>
      <div id="inv-panel"></div>
    </div>`;

  c.querySelectorAll('.inv-tab').forEach(t => {
    t.addEventListener('click', () => {
      c.querySelectorAll('.inv-tab').forEach(x => x.classList.toggle('active', x === t));
      _invView = t.dataset.view;
      _invRenderView(c.querySelector('#inv-panel'));
    });
  });

  c.querySelector('#inv-import-btn').addEventListener('click', _openInvImportModal);

  if (!_invDataLoaded) await _invLoadData();
  _invRenderAcctBar(c.querySelector('#inv-acct-bar'));
  _invRenderView(c.querySelector('#inv-panel'));
}

async function _invLoadData() {
  try {
    const [posData, ordData, sp5Data, noteData, acctData, histData, actData] = await Promise.all([
      apiFetch('GET', '/investments/positions'),
      apiFetch('GET', '/investments/orders'),
      apiFetch('GET', '/investments/sp500'),
      apiFetch('GET', '/investments/notes'),
      apiFetch('GET', '/investments/accounts'),
      apiFetch('GET', '/investments/portfolio-history'),
      apiFetch('GET', '/investments/actions'),
    ]);
    _invPositions        = posData?.items  || [];
    _invImportMeta       = posData?.import_meta || null;
    _invOrders           = ordData?.items  || [];
    _invSP500            = sp5Data?.items  || [];
    _invNotes            = noteData?.items || [];
    _invAccounts         = acctData?.items || [];
    _invPortfolioHistory = histData?.items || [];
    _invActions          = actData?.items  || [];
    _invDataLoaded = true;
  } catch (e) {
    _invDataLoaded = true;
  }
}

function _invRenderView(el) {
  el.innerHTML = '<div class="loading-state">Loading…</div>';
  switch (_invView) {
    case 'overview':     _invRenderOverview(el);     break;
    case 'holdings':     _invRenderHoldings(el);     break;
    case 'activity':     _invRenderActivity(el);     break;
    case 'analysis':     _invRenderAnalysis(el);     break;
    case 'notes':        _invRenderNotes(el);        break;
    case 'actions':      _invRenderActions(el);      break;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Account filter bar ────────────────────────────────────────────────────────

function _invRenderAcctBar(el) {
  if (!el || !_invAccounts.length) { if (el) el.style.display = 'none'; return; }
  el.style.display = 'flex';
  const pills = [{ account_number: '', account_name: 'All Accounts' }, ..._invAccounts];
  el.innerHTML = pills.map(a => {
    const active = _invAccountFilter === a.account_number;
    return `<button class="inv-acct-pill"
      data-acct="${escHtml(a.account_number)}"
      style="padding:4px 14px;border-radius:var(--radius-pill);font-size:12px;font-weight:${active?'500':'400'};
             border:1px solid ${active?'var(--neon-cyan)':'var(--border-color)'};
             background:${active?'rgba(0,229,255,0.12)':'transparent'};
             color:${active?'var(--neon-cyan)':'var(--text-muted)'};cursor:pointer">
      ${escHtml(a.account_name)}
    </button>`;
  }).join('');
  el.querySelectorAll('.inv-acct-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      _invAccountFilter = btn.dataset.acct;
      _invRenderAcctBar(el);
      _invRenderView(document.querySelector('#inv-panel'));
    });
  });
}

// ── History / chart helpers ───────────────────────────────────────────────────

function _invGetHistoryPoints() {
  if (!_invPortfolioHistory.length) return [];
  const rows = _invAccountFilter
    ? _invPortfolioHistory.filter(h => h.account_number === _invAccountFilter)
    : _invPortfolioHistory;
  // Group by import snapshot, summing across accounts
  const byImport = new Map();
  for (const h of rows) {
    if (!byImport.has(h.import_id)) {
      byImport.set(h.import_id, { date: (h.imported_at || '').slice(0, 10), value: 0, cost: 0 });
    }
    const e = byImport.get(h.import_id);
    e.value += (h.total_value || 0);
    e.cost  += (h.total_cost  || 0);
  }
  return [...byImport.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Builds a portfolio value trend series from order history × current prices.
// At each order date: (shares accumulated so far for each symbol) × latest price.
// This is NOT historical pricing — it uses current prices throughout — but shows
// the shape of your exposure over time. Anchored to the real snapshot value at today.
function _invBuildEstimatedSeries(positions, orders, stableSymbols) {
  const priceBySymbol = {};
  for (const p of positions) {
    if (p.symbol && p.last_price != null) priceBySymbol[p.symbol] = p.last_price;
  }

  const trades = orders
    .filter(o => (o.action_type === 'buy' || o.action_type === 'sell') &&
                  o.quantity != null && o.symbol && o.run_date &&
                  !stableSymbols.has(o.symbol))
    .sort((a, b) => a.run_date.localeCompare(b.run_date));

  if (trades.length < 2) return null;

  const cumShares = {};
  const byDate = new Map();

  for (const o of trades) {
    const prev = cumShares[o.symbol] || 0;
    cumShares[o.symbol] = o.action_type === 'buy'
      ? prev + o.quantity
      : Math.max(0, prev - o.quantity);
    const value = Object.entries(cumShares)
      .reduce((s, [sym, qty]) => s + qty * (priceBySymbol[sym] || 0), 0);
    byDate.set(o.run_date, value);
  }

  // Anchor the final point to actual portfolio value from positions
  const latestValue = positions.reduce((s, p) => s + (p.current_value || 0), 0);
  if (latestValue > 0) {
    const today = new Date().toISOString().slice(0, 10);
    byDate.set(today, latestValue);
  }

  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Chart shows three series:
//   1. Cumulative invested — step line built from every buy order (cyan)
//   2. Estimated value trend — shares held at each order date × current prices (dashed green)
//   3. Portfolio value snapshots — dots at each positions-import (solid green)
// The gap between invested and estimated = unrealised gain/loss at current prices.
function _invDrawChart(histPoints, buyOrders, estimatedSeries) {
  // Build cumulative-invested step series from order history
  const sortedBuys = [...(buyOrders || [])]
    .filter(o => o.run_date && o.amount != null)
    .sort((a, b) => a.run_date.localeCompare(b.run_date));

  let cum = 0;
  const investedSteps = sortedBuys.map(o => ({ date: o.run_date, value: (cum += Math.abs(o.amount)) }));
  const today = new Date().toISOString().slice(0, 10);
  if (investedSteps.length) {
    investedSteps.push({ date: today, value: cum }); // extend line to today
  }

  const hasPortfolio = histPoints.length > 0;
  const hasInvested  = investedSteps.length > 0;
  const hasEstimated = (estimatedSeries || []).length >= 2;

  if (!hasPortfolio && !hasInvested && !hasEstimated) {
    return `<div style="text-align:center;padding:32px 16px;color:var(--text-muted);font-size:13px">
      Import positions and order history to see the performance chart.</div>`;
  }

  const W = 560, H = 260;
  const PAD = { top: 20, right: 16, bottom: 36, left: 68 };
  const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;

  const allVals = [
    ...histPoints.map(h => h.value),
    ...investedSteps.map(s => s.value),
    ...(estimatedSeries || []).map(s => s.value),
  ].filter(v => v > 0);

  if (!allVals.length) return '';

  const maxV  = Math.max(...allVals) * 1.06;
  const allMs = [
    ...histPoints.map(h => new Date(h.date).getTime()),
    ...investedSteps.map(s => new Date(s.date).getTime()),
    ...(estimatedSeries || []).map(s => new Date(s.date).getTime()),
  ];
  const minMs = Math.min(...allMs), maxMs = Math.max(...allMs);
  const msRange = maxMs - minMs || 1;

  const xP = d => PAD.left + (new Date(d).getTime() - minMs) / msRange * cW;
  const yP = v => PAD.top + cH - (v / maxV) * cH;

  // Grid
  const gridHTML = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const v = maxV * f, y = yP(v).toFixed(1);
    return `<line x1="${PAD.left}" y1="${y}" x2="${W-PAD.right}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
      <text x="${PAD.left-6}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="var(--text-muted)">${_fmtMoneyCompact(v)}</text>`;
  }).join('');

  // Cumulative invested — step path + filled area
  let investedHTML = '';
  if (investedSteps.length) {
    // Step path: go vertical first at each new date, then horizontal
    let d = `M${xP(investedSteps[0].date).toFixed(1)},${yP(0).toFixed(1)} L${xP(investedSteps[0].date).toFixed(1)},${yP(investedSteps[0].value).toFixed(1)}`;
    for (let i = 1; i < investedSteps.length; i++) {
      const x = xP(investedSteps[i].date).toFixed(1);
      const yPrev = yP(investedSteps[i-1].value).toFixed(1);
      const yCurr = yP(investedSteps[i].value).toFixed(1);
      d += ` L${x},${yPrev} L${x},${yCurr}`;
    }
    const lastX = xP(investedSteps[investedSteps.length-1].date).toFixed(1);
    const areaD = `${d} L${lastX},${yP(0).toFixed(1)} Z`;
    investedHTML = `
      <path d="${areaD}" fill="var(--neon-cyan)" opacity="0.07"/>
      <path d="${d}" fill="none" stroke="var(--neon-cyan)" stroke-width="1.5" opacity="0.55"/>`;
  }

  // Estimated value trend — dashed line from shares accumulated × current prices
  let estimatedHTML = '';
  if (hasEstimated) {
    const linePath = estimatedSeries
      .map((h, i) => `${i?'L':'M'}${xP(h.date).toFixed(1)},${yP(h.value).toFixed(1)}`)
      .join(' ');
    estimatedHTML = `<path d="${linePath}" fill="none" stroke="var(--neon-green)" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.6"/>`;
  }

  // Portfolio value snapshots — solid green dots + connecting line (measured, not estimated)
  let portfolioHTML = '';
  if (histPoints.length) {
    if (histPoints.length > 1) {
      const linePath = histPoints.map((h, i) => `${i?'L':'M'}${xP(h.date).toFixed(1)},${yP(h.value).toFixed(1)}`).join(' ');
      portfolioHTML += `<path d="${linePath}" fill="none" stroke="var(--neon-green)" stroke-width="2.5"/>`;
    }
    portfolioHTML += histPoints.map(h =>
      `<circle cx="${xP(h.date).toFixed(1)}" cy="${yP(h.value).toFixed(1)}" r="5" fill="var(--neon-green)" stroke="var(--bg-card)" stroke-width="2">
        <title>${h.date}: ${_fmtMoney(h.value)}</title></circle>`
    ).join('');
  }

  // S&P 500 normalised to first portfolio snapshot (only if ≥2 snapshots)
  let sp5HTML = '';
  if (_invSP500.length && histPoints.length >= 2) {
    const firstSP5 = _sp500LookupNearest(histPoints[0].date);
    if (firstSP5 > 0) {
      const sp5pts = histPoints.map(h => {
        const sp5 = _sp500LookupNearest(h.date);
        return sp5 ? `${xP(h.date).toFixed(1)},${yP(histPoints[0].value * sp5 / firstSP5).toFixed(1)}` : null;
      }).filter(Boolean);
      if (sp5pts.length >= 2) {
        sp5HTML = `<polyline points="${sp5pts.join(' ')}" fill="none" stroke="var(--neon-amber)" stroke-width="1.5" stroke-dasharray="5,4" opacity="0.7"/>`;
      }
    }
  }

  // X-axis labels — evenly-spaced calendar month boundaries, not data-point indices.
  // Picking every N-th data point bunches labels wherever orders are dense; instead
  // we generate 1st-of-month ticks at a step size that yields ~5-7 labels.
  const _MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const _fmtAxisDate = iso => {
    const [y, m] = iso.split('-');
    return `${_MONTHS[parseInt(m, 10) - 1]} '${y.slice(2)}`;
  };

  const axisStart = new Date(minMs), axisEnd = new Date(maxMs);
  const spanMonths = (axisEnd.getUTCFullYear() - axisStart.getUTCFullYear()) * 12
                   + axisEnd.getUTCMonth() - axisStart.getUTCMonth();
  const stepMonths = spanMonths <= 5 ? 1 : spanMonths <= 11 ? 2 : spanMonths <= 23 ? 3 : 6;

  // Walk month boundaries from the first full month inside the range to the last
  let ly = axisStart.getUTCFullYear(), lm = axisStart.getUTCMonth();
  if (axisStart.getUTCDate() > 1) { lm++; if (lm > 11) { lm = 0; ly++; } }
  const tickDates = [];
  while (Date.UTC(ly, lm, 1) <= maxMs) {
    tickDates.push(new Date(Date.UTC(ly, lm, 1)).toISOString().slice(0, 10));
    lm += stepMonths;
    while (lm > 11) { lm -= 12; ly++; }
  }

  let prevLabelX = -Infinity;
  const xLabels = tickDates.map(d => {
    const x = parseFloat(xP(d).toFixed(1));
    if (x < PAD.left || x > W - PAD.right) return '';
    if (x - prevLabelX < 42) return '';   // skip if too close to previous
    prevLabelX = x;
    return `<text x="${x}" y="${H - 4}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${_fmtAxisDate(d)}</text>`;
  }).join('');

  // Legend — build dynamically based on what series are present
  let lx = 0;
  const legendItems = [];
  if (hasInvested) {
    legendItems.push(`<line x1="${lx}" y1="9" x2="${lx+14}" y2="9" stroke="var(--neon-cyan)" stroke-width="1.5" opacity="0.55"/><text x="${lx+18}" y="13" font-size="11" fill="var(--text-muted)">Invested</text>`);
    lx += 72;
  }
  if (hasEstimated) {
    legendItems.push(`<line x1="${lx}" y1="9" x2="${lx+14}" y2="9" stroke="var(--neon-green)" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.6"/><text x="${lx+18}" y="13" font-size="11" fill="var(--text-muted)">Value trend</text>`);
    lx += 88;
  }
  if (hasPortfolio) {
    legendItems.push(`<circle cx="${lx+5}" cy="9" r="4" fill="var(--neon-green)"/><text x="${lx+13}" y="13" font-size="11" fill="var(--text-muted)">Snapshot</text>`);
    lx += 76;
  }
  if (sp5HTML) {
    legendItems.push(`<line x1="${lx}" y1="9" x2="${lx+14}" y2="9" stroke="var(--neon-amber)" stroke-width="1.5" stroke-dasharray="5,4" opacity="0.7"/><text x="${lx+18}" y="13" font-size="11" fill="var(--text-muted)">S&amp;P 500</text>`);
  }

  return `<svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block;overflow:visible">
    ${investedHTML}
    ${estimatedHTML}
    ${portfolioHTML}
    ${sp5HTML}
    ${gridHTML}
    ${xLabels}
    <g transform="translate(${PAD.left},6)">${legendItems.join('')}</g>
  </svg>`;
}

function _invFmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function _invGainClass(n) {
  if (n == null) return '';
  return n >= 0 ? 'inv-gain' : 'inv-loss';
}

function _invTotalValue() {
  return _invPositions.reduce((s, p) => s + (p.current_value || 0), 0);
}

function _invTotalCost() {
  return _invPositions.reduce((s, p) => s + (p.cost_basis_total || 0), 0);
}

function _invTotalGain() {
  return _invPositions.reduce((s, p) => s + (p.total_gain_dollar || 0), 0);
}

// Returns the set of symbols that are stable-NAV instruments (money market funds,
// SPAXX cash sweep, etc.). Their buy/sell transactions are liquidity management,
// not investment decisions — each deposit buys SPAXX and each withdrawal sells it,
// so cumulative buys vastly exceed true "invested" amounts. Money market funds trade
// at exactly $1.00/share; real stocks almost never do, so we use that as the signal.
function _invGetStableSymbols(positions) {
  return new Set(
    positions.filter(p =>
      (p.security_type && /money.?market/i.test(p.security_type)) ||
      (p.last_price != null && Math.abs(p.last_price - 1.00) < 0.005)
    ).map(p => p.symbol).filter(Boolean)
  );
}

// ── XIRR ─────────────────────────────────────────────────────────────────────
// Newton-Raphson solver for XIRR (internal rate of return for irregular cash flows).
// cashflows: [{date: 'YYYY-MM-DD', amount: Number}]
//   negative = money you paid out (buy), positive = money you received (sell/terminal value)
function _invXIRR(cashflows, guess = 0.1) {
  if (!cashflows || cashflows.length < 2) return null;
  const ms = cashflows.map(cf => new Date(cf.date).getTime());
  const t0 = Math.min(...ms);
  const yrs = ms.map(m => (m - t0) / 31557600000); // ms → years (365.25 days)
  let r = guess;
  for (let i = 0; i < 200; i++) {
    let f = 0, df = 0;
    for (let j = 0; j < cashflows.length; j++) {
      const c = cashflows[j].amount, t = yrs[j];
      if (t === 0) { f += c; continue; }
      const base = Math.pow(1 + r, t);
      f  += c / base;
      df -= c * t / (base * (1 + r));
    }
    if (Math.abs(df) < 1e-12) break;
    const rn = r - f / df;
    if (Math.abs(rn - r) < 1e-8) return rn * 100;
    r = (!isFinite(rn) || rn < -0.9999) ? (Math.random() - 0.5) * 0.4 : rn;
  }
  return isFinite(r) ? r * 100 : null;
}

// Build signed cash-flow array for XIRR from order history + current portfolio value.
function _invBuildCashflows(positions, orders, stableSymbols) {
  const stable = stableSymbols || _invGetStableSymbols(positions);
  const flows = [];
  for (const o of orders) {
    if (!o.run_date || o.amount == null || stable.has(o.symbol)) continue;
    if (o.action_type === 'buy')      flows.push({ date: o.run_date, amount: -Math.abs(o.amount) });
    if (o.action_type === 'sell')     flows.push({ date: o.run_date, amount: +Math.abs(o.amount) });
    if (o.action_type === 'dividend') flows.push({ date: o.run_date, amount: +Math.abs(o.amount) });
  }
  if (!flows.length) return null;
  flows.sort((a, b) => a.date.localeCompare(b.date));
  const terminalValue = positions.filter(p => !stable.has(p.symbol)).reduce((s, p) => s + (p.current_value || 0), 0);
  if (terminalValue > 0) flows.push({ date: new Date().toISOString().slice(0, 10), amount: +terminalValue });
  if (!flows.some(f => f.amount < 0) || !flows.some(f => f.amount > 0)) return null;
  return flows;
}

// ── Holding-level analytics ───────────────────────────────────────────────────
// Returns {symbol: {firstBuyDate, holdingDays, dividends, annualizedReturn}}
function _invGetHoldingAnalytics(positions, orders) {
  const bySymbol = {};
  for (const o of orders) {
    if (!o.symbol) continue;
    if (!bySymbol[o.symbol]) bySymbol[o.symbol] = { firstBuyDate: null, dividends: 0 };
    const a = bySymbol[o.symbol];
    if (o.action_type === 'buy' && (!a.firstBuyDate || o.run_date < a.firstBuyDate)) a.firstBuyDate = o.run_date;
    if (o.action_type === 'dividend') a.dividends += Math.abs(o.amount || 0);
  }
  const today = new Date().toISOString().slice(0, 10);
  const result = {};
  for (const p of positions) {
    if (!p.symbol) continue;
    const a = bySymbol[p.symbol] || {};
    const holdingDays  = a.firstBuyDate ? Math.round((new Date(today) - new Date(a.firstBuyDate)) / 86400000) : null;
    const holdingYears = holdingDays != null ? holdingDays / 365.25 : null;
    let annualizedReturn = null;
    if (holdingYears && holdingYears >= 30 / 365 && p.cost_basis_total > 0 && p.current_value > 0) {
      annualizedReturn = (Math.pow(p.current_value / p.cost_basis_total, 1 / holdingYears) - 1) * 100;
    }
    result[p.symbol] = { firstBuyDate: a.firstBuyDate || null, holdingDays, dividends: a.dividends || 0, annualizedReturn };
  }
  return result;
}

// ── Asset classification ──────────────────────────────────────────────────────
const _INV_ETF_SET = new Set([
  'VOO','VTI','QQQ','ONEQ','VBR','VB','VO','VXUS','VEA','VWO','BND','AGG',
  'SCHD','VYM','IVV','SPY','ARKK','SKYY','PBJ','XLK','XLF','XLE','XLV','XLI',
  'ITOT','SWTSX','FXAIX','FSKAX','FSMAX','FZROX','GLD','IAU','TLT','LQD','IJH','IJR',
]);
function _invClassifyHolding(position) {
  const sym  = (position.symbol        || '').toUpperCase();
  const desc = (position.description   || '').toUpperCase();
  const type = (position.security_type || '').toUpperCase();
  if (/money.?market/i.test(type) || (position.last_price != null && Math.abs(position.last_price - 1.00) < 0.005)) return 'cash';
  if (_INV_ETF_SET.has(sym) || /\bETF\b/.test(desc) || /INDEX\s*(FUND|SHARES|TRUST)/.test(desc)) return 'index_etf';
  return 'individual_stock';
}

// ── Year-over-year data ───────────────────────────────────────────────────────
function _invBuildYearlyData(orders, histPoints, stableSymbols) {
  const stable = stableSymbols || new Set();
  const byYear = {};
  for (const o of orders.filter(o => !stable.has(o.symbol) && o.run_date)) {
    const yr = +o.run_date.slice(0, 4);
    if (!byYear[yr]) byYear[yr] = { contributions: 0, proceeds: 0, dividends: 0 };
    if (o.action_type === 'buy')      byYear[yr].contributions += Math.abs(o.amount || 0);
    if (o.action_type === 'sell')     byYear[yr].proceeds      += Math.abs(o.amount || 0);
    if (o.action_type === 'dividend') byYear[yr].dividends     += Math.abs(o.amount || 0);
  }
  const snapByYear = {};
  for (const h of histPoints) {
    const yr = +h.date.slice(0, 4);
    if (!snapByYear[yr]) snapByYear[yr] = [];
    snapByYear[yr].push(h);
  }
  const years = [...new Set([...Object.keys(byYear).map(Number), ...Object.keys(snapByYear).map(Number)])].sort();
  return years.map(yr => {
    const d      = byYear[yr] || { contributions: 0, proceeds: 0, dividends: 0 };
    const snaps  = (snapByYear[yr]     || []).sort((a, b) => a.date.localeCompare(b.date));
    const pSnaps = (snapByYear[yr - 1] || []).sort((a, b) => a.date.localeCompare(b.date));
    const startValue = pSnaps.length ? pSnaps[pSnaps.length - 1].value : null;
    const endValue   = snaps.length  ? snaps[snaps.length - 1].value   : null;
    let gain = null, returnPct = null;
    if (startValue != null && startValue > 0 && endValue != null) {
      const net = d.contributions - d.proceeds;
      gain = endValue - startValue - net;
      const denom = startValue + net / 2; // modified Dietz mid-year weighting
      returnPct = denom > 0 ? gain / denom * 100 : null;
    }
    return { year: yr, contributions: d.contributions, proceeds: d.proceeds, dividends: d.dividends, startValue, endValue, gain, returnPct };
  });
}

// Compute portfolio stats using order history where available, falling back to
// Fidelity cost_basis_total for positions that have no imported buy orders.
// Accepts explicit positions/orders arrays so callers can pass account-filtered slices.
function _invComputePortfolioStats(positions = _invPositions, orders = _invOrders) {
  const totalValue = positions.reduce((s, p) => s + (p.current_value || 0), 0);

  // Exclude stable-NAV symbols from order-based math — use Fidelity cost basis instead.
  const stableSymbols = _invGetStableSymbols(positions);

  const buyOrders  = orders.filter(o => o.action_type === 'buy'      && o.amount != null && !stableSymbols.has(o.symbol));
  const sellOrders = orders.filter(o => o.action_type === 'sell'     && o.amount != null && !stableSymbols.has(o.symbol));
  const divOrders  = orders.filter(o => o.action_type === 'dividend' && o.amount != null && !stableSymbols.has(o.symbol));

  if (buyOrders.length) {
    // Symbols that have at least one imported buy — use cash-flow math for these.
    const symbolsWithOrders = new Set(buyOrders.map(o => o.symbol).filter(Boolean));

    const totalBought = buyOrders.reduce((s, o) => s + Math.abs(o.amount), 0);
    // Only subtract sells/divs for symbols we also have buys for, to stay consistent.
    const totalSold = sellOrders
      .filter(o => symbolsWithOrders.has(o.symbol))
      .reduce((s, o) => s + Math.abs(o.amount), 0);
    const totalDivs = divOrders
      .filter(o => symbolsWithOrders.has(o.symbol))
      .reduce((s, o) => s + Math.abs(o.amount), 0);
    const orderCost = totalBought - totalSold - totalDivs;

    // Positions with NO qualifying buy orders (including stable-NAV) — fall back to Fidelity cost basis.
    const fallbackCost = positions
      .filter(p => p.symbol && (!symbolsWithOrders.has(p.symbol) || stableSymbols.has(p.symbol)))
      .reduce((s, p) => s + (p.cost_basis_total || 0), 0);

    const netInvested = orderCost + fallbackCost;

    if (netInvested > 0) {
      const gainDollar  = totalValue - netInvested;
      const totalReturn = gainDollar / netInvested * 100;

      // Annualise if we have ≥30 days of history
      const dates     = buyOrders.map(o => o.run_date).filter(Boolean).sort();
      const firstDate = dates[0];
      let annualized  = null;
      if (firstDate) {
        const years = (Date.now() - new Date(firstDate).getTime()) / (365.25 * 86400 * 1000);
        if (years >= 30 / 365) {
          annualized = (Math.pow(1 + totalReturn / 100, 1 / years) - 1) * 100;
        }
      }
      return { totalValue, gainDollar, totalReturn, annualized, netInvested, source: 'orders' };
    }
  }

  // Full fallback — no qualifying orders at all; use Fidelity position data entirely.
  const netInvested = positions.reduce((s, p) => s + (p.cost_basis_total || 0), 0);
  const gainDollar  = positions.reduce((s, p) => s + (p.total_gain_dollar || 0), 0);
  const totalReturn = netInvested > 0 ? gainDollar / netInvested * 100 : 0;
  return { totalValue, gainDollar, totalReturn, annualized: null, netInvested, source: 'positions' };
}

function _sp500LookupNearest(isoDate) {
  if (!_invSP500.length) return null;
  // Find latest entry on or before isoDate
  let best = null;
  for (const row of _invSP500) {
    if (row.observation_date <= isoDate) best = row;
    else break;
  }
  return best ? best.value : null;
}

function _invComputeBenchmark(positions = _invPositions, orders = _invOrders) {
  if (!_invSP500.length || !orders.length) return null;
  const latestSP5 = _invSP500[_invSP500.length - 1].value;
  if (!latestSP5) return null;

  const stableSymbols = _invGetStableSymbols(positions);
  const buyOrders = orders.filter(o => o.action_type === 'buy' && o.amount && o.run_date && !stableSymbols.has(o.symbol));
  if (!buyOrders.length) return null;

  // Portfolio return: use the same hybrid calculation as the KPI cards so numbers stay consistent.
  const stats = _invComputePortfolioStats(positions, orders);
  if (!stats.netInvested) return null;

  // S&P 500 hypothetical: invest the same buy-order dollars on the same dates.
  let orderDollars = 0;
  let hypotheticalShares = 0;
  for (const o of buyOrders) {
    const spent = Math.abs(o.amount);
    orderDollars += spent;
    const sp5Price = _sp500LookupNearest(o.run_date);
    if (sp5Price && sp5Price > 0) hypotheticalShares += spent / sp5Price;
  }
  if (orderDollars === 0) return null;

  const hypotheticalValue = hypotheticalShares * latestSP5;
  const sp5Return         = (hypotheticalValue - orderDollars) / orderDollars * 100;

  return {
    totalInvested: stats.netInvested,
    hypotheticalValue,
    portfolioValue:  stats.totalValue,
    portfolioReturn: stats.totalReturn,
    sp5Return,
  };
}

function _invDonutSVG(positions, totalValue) {
  const COLORS = ['#00E5FF','#00FF88','#FFB800','#BF5FFF','#FF2D55','#4D9FFF','#FF6B2D','#1DE9B6','#FF6090','#69F0AE'];
  const THRESHOLD = 0.02;

  const sorted = [...positions].filter(p => p.current_value > 0)
    .sort((a,b) => b.current_value - a.current_value);

  const main   = sorted.filter(p => p.current_value / totalValue >= THRESHOLD);
  const otherV = sorted.filter(p => p.current_value / totalValue < THRESHOLD)
                       .reduce((s, p) => s + p.current_value, 0);

  const slices = main.map(p => ({ label: p.symbol, value: p.current_value }));
  if (otherV > 0) slices.push({ label: 'Other', value: otherV });

  const CX = 95, CY = 95, R = 78, IR = 44;
  let startAngle = -Math.PI / 2;
  const paths = slices.map((s, i) => {
    const frac = s.value / totalValue;
    const angle = frac * 2 * Math.PI;
    const x1 = CX + R * Math.cos(startAngle);
    const y1 = CY + R * Math.sin(startAngle);
    startAngle += angle;
    const x2 = CX + R * Math.cos(startAngle);
    const y2 = CY + R * Math.sin(startAngle);
    const large = angle > Math.PI ? 1 : 0;
    const color = COLORS[i % COLORS.length];
    return `<path d="M${CX},${CY} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${color}" opacity="0.85"><title>${s.label}: ${_fmtMoneyCompact(s.value)} (${(frac*100).toFixed(1)}%)</title></path>`;
  });

  return `<svg width="190" height="190" viewBox="0 0 190 190" style="display:block">
    ${paths.join('')}
    <circle cx="${CX}" cy="${CY}" r="${IR}" fill="var(--bg-card)"/>
    <text x="${CX}" y="${CY - 7}" text-anchor="middle" font-size="11" fill="var(--text-muted)">Total</text>
    <text x="${CX}" y="${CY + 11}" text-anchor="middle" font-size="14" font-weight="600" fill="var(--text-primary)">${_fmtMoneyCompact(totalValue)}</text>
  </svg>`;
}

function _invDonutLegend(positions, totalValue) {
  const COLORS = ['#00E5FF','#00FF88','#FFB800','#BF5FFF','#FF2D55','#4D9FFF','#FF6B2D','#1DE9B6','#FF6090','#69F0AE'];
  const THRESHOLD = 0.02;
  const sorted = [...positions].filter(p => p.current_value > 0)
    .sort((a,b) => b.current_value - a.current_value);
  const main = sorted.filter(p => p.current_value / totalValue >= THRESHOLD);
  return main.map((p, i) => {
    const pct = (p.current_value / totalValue * 100).toFixed(1);
    return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;font-size:12px">
      <span style="width:10px;height:10px;border-radius:2px;background:${COLORS[i % COLORS.length]};flex-shrink:0"></span>
      <span style="font-weight:500;min-width:34px">${escHtml(p.symbol)}</span>
      <span style="color:var(--text-muted);min-width:38px">${pct}%</span>
      <span class="${_invGainClass(p.total_gain_pct)}" style="min-width:46px;text-align:right">${_invFmtPct(p.total_gain_pct)}</span>
    </div>`;
  }).join('');
}

function _generateInvInsights(positions, orders, totalValue) {
  const insights = [];
  if (!positions.length) return insights;

  // Concentration warning
  const sorted = [...positions].filter(p => p.current_value > 0)
    .sort((a,b) => b.current_value - a.current_value);
  const top = sorted[0];
  if (top && totalValue > 0) {
    const topPct = top.current_value / totalValue * 100;
    if (topPct > 25) {
      insights.push({ type: 'warning', text: `<strong>${escHtml(top.symbol)}</strong> makes up ${topPct.toFixed(0)}% of your portfolio — concentration risk.` });
    }
  }

  // Gains concentration
  const gainers = positions.filter(p => (p.total_gain_dollar || 0) > 0)
    .sort((a,b) => b.total_gain_dollar - a.total_gain_dollar);
  if (gainers.length >= 3) {
    const totalGains = gainers.reduce((s,p) => s + p.total_gain_dollar, 0);
    const topGainShare = (gainers[0].total_gain_dollar / totalGains * 100);
    if (topGainShare > 40) {
      insights.push({ type: 'info', text: `<strong>${escHtml(gainers[0].symbol)}</strong> accounts for ${topGainShare.toFixed(0)}% of your total unrealized gains.` });
    }
  }

  // Heavy losers with ongoing buys
  const symbolBuyCounts = {};
  for (const o of orders.filter(o => o.action_type === 'buy')) {
    symbolBuyCounts[o.symbol] = (symbolBuyCounts[o.symbol] || 0) + 1;
  }
  for (const p of positions) {
    if ((p.total_gain_pct || 0) < -10 && (symbolBuyCounts[p.symbol] || 0) >= 2) {
      insights.push({ type: 'caution', text: `You've been regularly buying <strong>${escHtml(p.symbol)}</strong> but it's down ${Math.abs(p.total_gain_pct).toFixed(0)}% — is that intentional?` });
    }
  }

  // Heavy individual losers
  for (const p of positions) {
    if ((p.total_gain_pct || 0) < -30) {
      insights.push({ type: 'warning', text: `<strong>${escHtml(p.symbol)}</strong> is down ${Math.abs(p.total_gain_pct).toFixed(0)}% from cost basis — worth reviewing.` });
    }
  }

  // ETF vs stock mix
  if (positions.length >= 5) {
    const classed = positions.map(p => _invClassifyHolding(p));
    const etfV   = positions.reduce((s,p,i) => classed[i]==='index_etf'       ? s+(p.current_value||0) : s, 0);
    const stkV   = positions.reduce((s,p,i) => classed[i]==='individual_stock' ? s+(p.current_value||0) : s, 0);
    const etfPct = etfV / totalValue * 100;
    if (etfPct < 20) {
      insights.push({ type: 'info', text: `Only ${etfPct.toFixed(0)}% of your portfolio is in index funds/ETFs — heavily weighted toward individual stocks.` });
    } else if (etfPct > 70) {
      insights.push({ type: 'info', text: `${etfPct.toFixed(0)}% of your portfolio is in index funds/ETFs — well-diversified core.` });
    }
    const etfCost = positions.reduce((s,p,i) => classed[i]==='index_etf'       ? s+(p.cost_basis_total||0) : s, 0);
    const stkCost = positions.reduce((s,p,i) => classed[i]==='individual_stock' ? s+(p.cost_basis_total||0) : s, 0);
    const etfGain = positions.reduce((s,p,i) => classed[i]==='index_etf'       ? s+(p.total_gain_dollar||0) : s, 0);
    const stkGain = positions.reduce((s,p,i) => classed[i]==='individual_stock' ? s+(p.total_gain_dollar||0) : s, 0);
    const etfRet  = etfCost  > 0 ? etfGain  / etfCost  * 100 : null;
    const stkRet  = stkCost  > 0 ? stkGain  / stkCost  * 100 : null;
    if (etfRet != null && stkRet != null && Math.abs(stkRet - etfRet) > 2) {
      if (stkRet > etfRet) {
        insights.push({ type: 'good', text: `Your individual stock picks are outperforming your index funds by <strong>${(stkRet-etfRet).toFixed(1)}%</strong>.` });
      } else {
        insights.push({ type: 'caution', text: `Your index funds are outperforming individual stocks by <strong>${(etfRet-stkRet).toFixed(1)}%</strong>. Stock picks are a drag.` });
      }
    }
  }

  // Benchmark beat/miss
  const bm = _invComputeBenchmark();
  if (bm && Math.abs(bm.portfolioReturn - bm.sp5Return) > 1) {
    const diff = bm.portfolioReturn - bm.sp5Return;
    if (diff > 0) {
      insights.push({ type: 'good', text: `You're beating the S&P 500 equivalent by <strong>${diff.toFixed(1)}%</strong> on a money-weighted basis.` });
    } else {
      insights.push({ type: 'caution', text: `Your portfolio is trailing the S&P 500 equivalent by <strong>${Math.abs(diff).toFixed(1)}%</strong> on a money-weighted basis.` });
    }
  }

  // Open actions
  const openActions = _invActions.filter(a => a.status === 'open');
  if (openActions.length > 0) {
    insights.push({ type: 'info', text: `You have <strong>${openActions.length}</strong> open action item${openActions.length > 1 ? 's' : ''} — check the Actions tab.` });
  }

  return insights;
}

// ── Recurring investment helpers ──────────────────────────────────────────────

function _invDetectFrequency(sortedDates) {
  if (sortedDates.length < 2) return '—';
  const intervals = [];
  for (let i = 1; i < sortedDates.length; i++) {
    intervals.push((new Date(sortedDates[i]) - new Date(sortedDates[i-1])) / 86400000);
  }
  const avg = intervals.reduce((s, d) => s + d, 0) / intervals.length;
  if (avg < 10) return 'Weekly';
  if (avg < 21) return 'Bi-weekly';
  if (avg < 40) return 'Monthly';
  if (avg < 70) return 'Bi-monthly';
  return 'Quarterly+';
}

function _invRenderRecurringSection(fPos, fOrd, stable) {
  const buyOrders = fOrd.filter(o => o.action_type === 'buy' && o.symbol && o.run_date && !stable.has(o.symbol));
  if (!buyOrders.length) return '<div class="di-empty" style="padding:8px 0">Import order history to see recurring investment patterns.</div>';
  const bySymbol = {};
  for (const o of buyOrders) {
    if (!bySymbol[o.symbol]) bySymbol[o.symbol] = { orders: [], totalAmount: 0, totalQty: 0 };
    bySymbol[o.symbol].orders.push(o);
    bySymbol[o.symbol].totalAmount += Math.abs(o.amount || 0);
    bySymbol[o.symbol].totalQty    += o.quantity || 0;
  }
  const recurring = Object.entries(bySymbol)
    .filter(([, d]) => d.orders.length >= 2)
    .map(([sym, d]) => {
      const dates    = d.orders.map(o => o.run_date).sort();
      const avgCost  = d.totalQty > 0 ? d.totalAmount / d.totalQty : null;
      const pos      = fPos.find(p => p.symbol === sym);
      const curPrice = pos?.last_price;
      const curVal   = pos?.current_value;
      const glPct    = avgCost && curPrice ? (curPrice - avgCost) / avgCost * 100 : null;
      return { sym, count: d.orders.length, totalAmount: d.totalAmount, avgCost, curPrice, curVal, glPct,
               firstDate: dates[0], lastDate: dates[dates.length - 1], freq: _invDetectFrequency(dates) };
    })
    .sort((a, b) => b.totalAmount - a.totalAmount);
  if (!recurring.length) return '<div class="di-empty" style="padding:8px 0">No recurring investments detected (need ≥2 buys of the same symbol).</div>';
  const COLS = '56px 88px 88px 88px 48px 96px 76px 76px 68px';
  return `<div style="overflow-x:auto">
    <div class="inv-hdr-row" style="grid-template-columns:${COLS}">
      <div>Symbol</div><div>Frequency</div><div>First Buy</div><div>Latest Buy</div>
      <div style="text-align:right">Buys</div>
      <div style="text-align:right">Total Invested</div>
      <div style="text-align:right">Avg Cost</div>
      <div style="text-align:right">Cur. Value</div>
      <div style="text-align:right">G/L %</div>
    </div>
    ${recurring.map(r => `
      <div class="inv-data-row" style="grid-template-columns:${COLS}">
        <div style="font-weight:600">${escHtml(r.sym)}</div>
        <div style="font-size:12px;color:var(--neon-cyan);font-weight:500">${r.freq}</div>
        <div style="font-size:12px;color:var(--text-muted)">${r.firstDate}</div>
        <div style="font-size:12px;color:var(--text-muted)">${r.lastDate}</div>
        <div style="text-align:right;font-size:13px">${r.count}</div>
        <div style="text-align:right;font-size:13px">${_fmtMoney(r.totalAmount)}</div>
        <div style="text-align:right;font-size:13px">${r.avgCost != null ? _fmtMoney(r.avgCost) : '—'}</div>
        <div style="text-align:right;font-size:13px">${r.curVal != null ? _fmtMoney(r.curVal) : '—'}</div>
        <div class="${_invGainClass(r.glPct)}" style="text-align:right;font-size:13px;font-weight:500">${_invFmtPct(r.glPct)}</div>
      </div>`).join('')}
  </div>`;
}

// ── Year-over-year panel (shared by Overview + Performance) ───────────────────

function _invBuildYoYPanelHTML(fOrd, histPoints, stable) {
  const yearlyData = _invBuildYearlyData(fOrd, histPoints, stable);
  if (!yearlyData.length) return '';
  const oldestSnap = histPoints[0];
  const newestSnap = histPoints[histPoints.length - 1];
  const snapshotNote = histPoints.length > 0
    ? `${histPoints.length} snapshot${histPoints.length > 1 ? 's' : ''} on file (${oldestSnap.date.slice(0,7)} – ${newestSnap.date.slice(0,7)}).`
    : 'No portfolio snapshots yet.';
  const hasDivOrders = fOrd.some(o => o.action_type === 'dividend');
  const YCOLS = '60px 1fr 1fr 1fr 1fr 72px';
  const yrRows = [...yearlyData].reverse().map(y => {
    const gc = _invGainClass(y.gain), rc = _invGainClass(y.returnPct);
    const gainCell = y.gain != null
      ? `<div class="${gc}" style="text-align:right">${_fmtMoney(y.gain)}</div>`
      : `<div style="text-align:right;color:var(--text-muted);font-size:11px" title="Needs a prior-year snapshot">—</div>`;
    const retCell = y.returnPct != null
      ? `<div class="${rc}" style="text-align:right">${_invFmtPct(y.returnPct)}</div>`
      : `<div style="text-align:right;color:var(--text-muted);font-size:11px">—</div>`;
    return `<div class="inv-data-row" style="grid-template-columns:${YCOLS}">
      <div style="font-weight:600">${y.year}</div>
      <div style="text-align:right">${_fmtMoney(y.contributions)}</div>
      <div style="text-align:right;color:var(--neon-green)">${y.dividends > 0 ? _fmtMoney(y.dividends) : '—'}</div>
      <div style="text-align:right;color:var(--text-muted)">${y.proceeds > 0 ? _fmtMoney(y.proceeds) : '—'}</div>
      ${gainCell}
      ${retCell}
    </div>`;
  }).join('');
  return `
    <div class="fin-panel" style="margin-bottom:16px">
      <div class="fin-panel-header"><h3>Year-over-Year Summary</h3></div>
      <div style="overflow-x:auto">
        <div class="inv-hdr-row" style="grid-template-columns:${YCOLS}">
          <div>Year</div>
          <div style="text-align:right">Contributions</div>
          <div style="text-align:right">Dividends</div>
          <div style="text-align:right">Proceeds</div>
          <div style="text-align:right">Est. Gain</div>
          <div style="text-align:right">Return</div>
        </div>
        ${yrRows}
      </div>
      <div style="font-size:11px;color:var(--text-muted);padding:8px 12px;line-height:1.6">
        ${snapshotNote} Est. Gain and Return require a snapshot from the <em>prior</em> year — import positions at year-start and year-end to populate these columns.
        ${hasDivOrders && yearlyData.every(y => y.dividends === 0) ? ' Dividend records were found but amounts may be blank in the Fidelity CSV (common for reinvested dividends).' : ''}
      </div>
    </div>`;
}

// ── Overview ──────────────────────────────────────────────────────────────────

function _invRenderOverview(el) {
  if (!_invPositions.length) {
    el.innerHTML = _invEmptyState();
    return;
  }

  // Apply account filter
  const fPos = _invAccountFilter ? _invPositions.filter(p => p.account_number === _invAccountFilter) : _invPositions;
  const fOrd = _invAccountFilter ? _invOrders.filter(o => o.account_number === _invAccountFilter) : _invOrders;

  const stats       = _invComputePortfolioStats(fPos, fOrd);
  const totalValue  = stats.totalValue;
  const totalGain   = stats.gainDollar;
  const totalRet    = stats.totalReturn;
  const netInvested = stats.netInvested;
  const fromOrders  = stats.source === 'orders';

  const retSub = stats.annualized != null
    ? `${_invFmtPct(stats.annualized)}/yr · on ${_fmtMoney(netInvested)} invested`
    : `on ${_fmtMoney(netInvested)} invested`;

  const stable = _invGetStableSymbols(fPos);
  const xirrFlows = _invBuildCashflows(fPos, fOrd, stable);
  const xirr = xirrFlows ? _invXIRR(xirrFlows) : null;
  const xirrReasonable = xirr != null && Math.abs(xirr) < 500;

  // KPI cards
  const kpis = [
    { label: 'Portfolio Value',   value: _fmtMoney(totalValue), accent: 'green', sub: _invImportMeta ? `as of ${formatDateShort(_invImportMeta.imported_at)}` : '' },
    { label: 'Total Gain / Loss', value: _fmtMoney(totalGain),  accent: totalGain >= 0 ? 'green' : 'red', sub: _invFmtPct(totalRet) },
    { label: 'Total Return',      value: _invFmtPct(totalRet),  accent: totalRet >= 0 ? 'green' : 'red',  sub: retSub },
    { label: fromOrders ? 'Net Invested' : 'Cost Basis', value: _fmtMoney(netInvested), accent: 'cyan',
      sub: fromOrders ? `${fOrd.filter(o=>o.action_type==='buy').length} purchases` : `${fPos.length} positions` },
    ...(xirrReasonable ? [{ label: 'Portfolio IRR', value: _invFmtPct(xirr), accent: xirr >= 0 ? 'green' : 'red', sub: 'personal rate of return' }] : []),
  ];
  const kpisHTML = kpis.map(k => `
    <div class="stat-card stat-card--${k.accent}">
      <div class="stat-label">${k.label}</div>
      <div class="stat-value">${k.value}</div>
      ${k.sub ? `<div class="stat-sub">${k.sub}</div>` : ''}
    </div>`).join('');

  // Benchmark panel — compact version for top-right alongside KPIs
  const bm = _invComputeBenchmark(fPos, fOrd);
  const bmTopHTML = bm ? `
    <div class="fin-panel" style="padding:14px 16px">
      <div style="font-weight:500;font-size:13px;margin-bottom:10px;color:var(--text-muted)">Benchmark: Money-Weighted vs S&P 500</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;margin-bottom:10px">
        <div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">Your Return</div>
          <div class="${_invGainClass(bm.portfolioReturn)}" style="font-size:20px;font-weight:600">${_invFmtPct(bm.portfolioReturn)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">S&P 500 Equiv.</div>
          <div class="${_invGainClass(bm.sp5Return)}" style="font-size:20px;font-weight:600">${_invFmtPct(bm.sp5Return)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">Your Edge</div>
          <div class="${_invGainClass(bm.portfolioReturn - bm.sp5Return)}" style="font-size:20px;font-weight:600">${_invFmtPct(bm.portfolioReturn - bm.sp5Return)}</div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-muted)">S&P hypothetical: ${_fmtMoney(bm.hypotheticalValue)} · same dollars, same dates</div>
    </div>` : `
    <div class="fin-panel" style="padding:14px 16px;display:flex;flex-direction:column;justify-content:center;min-height:100px">
      <div style="font-weight:500;font-size:13px;margin-bottom:6px">Benchmark vs S&P 500</div>
      <div style="font-size:12px;color:var(--text-muted);line-height:1.5">Import <strong>SP500.csv</strong> (via ↑ Import Data) to compare your money-weighted return against the S&P 500.</div>
    </div>`;

  // Performance chart
  const histPoints = _invGetHistoryPoints();
  const buyOrdersForChart = fOrd.filter(o => o.action_type === 'buy' && !stable.has(o.symbol));
  const estimatedSeries   = _invBuildEstimatedSeries(fPos, fOrd, stable);
  const chartHTML = _invDrawChart(histPoints, buyOrdersForChart, estimatedSeries);
  const yoyPanelHTML = _invBuildYoYPanelHTML(fOrd, histPoints, stable);

  // Contributions vs Gains bar
  const investedW = totalValue > 0 ? Math.max(5, Math.min(90, netInvested / totalValue * 100)) : 0;
  const gainsW    = 100 - investedW;
  const cvgBar = `
    <div style="margin:0 0 16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px;color:var(--text-muted)">
        <span style="color:var(--neon-cyan)">■</span> Invested
        <span style="color:var(--neon-green);margin-left:12px">■</span> ${totalGain >= 0 ? 'Gains' : 'Losses'}
      </div>
      <div style="height:12px;border-radius:6px;overflow:hidden;display:flex;background:var(--bg-hover)">
        <div style="width:${investedW}%;background:var(--neon-cyan);opacity:0.7"></div>
        <div style="width:${gainsW}%;background:${totalGain >= 0 ? 'var(--neon-green)' : 'var(--neon-red)'};opacity:0.7"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-top:4px">
        <span>${_fmtMoney(netInvested)}</span>
        <span class="${_invGainClass(totalGain)}">${totalGain >= 0 ? '+' : ''}${_fmtMoney(totalGain)}</span>
      </div>
    </div>`;

  // Account breakdown — only shown when "All Accounts" is selected
  let acctCardsHTML = '';
  if (!_invAccountFilter) {
    const byAcct = {};
    for (const p of _invPositions) {
      const key = p.account_number;
      if (!byAcct[key]) byAcct[key] = { name: p.account_name || p.account_number, value: 0, gain: 0, cost: 0, positions: [] };
      byAcct[key].value     += p.current_value || 0;
      byAcct[key].gain      += p.total_gain_dollar || 0;
      byAcct[key].cost      += p.cost_basis_total || 0;
      byAcct[key].positions.push(p);
    }
    acctCardsHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:16px">` +
      Object.values(byAcct).sort((a,b) => b.value - a.value).map(a => {
        const ret = a.cost > 0 ? (a.gain / a.cost * 100) : 0;
        const top = a.positions.filter(p => p.current_value > 0).sort((x,y) => y.current_value - x.current_value)[0];
        return `<div class="fin-panel" style="padding:14px 16px">
          <div style="font-weight:500;font-size:14px;margin-bottom:6px">${escHtml(a.name)}</div>
          <div style="font-size:20px;font-weight:600;margin-bottom:2px">${_fmtMoney(a.value)}</div>
          <div class="${_invGainClass(a.gain)}" style="font-size:13px">${_invFmtPct(ret)} · ${_fmtMoney(a.gain)}</div>
          ${top ? `<div style="font-size:12px;color:var(--text-muted);margin-top:6px">Top: ${escHtml(top.symbol)} · ${_fmtMoney(top.current_value)}</div>` : ''}
        </div>`;
      }).join('') + `</div>`;
  }

  // Top / bottom performers
  const withGain   = fPos.filter(p => p.total_gain_pct != null && p.current_value > 0);
  const winners    = [...withGain].sort((a,b) => b.total_gain_pct - a.total_gain_pct).slice(0, 3);
  const losers     = [...withGain].sort((a,b) => a.total_gain_pct - b.total_gain_pct).slice(0, 3);

  const perfRow = (p, cls) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:var(--border-subtle);font-size:13px">
      <span><strong>${escHtml(p.symbol)}</strong> <span style="color:var(--text-muted);font-size:11px">${escHtml((p.description||'').slice(0,24))}</span></span>
      <span style="text-align:right">
        <span class="${cls}" style="display:block">${_invFmtPct(p.total_gain_pct)}</span>
        <span style="font-size:11px;color:var(--text-muted)">${p.total_gain_dollar != null ? _fmtMoney(p.total_gain_dollar) : ''}</span>
      </span>
    </div>`;

  const topDollarGainers = [...withGain].sort((a,b) => (b.total_gain_dollar||0) - (a.total_gain_dollar||0)).slice(0,3);
  const topDollarLosers  = [...withGain].sort((a,b) => (a.total_gain_dollar||0) - (b.total_gain_dollar||0)).slice(0,3);

  // Recent activity (last 30)
  const recent = fOrd.slice(0, 30);
  const recentHTML = recent.length ? recent.map(o => {
    const badge = o.action_type === 'buy' ? 'var(--neon-cyan)' : o.action_type === 'sell' ? 'var(--neon-red)' : 'var(--neon-green)';
    return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:var(--border-subtle);font-size:13px">
      <span style="color:var(--text-muted);min-width:86px">${escHtml(o.run_date||'')}</span>
      <span style="color:${badge};font-size:11px;font-weight:600;min-width:36px">${o.action_type.toUpperCase()}</span>
      <span style="font-weight:500;min-width:50px">${escHtml(o.symbol||'')}</span>
      <span style="color:var(--text-muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(o.account_name||'')}</span>
      <span style="color:${_invGainClass(-(o.amount||0))}">${_fmtMoney(Math.abs(o.amount||0))}</span>
    </div>`;
  }).join('') : '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">No order history imported yet.</div>';

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:3fr 2fr;gap:16px;margin-bottom:16px;align-items:start">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px">
        ${kpisHTML}
      </div>
      ${bmTopHTML}
    </div>
    <div style="display:grid;grid-template-columns:minmax(260px,2fr) minmax(300px,3fr);gap:16px;align-items:start;margin-bottom:16px">
      <div>
        ${cvgBar}
        ${acctCardsHTML}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div class="fin-panel">
            <div class="fin-panel-header"><h3 style="font-size:13px">Best Returns (%)</h3></div>
            <div class="fin-panel-body" style="padding:4px 12px">${winners.map(p => perfRow(p,'inv-gain')).join('') || '<div class="di-empty">No data</div>'}</div>
          </div>
          <div class="fin-panel">
            <div class="fin-panel-header"><h3 style="font-size:13px">Worst Returns (%)</h3></div>
            <div class="fin-panel-body" style="padding:4px 12px">${losers.map(p => perfRow(p,'inv-loss')).join('') || '<div class="di-empty">No data</div>'}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="fin-panel">
            <div class="fin-panel-header"><h3 style="font-size:13px">Biggest Gains ($)</h3></div>
            <div class="fin-panel-body" style="padding:4px 12px">${topDollarGainers.map(p => perfRow(p,'inv-gain')).join('') || '<div class="di-empty">No data</div>'}</div>
          </div>
          <div class="fin-panel">
            <div class="fin-panel-header"><h3 style="font-size:13px">Biggest Losses ($)</h3></div>
            <div class="fin-panel-body" style="padding:4px 12px">${topDollarLosers.filter(p=>(p.total_gain_dollar||0)<0).map(p => perfRow(p,'inv-loss')).join('') || '<div class="di-empty">No losses</div>'}</div>
          </div>
        </div>
      </div>
      <div class="fin-panel" style="padding:14px 16px">
        <div style="font-weight:500;font-size:13px;margin-bottom:10px;color:var(--text-muted)">Invested vs Portfolio Value</div>
        ${chartHTML}
      </div>
    </div>
    ${yoyPanelHTML}
    <div style="display:grid;grid-template-columns:3fr 2fr;gap:16px;align-items:start">
      <div class="fin-panel">
        <div class="fin-panel-header"><h3>Recurring Investments</h3></div>
        <div style="overflow-x:auto;padding:0 4px">${_invRenderRecurringSection(fPos, fOrd, stable)}</div>
      </div>
      <div class="fin-panel">
        <div class="fin-panel-header"><h3>Recent Activity</h3></div>
        <div class="fin-panel-body">${recentHTML}</div>
      </div>
    </div>`;
}

// ── Holdings ──────────────────────────────────────────────────────────────────

function _invRenderHoldings(el) {
  if (!_invPositions.length) { el.innerHTML = _invEmptyState(); return; }

  const totalValue = _invTotalValue();
  const st = _invHoldingsState;

  // Sort
  let rows = [..._invPositions].filter(p => p.current_value > 0 || p.cost_basis_total > 0);
  rows.sort((a, b) => {
    let av = a[st.sortCol] ?? -Infinity;
    let bv = b[st.sortCol] ?? -Infinity;
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    return st.sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  const sortHdr = (col, label, align = 'left') => {
    const active = st.sortCol === col;
    const arrow  = active ? (st.sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<div class="inv-sort-hdr" data-col="${col}" style="cursor:pointer;text-align:${align}">${label}${arrow}</div>`;
  };

  const ha = _invGetHoldingAnalytics(rows, _invOrders);
  const maxSymLen = rows.reduce((m, p) => Math.max(m, (p.symbol || '').length), 0);
  const symColW = Math.max(maxSymLen * 9, 52) + 'px';
  const COLS = `${symColW} 1fr 76px 60px 68px 68px 80px 80px 68px 56px 56px 60px 52px`;

  const headerHTML = `
    <div class="inv-hdr-row" style="grid-template-columns:${COLS}">
      ${sortHdr('symbol','Symbol')}
      ${sortHdr('description','Name')}
      ${sortHdr('account_name','Account')}
      ${sortHdr('quantity','Shares','right')}
      ${sortHdr('avg_cost_basis','Avg Cost','right')}
      ${sortHdr('last_price','Price','right')}
      ${sortHdr('cost_basis_total','Cost Basis','right')}
      ${sortHdr('current_value','Value','right')}
      ${sortHdr('total_gain_dollar','G/L $','right')}
      ${sortHdr('total_gain_pct','G/L %','right')}
      <div style="text-align:right">% Port</div>
      <div style="text-align:right">Divs</div>
      <div style="text-align:right">Held</div>
    </div>`;

  const dataHTML = rows.map(p => {
    const portPct = totalValue > 0 ? (p.current_value || 0) / totalValue * 100 : 0;
    const gainCls = _invGainClass(p.total_gain_dollar);
    const a = ha[p.symbol] || {};
    const heldStr = a.holdingDays != null
      ? (a.holdingDays >= 365 ? `${(a.holdingDays/365.25).toFixed(1)}y` : `${a.holdingDays}d`)
      : '—';
    const annStr = a.annualizedReturn != null ? _invFmtPct(a.annualizedReturn) : '—';
    return `<div class="inv-data-row" style="grid-template-columns:${COLS}">
      <div style="font-weight:600;color:var(--text-primary)">${escHtml(p.symbol||'')}</div>
      <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary);font-size:12px">${escHtml((p.description||'').slice(0,30))}</div>
      <div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.account_name||'')}</div>
      <div style="text-align:right;font-size:12px">${p.quantity != null ? p.quantity.toLocaleString('en-US',{maximumFractionDigits:4}) : '—'}</div>
      <div style="text-align:right;font-size:12px">${p.avg_cost_basis != null ? _fmtMoney(p.avg_cost_basis) : '—'}</div>
      <div style="text-align:right;font-size:12px">${p.last_price != null ? _fmtMoney(p.last_price) : '—'}</div>
      <div style="text-align:right;font-size:12px">${_fmtMoney(p.cost_basis_total)}</div>
      <div style="text-align:right;font-weight:500">${_fmtMoney(p.current_value)}</div>
      <div class="${gainCls}" style="text-align:right;font-size:12px">${p.total_gain_dollar != null ? _fmtMoney(p.total_gain_dollar) : '—'}</div>
      <div class="${gainCls}" style="text-align:right;font-size:12px">
        <div>${_invFmtPct(p.total_gain_pct)}</div>
        ${a.annualizedReturn != null ? `<div style="font-size:10px;color:var(--text-muted)">${annStr}/yr</div>` : ''}
      </div>
      <div style="text-align:right">
        <div style="font-size:12px">${portPct.toFixed(1)}%</div>
        <div class="inv-conc-bar"><div class="inv-conc-fill" style="width:${Math.min(portPct*4,100)}%"></div></div>
      </div>
      <div style="text-align:right;font-size:12px;color:${a.dividends > 0 ? 'var(--neon-green)' : 'var(--text-muted)'}">${a.dividends > 0 ? _fmtMoney(a.dividends) : '—'}</div>
      <div style="text-align:right;font-size:12px;color:var(--text-muted)">${heldStr}</div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
      <span style="font-size:13px;color:var(--text-muted)">${rows.length} positions · ${_fmtMoney(totalValue)} total</span>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;margin-left:auto;cursor:pointer">
        <input type="checkbox" id="inv-h-group" ${st.groupByAccount ? 'checked' : ''}> Group by account
      </label>
    </div>
    <div class="fin-panel" style="overflow-x:auto">
      ${headerHTML}
      <div id="inv-h-body">${dataHTML}</div>
    </div>`;

  el.querySelectorAll('.inv-sort-hdr').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const col = hdr.dataset.col;
      if (st.sortCol === col) {
        st.sortDir = st.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        st.sortCol = col; st.sortDir = 'desc';
      }
      _invRenderHoldings(el);
    });
  });

  el.querySelector('#inv-h-group').addEventListener('change', e => {
    st.groupByAccount = e.target.checked;
    _invRenderHoldings(el);
  });
}

// ── Activity ──────────────────────────────────────────────────────────────────

function _invRenderActivity(el) {
  const st = _invActivityState;

  // Filter
  let rows = [..._invOrders];
  if (st.symbol)     rows = rows.filter(o => o.symbol && o.symbol.toUpperCase().includes(st.symbol.toUpperCase()));
  if (st.account)    rows = rows.filter(o => o.account_number === st.account);
  if (st.actionType) rows = rows.filter(o => o.action_type === st.actionType);

  // Sort
  rows.sort((a,b) => {
    let av = a[st.sortCol] ?? '', bv = b[st.sortCol] ?? '';
    return st.sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  const accounts = [...new Set(_invOrders.map(o => o.account_number).filter(Boolean))];

  const filterBar = `
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
      <input id="inv-a-sym" class="form-input" style="width:100px" placeholder="Symbol" value="${escHtml(st.symbol)}">
      <select id="inv-a-acct" class="form-input" style="width:140px">
        <option value="">All accounts</option>
        ${accounts.map(a => `<option value="${escHtml(a)}" ${st.account===a?'selected':''}>${escHtml(a)}</option>`).join('')}
      </select>
      <select id="inv-a-type" class="form-input" style="width:130px">
        <option value="">All types</option>
        <option value="buy" ${st.actionType==='buy'?'selected':''}>Buy</option>
        <option value="sell" ${st.actionType==='sell'?'selected':''}>Sell</option>
        <option value="dividend" ${st.actionType==='dividend'?'selected':''}>Dividend</option>
      </select>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;margin-left:auto">
        <input type="checkbox" id="inv-a-group" ${st.groupBy?'checked':''}> Group by symbol
      </label>
    </div>`;

  let bodyHTML;

  if (st.groupBy) {
    // DCA summary grouped by symbol
    const symbolMap = {};
    for (const o of rows.filter(o => o.action_type === 'buy')) {
      if (!o.symbol) continue;
      if (!symbolMap[o.symbol]) symbolMap[o.symbol] = { orders: [], totalAmount: 0, totalQty: 0 };
      symbolMap[o.symbol].orders.push(o);
      symbolMap[o.symbol].totalAmount += Math.abs(o.amount || 0);
      symbolMap[o.symbol].totalQty    += o.quantity || 0;
    }

    const grouped = Object.entries(symbolMap)
      .map(([sym, d]) => {
        const avgCost = d.totalQty > 0 ? d.totalAmount / d.totalQty : null;
        const pos     = _invPositions.find(p => p.symbol === sym);
        const curPrice = pos?.last_price;
        const glPct    = avgCost && curPrice ? (curPrice - avgCost) / avgCost * 100 : null;
        const firstDate = d.orders.map(o => o.run_date).sort()[0];
        const lastDate  = d.orders.map(o => o.run_date).sort().reverse()[0];
        return { sym, orders: d.orders, totalAmount: d.totalAmount, avgCost, curPrice, glPct, firstDate, lastDate };
      })
      .sort((a,b) => b.totalAmount - a.totalAmount);

    const COLS = '60px 90px 90px 60px 80px 80px 80px';
    bodyHTML = `
      <div class="fin-panel" style="overflow-x:auto">
        <div class="inv-hdr-row" style="grid-template-columns:${COLS}">
          <div>Symbol</div><div>First Buy</div><div>Latest Buy</div>
          <div style="text-align:right"># Buys</div>
          <div style="text-align:right">Invested</div>
          <div style="text-align:right">Avg Cost</div>
          <div style="text-align:right">G/L %</div>
        </div>
        ${grouped.map(g => `
          <div class="inv-data-row" style="grid-template-columns:${COLS}">
            <div style="font-weight:600">${escHtml(g.sym)}</div>
            <div style="font-size:12px;color:var(--text-muted)">${g.firstDate||'—'}</div>
            <div style="font-size:12px;color:var(--text-muted)">${g.lastDate||'—'}</div>
            <div style="text-align:right;font-size:13px">${g.orders.length}</div>
            <div style="text-align:right;font-size:13px">${_fmtMoney(g.totalAmount)}</div>
            <div style="text-align:right;font-size:13px">${g.avgCost != null ? _fmtMoney(g.avgCost) : '—'}</div>
            <div class="${_invGainClass(g.glPct)}" style="text-align:right;font-size:13px">${_invFmtPct(g.glPct)}</div>
          </div>`).join('')}
      </div>`;
  } else {
    const COLS = '90px 60px 1fr 100px 70px 64px 64px 80px';
    const actionBadge = type => {
      const c = type === 'buy' ? 'var(--neon-cyan)' : type === 'sell' ? 'var(--neon-red)' : 'var(--neon-green)';
      return `<span style="font-size:10px;font-weight:700;color:${c};background:${c}22;padding:2px 6px;border-radius:4px">${type.toUpperCase()}</span>`;
    };
    bodyHTML = `
      <div class="fin-panel" style="overflow-x:auto">
        <div class="inv-hdr-row" style="grid-template-columns:${COLS}">
          <div>Date</div><div>Symbol</div><div>Description</div>
          <div>Account</div>
          <div>Action</div>
          <div style="text-align:right">Shares</div>
          <div style="text-align:right">Price</div>
          <div style="text-align:right">Amount</div>
        </div>
        ${rows.length ? rows.map(o => `
          <div class="inv-data-row" style="grid-template-columns:${COLS}">
            <div style="font-size:12px;color:var(--text-muted)">${o.run_date||'—'}</div>
            <div style="font-weight:600">${escHtml(o.symbol||'')}</div>
            <div style="font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml((o.description||'').slice(0,30))}</div>
            <div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(o.account_name||'')}</div>
            <div>${actionBadge(o.action_type)}</div>
            <div style="text-align:right;font-size:12px">${o.quantity != null ? o.quantity.toLocaleString('en-US',{maximumFractionDigits:4}) : '—'}</div>
            <div style="text-align:right;font-size:12px">${o.price != null ? _fmtMoney(o.price) : '—'}</div>
            <div style="text-align:right;font-size:12px;color:var(--text-muted)">${o.amount != null ? _fmtMoney(Math.abs(o.amount)) : '—'}</div>
          </div>`).join('') : '<div class="di-empty">No orders match filters.</div>'}
      </div>`;
  }

  el.innerHTML = filterBar + bodyHTML;

  el.querySelector('#inv-a-sym').addEventListener('input', e => { st.symbol = e.target.value; _invRenderActivity(el); });
  el.querySelector('#inv-a-acct').addEventListener('change', e => { st.account = e.target.value; _invRenderActivity(el); });
  el.querySelector('#inv-a-type').addEventListener('change', e => { st.actionType = e.target.value; _invRenderActivity(el); });
  el.querySelector('#inv-a-group').addEventListener('change', e => { st.groupBy = e.target.checked; _invRenderActivity(el); });
}

// ── Recent Purchase Performance ───────────────────────────────────────────────

function _invPeriodCutoff(period) {
  const now = new Date();
  if (period === 'ytd') return `${now.getFullYear()}-01-01`;
  const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[period] || 3;
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function _invBuildPeriodPerfHTML(fPos, fOrd, stable, period) {
  const cutoff = _invPeriodCutoff(period);

  const buysInPeriod = fOrd.filter(o =>
    o.action_type === 'buy' &&
    o.run_date >= cutoff &&
    o.symbol && o.amount != null && o.quantity != null &&
    !stable.has(o.symbol)
  );

  if (!buysInPeriod.length) {
    return `<div class="di-empty">No buy orders found since ${cutoff}.</div>`;
  }

  const bySymbol = {};
  for (const o of buysInPeriod) {
    if (!bySymbol[o.symbol]) bySymbol[o.symbol] = { buys: 0, totalInvested: 0, totalShares: 0, firstDate: o.run_date };
    const b = bySymbol[o.symbol];
    b.buys++;
    b.totalInvested += Math.abs(o.amount);
    b.totalShares   += o.quantity;
    if (o.run_date < b.firstDate) b.firstDate = o.run_date;
  }

  const posMap = {};
  for (const p of fPos) if (p.symbol) posMap[p.symbol] = p;

  const rows = Object.entries(bySymbol).map(([sym, d]) => {
    const avgCost     = d.totalShares > 0 ? d.totalInvested / d.totalShares : null;
    const curPrice    = posMap[sym]?.last_price ?? null;
    const curValue    = curPrice != null ? curPrice * d.totalShares : null;
    const glDollar    = curValue != null ? curValue - d.totalInvested : null;
    const glPct       = glDollar != null && d.totalInvested > 0 ? glDollar / d.totalInvested * 100 : null;
    return { sym, buys: d.buys, avgCost, curPrice, totalInvested: d.totalInvested, totalShares: d.totalShares, curValue, glDollar, glPct, firstDate: d.firstDate };
  }).sort((a, b) => b.totalInvested - a.totalInvested);

  const totInvested = rows.reduce((s, r) => s + r.totalInvested, 0);
  const totCurValue = rows.reduce((s, r) => s + (r.curValue ?? r.totalInvested), 0);
  const totGL       = totCurValue - totInvested;
  const totGLPct    = totInvested > 0 ? totGL / totInvested * 100 : 0;

  const maxSymLen = rows.reduce((m, r) => Math.max(m, r.sym.length), 0);
  const symW = Math.max(maxSymLen * 9, 52) + 'px';
  const COLS = `${symW} 44px 80px 80px 84px 84px 72px 72px`;

  const rowsHTML = rows.map(r => {
    const gc = _invGainClass(r.glPct);
    return `<div class="inv-data-row" style="grid-template-columns:${COLS}">
      <div style="font-weight:600">${escHtml(r.sym)}</div>
      <div style="text-align:right;color:var(--text-muted);font-size:12px">${r.buys}</div>
      <div style="text-align:right;font-size:12px">${r.avgCost != null ? _fmtMoney(r.avgCost) : '—'}</div>
      <div style="text-align:right;font-size:12px">${r.curPrice != null ? _fmtMoney(r.curPrice) : '—'}</div>
      <div style="text-align:right;font-size:12px">${_fmtMoney(r.totalInvested)}</div>
      <div style="text-align:right;font-size:12px">${r.curValue != null ? _fmtMoney(r.curValue) : '—'}</div>
      <div class="${gc}" style="text-align:right;font-size:12px">${r.glDollar != null ? _fmtMoney(r.glDollar) : '—'}</div>
      <div class="${gc}" style="text-align:right;font-size:12px;font-weight:500">${_invFmtPct(r.glPct)}</div>
    </div>`;
  }).join('');

  return `
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">
      ${rows.length} symbol${rows.length !== 1 ? 's' : ''} purchased since ${cutoff} ·
      ${_fmtMoney(totInvested)} invested ·
      <span class="${_invGainClass(totGL)}">${_invFmtPct(totGLPct)} overall (${_fmtMoney(totGL)})</span>
    </div>
    <div style="overflow-x:auto">
      <div class="inv-hdr-row" style="grid-template-columns:${COLS}">
        <div>Symbol</div>
        <div style="text-align:right">Buys</div>
        <div style="text-align:right">Avg Cost</div>
        <div style="text-align:right">Cur Price</div>
        <div style="text-align:right">Invested</div>
        <div style="text-align:right">Cur Value</div>
        <div style="text-align:right">G/L $</div>
        <div style="text-align:right">G/L %</div>
      </div>
      ${rowsHTML}
    </div>`;
}

// ── Analysis ──────────────────────────────────────────────────────────────────

function _invRenderAnalysis(el) {
  if (!_invPositions.length) { el.innerHTML = _invEmptyState(); return; }

  // Apply account filter
  const fPos = _invAccountFilter ? _invPositions.filter(p => p.account_number === _invAccountFilter) : _invPositions;
  const fOrd = _invAccountFilter ? _invOrders.filter(o => o.account_number === _invAccountFilter) : _invOrders;

  const totalValue = fPos.reduce((s, p) => s + (p.current_value || 0), 0);
  const stable = _invGetStableSymbols(fPos);

  // Section 0: Recent Purchase Performance
  const PERF_PERIODS = [['1m','1 Mo'], ['3m','3 Mo'], ['6m','6 Mo'], ['1y','1 Yr'], ['ytd','YTD']];
  const perfBodyHTML = _invBuildPeriodPerfHTML(fPos, fOrd, stable, _invPerfPeriod);
  const perfBtnsHTML = PERF_PERIODS.map(([k, lbl]) =>
    `<button class="inv-perf-period-btn${_invPerfPeriod === k ? ' active' : ''}" data-period="${k}">${lbl}</button>`
  ).join('');
  const periodPerfHTML = `
    <div class="fin-panel" style="margin-bottom:16px" id="inv-period-perf-panel">
      <div class="fin-panel-header" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <h3 style="flex:1;margin:0">Recent Purchase Performance</h3>
        <div style="display:flex;gap:4px">${perfBtnsHTML}</div>
      </div>
      <div class="fin-panel-body" id="inv-period-perf-body">${perfBodyHTML}</div>
    </div>`;

  // Section 1: Allocation
  const donutHTML  = _invDonutSVG(fPos, totalValue);
  const legendHTML = _invDonutLegend(fPos, totalValue);

  // Section 2: Benchmark
  const bm = _invComputeBenchmark(fPos, fOrd);
  const bmHTML = bm ? `
    <div class="fin-panel" style="margin-bottom:16px">
      <div class="fin-panel-header"><h3>Money-Weighted Return vs S&P 500</h3></div>
      <div class="fin-panel-body">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;text-align:center;margin-bottom:10px">
          <div>
            <div class="stat-label">Your Portfolio Return</div>
            <div class="stat-value ${_invGainClass(bm.portfolioReturn)}" style="font-size:22px">${_invFmtPct(bm.portfolioReturn)}</div>
            <div class="stat-sub">${_fmtMoney(bm.portfolioValue)}</div>
          </div>
          <div>
            <div class="stat-label">S&P 500 Equivalent</div>
            <div class="stat-value ${_invGainClass(bm.sp5Return)}" style="font-size:22px">${_invFmtPct(bm.sp5Return)}</div>
            <div class="stat-sub">${_fmtMoney(bm.hypotheticalValue)}</div>
          </div>
          <div>
            <div class="stat-label">Your Edge</div>
            <div class="stat-value ${_invGainClass(bm.portfolioReturn - bm.sp5Return)}" style="font-size:22px">${_invFmtPct(bm.portfolioReturn - bm.sp5Return)}</div>
            <div class="stat-sub">${_fmtMoney(bm.portfolioValue - bm.hypotheticalValue)} difference</div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--text-muted)">Hypothetical: invest same dollar amounts on same dates into S&P 500 · ${fOrd.filter(o=>o.action_type==='buy').length} purchases · ${_fmtMoney(bm.totalInvested)} total invested</div>
      </div>
    </div>` : `
    <div class="fin-panel" style="margin-bottom:16px">
      <div class="fin-panel-header"><h3>Benchmark Comparison</h3></div>
      <div class="fin-panel-body">
        <div class="di-empty">Import the SP500 CSV to enable benchmark comparison.</div>
      </div>
    </div>`;

  // Section 3b: Concentration metrics
  const sortedByVal = [...fPos].filter(p => p.current_value > 0).sort((a,b) => b.current_value - a.current_value);
  const top1Pct = sortedByVal[0] ? sortedByVal[0].current_value / totalValue * 100 : 0;
  const top3Pct = sortedByVal.slice(0,3).reduce((s,p) => s + p.current_value, 0) / totalValue * 100;
  const top5Pct = sortedByVal.slice(0,5).reduce((s,p) => s + p.current_value, 0) / totalValue * 100;
  const concPanelHTML = `
    <div class="fin-panel">
      <div class="fin-panel-header"><h3>Concentration</h3></div>
      <div class="fin-panel-body">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;text-align:center">
          <div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Top Holding</div>
            <div style="font-size:20px;font-weight:600;color:${top1Pct>25?'var(--neon-amber)':'var(--text-primary)'}">${top1Pct.toFixed(1)}%</div>
            <div style="font-size:11px;color:var(--text-muted)">${sortedByVal[0]?.symbol || '—'}</div>
          </div>
          <div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Top 3 Holdings</div>
            <div style="font-size:20px;font-weight:600;color:${top3Pct>50?'var(--neon-amber)':'var(--text-primary)'}">${top3Pct.toFixed(1)}%</div>
            <div style="font-size:11px;color:var(--text-muted)">${sortedByVal.slice(0,3).map(p=>p.symbol).join(', ')}</div>
          </div>
          <div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Top 5 Holdings</div>
            <div style="font-size:20px;font-weight:600;color:${top5Pct>70?'var(--neon-amber)':'var(--text-primary)'}">${top5Pct.toFixed(1)}%</div>
            <div style="font-size:11px;color:var(--text-muted)">${sortedByVal.slice(0,5).map(p=>p.symbol).join(', ')}</div>
          </div>
        </div>
      </div>
    </div>`;

  // Section 3c: Index ETFs vs individual stocks
  const classified = fPos.map(p => ({ ...p, _cls: _invClassifyHolding(p) }));
  const etfVal   = classified.filter(p => p._cls === 'index_etf').reduce((s,p) => s + (p.current_value||0), 0);
  const stockVal = classified.filter(p => p._cls === 'individual_stock').reduce((s,p) => s + (p.current_value||0), 0);
  const cashVal  = classified.filter(p => p._cls === 'cash').reduce((s,p) => s + (p.current_value||0), 0);
  const etfGain   = classified.filter(p => p._cls === 'index_etf').reduce((s,p) => s + (p.total_gain_dollar||0), 0);
  const stockGain = classified.filter(p => p._cls === 'individual_stock').reduce((s,p) => s + (p.total_gain_dollar||0), 0);
  const etfCost   = classified.filter(p => p._cls === 'index_etf').reduce((s,p) => s + (p.cost_basis_total||0), 0);
  const stockCost = classified.filter(p => p._cls === 'individual_stock').reduce((s,p) => s + (p.cost_basis_total||0), 0);
  const etfRet    = etfCost   > 0 ? etfGain   / etfCost   * 100 : null;
  const stockRet  = stockCost > 0 ? stockGain / stockCost * 100 : null;
  const mixHTML = `
    <div class="fin-panel" style="margin-bottom:16px">
      <div class="fin-panel-header"><h3>Index Funds vs Individual Stocks</h3></div>
      <div class="fin-panel-body">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;text-align:center;margin-bottom:12px">
          <div style="padding:12px;background:var(--bg-hover);border-radius:var(--radius-el)">
            <div style="font-size:11px;color:var(--neon-cyan);font-weight:500;margin-bottom:4px">INDEX / ETF</div>
            <div style="font-size:18px;font-weight:600">${totalValue > 0 ? (etfVal/totalValue*100).toFixed(1) : 0}%</div>
            <div style="font-size:12px;color:var(--text-muted)">${_fmtMoney(etfVal)}</div>
            ${etfRet != null ? `<div class="${_invGainClass(etfRet)}" style="font-size:13px;margin-top:4px">${_invFmtPct(etfRet)}</div>` : ''}
          </div>
          <div style="padding:12px;background:var(--bg-hover);border-radius:var(--radius-el)">
            <div style="font-size:11px;color:var(--neon-amber);font-weight:500;margin-bottom:4px">INDIVIDUAL STOCKS</div>
            <div style="font-size:18px;font-weight:600">${totalValue > 0 ? (stockVal/totalValue*100).toFixed(1) : 0}%</div>
            <div style="font-size:12px;color:var(--text-muted)">${_fmtMoney(stockVal)}</div>
            ${stockRet != null ? `<div class="${_invGainClass(stockRet)}" style="font-size:13px;margin-top:4px">${_invFmtPct(stockRet)}</div>` : ''}
          </div>
          <div style="padding:12px;background:var(--bg-hover);border-radius:var(--radius-el)">
            <div style="font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:4px">CASH / OTHER</div>
            <div style="font-size:18px;font-weight:600">${totalValue > 0 ? (cashVal/totalValue*100).toFixed(1) : 0}%</div>
            <div style="font-size:12px;color:var(--text-muted)">${_fmtMoney(cashVal)}</div>
          </div>
        </div>
        ${(etfRet != null && stockRet != null) ? `
          <div style="font-size:13px;padding:8px 12px;background:var(--bg-hover);border-radius:var(--radius-el)">
            Your individual stocks are <strong class="${_invGainClass(stockRet - etfRet)}">${_invFmtPct(Math.abs(stockRet - etfRet))}</strong>
            ${stockRet >= etfRet ? '<span style="color:var(--neon-green)">ahead of</span>' : '<span style="color:var(--neon-red)">behind</span>'} your index fund returns.
          </div>` : ''}
      </div>
    </div>`;

  // Section 4: Insights (filtered)
  const insights = _generateInvInsights(fPos, fOrd, totalValue);
  const insightsHTML = insights.length
    ? insights.map(i => `<div class="inv-insight inv-insight--${i.type}">${i.text}</div>`).join('')
    : '<div class="di-empty" style="padding:8px 0">No insights generated yet.</div>';

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:190px auto 1fr;gap:20px;margin-bottom:16px;align-items:start">
      <div>${donutHTML}</div>
      <div style="overflow-y:auto">${legendHTML}</div>
      ${concPanelHTML}
    </div>
    ${mixHTML}
    ${bmHTML}
    ${periodPerfHTML}
    <div class="fin-panel">
      <div class="fin-panel-header"><h3>Portfolio Insights</h3></div>
      <div class="fin-panel-body">${insightsHTML}</div>
    </div>`;

  // Period selector clicks — update state and re-render just the body
  el.querySelectorAll('.inv-perf-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _invPerfPeriod = btn.dataset.period;
      el.querySelectorAll('.inv-perf-period-btn').forEach(b => b.classList.toggle('active', b === btn));
      el.querySelector('#inv-period-perf-body').innerHTML = _invBuildPeriodPerfHTML(fPos, fOrd, stable, _invPerfPeriod);
    });
  });
}

// ── Actions ────────────────────────────────────────────────────────────────────

const _INV_ACTION_LABELS = {
  buy_more: 'Buy More', sell: 'Sell', trim: 'Trim', rebalance: 'Rebalance',
  research: 'Research', review: 'Review', stop_recurring: 'Stop Recurring', other: 'Other',
};
const _INV_ACTION_STATUS_COLOR = {
  open: 'var(--neon-cyan)', completed: 'var(--neon-green)', deferred: 'var(--neon-amber)', dismissed: 'var(--text-muted)',
};

function _invRenderActions(el) {
  const sf = _invActionsFilter || 'open';
  const filtered = sf === 'all' ? _invActions : _invActions.filter(a => a.status === sf);

  const counts = ['open','completed','deferred','dismissed'].map(s => ({ s, n: _invActions.filter(a => a.status === s).length }));
  const filterBar = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
      ${[{s:'open'},{s:'completed'},{s:'deferred'},{s:'dismissed'},{s:'all'}].map(({s}) => {
        const active = sf === s;
        const n = s === 'all' ? _invActions.length : _invActions.filter(a => a.status === s).length;
        return `<button class="inv-acct-pill inv-act-sf" data-sf="${s}"
          style="padding:4px 14px;border-radius:var(--radius-pill);font-size:12px;cursor:pointer;
                 border:1px solid ${active?'var(--neon-cyan)':'var(--border-color)'};
                 background:${active?'rgba(0,229,255,0.12)':'transparent'};
                 color:${active?'var(--neon-cyan)':'var(--text-muted)'}">
          ${s.charAt(0).toUpperCase()+s.slice(1)} ${n > 0 ? `(${n})` : ''}
        </button>`;
      }).join('')}
      <button class="btn btn-sm btn-primary" id="inv-act-new" style="margin-left:auto;font-size:12px">+ New Action</button>
    </div>`;

  const listHTML = filtered.length ? filtered.map(a => {
    const sc = _INV_ACTION_STATUS_COLOR[a.status] || 'var(--text-muted)';
    return `<div style="display:flex;gap:12px;padding:12px 16px;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-el);margin-bottom:8px;border-left:3px solid ${sc}">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
          ${a.symbol ? `<span style="font-weight:700;font-size:13px">${escHtml(a.symbol)}</span>` : ''}
          <span style="font-size:11px;font-weight:600;color:${sc};background:${sc}22;padding:2px 8px;border-radius:var(--radius-pill)">${_INV_ACTION_LABELS[a.action_type]||a.action_type}</span>
          <span style="font-size:11px;color:var(--text-muted)">${a.status}</span>
          ${a.due_date ? `<span style="font-size:11px;color:var(--text-muted);margin-left:auto">due ${a.due_date}</span>` : ''}
        </div>
        <div style="font-size:13px;font-weight:500">${escHtml(a.title)}</div>
        ${a.notes ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px;white-space:pre-wrap">${escHtml(a.notes)}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
        <button class="btn btn-xs btn-secondary inv-act-edit" data-id="${a.id}" title="Edit" style="font-size:11px">✎</button>
        ${a.status === 'open'
          ? `<button class="btn btn-xs btn-primary inv-act-done" data-id="${a.id}" title="Complete" style="font-size:11px">✓</button>
             <button class="btn btn-xs btn-secondary inv-act-defer" data-id="${a.id}" title="Defer" style="font-size:11px">⏸</button>`
          : `<button class="btn btn-xs btn-secondary inv-act-reopen" data-id="${a.id}" title="Reopen" style="font-size:11px">↺</button>`}
        <button class="btn btn-xs btn-secondary inv-act-del" data-id="${a.id}" title="Delete" style="font-size:11px;color:var(--neon-red)">✕</button>
      </div>
    </div>`;
  }).join('') : `<div class="di-empty" style="padding:32px 0">No ${sf === 'all' ? '' : sf + ' '}actions.</div>`;

  el.innerHTML = filterBar + `<div id="inv-act-list">${listHTML}</div>`;

  el.querySelectorAll('.inv-act-sf').forEach(b => b.addEventListener('click', () => { _invActionsFilter = b.dataset.sf; _invRenderActions(el); }));

  const patchAction = async (id, data) => {
    try {
      const r = await apiFetch('PATCH', `/investments/actions/${id}`, data);
      const i = _invActions.findIndex(a => a.id === id);
      if (i >= 0) _invActions[i] = r;
      _invRenderActions(el);
    } catch (e) { alert('Error: ' + e.message); }
  };

  el.querySelectorAll('.inv-act-done').forEach(b   => b.addEventListener('click', () => patchAction(+b.dataset.id, { status: 'completed' })));
  el.querySelectorAll('.inv-act-defer').forEach(b  => b.addEventListener('click', () => patchAction(+b.dataset.id, { status: 'deferred'  })));
  el.querySelectorAll('.inv-act-reopen').forEach(b => b.addEventListener('click', () => patchAction(+b.dataset.id, { status: 'open'      })));
  el.querySelectorAll('.inv-act-del').forEach(b    => b.addEventListener('click', async () => {
    if (!confirm('Delete this action?')) return;
    try {
      await apiFetch('DELETE', `/investments/actions/${+b.dataset.id}`);
      _invActions = _invActions.filter(a => a.id !== +b.dataset.id);
      _invRenderActions(el);
    } catch (e) { alert('Error: ' + e.message); }
  }));
  el.querySelectorAll('.inv-act-edit').forEach(b   => b.addEventListener('click', () => {
    const a = _invActions.find(x => x.id === +b.dataset.id);
    if (a) _openInvActionModal(a, el);
  }));
  el.querySelector('#inv-act-new')?.addEventListener('click', () => _openInvActionModal(null, el));
}

function _openInvActionModal(action, listEl) {
  const isEdit = !!action;
  const knownSymbols = [...new Set([..._invPositions.map(p => p.symbol), ..._invOrders.map(o => o.symbol)].filter(Boolean))].sort();
  const typeOpts = Object.entries(_INV_ACTION_LABELS).map(([v,l]) =>
    `<option value="${v}" ${action?.action_type===v?'selected':''}>${l}</option>`).join('');
  const statusOpts = ['open','completed','deferred','dismissed'].map(s =>
    `<option value="${s}" ${action?.status===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:460px">
      <div class="modal-header"><span class="modal-title">${isEdit ? 'Edit' : 'New'} Portfolio Action</span><button class="modal-close">×</button></div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <div class="form-label">Symbol (optional)</div>
            <input id="ia-sym" class="form-input" list="ia-sym-list" value="${escHtml(action?.symbol||'')}" placeholder="e.g. NVDA">
            <datalist id="ia-sym-list">${knownSymbols.map(s=>`<option value="${escHtml(s)}">`).join('')}</datalist>
          </div>
          <div><div class="form-label">Action Type</div><select id="ia-type" class="form-input">${typeOpts}</select></div>
        </div>
        <div style="margin-bottom:10px"><div class="form-label">Title</div>
          <input id="ia-title" class="form-input" value="${escHtml(action?.title||'')}" placeholder="What are you considering?"></div>
        <div style="margin-bottom:10px"><div class="form-label">Notes (optional)</div>
          <textarea id="ia-notes" class="form-input" rows="3" style="resize:vertical">${escHtml(action?.notes||'')}</textarea></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><div class="form-label">Due Date</div><input id="ia-due" class="form-input" type="date" value="${escHtml(action?.due_date||'')}"></div>
          ${isEdit ? `<div><div class="form-label">Status</div><select id="ia-status" class="form-input">${statusOpts}</select></div>` : ''}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="ia-save">Save</button>
      </div>
    </div>`;

  const dismiss = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 150); };
  overlay.querySelector('.modal-close').addEventListener('click', dismiss);
  overlay.querySelector('.modal-cancel-btn').addEventListener('click', dismiss);
  overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });

  overlay.querySelector('#ia-save').addEventListener('click', async () => {
    const sym   = overlay.querySelector('#ia-sym').value.trim().toUpperCase() || null;
    const type  = overlay.querySelector('#ia-type').value;
    const title = overlay.querySelector('#ia-title').value.trim();
    const notes = overlay.querySelector('#ia-notes').value.trim() || null;
    const due   = overlay.querySelector('#ia-due').value || null;
    if (!title) { alert('Title is required.'); return; }
    try {
      if (isEdit) {
        const status = overlay.querySelector('#ia-status')?.value;
        const r = await apiFetch('PATCH', `/investments/actions/${action.id}`, { symbol: sym, action_type: type, title, notes, due_date: due, status });
        const i = _invActions.findIndex(a => a.id === action.id);
        if (i >= 0) _invActions[i] = r;
      } else {
        const r = await apiFetch('POST', '/investments/actions', { symbol: sym, action_type: type, title, notes, due_date: due });
        _invActions.unshift(r);
      }
      dismiss();
      if (listEl) _invRenderActions(listEl);
    } catch (e) { alert('Error: ' + e.message); }
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

// ── Notes ─────────────────────────────────────────────────────────────────────

function _invRenderNotes(el) {
  const knownSymbols = [...new Set([
    ..._invPositions.map(p => p.symbol),
    ..._invOrders.map(o => o.symbol),
    ..._invNotes.map(n => n.symbol),
  ].filter(Boolean))].sort();

  const noteTypeOptions = `
    <option value="general">General</option>
    <option value="thesis">Thesis</option>
    <option value="action">Action</option>
    <option value="watchlist">Watchlist</option>`;

  // Group notes by symbol
  const bySymbol = {};
  for (const n of _invNotes) {
    if (!bySymbol[n.symbol]) bySymbol[n.symbol] = [];
    bySymbol[n.symbol].push(n);
  }

  const notesListHTML = Object.keys(bySymbol).sort().map(sym => `
    <div style="margin-bottom:16px">
      <div style="font-weight:600;font-size:14px;margin-bottom:8px">${escHtml(sym)} <span style="font-size:12px;color:var(--text-muted)">(${bySymbol[sym].length})</span></div>
      ${bySymbol[sym].map(n => `
        <div class="inv-note-row" data-nid="${n.id}" style="display:flex;gap:10px;padding:10px 12px;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-el);margin-bottom:6px">
          <div style="flex:1">
            <span class="inv-note-badge inv-note-type-${n.note_type}">${n.note_type}</span>
            <div class="inv-note-content" style="margin-top:6px;font-size:13px;line-height:1.5;white-space:pre-wrap">${escHtml(n.content)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${formatDateShort(n.created_at)}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <button class="btn btn-xs btn-secondary inv-note-edit" data-nid="${n.id}" style="font-size:11px">✎</button>
            <button class="btn btn-xs btn-secondary inv-note-del" data-nid="${n.id}" style="font-size:11px;color:var(--neon-red)">✕</button>
          </div>
        </div>`).join('')}
    </div>`).join('');

  el.innerHTML = `
    <div class="fin-panel" style="margin-bottom:16px">
      <div class="fin-panel-header"><h3>Add Note</h3></div>
      <div class="fin-panel-body">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div>
            <div class="form-label" style="font-size:12px;margin-bottom:4px">Symbol</div>
            <input id="inv-n-sym" class="form-input" style="width:100px" placeholder="AAPL" list="inv-n-sym-list">
            <datalist id="inv-n-sym-list">${knownSymbols.map(s => `<option value="${escHtml(s)}">`).join('')}</datalist>
          </div>
          <div>
            <div class="form-label" style="font-size:12px;margin-bottom:4px">Type</div>
            <select id="inv-n-type" class="form-input" style="width:120px">${noteTypeOptions}</select>
          </div>
          <div style="flex:1;min-width:200px">
            <div class="form-label" style="font-size:12px;margin-bottom:4px">Note</div>
            <textarea id="inv-n-content" class="form-input" rows="2" style="resize:vertical;width:100%" placeholder="Your thoughts…"></textarea>
          </div>
          <button class="btn btn-primary btn-sm" id="inv-n-add">Add Note</button>
        </div>
      </div>
    </div>
    <div id="inv-notes-list">
      ${Object.keys(bySymbol).length ? notesListHTML : '<div class="di-empty">No notes yet. Add one above.</div>'}
    </div>`;

  el.querySelector('#inv-n-add').addEventListener('click', async () => {
    const sym     = el.querySelector('#inv-n-sym').value.trim().toUpperCase();
    const type    = el.querySelector('#inv-n-type').value;
    const content = el.querySelector('#inv-n-content').value.trim();
    if (!sym || !content) { alert('Symbol and note content are required.'); return; }
    try {
      const note = await apiFetch('POST', '/investments/notes', { symbol: sym, note_type: type, content });
      _invNotes.unshift(note);
      el.querySelector('#inv-n-sym').value = '';
      el.querySelector('#inv-n-content').value = '';
      _invRenderNotes(el);
    } catch (e) { alert('Error: ' + e.message); }
  });

  el.querySelectorAll('.inv-note-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const nid  = parseInt(btn.dataset.nid);
      const note = _invNotes.find(n => n.id === nid);
      if (!note) return;
      const row  = el.querySelector(`.inv-note-row[data-nid="${nid}"]`);
      const contentEl = row.querySelector('.inv-note-content');
      const orig = note.content;
      contentEl.innerHTML = `<textarea class="form-input" style="width:100%;resize:vertical" rows="3">${escHtml(orig)}</textarea>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn btn-primary btn-xs inv-n-save">Save</button>
          <button class="btn btn-secondary btn-xs inv-n-cancel">Cancel</button>
        </div>`;
      contentEl.querySelector('.inv-n-cancel').addEventListener('click', () => _invRenderNotes(el));
      contentEl.querySelector('.inv-n-save').addEventListener('click', async () => {
        const newContent = contentEl.querySelector('textarea').value.trim();
        if (!newContent) return;
        try {
          const updated = await apiFetch('PATCH', `/investments/notes/${nid}`, { content: newContent });
          const idx = _invNotes.findIndex(n => n.id === nid);
          if (idx >= 0) _invNotes[idx] = updated;
          _invRenderNotes(el);
        } catch (e) { alert('Error: ' + e.message); }
      });
    });
  });

  el.querySelectorAll('.inv-note-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this note?')) return;
      const nid = parseInt(btn.dataset.nid);
      try {
        await apiFetch('DELETE', `/investments/notes/${nid}`);
        _invNotes = _invNotes.filter(n => n.id !== nid);
        _invRenderNotes(el);
      } catch (e) { alert('Error: ' + e.message); }
    });
  });
}

// ── Import modal ──────────────────────────────────────────────────────────────

function _openInvImportModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:480px">
      <div class="modal-header"><span class="modal-title">Import Investment Data</span><button class="modal-close">×</button></div>
      <div class="modal-body">
        <div style="margin-bottom:14px">
          <div style="display:flex;gap:12px;margin-bottom:14px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="inv-itype" value="positions" checked> Positions</label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="inv-itype" value="orders"> Order History</label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="inv-itype" value="sp500"> S&amp;P 500</label>
          </div>
          <div id="inv-imp-desc" style="font-size:12px;color:var(--text-muted);margin-bottom:10px">
            Export from Fidelity: Accounts → Portfolio → Download → Positions CSV
          </div>
        </div>
        <input type="file" id="inv-imp-file" accept=".csv" class="form-input">
        <div id="inv-imp-result" style="margin-top:10px;font-size:13px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="inv-imp-go">Import</button>
      </div>
    </div>`;

  const descriptions = {
    positions: 'Export from Fidelity: Accounts → Portfolio → Download → Positions CSV (Portfolio_Positions_*.csv)',
    orders:    'Export from Fidelity: Accounts → History → Download → CSV (Accounts_History*.csv)',
    sp500:     'Two-column CSV with headers: observation_date, SP500 — import periodically for fresh benchmark data',
  };

  const dismiss = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 150); };
  overlay.querySelector('.modal-close').addEventListener('click', dismiss);
  overlay.querySelector('.modal-cancel-btn').addEventListener('click', dismiss);
  overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });

  overlay.querySelectorAll('input[name="inv-itype"]').forEach(r => {
    r.addEventListener('change', () => {
      overlay.querySelector('#inv-imp-desc').textContent = descriptions[r.value] || '';
    });
  });

  overlay.querySelector('#inv-imp-go').addEventListener('click', async () => {
    const type  = overlay.querySelector('input[name="inv-itype"]:checked').value;
    const file  = overlay.querySelector('#inv-imp-file').files[0];
    const resEl = overlay.querySelector('#inv-imp-result');
    if (!file) { resEl.textContent = 'Please choose a CSV file.'; return; }

    resEl.textContent = 'Uploading…';
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch(`/api/investments/import/${type}`, { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Upload failed');

      let msg = '';
      if (type === 'positions') msg = `✓ Imported ${data.inserted} positions`;
      else if (type === 'orders') msg = `✓ Imported ${data.inserted} orders · ${data.skipped_dupes} duplicates skipped`;
      else msg = `✓ Imported ${data.inserted} S&P 500 data points`;

      resEl.innerHTML = `<span style="color:var(--neon-green)">${msg}</span>`;
      // Refresh data
      _invDataLoaded = false;
      await _invLoadData();
      // Re-render active view
      const panel = document.querySelector('#inv-panel');
      if (panel) _invRenderView(panel);
    } catch (e) {
      resEl.innerHTML = `<span style="color:var(--neon-red)">Error: ${escHtml(e.message)}</span>`;
    }
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

// ── Empty state ───────────────────────────────────────────────────────────────

function _invEmptyState() {
  return `<div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
    <div style="font-size:32px;margin-bottom:12px">📈</div>
    <div style="font-size:15px;font-weight:500;margin-bottom:6px">No position data yet</div>
    <div style="font-size:13px">Click <strong>↑ Import Data</strong> above and upload your Fidelity Portfolio_Positions CSV to get started.</div>
  </div>`;
}
