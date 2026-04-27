let _dashTripId = null;
let _dashTrips  = [];

registerPage('dashboard', async function(content) {
  _dashTripId = null;

  content.innerHTML = `
    <div class="dash-page">
      <div id="dash-header"></div>
      <div id="dash-stats" class="stats-row" style="grid-template-columns:repeat(4,1fr)"></div>
      <div id="dash-main" class="dash-grid"></div>
      <div id="dash-insights" class="dash-insights-grid"></div>
      <div id="dash-upcoming"></div>
    </div>`;

  let data, tripsData;
  try {
    [data, tripsData] = await Promise.all([
      apiFetch('GET', '/dashboard'),
      apiFetch('GET', '/trips').catch(() => ({ upcoming: [], planning: [], past: [] })),
    ]);
  } catch(e) {
    content.querySelector('.dash-page').innerHTML =
      `<div class="empty-state"><div class="empty-state-title">Couldn't load dashboard</div>
       <p class="empty-state-text">${e.message}</p></div>`;
    return;
  }

  _dashTrips = [...(tripsData.upcoming || []), ...(tripsData.planning || []), ...(tripsData.past || [])];
  _renderHeader(data.user_name);
  _renderStats(data.stats);
  _renderMain(data);
  _renderInsights(data);
  _renderUpcoming(data.upcoming_tasks);
});

async function _dashReload() {
  const url = _dashTripId ? `/dashboard?trip_id=${_dashTripId}` : '/dashboard';
  try {
    const data = await apiFetch('GET', url);
    _renderStats(data.stats);
    _renderMain(data);
    _renderInsights(data);
    _renderUpcoming(data.upcoming_tasks);
  } catch(e) {}
}

function _renderHeader(userName) {
  const el = document.getElementById('dash-header');
  if (!el) return;
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
  const tripOpts = _dashTrips.map(t =>
    `<option value="${t.id}"${_dashTripId === t.id ? ' selected' : ''}>${escHtml(t.name)}</option>`
  ).join('');
  const tripFilter = _dashTrips.length ? `
    <select id="dash-trip-filter" class="form-select" style="font-size:13px;padding:5px 8px;height:auto;min-width:120px">
      <option value="">All trips</option>${tripOpts}
    </select>` : '';
  el.innerHTML = `
    <div class="dash-header">
      <div>
        <h1 class="dash-greeting">${greeting()}, ${escHtml(userName)}!</h1>
        <div class="dash-date">${dateStr}</div>
      </div>
      ${tripFilter}
    </div>`;
  el.querySelector('#dash-trip-filter')?.addEventListener('change', async e => {
    _dashTripId = parseInt(e.target.value) || null;
    await _dashReload();
  });
}

function _renderStats(stats) {
  const el = document.getElementById('dash-stats');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card stat-card--cyan">
      <div class="stat-label">Due today</div>
      <div class="stat-value"><span id="dash-stat-today-remaining">${stats.due_today}</span><span style="font-size:14px;font-weight:400;color:var(--text-muted)"> / ${stats.due_today_total}</span></div>
    </div>
    <div class="stat-card stat-card--red">
      <div class="stat-label">Overdue</div>
      <div class="stat-value${stats.overdue > 0 ? ' danger' : ''}">${stats.overdue}</div>
    </div>
    <div class="stat-card stat-card--green">
      <div class="stat-label">Goals on track</div>
      <div class="stat-value">${stats.goals_on_track}<span style="font-size:14px;font-weight:400;color:var(--text-muted)"> / ${stats.active_goals}</span></div>
    </div>
    <div class="stat-card stat-card--blue">
      <div class="stat-label">Upcoming (7 days)</div>
      <div class="stat-value">${stats.upcoming_7d}</div>
    </div>`;
}

function _renderMain(data) {
  const el = document.getElementById('dash-main');
  if (!el) return;

  el.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header">
        <span class="dash-section-title">Today</span>
        <span class="dash-section-link" data-nav="tasks">View all →</span>
      </div>
      <div id="dash-tasks-body"></div>
    </div>
    <div class="dash-section">
      <div class="dash-section-header">
        <span class="dash-section-title">Goals</span>
        <span class="dash-section-link" data-nav="goals">View all →</span>
      </div>
      <div id="dash-goals-body"></div>
    </div>`;

  el.querySelectorAll('[data-nav]').forEach(link => {
    link.addEventListener('click', () => loadPage(link.dataset.nav));
  });

  _renderTasks(data.today_tasks);
  _renderGoals(data.goals);
}

