// ── dashboard.js — LifeTracker Dashboard ─────────────────────

let _dashData = null;

// Hot neon palette — high-saturation, "cyber" feel
const AREA_COLORS = {
  Health:   '#00FF88',  // neon green
  Fitness:  '#FF1493',  // hot neon pink
  Work:     '#4D9FFF',  // electric blue
  Finance:  '#FFB800',  // gold
  Personal: '#BF5FFF',  // purple
  Learning: '#00BFFF',  // cool electric blue
  Home:     '#FF6B35',  // coral
  Social:   '#FF3CC2',  // hot magenta
  Creative: '#C77DFF',  // violet
};

// Per-goal palette — every entry is in its own hue family so any two goals
// read distinctly. Deliberately excludes blue/cyan (Tasks line owns cyan) so
// new goals can't end up looking the same as Tasks. Adjacent indices land on
// opposite sides of the wheel so consecutive goal_ids contrast strongly.
const GOAL_PALETTE = [
  '#FF1493',  // 1. hot pink     (rose-magenta)
  '#76FF03',  // 2. lime         (yellow-green)
  '#FF6B35',  // 3. orange       (warm)
  '#9D4EDD',  // 4. violet       (purple)
  '#FFD23F',  // 5. gold         (warm yellow)
  '#DC143C',  // 6. crimson      (deep red)
  '#22C55E',  // 7. emerald      (medium pure green — distinct from lime)
  '#FFAB00',  // 8. amber        (orange-yellow)
  '#C77DFF',  // 9. lavender     (light purple — distinct from violet)
  '#A0522D',  // 10. sienna      (earth brown/rust)
];

function _goalColor(goalId) {
  if (goalId == null) return '#888';
  // Stable index based on goal_id so colors don't shift between renders
  const idx = ((goalId % GOAL_PALETTE.length) + GOAL_PALETTE.length) % GOAL_PALETTE.length;
  return GOAL_PALETTE[idx];
}

function _stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#\d]+;/gi, ' ').replace(/\s{2,}/g, ' ').trim();
}

