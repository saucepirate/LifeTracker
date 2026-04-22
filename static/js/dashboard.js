registerPage('dashboard', async function(content) {
  content.innerHTML = `
    <div class="dash-page">
      <div id="dash-header"></div>
      <div id="dash-stats" class="stats-row" style="grid-template-columns:repeat(4,1fr)"></div>
      <div id="dash-main" class="dash-grid"></div>
      <div id="dash-upcoming"></div>
    </div>`;

  let data;
  try {
    data = await apiFetch('GET', '/dashboard');
  } catch(e) {
    content.querySelector('.dash-page').innerHTML =
      `<div class="empty-state"><div class="empty-state-title">Couldn't load dashboard</div>
       <p class="empty-state-text">${e.message}</p></div>`;
    return;
  }

  _renderHeader(data.user_name);
  _renderStats(data.stats);
  _renderMain(data);
  _renderUpcoming(data.upcoming_tasks);
});

function _renderHeader(userName) {
  const el = document.getElementById('dash-header');
  if (!el) return;
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
  el.innerHTML = `
    <div class="dash-header">
      <h1 class="dash-greeting">${greeting()}, ${escHtml(userName)}!</h1>
      <div class="dash-date">${dateStr}</div>
    </div>`;
}

function _renderStats(stats) {
  const el = document.getElementById('dash-stats');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Due today</div>
      <div class="stat-value">${stats.due_today}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Overdue</div>
      <div class="stat-value${stats.overdue > 0 ? ' danger' : ''}">${stats.overdue}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Goals on track</div>
      <div class="stat-value">${stats.goals_on_track}<span style="font-size:14px;font-weight:400;color:var(--text-muted)"> / ${stats.active_goals}</span></div>
    </div>
    <div class="stat-card">
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
  _renderDueSoon(data.due_metrics || [], data.due_milestones || []);
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
          // Decrement stat
          const sv = document.querySelector('#dash-stats .stat-card:first-child .stat-value');
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

  body.innerHTML = goals.slice(0, 7).map(g => {
    const pct      = Math.round(g.progress_pct || 0);
    const trackCls = g.is_on_track ? 'on-track' : 'off-track';
    const activeMetrics = (g.metrics || []).filter(m => m.target_value != null);

    const metricsHTML = activeMetrics.length ? `
      <div class="dash-goal-metrics">
        ${activeMetrics.map(m => {
          const sv  = m.start_value || 0;
          const cv  = m.current_value != null ? m.current_value : sv;
          const tv  = m.target_value;
          const u   = m.unit ? ` ${escHtml(m.unit)}` : '';
          const mp  = tv !== sv ? Math.round(Math.max(0, Math.min(100, (cv - sv) / (tv - sv) * 100))) : 0;
          const overdue = m.target_date && m.target_date < todayISO();
          const dateLabel = m.target_date
            ? `<span class="dash-metric-date${overdue ? ' overdue' : ''}">${formatDateShort(m.target_date)}</span>`
            : '';
          return `
            <div class="dash-metric-row">
              <div class="dash-metric-header">
                <span class="dash-metric-label">${escHtml(m.label)}</span>
                <span class="dash-metric-value">${cv}${u} / ${tv}${u}</span>
                ${dateLabel}
              </div>
              <div class="progress-bar" style="height:4px">
                <div class="progress-fill" style="width:${mp}%"></div>
              </div>
            </div>`;
        }).join('')}
      </div>` : '';

    const pendingMilestones = (g.milestones || []).filter(m => !m.completed);
    const doneMilestones    = (g.milestones || []).filter(m => m.completed).length;
    const milestonesHTML = pendingMilestones.length ? `
      <div class="dash-goal-milestones">
        ${pendingMilestones.slice(0, 3).map(m => `
          <div class="dash-ms-row">
            <div class="dash-ms-dot"></div>
            <span class="dash-ms-title">${escHtml(m.title)}</span>
            ${m.target_date ? `<span class="dash-ms-date${m.target_date < todayISO() ? ' overdue' : ''}">${formatDateShort(m.target_date)}</span>` : ''}
          </div>`).join('')}
        ${pendingMilestones.length > 3 ? `<div style="font-size:12px;color:var(--text-muted);padding:2px 0 0 14px">+${pendingMilestones.length - 3} more</div>` : ''}
      </div>` : '';

    return `
      <div class="dash-goal-row" data-id="${g.id}">
        <div class="goal-on-track-dot ${trackCls}" title="${g.is_on_track ? 'On track' : 'Off track'}" style="margin-top:3px"></div>
        <div class="dash-goal-info">
          <div class="dash-goal-name">${escHtml(g.title)}</div>
          <div class="dash-goal-progress">
            <div class="dash-goal-bar">
              <div class="dash-goal-fill ${trackCls}" style="width:${pct}%"></div>
            </div>
            <span class="dash-goal-pct">${pct}%</span>
          </div>
          ${g.current_streak > 0 ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px">${g.current_streak} day streak${g.best_streak > g.current_streak ? ` · best ${g.best_streak}` : ''}</div>` : ''}
          ${metricsHTML}
          ${milestonesHTML}
        </div>
      </div>`;
  }).join('');

  body.querySelectorAll('.dash-goal-row').forEach(row => {
    row.addEventListener('click', () => loadPage('goals'));
  });
}

function _renderDueSoon(dueMetrics, dueMilestones) {
  if (!dueMetrics.length && !dueMilestones.length) return;

  const container = document.getElementById('dash-main');
  if (!container) return;

  const today = todayISO();

  const metricsHTML = dueMetrics.map(m => {
    const sv  = m.start_value || 0;
    const cv  = m.current_value != null ? m.current_value : sv;
    const tv  = m.target_value;
    const u   = m.unit ? ` ${escHtml(m.unit)}` : '';
    const pct = tv != null && tv !== sv
      ? Math.round(Math.max(0, Math.min(100, (cv - sv) / (tv - sv) * 100))) : 0;
    const overdue = m.target_date < today;
    return `
      <div class="dash-due-row" style="cursor:pointer" data-nav="goals">
        <div class="dash-due-meta">
          <span class="dash-due-goal">${escHtml(m.goal_title)}</span>
          <span class="dash-due-sep">·</span>
          <span class="dash-due-label">${escHtml(m.label)}</span>
        </div>
        <div class="dash-due-body">
          <div class="progress-bar" style="flex:1;height:5px">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
          <span class="dash-due-val">${cv}${u} / ${tv}${u}</span>
          <span class="dash-metric-date${overdue ? ' overdue' : ''}">${formatDateShort(m.target_date)}</span>
        </div>
      </div>`;
  }).join('');

  const milestonesHTML = dueMilestones.map(m => {
    const overdue = m.target_date < today;
    return `
      <div class="dash-due-row" style="cursor:pointer" data-nav="goals">
        <div class="dash-due-meta">
          <span class="dash-due-goal">${escHtml(m.goal_title)}</span>
          <span class="dash-due-sep">·</span>
          <span class="dash-due-label">${escHtml(m.title)}</span>
          <span style="font-size:11px;color:var(--text-muted);margin-left:4px">(milestone)</span>
        </div>
        <div class="dash-due-body">
          <span class="dash-metric-date${overdue ? ' overdue' : ''}" style="margin-left:0">${formatDateShort(m.target_date)}</span>
        </div>
      </div>`;
  }).join('');

  const section = document.createElement('div');
  section.className = 'dash-section dash-due-section';
  section.innerHTML = `
    <div class="dash-section-header">
      <span class="dash-section-title">Targets &amp; milestones due soon</span>
      <span class="dash-section-link" data-nav="goals">View goals →</span>
    </div>
    ${metricsHTML}${milestonesHTML}`;

  section.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => loadPage('goals'));
  });

  container.appendChild(section);
}

function _renderUpcoming(upcoming) {
  const el = document.getElementById('dash-upcoming');
  if (!el || !upcoming.length) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = tomorrow.toISOString().slice(0, 10);

  // Group by date
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