function _renderTasks(tasks) {
  const body = document.getElementById('dash-tasks-body');
  if (!body) return;

  if (!tasks.length) {
    body.innerHTML = `<div style="padding:24px 0;text-align:center;color:var(--text-muted);font-size:14px">You're all clear for today</div>`;
    return;
  }

  const today = todayISO();
  const shown = tasks.slice(0, 9);

  body.innerHTML = shown.map(t => {
    const overdue = t.due_date && t.due_date < today;
    const dueBadge = overdue
      ? `<span class="due-label overdue" style="font-size:13px;flex-shrink:0">Overdue</span>`
      : '';
    return `
      <div class="dash-task-row" data-id="${t.id}">
        <div class="checkbox-circle" data-task-id="${t.id}" style="flex-shrink:0"></div>
        ${priorityDotHTML(t.priority)}
        <div class="dash-task-title">${escHtml(t.title)}</div>
        ${dueBadge}
      </div>`;
  }).join('');

  if (tasks.length > 9) {
    const more = document.createElement('div');
    more.style.cssText = 'font-size:13px;color:var(--text-muted);padding:8px 0 2px;text-align:center;cursor:pointer';
    more.textContent = `+${tasks.length - 9} more`;
    more.addEventListener('click', () => loadPage('tasks'));
    body.appendChild(more);
  }

  body.querySelectorAll('.checkbox-circle').forEach(cb => {
    cb.addEventListener('click', async e => {
      e.stopPropagation();
      const taskId = parseInt(cb.dataset.taskId);
      try {
        await apiFetch('POST', `/tasks/${taskId}/complete`);
        const row = cb.closest('.dash-task-row');
        row.style.cssText = 'opacity:0;transition:opacity 0.25s';
        setTimeout(() => {
          row.remove();
          const sv = document.getElementById('dash-stat-today-remaining');
          if (sv) sv.textContent = Math.max(0, parseInt(sv.textContent) - 1);
        }, 260);
      } catch(err) { /* silent */ }
    });
  });

  body.querySelectorAll('.dash-task-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.checkbox-circle')) return;
      loadPage('tasks');
    });
  });
}