function _isoDateAdd(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _fmtMonDay(iso) {
  if (!iso) return '';
  const dt = new Date(iso + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

registerPage('dashboard', async function(content) {
  content.innerHTML = `
    <div class="dash-page">
      <div class="dash-top">
        <div id="dash-header"  class="dash-header-row"></div>
        <div id="dash-kpi-row" class="dash-kpi-row"></div>
      </div>
      <div id="dash-trip-row" class="dash-trip-row" style="display:none"></div>
      <div class="dash-grid-4">
        <div class="dash-qp" id="dash-qp-tasks">
          <div class="dash-qp-header">
            <span class="dash-section-title" id="dash-tl-title">Today</span>
            <span class="dash-section-link" id="dash-tasks-nav">View all →</span>
          </div>
          <div class="dash-qa-row" id="dash-qa-row">
            <input id="dash-task-qa" class="dash-qa-field" placeholder="+ Quick add for today…" autocomplete="off"/>
          </div>
          <div class="dash-qp-body" id="dash-task-list"></div>
          <div class="dash-qp-body dash-qp-body--activity" id="dash-activity-chart" style="display:none"></div>
          <button class="dash-mode-toggle" id="dash-mode-toggle" title="Toggle Today / Activity">⇄</button>
        </div>
        <div class="dash-qp" id="dash-qp-habits">
          <div class="dash-qp-header">
            <span class="dash-section-title">Habits</span>
            <span class="dash-section-link" id="dash-habits-nav">Goals →</span>
          </div>
          <div class="dash-qp-body" id="dash-habits-list"></div>
        </div>
        <div class="dash-qp" id="dash-qp-cal">
          <div class="dash-qp-header">
            <span class="dash-section-title">Next 7 Days</span>
            <span class="dash-section-link" id="dash-cal-nav">Calendar →</span>
          </div>
          <div class="dash-qp-body dash-qp-body--minical" id="dash-minical-body"></div>
        </div>
        <div class="dash-qp" id="dash-qp-goalms">
          <div class="dash-qp-header">
            <span class="dash-section-title">Goals & Milestones</span>
            <span class="dash-section-link" id="dash-goals-nav">View all →</span>
          </div>
          <div class="dash-qp-body" id="dash-goalms-list"></div>
        </div>
      </div>
    </div>`;

  document.getElementById('dash-tasks-nav')?.addEventListener('click', () => loadPage('tasks'));
  document.getElementById('dash-habits-nav')?.addEventListener('click', () => loadPage('goals'));
  document.getElementById('dash-goals-nav')?.addEventListener('click', () => loadPage('goals'));
  document.getElementById('dash-cal-nav')?.addEventListener('click',   () => loadPage('calendar'));
  document.getElementById('dash-mode-toggle')?.addEventListener('click', () => {
    _setTLMode(_tlMode === 'tasks' ? 'activity' : 'tasks');
  });

  try {
    _dashData = await apiFetch('GET', '/dashboard');
  } catch(e) {
    document.querySelector('.dash-page').innerHTML =
      `<div class="empty-state"><div class="empty-state-title">Couldn't load dashboard</div>
       <p class="empty-state-text">${e.message}</p></div>`;
    return;
  }

  _renderHeader(_dashData.user_name);
  _renderKPIs(_dashData);
  _renderTasks(_dashData.today_tasks);
  _renderHabits(_dashData.habits);
  _renderGoalsAndMilestones(_dashData.goals);
  _renderMiniCalendar(_dashData);
  _wireQuickAdd();
  _renderTripSelector();
  _setTLMode(_tlMode);
});

let _tlMode = localStorage.getItem('dash_tl_mode') || 'tasks';

function _setTLMode(mode) {
  _tlMode = mode;
  localStorage.setItem('dash_tl_mode', mode);
  const taskList = document.getElementById('dash-task-list');
  const chart    = document.getElementById('dash-activity-chart');
  const qa       = document.getElementById('dash-qa-row');
  const title    = document.getElementById('dash-tl-title');
  const nav      = document.getElementById('dash-tasks-nav');
  if (!taskList || !chart) return;
  if (mode === 'activity') {
    taskList.style.display = 'none';
    chart.style.display    = '';
    if (qa) qa.style.display = 'none';
    if (title) title.textContent = 'Activity';
    if (nav) nav.style.display = 'none';
    if (_dashData) _renderActivityChart(_dashData);
  } else {
    taskList.style.display = '';
    chart.style.display    = 'none';
    if (qa) qa.style.display = '';
    if (title) title.textContent = 'Today';
    if (nav) nav.style.display = '';
  }
}

async function _dashReload() {
  try {
    _dashData = await apiFetch('GET', '/dashboard');
    _renderKPIs(_dashData);
    _renderTasks(_dashData.today_tasks);
    _renderHabits(_dashData.habits);
    _renderGoalsAndMilestones(_dashData.goals);
    _renderMiniCalendar(_dashData);
    if (_tlMode === 'activity') _renderActivityChart(_dashData);
  } catch(e) {}
}

// ── Activity chart (toggle of Today's tasks) ──────────────────
function _renderActivityChart(data) {
  const container = document.getElementById('dash-activity-chart');
  if (!container) return;
  const chart = data.activity_chart;
  if (!chart || !chart.days || !chart.days.length) {
    container.innerHTML = `<div class="di-empty">No activity data</div>`;
    return;
  }

  if (!container._actObserver) {
    let lastW = 0, lastH = 0;
    container._actObserver = new ResizeObserver(entries => {
      if (_tlMode !== 'activity' || !_dashData) return;
      const r = entries[0].contentRect;
      if (Math.abs(r.width - lastW) > 4 || Math.abs(r.height - lastH) > 4) {
        lastW = r.width; lastH = r.height;
        _drawActivity(_dashData);
      }
    });
    container._actObserver.observe(container);
  }

  _drawActivity(data);
}

function _drawActivity(data) {
  const container = document.getElementById('dash-activity-chart');
  if (!container) return;
  const chart = data.activity_chart;
  if (!chart) return;

  const rect = container.getBoundingClientRect();
  if (rect.width < 50) {
    requestAnimationFrame(() => _drawActivity(data));
    return;
  }

  // Resolve series colors so they match the KPI cards (same _goalColor function).
  // Tasks (no goal_id) → cyan; goal habit lines → toned palette by goal_id.
  const series = chart.series.filter(s => s.data && s.data.length).map(s => ({
    ...s,
    color: s.goal_id != null ? _goalColor(s.goal_id) : '#00E5FF',
  }));
  const days = chart.days;

  // Reserve space at bottom for the legend (HTML, outside SVG)
  const legendCount = Math.ceil(series.length / 4);
  const LEGEND_H = 22 + legendCount * 18;
  const W = Math.floor(rect.width);
  const H = Math.max(140, Math.floor(rect.height - LEGEND_H));

  const PAD_L = 32, PAD_R = 14, PAD_T = 12, PAD_B = 26;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const xFor = i => PAD_L + (days.length === 1 ? innerW/2 : (i / (days.length - 1)) * innerW);
  const yFor = pct => PAD_T + innerH * (1 - pct / 100);

  const grid = [0, 25, 50, 75, 100].map(p =>
    `<line x1="${PAD_L}" y1="${yFor(p)}" x2="${W - PAD_R}" y2="${yFor(p)}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="2,3" stroke-width="0.5"/>`
  ).join('');

  const yLbls = [0, 50, 100].map(p =>
    `<text x="${PAD_L - 6}" y="${yFor(p) + 4}" text-anchor="end" fill="var(--text-muted)" font-size="11">${p}</text>`
  ).join('');

  const xLbls = days.map((d, i) =>
    `<text x="${xFor(i)}" y="${H - 8}" text-anchor="middle" fill="var(--text-muted)" font-size="12" font-weight="600">${escHtml(d.label)}</text>`
  ).join('');

  const lines = series.map(s => {
    const pts = s.data.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ');
    const dots = s.data.map((v, i) =>
      `<circle cx="${xFor(i).toFixed(1)}" cy="${yFor(v).toFixed(1)}" r="3" fill="${s.color}"/>`
    ).join('');
    return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" style="filter:drop-shadow(0 0 1.5px ${s.color})"/>${dots}`;
  }).join('');

  const legend = series.map(s =>
    `<span class="dash-act-leg-item"><span class="dash-act-leg-dot" style="background:${s.color}"></span>${escHtml(s.name)}</span>`
  ).join('');

  container.innerHTML = `
    <svg width="${W}" height="${H}" class="dash-act-svg">
      ${grid}${yLbls}${lines}${xLbls}
    </svg>
    <div class="dash-act-legend">${legend}</div>`;
}

// ── Header ────────────────────────────────────────────────────
function _renderHeader(userName) {
  const el = document.getElementById('dash-header');
  if (!el) return;
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  });
  el.innerHTML = `
    <h1 class="dash-greeting">${greeting()}, ${escHtml(userName || 'there')}!</h1>
    <div class="dash-date">${dateStr}</div>`;
}

// ── KPI row (8 slots: 2 fixed + 6 pinned) ─────────────────────
function _renderKPIs(data) {
  const el = document.getElementById('dash-kpi-row');
  if (!el) return;

  const stats     = data.stats;
  const habits    = data.habits || [];
  const pinnedMs  = data.pinned_milestones || [];
  const pinnedMet = data.pinned_metrics || [];

  function _ringColor(item) {
    return _goalColor(item.goal_id);
  }

  function msCountdownCell(m) {
    const label = m.title.length > 22 ? m.title.slice(0, 21) + '…' : m.title;
    const r = 13, circ = +(2 * Math.PI * r).toFixed(2);
    const lm = m.linked_metric;
    const color = _ringColor(m);
    let ringHTML, sub;

    if (lm && lm.target_value != null) {
      const sv = lm.start_value ?? 0;
      const cv = lm.current_value ?? sv;
      const pct = lm.target_value !== sv
        ? Math.max(0, Math.min(100, Math.round((cv - sv) / (lm.target_value - sv) * 100)))
        : 0;
      const offset = +(circ * (1 - pct / 100)).toFixed(2);
      ringHTML = `<svg viewBox="0 0 32 32" class="dash-kpi-ring-svg">
        <circle cx="16" cy="16" r="${r}" fill="none" stroke="var(--bg-input)" stroke-width="3"/>
        <circle cx="16" cy="16" r="${r}" fill="none" stroke="${color}" stroke-width="3"
          stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
          stroke-linecap="round" transform="rotate(-90 16 16)"
          style="filter:drop-shadow(0 0 4px ${color})"/>
        <text x="16" y="20" text-anchor="middle" class="dash-kpi-ring-val" fill="${color}">${pct}%</text>
      </svg>`;
      sub = `${cv}${lm.unit ? ' '+lm.unit : ''} / ${lm.target_value}${lm.unit ? ' '+lm.unit : ''}`;
    } else if (m.target_date) {
      const daysLeft = Math.ceil((new Date(m.target_date + 'T00:00:00') - new Date()) / 86400000);
      const overdueColor = daysLeft < 0 ? '#FF4455' : color;
      const maxDays = 90;
      const pct = Math.max(0, Math.min(100, (1 - daysLeft / maxDays) * 100));
      const offset = +(circ * (1 - pct / 100)).toFixed(2);
      const dayLbl = daysLeft < 0 ? 'PAST' : daysLeft === 0 ? 'TODAY' : `${daysLeft}d`;
      ringHTML = `<svg viewBox="0 0 32 32" class="dash-kpi-ring-svg">
        <circle cx="16" cy="16" r="${r}" fill="none" stroke="var(--bg-input)" stroke-width="3"/>
        <circle cx="16" cy="16" r="${r}" fill="none" stroke="${overdueColor}" stroke-width="3"
          stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
          stroke-linecap="round" transform="rotate(-90 16 16)"
          style="filter:drop-shadow(0 0 4px ${overdueColor})"/>
        <text x="16" y="20" text-anchor="middle" class="dash-kpi-ring-val" fill="${overdueColor}" style="font-size:${daysLeft > 99 ? '7px' : '8px'}">${dayLbl}</text>
      </svg>`;
      sub = daysLeft < 0 ? 'overdue' : daysLeft === 0 ? 'today' : `in ${daysLeft} days`;
    } else {
      ringHTML = `<svg viewBox="0 0 32 32" class="dash-kpi-ring-svg">
        <circle cx="16" cy="16" r="${r}" fill="none" stroke="var(--bg-input)" stroke-width="3"/>
        <circle cx="16" cy="16" r="${r}" fill="none" stroke="${color}" stroke-width="3"
          stroke-linecap="round" transform="rotate(-90 16 16)"
          style="filter:drop-shadow(0 0 4px ${color});opacity:0.5"/>
      </svg>`;
      sub = m.goal_title || '';
    }

    return `<div class="dash-kpi-cell dash-kpi--ring dash-kpi--ms" data-goal-id="${m.goal_id}" title="${escHtml(m.title)}" style="border-top:3px solid ${color};box-shadow:inset 0 0 8px ${color}14">
      <button class="dash-kpi-unpin" data-kind="ms" data-goal-id="${m.goal_id}" data-id="${m.id}" title="Unpin from dashboard">×</button>
      ${ringHTML}
      <div class="dash-kpi-text">
        <div class="dash-kpi-label">${escHtml(label)}</div>
        ${sub ? `<div class="dash-kpi-sublabel">${escHtml(sub)}</div>` : ''}
      </div>
    </div>`;
  }

  function metricRingCell(m) {
    const sv   = m.start_value ?? 0;
    const cv   = m.current_value ?? sv;
    const tv   = m.target_value;
    const pct  = (tv != null && tv !== sv)
      ? Math.round(Math.max(0, Math.min(100, (cv - sv) / (tv - sv) * 100)))
      : 0;
    const color = _ringColor(m);
    const label = m.label.length > 22 ? m.label.slice(0, 21) + '…' : m.label;
    const r = 13, circ = +(2 * Math.PI * r).toFixed(2);
    const offset = +(circ * (1 - pct / 100)).toFixed(2);
    const sub = tv != null ? `${cv}${m.unit ? ' '+m.unit : ''} / ${tv}${m.unit ? ' '+m.unit : ''}` : (m.goal_title || '');
    return `<div class="dash-kpi-cell dash-kpi--ring" data-goal-id="${m.goal_id}" title="${escHtml(m.label)}" style="border-top:3px solid ${color};box-shadow:inset 0 0 8px ${color}14">
      <button class="dash-kpi-unpin" data-kind="met" data-goal-id="${m.goal_id}" data-id="${m.id}" title="Unpin from dashboard">×</button>
      <svg viewBox="0 0 32 32" class="dash-kpi-ring-svg">
        <circle cx="16" cy="16" r="${r}" fill="none" stroke="var(--bg-input)" stroke-width="3"/>
        <circle cx="16" cy="16" r="${r}" fill="none" stroke="${color}" stroke-width="3"
          stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
          stroke-linecap="round" transform="rotate(-90 16 16)"
          style="filter:drop-shadow(0 0 4px ${color})"/>
        <text x="16" y="20" text-anchor="middle" class="dash-kpi-ring-val" fill="${color}">${pct}%</text>
      </svg>
      <div class="dash-kpi-text">
        <div class="dash-kpi-label">${escHtml(label)}</div>
        ${sub ? `<div class="dash-kpi-sublabel">${escHtml(sub)}</div>` : ''}
      </div>
    </div>`;
  }

  // Habit compliance: avg % across all habits (days-met OR minutes-met OR avg of both)
  const compliance = _calcHabitCompliance(habits);
  const habitColor = compliance == null ? '#666'
    : compliance >= 75 ? '#00FF88'
    : compliance >= 50 ? '#00BFFF'
    : compliance >= 25 ? '#FFB800'
    : '#FF4455';

  const slots = [
    `<div class="dash-kpi-cell dash-kpi--today dash-kpi--stat" data-stat="today" style="border-top:3px solid var(--neon-cyan)">
      <div class="dash-kpi-stat-num"><span id="dash-stat-rem">${stats.due_today}</span><span class="dash-kpi-denom">/${stats.due_today_total}</span></div>
      <div class="dash-kpi-stat-label">Tasks Due Today</div>
    </div>`,
    `<div class="dash-kpi-cell dash-kpi--stat" data-stat="habits" style="border-top:3px solid ${habitColor};box-shadow:inset 0 0 12px ${habitColor}1a">
      <div class="dash-kpi-stat-num" style="color:${habitColor}">${compliance != null ? compliance + '%' : '—'}</div>
      <div class="dash-kpi-stat-label">Habit Compliance</div>
    </div>`,
  ];

  // Slots 3-8: pinned milestones + metrics, sorted so items from the same goal
  // are adjacent. Within a goal: milestones first, then metrics.
  const PIN_SLOTS = 6;
  const combined = [
    ...pinnedMs.map(m => ({ kind: 'ms', data: m })),
    ...pinnedMet.map(m => ({ kind: 'met', data: m })),
  ].sort((a, b) => {
    const ga = a.data.goal_id ?? 0;
    const gb = b.data.goal_id ?? 0;
    if (ga !== gb) return ga - gb;
    if (a.kind !== b.kind) return a.kind === 'ms' ? -1 : 1;
    return (a.data.id ?? 0) - (b.data.id ?? 0);
  }).slice(0, PIN_SLOTS);
  for (let i = 0; i < PIN_SLOTS; i++) {
    const slot = combined[i];
    if (!slot) {
      slots.push(`<div class="dash-kpi-cell dash-kpi--empty dash-kpi--ring" data-slot="${i}">
        <div class="dash-kpi-plus">+</div>
        <div class="dash-kpi-text">
          <div class="dash-kpi-label">Pin a milestone</div>
          <div class="dash-kpi-sublabel">or numeric target</div>
        </div>
      </div>`);
    } else if (slot.kind === 'ms') {
      slots.push(msCountdownCell(slot.data));
    } else {
      slots.push(metricRingCell(slot.data));
    }
  }

  el.innerHTML = slots.join('');

  el.querySelectorAll('[data-stat]').forEach(cell => {
    cell.addEventListener('click', () => {
      const s = cell.dataset.stat;
      if      (s === 'today')  document.getElementById('dash-qp-tasks')?.scrollIntoView({ behavior: 'smooth' });
      else if (s === 'habits') document.getElementById('dash-qp-habits')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  el.querySelectorAll('[data-goal-id]').forEach(cell => {
    cell.addEventListener('click', e => {
      if (e.target.closest('.dash-kpi-unpin')) return;
      window._openGoalId = parseInt(cell.dataset.goalId);
      loadPage('goals');
    });
  });

  el.querySelectorAll('.dash-kpi-unpin').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      btn.disabled = true;
      const path = btn.dataset.kind === 'ms'
        ? `/goals/${btn.dataset.goalId}/milestones/${btn.dataset.id}/pin`
        : `/goals/${btn.dataset.goalId}/metrics/${btn.dataset.id}/pin`;
      try {
        await apiFetch('POST', path);
        await _dashReload();
      } catch(err) { btn.disabled = false; }
    });
  });

  el.querySelectorAll('.dash-kpi--empty').forEach(cell => {
    cell.addEventListener('click', _openPinPicker);
  });
}

// Habit compliance %: average across habits of (days met / target days) and/or (minutes / target minutes)
function _calcHabitCompliance(habits) {
  if (!habits || !habits.length) return null;
  const today    = todayISO();
  const weekAgo  = _isoDateAdd(-6);

  let totalPct = 0, count = 0;
  habits.forEach(h => {
    const entries = h.week_entries || [];
    const daysSet = new Set();
    let totalMin = 0;
    entries.forEach(e => {
      const day = (e.logged_at || '').slice(0, 10);
      if (day >= weekAgo && day <= today) {
        daysSet.add(day);
        if (e.value != null) totalMin += e.value;
      }
    });

    const partial = [];
    if (h.min_days_per_week)     partial.push(Math.min(100, (daysSet.size / h.min_days_per_week) * 100));
    if (h.weekly_target_minutes) partial.push(Math.min(100, (totalMin    / h.weekly_target_minutes) * 100));

    if (partial.length) {
      totalPct += partial.reduce((a, b) => a + b, 0) / partial.length;
      count++;
    }
  });
  return count ? Math.round(totalPct / count) : null;
}

// ── Pin picker modal ──────────────────────────────────────────
async function _openPinPicker() {
  let goalsData;
  try {
    goalsData = await apiFetch('GET', '/goals?status=active');
  } catch(e) { return; }

  const goals = goalsData.items || [];
  const unpinnedMs = [];
  const unpinnedMet = [];
  goals.forEach(g => {
    (g.milestones || []).forEach(m => {
      if (!m.is_pinned && !m.completed) unpinnedMs.push({ ...m, goal: g });
    });
    (g.metrics || []).forEach(m => {
      if (!m.is_pinned && !m.completed) unpinnedMet.push({ ...m, goal: g });
    });
  });

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const empty = unpinnedMs.length === 0 && unpinnedMet.length === 0;
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Pin to KPI dashboard</span>
        <button class="modal-close" aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        ${empty
          ? `<div class="di-empty" style="padding:24px 0;text-align:center">No unpinned milestones or numeric targets available.<br><br><button class="btn btn-primary btn-sm" id="pin-pick-go-goals">Open Goals to create one →</button></div>`
          : `${unpinnedMs.length ? `<div class="pin-pick-section">
              <div class="pin-pick-section-title">Milestones</div>
              ${unpinnedMs.map(m => {
                const dateStr = m.target_date ? formatDateShort(m.target_date) : '';
                return `<div class="pin-pick-item" data-kind="ms" data-goal-id="${m.goal.id}" data-id="${m.id}">
                  <span class="pin-pick-title">${escHtml(m.title)}</span>
                  <span class="pin-pick-goal">${escHtml(m.goal.title)}</span>
                  ${dateStr ? `<span class="pin-pick-meta">${dateStr}</span>` : ''}
                </div>`;
              }).join('')}
            </div>` : ''}
            ${unpinnedMet.length ? `<div class="pin-pick-section">
              <div class="pin-pick-section-title">Numeric Targets</div>
              ${unpinnedMet.map(m => {
                const cv = m.current_value ?? m.start_value ?? 0;
                const valStr = m.target_value != null ? `${cv}/${m.target_value}${m.unit ? ' '+m.unit : ''}` : '';
                return `<div class="pin-pick-item" data-kind="met" data-goal-id="${m.goal.id}" data-id="${m.id}">
                  <span class="pin-pick-title">${escHtml(m.label)}</span>
                  <span class="pin-pick-goal">${escHtml(m.goal.title)}</span>
                  ${valStr ? `<span class="pin-pick-meta">${escHtml(valStr)}</span>` : ''}
                </div>`;
              }).join('')}
            </div>` : ''}`
        }
      </div>
    </div>`;

  const dismiss = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 150); };
  overlay.querySelector('.modal-close').addEventListener('click', dismiss);
  overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });
  overlay.querySelector('#pin-pick-go-goals')?.addEventListener('click', () => { dismiss(); loadPage('goals'); });

  overlay.querySelectorAll('.pin-pick-item').forEach(item => {
    item.addEventListener('click', async () => {
      item.style.opacity = '0.5';
      try {
        const path = item.dataset.kind === 'ms'
          ? `/goals/${item.dataset.goalId}/milestones/${item.dataset.id}/pin`
          : `/goals/${item.dataset.goalId}/metrics/${item.dataset.id}/pin`;
        await apiFetch('POST', path);
        dismiss();
        await _dashReload();
      } catch(err) { item.style.opacity = '1'; }
    });
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

// ── Trip Selector row ─────────────────────────────────────────
async function _renderTripSelector() {
  const el = document.getElementById('dash-trip-row');
  if (!el) return;

  let tripsData;
  try {
    tripsData = await apiFetch('GET', '/trips');
  } catch(e) { el.style.display = 'none'; return; }

  const allTrips = [...(tripsData.upcoming || []), ...(tripsData.planning || [])];
  if (!allTrips.length) { el.style.display = 'none'; return; }

  const initialId = (allTrips.find(t => t.is_highlighted) || allTrips[0]).id;

  el.style.display = '';
  el.innerHTML = `
    <div class="dash-tr-inner">
      <div class="dash-tr-left">
        <span class="dash-tr-icon">✈</span>
        <select class="dash-tr-select" id="dash-tr-select">
          ${allTrips.map(t =>
            `<option value="${t.id}"${t.id === initialId ? ' selected' : ''}>${escHtml(t.name)}${t.is_highlighted ? ' 📌' : ''}</option>`
          ).join('')}
        </select>
      </div>
      <div class="dash-tr-stats" id="dash-tr-stats"></div>
      <button class="btn btn-sm btn-secondary dash-tr-open">Open →</button>
    </div>`;

  _showTripStats(allTrips, initialId);

  document.getElementById('dash-tr-select').addEventListener('change', e => {
    _showTripStats(allTrips, parseInt(e.target.value));
  });
  el.querySelector('.dash-tr-open').addEventListener('click', () => loadPage('trips'));
}

function _showTripStats(trips, tripId) {
  const statsEl = document.getElementById('dash-tr-stats');
  if (!statsEl) return;
  const t = trips.find(tr => tr.id === tripId);
  if (!t) { statsEl.innerHTML = ''; return; }

  const packPct   = t.packing_total > 0 ? Math.round(t.packing_checked / t.packing_total * 100) : null;
  const taskDone  = (t.total_task_count || 0) - (t.open_task_count || 0);
  const budgetUsed  = (t.budget_committed || 0) + (t.budget_spent || 0);
  const budgetTotal = t.budget || 0;

  const daysLbl = t.days_until == null ? escHtml(t.status)
    : t.days_until === 0 ? 'Today!'
    : t.days_until === 1 ? 'Tomorrow'
    : `In ${t.days_until}d`;

  const dateRange = (t.start_date && t.end_date)
    ? `${_fmtMonDay(t.start_date)} – ${_fmtMonDay(t.end_date)}`
    : '';

  const budgetPct = budgetTotal > 0 ? Math.min(100, Math.round(budgetUsed / budgetTotal * 100)) : null;

  const entries = t.next_entries || [];
  const fmtShort = (iso) => {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return `${d.getMonth()+1}/${d.getDate()}`;
  };

  const itineraryHTML = entries.length
    ? `<span class="dash-tr-stat dash-tr-stat--itinerary">
        <span class="dash-tr-stat-lbl">Up next</span>
        ${entries.map(e =>
          `<span class="dash-tr-itin-item"><span class="dash-tr-itin-date">${fmtShort(e.entry_date)}</span><span class="dash-tr-itin-title">${escHtml(e.title.slice(0, 36))}${e.title.length > 36 ? '…' : ''}</span></span>`
        ).join('')}
      </span>`
    : (t.next_action
        ? `<span class="dash-tr-stat dash-tr-stat--next"><span class="dash-tr-stat-lbl">Next</span><span class="dash-tr-stat-val dash-tr-next">${escHtml(t.next_action.slice(0, 36))}${t.next_action.length > 36 ? '…' : ''}</span></span>`
        : '');

  statsEl.innerHTML = [
    t.destination ? `<span class="dash-tr-stat"><span class="dash-tr-stat-val dash-tr-dest">${escHtml(t.destination)}</span></span>` : '',
    dateRange     ? `<span class="dash-tr-stat"><span class="dash-tr-stat-val dash-tr-dates">${dateRange}</span></span>` : '',
    `<span class="dash-tr-stat dash-tr-stat--days"><span class="dash-tr-stat-val">${daysLbl}</span></span>`,
    packPct !== null
      ? `<span class="dash-tr-stat"><span class="dash-tr-stat-lbl">Packing</span>
         <div class="dash-tr-mini-bar"><div style="width:${packPct}%"></div></div>
         <span class="dash-tr-stat-val">${packPct}%</span></span>`
      : '',
    t.total_task_count > 0
      ? `<span class="dash-tr-stat"><span class="dash-tr-stat-lbl">Tasks</span><span class="dash-tr-stat-val">${taskDone}/${t.total_task_count}</span></span>`
      : '',
    budgetPct !== null
      ? `<span class="dash-tr-stat"><span class="dash-tr-stat-lbl">Budget</span>
         <div class="dash-tr-mini-bar dash-tr-mini-bar--budget"><div style="width:${budgetPct}%;background:${budgetPct > 90 ? '#ff4455' : '#FFB800'}"></div></div>
         <span class="dash-tr-stat-val">$${Math.round(budgetUsed)}/$${Math.round(budgetTotal)}</span></span>`
      : '',
    itineraryHTML,
  ].filter(Boolean).join('<span class="dash-tr-sep">·</span>');
}

// ── Quick-add wiring ──────────────────────────────────────────
function _wireQuickAdd() {
  const qaIn = document.getElementById('dash-task-qa');
  if (!qaIn) return;
  qaIn.addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const title = qaIn.value.trim();
    if (!title) return;
    qaIn.disabled = true;
    try {
      await apiFetch('POST', '/tasks', { title, due_date: todayISO(), priority: 'medium' });
      qaIn.value = '';
      await _dashReload();
    } catch(err) { /* silent */ }
    qaIn.disabled = false;
    qaIn.focus();
  });
}

// ── Today's tasks ─────────────────────────────────────────────
function _renderTasks(tasks) {
  const list = document.getElementById('dash-task-list');
  if (!list) return;

  const today = todayISO();
  if (!tasks.length) {
    list.innerHTML = `
      <div class="dash-done-state">
        <div class="dash-done-icon">✓</div>
        <div class="dash-done-text">All done for today!</div>
      </div>`;
    return;
  }

  const shown = tasks.slice(0, 10);
  const extra = tasks.length - shown.length;

  list.innerHTML = shown.map(t => {
    const overdue  = t.due_date && t.due_date < today;
    const subBadge = t.subtask_count > 0
      ? `<span class="dash-sub-badge">${t.subtask_done}/${t.subtask_count}</span>` : '';
    const ovBadge  = overdue ? `<span class="dash-overdue-badge">!</span>` : '';
    return `
      <div class="dash-task-row" data-id="${t.id}">
        <div class="dash-task-check" data-task-id="${t.id}"></div>
        <span class="priority-dot ${t.priority}"></span>
        <span class="dash-task-title">${escHtml(t.title)}</span>
        ${subBadge}${ovBadge}
      </div>`;
  }).join('') + (extra > 0
    ? `<div class="dash-more-link" id="dash-tasks-more">+${extra} more →</div>` : '');

  document.getElementById('dash-tasks-more')?.addEventListener('click', () => loadPage('tasks'));

  list.querySelectorAll('.dash-task-check').forEach(cb => {
    cb.addEventListener('click', async e => {
      e.stopPropagation();
      try {
        await apiFetch('POST', `/tasks/${parseInt(cb.dataset.taskId)}/complete`);
        const row = cb.closest('.dash-task-row');
        row.style.cssText = 'opacity:0;transition:opacity 0.18s';
        setTimeout(() => {
          row.remove();
          const rem = document.getElementById('dash-stat-rem');
          if (rem) rem.textContent = Math.max(0, parseInt(rem.textContent) - 1);
          if (!list.querySelector('.dash-task-row')) {
            list.innerHTML = `
              <div class="dash-done-state">
                <div class="dash-done-icon">✓</div>
                <div class="dash-done-text">All done for today!</div>
              </div>`;
          }
        }, 200);
      } catch(err) { /* silent */ }
    });
  });

  list.querySelectorAll('.dash-task-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.dash-task-check')) return;
      loadPage('tasks');
    });
  });
}

// ── Habits — per-goal groups with Log button ──────────────────
function _renderHabits(habits) {
  const list = document.getElementById('dash-habits-list');
  if (!list) return;

  if (!habits.length) {
    list.innerHTML = `<div class="di-empty">No habits tracked</div>`;
    return;
  }

  const byGoal = {};
  const goalOrder = [];
  habits.forEach(h => {
    if (!byGoal[h.goal_id]) {
      byGoal[h.goal_id] = { title: h.goal_title, habits: [] };
      goalOrder.push(h.goal_id);
    }
    byGoal[h.goal_id].habits.push(h);
  });

  list.innerHTML = goalOrder.map(gid => {
    const group = byGoal[gid];
    const color = AREA_COLORS[group.habits[0]?.area] || 'var(--color-accent)';
    return `<div class="dash-hgroup">
      <div class="dash-hgroup-title" style="border-color:${color};color:${color}">${escHtml(group.title)}</div>
      ${group.habits.map(h => {
        const entries = h.week_entries || [];
        const dots = Array.from({length: 7}, (_, i) => {
          const ds    = _isoDateAdd(-(6 - i));
          const on    = entries.some(e => e.logged_at.startsWith(ds));
          const isToday = i === 6;
          return `<span class="dash-hrow-dot${on ? ' dash-hrow-dot--on' : ''}${isToday ? ' dash-hrow-dot--today' : ''}"></span>`;
        }).join('');
        return `
          <div class="dash-hrow${h.logged_today ? ' dash-hrow--done' : ''}" data-habit-id="${h.id}" data-goal-id="${h.goal_id}">
            <div class="dash-hrow-dots">${dots}</div>
            <div class="dash-hrow-name">${escHtml(h.label)}</div>
            ${h.logged_today
              ? `<span class="dash-hrow-check">✓</span>`
              : `<button class="dash-hrow-log-btn">Log</button>`}
            <div class="dash-hrow-form" id="dash-hform-${h.id}" style="display:none">
              <input class="dash-hrow-min" type="number" min="1" placeholder="min"/>
              <button class="dash-hrow-ok"  data-habit-id="${h.id}" data-goal-id="${h.goal_id}">✓</button>
              <button class="dash-hrow-cancel" data-habit-id="${h.id}">✕</button>
            </div>
          </div>`;
      }).join('')}
    </div>`;
  }).join('');

  list.querySelectorAll('.dash-hrow-log-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const row  = btn.closest('.dash-hrow');
      const hid  = row.dataset.habitId;
      const form = document.getElementById(`dash-hform-${hid}`);
      if (!form) return;
      list.querySelectorAll('.dash-hrow-form').forEach(f => { f.style.display = 'none'; });
      list.querySelectorAll('.dash-hrow-log-btn').forEach(b => { b.style.display = ''; });
      btn.style.display = 'none';
      form.style.display = 'flex';
      form.querySelector('.dash-hrow-min')?.focus();
    });
  });

  list.querySelectorAll('.dash-hrow-cancel').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const form = document.getElementById(`dash-hform-${btn.dataset.habitId}`);
      const logBtn = form?.closest('.dash-hrow')?.querySelector('.dash-hrow-log-btn');
      if (form) form.style.display = 'none';
      if (logBtn) logBtn.style.display = '';
    });
  });

  list.querySelectorAll('.dash-hrow-ok').forEach(btn => {
    btn.addEventListener('click', async e => { e.stopPropagation(); await _saveHabitFromRow(btn); });
  });

  list.querySelectorAll('.dash-hrow-min').forEach(input => {
    input.addEventListener('keydown', async e => {
      if (e.key === 'Enter') {
        const ok = input.closest('.dash-hrow-form')?.querySelector('.dash-hrow-ok');
        if (ok) await _saveHabitFromRow(ok);
      } else if (e.key === 'Escape') {
        const cancel = input.closest('.dash-hrow-form')?.querySelector('.dash-hrow-cancel');
        cancel?.click();
      }
      e.stopPropagation();
    });
  });
}

async function _saveHabitFromRow(btn) {
  const form    = btn.closest('.dash-hrow-form');
  const row     = form?.closest('.dash-hrow');
  const goalId  = parseInt(row?.dataset.goalId);
  const habitId = parseInt(row?.dataset.habitId);
  const minVal  = parseInt(form?.querySelector('.dash-hrow-min')?.value) || null;
  btn.disabled  = true;
  try {
    await apiFetch('POST', `/goals/${goalId}/log`, { habit_id: habitId, value: minVal, note: null });
    await _dashReload();
  } catch(err) { btn.disabled = false; }
}

// ── Goals & Milestones combined panel ────────────────────────
function _renderGoalsAndMilestones(goals) {
  const list = document.getElementById('dash-goalms-list');
  if (!list) return;

  if (!goals.length) {
    list.innerHTML = `<div class="di-empty">No active goals</div>`;
    return;
  }

  const today = todayISO();

  list.innerHTML = goals.slice(0, 10).map(g => {
    const pct     = Math.round(g.progress_pct || 0);
    const color   = AREA_COLORS[g.area] || 'var(--color-accent)';
    const incomplete = (g.milestones || []).filter(m => !m.completed);

    const msHTML = incomplete.slice(0, 5).map(m => {
      const daysLeft  = m.target_date ? Math.ceil((new Date(m.target_date + 'T00:00:00') - new Date()) / 86400000) : null;
      const overdue   = daysLeft !== null && daysLeft < 0;
      const urgent    = daysLeft !== null && !overdue && daysLeft < 14;
      const dateCls   = overdue ? 'di-date-overdue' : urgent ? 'di-date-urgent' : 'di-date';
      return `<div class="dash-gms-ms-row" data-ms-id="${m.id}" data-goal-id="${g.id}">
        <div class="checkbox-square dash-ms-complete-btn" data-ms-id="${m.id}" data-goal-id="${g.id}" title="Complete milestone"></div>
        <span class="dash-gms-ms-title">${escHtml(m.title)}</span>
        ${m.target_date ? `<span class="${dateCls} dash-gms-ms-date">${formatDateShort(m.target_date)}</span>` : ''}
      </div>`;
    }).join('');

    return `<div class="dash-gms-block${g.is_on_track ? '' : ' off-track'}" data-goal-id="${g.id}">
      <div class="dash-gms-header">
        <div class="goal-on-track-dot ${g.is_on_track ? 'on-track' : 'off-track'}"></div>
        <span class="dash-gms-title" style="border-left:3px solid ${color};padding-left:6px">${escHtml(g.title)}</span>
        <div class="dash-goal-bar-wrap">
          <div class="dash-goal-bar"><div class="dash-goal-fill" style="width:${pct}%;background:${color}"></div></div>
        </div>
        <span class="dash-goal-pct">${pct}%</span>
      </div>
      ${msHTML ? `<div class="dash-gms-ms-list">${msHTML}</div>` : ''}
    </div>`;
  }).join('');

  list.querySelectorAll('.dash-gms-block').forEach(block => {
    block.addEventListener('click', e => {
      if (e.target.closest('.dash-ms-complete-btn')) return;
      window._openGoalId = parseInt(block.dataset.goalId);
      loadPage('goals');
    });
  });

  list.querySelectorAll('.dash-ms-complete-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      btn.classList.add('checked');
      try {
        await apiFetch('PUT', `/goals/${btn.dataset.goalId}/milestones/${btn.dataset.msId}`, { completed: true });
        const row = btn.closest('.dash-gms-ms-row');
        row.style.cssText = 'opacity:0;transition:opacity 0.18s';
        setTimeout(() => row.remove(), 200);
      } catch(err) { btn.classList.remove('checked'); }
    });
  });
}

// ── 7-day Mini Calendar (8am–10pm timeline) ───────────────────
function _renderMiniCalendar(data) {
  const body = document.getElementById('dash-minical-body');
  if (!body) return;

  const HOURS_START = 8;
  const HOURS_END   = 22;
  const HOUR_H      = 18;
  const totalH      = (HOURS_END - HOURS_START) * HOUR_H;
  const today       = todayISO();
  const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // Build 7-day map (today + 6)
  const days = Array.from({length: 7}, (_, i) => ({
    iso: _isoDateAdd(i), tasks: [], milestones: [], events: []
  }));
  const dayMap = {};
  days.forEach(d => { dayMap[d.iso] = d; });

  (data.today_tasks || []).forEach(t => { if (dayMap[today]) dayMap[today].tasks.push(t); });
  (data.upcoming_tasks || []).forEach(t => {
    if (t.due_date && dayMap[t.due_date] && t.due_date !== today) dayMap[t.due_date].tasks.push(t);
  });
  (data.due_milestones || []).forEach(m => {
    if (m.target_date && dayMap[m.target_date]) dayMap[m.target_date].milestones.push(m);
  });
  (data.agenda_events || []).forEach(ev => {
    if (ev.date && dayMap[ev.date]) dayMap[ev.date].events.push(ev);
  });

  function timeToY(s) {
    const [h, m] = s.split(':').map(Number);
    return Math.max(0, ((h + m / 60) - HOURS_START) * HOUR_H);
  }
  function durPx(start, end) {
    if (!end) return HOUR_H;
    const [h1,m1] = start.split(':').map(Number);
    const [h2,m2] = end.split(':').map(Number);
    return Math.max(HOUR_H * 0.5, ((h2+m2/60)-(h1+m1/60)) * HOUR_H);
  }

  // Gutter time labels
  const gutterCells = [];
  for (let h = HOURS_START; h <= HOURS_END; h += 2) {
    const lbl = h < 12 ? `${h}a` : h === 12 ? '12p' : `${h-12}p`;
    gutterCells.push(`<div style="position:absolute;top:${(h-HOURS_START)*HOUR_H}px;right:3px;transform:translateY(-50%);font-size:10px;color:var(--text-muted);white-space:nowrap;font-weight:600">${lbl}</div>`);
  }

  const hdrRow = `<div class="dash-mc-row dash-mc-row--hdr">
    <div class="dash-mc-gcell"></div>
    ${days.map(d => {
      const dt = new Date(d.iso + 'T00:00:00');
      const isT = d.iso === today;
      return `<div class="dash-mc-dcell dash-mc-dcell--hdr${isT ? ' today' : ''}">
        ${DAY_NAMES[dt.getDay()]}<br><span>${dt.getDate()}</span>
      </div>`;
    }).join('')}
  </div>`;

  const allDayRow = `<div class="dash-mc-row dash-mc-row--allday">
    <div class="dash-mc-gcell dash-mc-gcell--lbl">all</div>
    ${days.map(d => {
      const pills = [
        ...d.tasks.slice(0,3).map(t =>
          `<span class="dash-mc-pill dash-mc-pill--task${t.priority==='high'?' high':''}" title="${escHtml(t.title)}">${escHtml(t.title.slice(0,12))}</span>`),
        ...d.milestones.slice(0,2).map(m =>
          `<span class="dash-mc-pill dash-mc-pill--ms" title="${escHtml(m.title)}">${escHtml(m.title.slice(0,12))}</span>`),
        ...d.events.filter(ev=>ev.all_day||!ev.start_time).map(ev =>
          `<span class="dash-mc-pill dash-mc-pill--ev${ev.tag_color ? ' tag-'+ev.tag_color : ''}" title="${escHtml(ev.title)}">${escHtml(ev.title.slice(0,12))}</span>`),
      ].join('');
      return `<div class="dash-mc-dcell dash-mc-dcell--allday${d.iso===today?' today':''}">${pills}</div>`;
    }).join('')}
  </div>`;

  const hourLines = Array.from({length: HOURS_END - HOURS_START}, (_,j) =>
    `<div style="position:absolute;left:0;right:0;top:${j*HOUR_H}px;border-top:1px solid rgba(255,255,255,0.04)"></div>`
  ).join('');

  const timeRow = `<div class="dash-mc-row dash-mc-row--time">
    <div class="dash-mc-gcell dash-mc-gcell--time" style="position:relative;height:${totalH}px">${gutterCells.join('')}</div>
    ${days.map(d => {
      const evBlocks = d.events.filter(ev => !ev.all_day && ev.start_time).map(ev => {
        const y = timeToY(ev.start_time);
        if (y >= totalH) return '';
        const h = Math.min(durPx(ev.start_time, ev.end_time), totalH - y);
        const tagCls = ev.tag_color ? ` tag-${ev.tag_color}` : '';
        return `<div class="dash-mc-ev${tagCls}" style="top:${y}px;height:${h}px" title="${escHtml(ev.title)}">${escHtml(ev.title.slice(0,16))}</div>`;
      }).join('');
      return `<div class="dash-mc-dcell dash-mc-dcell--time${d.iso===today?' today':''}" style="height:${totalH}px;position:relative">${hourLines}${evBlocks}</div>`;
    }).join('')}
  </div>`;

  body.innerHTML = `<div class="dash-mc-outer">${hdrRow}${allDayRow}<div class="dash-mc-scroll">${timeRow}</div></div>`;
}
