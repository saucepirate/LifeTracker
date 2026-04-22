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
    const pct = Math.round(g.progress_pct || 0);
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