function _renderGoals(goals) {
  const body = document.getElementById('dash-goals-body');
  if (!body) return;

  if (!goals.length) {
    body.innerHTML = `<div style="padding:24px 0;text-align:center;color:var(--text-muted);font-size:14px">No active goals yet</div>`;
    return;
  }

  body.innerHTML = goals.slice(0, 8).map(g => {
    const pct      = Math.round(g.progress_pct || 0);
    const trackCls = g.is_on_track ? 'on-track' : 'off-track';
    return `
      <div class="dash-goal-row" data-id="${g.id}">
        <div class="goal-on-track-dot ${trackCls}" title="${g.is_on_track ? 'On track' : 'Off track'}"></div>
        <div class="dash-goal-info">
          <div class="dash-goal-name">${escHtml(g.title)}</div>
          <div class="dash-goal-progress">
            <div class="dash-goal-bar">
              <div class="dash-goal-fill ${trackCls}" style="width:${pct}%"></div>
            </div>
            <span class="dash-goal-pct">${pct}%</span>
          </div>
          ${g.current_streak > 0 ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px">${g.current_streak} day streak${g.best_streak > g.current_streak ? ` · best ${g.best_streak}` : ''}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  body.querySelectorAll('.dash-goal-row').forEach(row => {
    row.addEventListener('click', () => loadPage('goals'));
  });
}

// ── Insights grid (milestones / targets / habits) ─────────────
function _renderInsights(data) {
  const el = document.getElementById('dash-insights');
  if (!el) return;

  const milestones = data.due_milestones || [];
  const metrics    = data.due_metrics    || [];
  const habits     = data.habits         || [];

  if (!milestones.length && !metrics.length && !habits.length) return;

  const today = todayISO();
  const in7   = (() => { const d = new Date(); d.setDate(d.getDate()+7); return d.toISOString().slice(0,10); })();

  // ── Milestones panel ──
  let msHTML = '';
  if (milestones.length) {
    msHTML = milestones.map(m => {
      const overdue = m.target_date < today;
      const soon    = !overdue && m.target_date <= in7;
      const dateCls = overdue ? 'di-date-overdue' : soon ? 'di-date-soon' : 'di-date';
      return `
        <div class="di-row" data-nav="goals">
          <div class="di-row-main">
            <span class="di-label">${escHtml(m.title)}</span>
            <span class="${dateCls}">${formatDateShort(m.target_date)}</span>
          </div>
          <div class="di-goal-tag">${escHtml(m.goal_title)}</div>
        </div>`;
    }).join('');
  } else {
    msHTML = `<div class="di-empty">No upcoming milestones</div>`;
  }

  // ── Numeric targets panel ──
  let targetsHTML = '';
  if (metrics.length) {
    targetsHTML = metrics.map(m => {
      const sv  = m.start_value || 0;
      const cv  = m.current_value != null ? m.current_value : sv;
      const tv  = m.target_value;
      const u   = m.unit ? ` ${escHtml(m.unit)}` : '';
      const pct = tv != null && tv !== sv
        ? Math.round(Math.max(0, Math.min(100, (cv - sv) / (tv - sv) * 100))) : 0;
      const overdue = m.target_date < today;
      const soon    = !overdue && m.target_date <= in7;
      const dateCls = overdue ? 'di-date-overdue' : soon ? 'di-date-soon' : 'di-date';
      return `
        <div class="di-row" data-nav="goals">
          <div class="di-row-main">
            <span class="di-label">${escHtml(m.label)}</span>
            <span class="${dateCls}">${formatDateShort(m.target_date)}</span>
          </div>
          <div class="di-goal-tag">${escHtml(m.goal_title)}</div>
          <div class="di-progress">
            <div class="progress-bar" style="flex:1;height:4px">
              <div class="progress-fill" style="width:${pct}%"></div>
            </div>
            <span class="di-progress-val">${cv}${u} / ${tv}${u} &middot; ${pct}%</span>
          </div>
        </div>`;
    }).join('');
  } else {
    targetsHTML = `<div class="di-empty">No targets with due dates</div>`;
  }

  // ── Habits panel ──
  let habitsHTML = '';
  if (habits.length) {
    habitsHTML = habits.map(h => {
      const entries  = h.week_entries || [];
      const totalMin = Math.round(entries.reduce((s, e) => s + (e.value || 0), 0));
      const days     = new Set(entries.map(e => e.logged_at.slice(0,10))).size;
      const wtMin    = h.weekly_target_minutes;
      const mdTarget = h.min_days_per_week;

      const statParts = [];
      let pct = 0;
      if (wtMin) {
        const hrs    = parseFloat((totalMin / 60).toFixed(1));
        const tgtHrs = parseFloat((wtMin / 60).toFixed(1));
        statParts.push(`${hrs} / ${tgtHrs} hrs`);
        pct = Math.min(100, Math.round(totalMin / wtMin * 100));
      }
      if (mdTarget) {
        statParts.push(`${days} / ${mdTarget} days`);
        if (!wtMin) pct = Math.min(100, Math.round(days / mdTarget * 100));
      }
      if (!wtMin && !mdTarget) statParts.push(`${days} day${days !== 1 ? 's' : ''} logged`);

      const hasTarget = !!(wtMin || mdTarget);
      const done    = hasTarget && (wtMin ? totalMin >= wtMin : true) && (mdTarget ? days >= mdTarget : true);
      const barCls  = done ? 'di-habit-bar-on' : '';

      return `
        <div class="di-habit-row${done ? ' di-habit-done' : ''}" data-nav="goals">
          <div class="di-row-main">
            <span class="di-label">${escHtml(h.label)}${done ? '<span class="di-done-badge">✓ Done</span>' : ''}</span>
            <span class="di-habit-stat">${statParts.join(' · ')}</span>
          </div>
          <div class="di-goal-tag">${escHtml(h.goal_title)}</div>
          ${hasTarget ? `<div class="progress-bar" style="height:4px;margin-top:5px">
            <div class="progress-fill ${barCls}" style="width:${pct}%"></div>
          </div>` : ''}
        </div>`;
    }).join('');
  } else {
    habitsHTML = `<div class="di-empty">No habits tracked</div>`;
  }

  el.innerHTML = `
    <div class="dash-insight-panel">
      <div class="dash-section-header">
        <span class="dash-section-title">Upcoming milestones</span>
        <span class="dash-section-link" data-nav="goals">Goals →</span>
      </div>
      <div class="di-list">${msHTML}</div>
    </div>
    <div class="dash-insight-panel">
      <div class="dash-section-header">
        <span class="dash-section-title">Upcoming targets</span>
        <span class="dash-section-link" data-nav="goals">Goals →</span>
      </div>
      <div class="di-list">${targetsHTML}</div>
    </div>
    <div class="dash-insight-panel">
      <div class="dash-section-header">
        <span class="dash-section-title">Habit progress this week</span>
        <span class="dash-section-link" data-nav="goals">Goals →</span>
      </div>
      <div class="di-list">${habitsHTML}</div>
    </div>`;

  el.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => loadPage('goals'));
  });
}

function _renderUpcoming(upcoming) {
  const el = document.getElementById('dash-upcoming');
  if (!el || !upcoming.length) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = tomorrow.toISOString().slice(0, 10);

  const byDay = {};
  upcoming.forEach(t => {
    if (!byDay[t.due_date]) byDay[t.due_date] = [];
    byDay[t.due_date].push(t);
  });

  const daysHTML = Object.entries(byDay).map(([dateStr, tasks]) => {
    const label = dateStr === tomorrowISO
      ? `Tomorrow · ${formatDateShort(dateStr)}`
      : new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric'
        });

    const tasksHTML = tasks.map(t =>
      `<div class="dash-upcoming-task" data-id="${t.id}">
         ${priorityDotHTML(t.priority)}
         <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(t.title)}</span>
       </div>`
    ).join('');

    return `<div class="dash-upcoming-day">
      <div class="dash-day-label">${label}</div>
      ${tasksHTML}
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="dash-section">
      <div class="dash-section-header">
        <span class="dash-section-title">Coming up</span>
        <span class="dash-section-link" data-nav="tasks">View all →</span>
      </div>
      <div class="dash-upcoming-grid">${daysHTML}</div>
    </div>`;

  el.querySelector('[data-nav]').addEventListener('click', () => loadPage('tasks'));
  el.querySelectorAll('.dash-upcoming-task').forEach(row => {
    row.addEventListener('click', () => loadPage('tasks'));
  });
}
