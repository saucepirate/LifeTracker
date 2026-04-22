// ── Module state ─────────────────────────────────────────────
let _goals = [];
let _gTrackFilter = 'all';
let _gAreaFilters = new Set();
let _gSelectedId = null;

const GOAL_AREAS = ['Health','Fitness','Work','Finance','Personal','Learning','Home','Social','Creative'];

function _areaPickerHTML(areaStr) {
  const sel = new Set((areaStr || '').split(',').map(a => a.trim()).filter(Boolean));
  return `<div class="area-picker">${GOAL_AREAS.map(a =>
    `<button type="button" class="area-pill${sel.has(a) ? ' selected' : ''}" data-area="${a}">${a}</button>`
  ).join('')}</div>`;
}

function _getSelectedAreas(container) {
  return [...container.querySelectorAll('.area-pill.selected')].map(p => p.dataset.area).join(', ') || null;
}

function _wireAreaPills(container) {
  container.querySelectorAll('.area-pill').forEach(p =>
    p.addEventListener('click', () => p.classList.toggle('selected'))
  );
}

// ── Entry point ───────────────────────────────────────────────
registerPage('goals', async function(content) {
  _gTrackFilter = 'all';
  _gAreaFilters = new Set();
  _gSelectedId = null;

  content.innerHTML = `
    <div class="goals-shell">
      <div class="goals-main" id="goals-main">
        <div class="page-header">
          <h1 class="page-title">Goals</h1>
          <button class="btn btn-primary btn-sm" id="new-goal-btn">+ New goal</button>
        </div>
        <div id="goals-stats" class="stats-row" style="grid-template-columns:repeat(4,1fr)"></div>
        <div class="goals-filter-bar">
          <button class="btn btn-secondary btn-sm goals-filter-toggle" id="goals-filter-toggle">Filters</button>
          <div id="goals-filter-panels" style="display:none">
            <div class="filter-pills" id="goals-track-pills">
              <button class="filter-pill active" data-track="all">All</button>
              <button class="filter-pill" data-track="on-track">On track</button>
              <button class="filter-pill" data-track="off-track">Off track</button>
            </div>
            <div class="filter-pills" id="goals-area-pills">
              ${GOAL_AREAS.map(a =>
                `<button class="filter-pill" data-area="${a}">${a}</button>`
              ).join('')}
            </div>
          </div>
        </div>
        <div id="goals-grid" class="goals-grid"></div>
      </div>
      <div class="goals-detail-pane" id="goals-detail-pane"></div>
    </div>`;

  document.getElementById('new-goal-btn').addEventListener('click', openNewGoalSidebar);

  document.getElementById('goals-filter-toggle').addEventListener('click', () => {
    const panels = document.getElementById('goals-filter-panels');
    const open = panels.style.display === 'none';
    panels.style.display = open ? 'flex' : 'none';
  });

  document.getElementById('goals-track-pills').addEventListener('click', e => {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;
    _gTrackFilter = pill.dataset.track;
    document.querySelectorAll('#goals-track-pills .filter-pill').forEach(p =>
      p.classList.toggle('active', p === pill)
    );
    _updateGFilterBtn();
    renderGGrid();
  });

  document.getElementById('goals-area-pills').addEventListener('click', e => {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;
    const area = pill.dataset.area;
    if (_gAreaFilters.has(area)) {
      _gAreaFilters.delete(area);
      pill.classList.remove('active');
    } else {
      _gAreaFilters.add(area);
      pill.classList.add('active');
    }
    _updateGFilterBtn();
    renderGGrid();
  });

  await loadGoals();
  renderGAll();
  if (window._openGoalId) {
    const gid = window._openGoalId;
    window._openGoalId = null;
    openGDetail(gid);
  }
});

function _updateGFilterBtn() {
  const btn = document.getElementById('goals-filter-toggle');
  if (!btn) return;
  const n = (_gTrackFilter !== 'all' ? 1 : 0) + _gAreaFilters.size;
  btn.textContent = n > 0 ? `Filters (${n})` : 'Filters';
}

// ── Data loading ──────────────────────────────────────────────
async function loadGoals() {
  const r = await apiFetch('GET', '/goals');
  _goals = r.items;
}

// ── Render orchestration ──────────────────────────────────────
function renderGAll() {
  renderGStats();
  renderGGrid();
  if (_gSelectedId) {
    const pane = document.getElementById('goals-detail-pane');
    if (pane?.classList.contains('open')) {
      const g = _goals.find(g => g.id === _gSelectedId);
      if (g) renderGDetail(g); else closeGDetail();
    }
  }
}

function renderGStats() {
  const today = todayISO();
  const in7 = new Date(); in7.setDate(in7.getDate() + 7);
  const in7ISO = in7.toISOString().slice(0, 10);

  const active   = _goals.filter(g => g.status === 'active').length;
  const onTrack  = _goals.filter(g => g.status === 'active' && g.is_on_track).length;

  let upcoming = 0, overdueMsCount = 0;
  _goals.forEach(g => {
    (g.milestones || []).forEach(m => {
      if (m.completed) return;
      if (m.target_date && m.target_date < today) overdueMsCount++;
      else if (m.target_date && m.target_date >= today && m.target_date <= in7ISO) upcoming++;
    });
  });

  document.getElementById('goals-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Active goals</div><div class="stat-value">${active}</div></div>
    <div class="stat-card"><div class="stat-label">On track</div><div class="stat-value">${onTrack}</div></div>
    <div class="stat-card"><div class="stat-label">Milestones due soon</div><div class="stat-value">${upcoming}</div></div>
    <div class="stat-card"><div class="stat-label">Overdue milestones</div><div class="stat-value${overdueMsCount > 0 ? ' danger' : ''}">${overdueMsCount}</div></div>`;
}

function renderGGrid() {
  const grid = document.getElementById('goals-grid');
  if (!grid) return;

  let filtered = _goals;

  switch (_gTrackFilter) {
    case 'on-track':  filtered = filtered.filter(g => g.status === 'active' && g.is_on_track); break;
    case 'off-track': filtered = filtered.filter(g => g.status === 'active' && !g.is_on_track); break;
  }

  if (_gAreaFilters.size) {
    filtered = filtered.filter(g => {
      const gAreas = (g.area || '').split(',').map(a => a.trim()).filter(Boolean);
      return [..._gAreaFilters].some(a => gAreas.includes(a));
    });
  }

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:48px 0">
      <div class="empty-state-title">No goals here</div>
      <p class="empty-state-text">Create a goal to start tracking your progress.</p>
    </div>`;
    return;
  }

  filtered.sort((a, b) => (b.pinned || 0) - (a.pinned || 0));

  grid.innerHTML = filtered.map(goalCardHTML).join('');

  grid.querySelectorAll('.goal-card').forEach(card => {
    card.addEventListener('click', () => openGDetail(parseInt(card.dataset.id)));
  });

  grid.querySelectorAll('.goal-pin-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const gid = parseInt(btn.dataset.id);
      const g = _goals.find(g => g.id === gid);
      if (!g) return;
      const updated = await apiFetch('PUT', `/goals/${gid}`, { pinned: g.pinned ? 0 : 1 });
      const idx = _goals.findIndex(g => g.id === gid);
      if (idx >= 0) _goals[idx] = updated;
      renderGGrid();
    });
  });
}

// ── Goal card HTML ────────────────────────────────────────────
function goalCardHTML(g) {
  const isDone     = g.status !== 'active';
  const onTrackKey = isDone ? 'neutral' : (g.is_on_track ? 'on-track' : 'off-track');
  const onTrackLabel = isDone ? capitalize(g.status) : (g.is_on_track ? 'On track' : 'Off track');
  const pct = Math.round(g.progress_pct || 0);

  // ── Tracking sections (all applicable) ────────────────────
  const cardSections = [];

  if ((g.habits || []).length > 0) {
    const weekAgoISO = (() => { const d = new Date(); d.setDate(d.getDate()-7); return d.toISOString().slice(0,10); })();
    const allLogDates = (g.habits || []).flatMap(h => (h.log_entries || []).map(e => e.logged_at.slice(0,10)));
    const statLines = (g.habits || []).map(h => {
      const thisWeek = (h.log_entries || []).filter(e => e.logged_at.slice(0,10) >= weekAgoISO);
      const weekMin  = Math.round(thisWeek.reduce((s, e) => s + (e.value || 0), 0));
      const weekDays = new Set(thisWeek.map(e => e.logged_at.slice(0,10))).size;
      const parts = [];
      if (h.weekly_target_minutes) parts.push(`${parseFloat((weekMin/60).toFixed(2))}/${parseFloat((h.weekly_target_minutes/60).toFixed(2))}hrs`);
      if (h.min_days_per_week)      parts.push(`${weekDays}/${h.min_days_per_week}d`);
      return `<span style="font-size:13px;color:var(--text-secondary)">${escHtml(h.label)}${parts.length ? ': ' + parts.join(' · ') : ''}</span>`;
    });
    const streakLabel = g.current_streak > 0 ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px">${g.current_streak} day streak${g.best_streak > g.current_streak ? ` · best ${g.best_streak}` : ''}</div>` : '';
    cardSections.push(`
      <div style="display:flex;flex-direction:column;gap:2px;margin-bottom:4px">${statLines.join('')}</div>
      ${streakDotsHTML(allLogDates)}
      ${streakLabel}`);
  } else if (g.weekly_target_minutes || g.min_days_per_week) {
    // Legacy fallback
    const weekAgoISO = (() => { const d = new Date(); d.setDate(d.getDate()-7); return d.toISOString().slice(0,10); })();
    const thisWeek = (g.log_entries || []).filter(e => e.logged_at.slice(0,10) >= weekAgoISO);
    const weekMin  = Math.round(thisWeek.reduce((s, e) => s + (e.value || 0), 0));
    const weekDays = new Set(thisWeek.map(e => e.logged_at.slice(0,10))).size;
    const statParts = [];
    if (g.weekly_target_minutes) statParts.push(`${parseFloat((weekMin/60).toFixed(2))} / ${parseFloat((g.weekly_target_minutes/60).toFixed(2))} hrs`);
    if (g.min_days_per_week) statParts.push(`${weekDays} / ${g.min_days_per_week} days`);
    const loggedDates = (g.log_entries || []).map(e => e.logged_at.slice(0,10));
    const streakLabelLegacy = g.current_streak > 0 ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px">${g.current_streak} day streak${g.best_streak > g.current_streak ? ` · best ${g.best_streak}` : ''}</div>` : '';
    cardSections.push(`
      ${statParts.length ? `<div class="goal-card-habit-stats">${statParts.join(' · ')}<span class="goal-card-stats-label"> this week</span></div>` : ''}
      ${streakDotsHTML(loggedDates)}
      ${streakLabelLegacy}`);
  }

  const metricsToShow = (g.metrics || []).filter(m => m.target_value != null && !m.completed);
  if (metricsToShow.length > 0) {
    cardSections.push(metricsToShow.map(m => {
      const sv  = m.start_value ?? 0;
      const cv  = m.current_value ?? sv;
      const tv  = m.target_value;
      const u   = m.unit ? ` ${escHtml(m.unit)}` : '';
      const pct = tv !== sv ? Math.round(Math.max(0, Math.min(100, (cv - sv) / (tv - sv) * 100))) : 0;
      return `
        <div style="margin-bottom:5px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px">
            <span style="font-size:13px;color:var(--text-muted)">${escHtml(m.label)}${m.target_date ? ` <span style="font-size:12px">· ${formatDateShort(m.target_date)}</span>` : ''}</span>
            <span style="font-size:13px;color:var(--text-secondary)">${cv}${u} / ${tv}${u}</span>
          </div>
          <div style="height:3px;background:var(--bg-hover);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:var(--color-goals);border-radius:2px"></div>
          </div>
        </div>`;
    }).join(''));
  } else if (g.target_value != null) {
    const cv = g.current_value ?? g.start_value ?? 0;
    const u  = g.unit ? ` ${escHtml(g.unit)}` : '';
    cardSections.push(`
      <div class="goal-card-numeric-display">
        <span class="goal-card-numeric-current">${cv}${u}</span>
        <span class="goal-card-numeric-sep">of</span>
        <span class="goal-card-numeric-target">${g.target_value}${u}</span>
      </div>`);
  }

  if ((g.milestones || []).length > 0) {
    const shown = g.milestones.slice(0, 3);
    const extra = g.milestones.length > 3
      ? `<div style="font-size:13px;color:var(--text-muted);padding:2px 0">+${g.milestones.length - 3} more</div>` : '';
    cardSections.push(
      shown.map(m => `
        <div class="goal-card-milestone-row">
          <div class="goal-card-ms-check${m.completed ? ' done' : ''}"></div>
          <span class="goal-card-ms-title${m.completed ? ' done' : ''}">${escHtml(m.title)}</span>
          ${m.target_date ? `<span class="goal-card-ms-date">${formatDateShort(m.target_date)}</span>` : ''}
        </div>`).join('') + extra
    );
  }

  const typeSection = cardSections.length
    ? `<div class="goal-card-type-section">${cardSections.join('<div style="height:1px;background:rgba(0,0,0,0.06);margin:6px 0"></div>')}</div>`
    : '';

  // ── Pending / recent tasks ─────────────────────────────────
  const pendingTasks = (g.pending_tasks || []);
  const recentDone   = (g.recent_tasks  || []).slice(0, 1);
  let tasksSection = '';
  if (pendingTasks.length || recentDone.length) {
    tasksSection = `<div class="goal-card-tasks">
      ${pendingTasks.map(t => `
        <div class="goal-card-task-row">
          ${priorityDotHTML(t.priority)}
          <span class="goal-card-task-title">${escHtml(t.title)}</span>
          ${t.due_date ? `<span class="goal-card-task-due">${formatDateShort(t.due_date)}</span>` : ''}
        </div>`).join('')}
      ${recentDone.map(t => `
        <div class="goal-card-task-row completed">
          <span class="goal-card-task-check">✓</span>
          <span class="goal-card-task-title">${escHtml(t.title)}</span>
          ${t.completed_at ? `<span class="goal-card-task-due">${formatDateShort(t.completed_at.slice(0,10))}</span>` : ''}
        </div>`).join('')}
    </div>`;
  }

  // ── Footer ─────────────────────────────────────────────────
  let footer = '';
  if (g.target_date) {
    const daysLeft = Math.ceil(
      (new Date(g.target_date + 'T00:00:00') - new Date(todayISO() + 'T00:00:00')) / 86400000
    );
    const dayLabel = daysLeft > 0 ? `${daysLeft}d left`
      : daysLeft === 0 ? 'Due today'
      : `${Math.abs(daysLeft)}d overdue`;
    const dayClass = daysLeft < 0 ? 'overdue' : daysLeft <= 7 ? 'today-due' : '';
    footer = `<div class="goal-card-footer">
      <span>${formatDateShort(g.target_date)}</span>
      <span class="due-label ${dayClass}" style="font-size:12px">${dayLabel}</span>
    </div>`;
  }

  const typeBadge = `<span class="goal-type-badge">${capitalize(g.goal_type)}</span>`;
  const areaBadges = (g.area || '').split(',').map(a => a.trim()).filter(Boolean)
    .map(a => `<span class="tag-badge tag-gray" style="font-size:12px">${escHtml(a)}</span>`).join('');

  return `
    <div class="goal-card${isDone ? ' goal-card-done' : ''}${_gSelectedId === g.id ? ' selected' : ''}" data-id="${g.id}">
      <div class="goal-card-top">
        <div class="goal-on-track-dot ${onTrackKey}" title="${onTrackLabel}"></div>
        <div style="flex:1;min-width:0">
          <div class="goal-card-title">${escHtml(g.title)}</div>
          <div class="goal-card-badges" style="margin-top:4px">${typeBadge}${areaBadges}</div>
        </div>
        <button class="goal-pin-btn${g.pinned ? ' pinned' : ''}" data-id="${g.id}" title="${g.pinned ? 'Unpin' : 'Pin'}">📌</button>
      </div>
      ${g.description ? `<div class="goal-card-desc">${escHtml(g.description)}</div>` : ''}
      <div class="goal-progress-wrap">
        <div class="goal-progress-bar">
          <div class="goal-progress-fill ${onTrackKey}" style="width:${pct}%"></div>
        </div>
        <span class="goal-progress-label">${pct}%</span>
      </div>
      ${typeSection}
      ${tasksSection}
      ${footer}
    </div>`;
}

// ── Detail panel ──────────────────────────────────────────────
function openGDetail(goalId) {
  _gSelectedId = goalId;
  document.querySelectorAll('.goal-card').forEach(c =>
    c.classList.toggle('selected', parseInt(c.dataset.id) === goalId)
  );
  const g = _goals.find(g => g.id === goalId);
  if (g) renderGDetail(g);
}

function closeGDetail() {
  _gSelectedId = null;
  document.querySelectorAll('.goal-card.selected').forEach(c => c.classList.remove('selected'));
  const pane = document.getElementById('goals-detail-pane');
  if (pane) { pane.classList.remove('open'); pane.innerHTML = ''; }
}

function renderGDetail(g) {
  const pane = document.getElementById('goals-detail-pane');
  if (!pane) return;
  pane.classList.add('open');

  const isDone = g.status !== 'active';
  const onTrackKey = isDone ? 'neutral' : (g.is_on_track ? 'on-track' : 'off-track');
  const onTrackLabel = isDone ? capitalize(g.status) : (g.is_on_track ? '✓ On track' : '⚠ Off track');
  const pct = Math.round(g.progress_pct || 0);

  pane.innerHTML = `
    <div class="detail-panel">
      <div class="detail-header">
        <textarea class="detail-title-input" id="d-g-title" rows="1">${escHtml(g.title)}</textarea>
        <button class="detail-close-btn" id="d-g-close">×</button>
      </div>
      <div class="detail-body">
        <div class="goal-detail-progress">
          <div class="goal-progress-bar" style="height:8px;margin-bottom:5px">
            <div class="goal-progress-fill ${onTrackKey}" style="width:${pct}%"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-muted)">
            <span>${onTrackLabel}</span>
            <span>${pct}% complete</span>
          </div>
          ${g.current_streak > 0 ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">🔥 ${g.current_streak} day streak${g.best_streak > g.current_streak ? ` · best ${g.best_streak}` : ''}</div>` : ''}
        </div>

        <div class="detail-grid">
          <div class="detail-field">
            <div class="detail-field-label">Status</div>
            <select id="d-g-status">
              <option value="active"${g.status === 'active' ? ' selected' : ''}>Active</option>
              <option value="completed"${g.status === 'completed' ? ' selected' : ''}>Completed</option>
              <option value="abandoned"${g.status === 'abandoned' ? ' selected' : ''}>Abandoned</option>
            </select>
          </div>
          <div class="detail-field">
            <div class="detail-field-label">Target date</div>
            <input type="date" id="d-g-target-date" value="${g.target_date || ''}">
          </div>
          <div class="detail-field" style="grid-column:1/-1">
            <div class="detail-field-label">Area</div>
            ${_areaPickerHTML(g.area)}
          </div>
        </div>

        <div class="detail-section-title">Description</div>
        <textarea class="detail-notes" id="d-g-description" placeholder="Describe your goal…" style="margin-bottom:14px">${escHtml(g.description || '')}</textarea>

        ${_goalDetailSectionsHTML(g)}

        <div class="divider"></div>
        <div class="detail-section-title">History</div>
        <div class="goal-log-history" id="d-g-log-history"></div>

        ${g.recent_tasks?.length ? `
          <div class="divider"></div>
          <div class="detail-section-title">Related tasks</div>
          <div>
            ${g.recent_tasks.map(t => `
              <div style="font-size:13px;padding:4px 0;border-bottom:var(--border-subtle);color:var(--text-secondary)">
                ✓ ${escHtml(t.title)}
                <span style="color:var(--text-muted);float:right">${t.completed_at ? formatDateShort(t.completed_at.slice(0,10)) : ''}</span>
              </div>`).join('')}
          </div>` : ''}

        ${(g.notes || []).length ? `
          <div class="divider"></div>
          <div class="detail-section-title">Linked notes</div>
          <div id="d-g-linked-notes">
            ${g.notes.map(n => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:var(--border-subtle)">
                <span style="font-size:13px;color:var(--text-secondary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(n.title)}</span>
                <button class="btn btn-secondary btn-sm" data-note-id="${n.id}" style="padding:2px 8px;font-size:12px;flex-shrink:0;margin-left:8px">Open →</button>
              </div>`).join('')}
          </div>` : ''}
      </div>
      <div class="detail-footer">
        <button class="btn btn-danger btn-sm" id="d-g-delete">Delete</button>
        <div style="display:flex;gap:8px">
          ${g.status === 'active' && (g.metrics || []).some(m => m.target_value != null)
            ? `<button class="btn btn-success btn-sm" id="d-g-complete">✓ Complete</button>` : ''}
          <button class="btn btn-secondary btn-sm" id="d-g-add-task">+ Task</button>
          <button class="btn btn-primary btn-sm" id="d-g-save">Save</button>
        </div>
      </div>
    </div>`;

  _wireAreaPills(pane);

  pane.querySelectorAll('#d-g-linked-notes [data-note-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      window._openNoteId = parseInt(btn.dataset.noteId);
      loadPage('notes');
    });
  });

  autoResizeTextarea(pane.querySelector('#d-g-title'));
  pane.querySelector('#d-g-title').addEventListener('input', e => autoResizeTextarea(e.target));
  pane.querySelector('#d-g-close').addEventListener('click', closeGDetail);
  pane.querySelector('#d-g-save').addEventListener('click', () => saveGDetail(g.id));
  pane.querySelector('#d-g-delete').addEventListener('click', () => {
    if (confirm(`Delete "${g.title}"?`)) doDeleteGoal(g.id);
  });
  pane.querySelector('#d-g-complete')?.addEventListener('click', () => doCompleteGoal(g.id));
  pane.querySelector('#d-g-add-task').addEventListener('click', () => openQuickTaskForGoal(g.id, g.title));

  renderGLogHistory(g);
  renderGHabits(g.habits || [], g.id);
  pane.querySelector('#d-g-h-toggle')?.addEventListener('click', () => {
    const form = pane.querySelector('#d-g-h-add-form');
    const btn  = pane.querySelector('#d-g-h-toggle');
    const open = form.style.display === 'none';
    form.style.display = open ? 'block' : 'none';
    btn.textContent = open ? '− Add habit' : '+ Add habit';
    if (open) pane.querySelector('#d-g-h-label')?.focus();
  });
  pane.querySelector('#d-g-h-add')?.addEventListener('click', () => doAddHabit(g.id));
  renderGMetrics(g.metrics || [], g.id, g.milestones || []);
  pane.querySelector('#d-g-m-toggle')?.addEventListener('click', () => {
    const form = pane.querySelector('#d-g-m-add-form');
    const btn  = pane.querySelector('#d-g-m-toggle');
    const open = form.style.display === 'none';
    form.style.display = open ? 'block' : 'none';
    btn.textContent = open ? '− Add target' : '+ Add target';
    if (open) pane.querySelector('#d-g-m-label')?.focus();
  });
  pane.querySelector('#d-g-m-add')?.addEventListener('click', () => doAddMetric(g.id));

  renderGMilestones(g.milestones || [], g.id, g.metrics || []);
  pane.querySelector('#d-g-ms-toggle')?.addEventListener('click', () => {
    const form = pane.querySelector('#d-g-ms-add-form');
    const btn  = pane.querySelector('#d-g-ms-toggle');
    const open = form.style.display === 'none';
    form.style.display = open ? 'block' : 'none';
    btn.textContent = open ? '− Add milestone' : '+ Add milestone';
    if (open) pane.querySelector('#d-g-ms-title')?.focus();
  });
  pane.querySelector('#d-g-ms-add')?.addEventListener('click', () => doAddMilestone(g.id));
  pane.querySelector('#d-g-ms-title')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doAddMilestone(g.id); }
  });
}

function _goalDetailSectionsHTML(g) {
  return `
    <div class="divider"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div class="detail-section-title" style="margin-bottom:0">Habits</div>
      <button class="btn btn-secondary btn-sm" id="d-g-h-toggle">+ Add habit</button>
    </div>
    <div class="goal-habits-list" id="d-g-habits"></div>
    <div id="d-g-h-add-form" style="display:none;padding:10px;background:var(--bg-hover);border-radius:var(--radius-el);margin-top:8px">
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:6px;margin-bottom:8px">
        <input class="form-input" id="d-g-h-label" placeholder="Label (e.g. Running)" style="font-size:13px">
        <input class="form-input" type="number" step="0.25" id="d-g-h-weekly-min" placeholder="Hrs/week" style="font-size:13px">
        <input class="form-input" type="number" id="d-g-h-min-days" placeholder="Days/week" min="1" max="7" style="font-size:13px">
      </div>
      <button class="btn btn-primary btn-sm" id="d-g-h-add">Add habit</button>
    </div>

    <div class="divider"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div class="detail-section-title" style="margin-bottom:0">Numeric targets</div>
      <button class="btn btn-secondary btn-sm" id="d-g-m-toggle">+ Add target</button>
    </div>
    <div class="goal-metrics-list" id="d-g-metrics"></div>
    <div id="d-g-m-add-form" style="display:none;padding:10px;background:var(--bg-hover);border-radius:var(--radius-el);margin-top:8px">
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:6px;margin-bottom:8px">
        <input class="form-input" id="d-g-m-label" placeholder="Label" style="font-size:13px">
        <input class="form-input" type="number" id="d-g-m-start" placeholder="Start" style="font-size:13px">
        <input class="form-input" type="number" id="d-g-m-target" placeholder="Target" style="font-size:13px">
        <input class="form-input" id="d-g-m-unit" placeholder="Unit" style="font-size:13px">
      </div>
      <div style="margin-bottom:8px">
        <input type="date" id="d-g-m-date" style="width:100%;font-size:13px;padding:5px 8px;border:var(--border-subtle);border-radius:var(--radius-el);background:var(--bg-input);outline:none" title="Due date (optional)">
      </div>
      ${(g.milestones || []).length ? `<div style="margin-bottom:8px">
        <select id="d-g-m-milestone" class="form-input" style="width:100%;font-size:13px">
          <option value="">Link to milestone (optional)</option>
          ${(g.milestones || []).filter(ms => !ms.completed).map(ms => `<option value="${ms.id}">${escHtml(ms.title)}</option>`).join('')}
        </select>
      </div>` : ''}
      <button class="btn btn-primary btn-sm" id="d-g-m-add">Add target</button>
    </div>

    <div class="divider"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div class="detail-section-title" style="margin-bottom:0">Milestones</div>
      <button class="btn btn-secondary btn-sm" id="d-g-ms-toggle">+ Add milestone</button>
    </div>
    <div class="goal-milestone-list" id="d-g-milestones"></div>
    <div id="d-g-ms-add-form" style="display:none;padding:10px;background:var(--bg-hover);border-radius:var(--radius-el);margin-top:8px">
      <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;align-items:center">
        <input class="form-input" id="d-g-ms-title" placeholder="Milestone title…" style="flex:2;min-width:140px;font-size:13px">
        <input type="date" id="d-g-ms-date" style="flex:1;min-width:110px;font-size:13px;padding:5px 8px;border:var(--border-subtle);border-radius:var(--radius-el);background:var(--bg-input);outline:none">
      </div>
      <button class="btn btn-primary btn-sm" id="d-g-ms-add">Add milestone</button>
    </div>`;
}

function renderGMilestones(milestones, goalId, metrics) {
  metrics = metrics || [];
  const container = document.getElementById('d-g-milestones');
  if (!container) return;
  if (!milestones.length) {
    container.innerHTML = `<div style="font-size:13px;color:var(--text-muted);padding:6px 0">No milestones yet</div>`;
    return;
  }

  container.innerHTML = milestones.map(m => {
    const linkedMetrics = metrics.filter(met => met.milestone_id === m.id);

    let linkedMetricsHTML = '';
    if (linkedMetrics.length) {
      linkedMetricsHTML = `<div class="goal-ms-linked-metrics">` + linkedMetrics.map(met => {
        const sv  = met.start_value || 0;
        const tv  = met.target_value;
        const cv  = met.current_value != null ? met.current_value : sv;
        const u   = met.unit ? ` ${escHtml(met.unit)}` : '';
        const pct = tv != null && tv !== sv
          ? Math.max(0, Math.min(100, ((cv - sv) / (tv - sv)) * 100)) : null;
        return `<div class="goal-ms-linked-metric-item">
          <span class="goal-ms-linked-metric-label">${escHtml(met.label)}</span>
          <span class="goal-ms-linked-metric-val">${cv}${u}${tv != null ? ` / ${tv}${u}` : ''}</span>
          ${pct !== null ? `<div class="progress-bar" style="height:3px;margin-top:2px"><div class="progress-fill${met.completed ? ' goal-metric-bar-done' : ''}" style="width:${Math.round(pct)}%"></div></div>` : ''}
        </div>`;
      }).join('') + `</div>`;
    }

    const metricCheckboxes = metrics.length ? `
      <div style="margin-top:8px">
        <div style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:.05em;margin-bottom:5px">LINKED TARGETS</div>
        ${metrics.map(met => `
          <label class="goal-ms-metric-checkbox-row">
            <input type="checkbox" class="ms-linked-metric-cb" data-met-id="${met.id}" ${met.milestone_id === m.id ? 'checked' : ''}>
            <span>${escHtml(met.label)}${met.target_value != null ? `<span style="color:var(--text-muted)"> (${met.current_value ?? met.start_value ?? 0}${met.unit ? ' '+escHtml(met.unit) : ''} / ${met.target_value}${met.unit ? ' '+escHtml(met.unit) : ''})</span>` : ''}</span>
          </label>`).join('')}
      </div>` : '';

    return `
    <div class="goal-milestone-row" data-ms-id="${m.id}">
      <div class="checkbox-square${m.completed ? ' checked' : ''}" data-ms-id="${m.id}" style="flex-shrink:0;margin-top:3px"></div>
      <div class="goal-ms-body">
        <div class="goal-ms-main">
          <span class="goal-milestone-title${m.completed ? ' done' : ''}">${escHtml(m.title)}</span>
          ${m.target_date ? `<span class="goal-milestone-date"> · ${formatDateShort(m.target_date)}</span>` : ''}
        </div>
        ${linkedMetricsHTML}
        <div class="goal-ms-edit-form" data-ms-id="${m.id}" style="display:none;margin-top:8px;padding:8px;background:var(--bg-hover);border-radius:var(--radius-el)">
          <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
            <input class="form-input ms-edit-title" value="${escHtml(m.title)}" style="flex:2;min-width:140px;font-size:13px">
            <input type="date" class="ms-edit-date" value="${m.target_date || ''}" style="flex:1;min-width:110px;font-size:13px;padding:5px 8px;border:var(--border-subtle);border-radius:var(--radius-el);background:var(--bg-input);outline:none">
          </div>
          ${metricCheckboxes}
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="btn btn-primary btn-sm ms-edit-save" data-ms-id="${m.id}">Save</button>
            <button class="btn btn-secondary btn-sm ms-edit-cancel" data-ms-id="${m.id}">Cancel</button>
          </div>
        </div>
      </div>
      <button class="goal-ms-edit-btn" data-ms-id="${m.id}">Edit</button>
      <button class="goal-milestone-delete" data-ms-id="${m.id}">×</button>
    </div>`;
  }).join('');

  container.querySelectorAll('.checkbox-square').forEach(cb => {
    cb.addEventListener('click', async () => {
      const msId = parseInt(cb.dataset.msId);
      const ms = milestones.find(m => m.id === msId);
      if (ms) await doToggleMilestone(goalId, msId, ms.completed);
    });
  });

  container.querySelectorAll('.goal-ms-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const msId = btn.dataset.msId;
      const form = container.querySelector(`.goal-ms-edit-form[data-ms-id="${msId}"]`);
      if (!form) return;
      const isOpen = form.style.display !== 'none';
      form.style.display = isOpen ? 'none' : 'block';
      btn.textContent = isOpen ? 'Edit' : 'Done';
      if (!isOpen) form.querySelector('.ms-edit-title')?.focus();
    });
  });

  container.querySelectorAll('.ms-edit-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      const msId = btn.dataset.msId;
      const form = container.querySelector(`.goal-ms-edit-form[data-ms-id="${msId}"]`);
      const editBtn = container.querySelector(`.goal-ms-edit-btn[data-ms-id="${msId}"]`);
      if (form) form.style.display = 'none';
      if (editBtn) editBtn.textContent = 'Edit';
    });
  });

  container.querySelectorAll('.ms-edit-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const msId = parseInt(btn.dataset.msId);
      const form = container.querySelector(`.goal-ms-edit-form[data-ms-id="${msId}"]`);
      if (!form) return;
      const title = form.querySelector('.ms-edit-title').value.trim();
      if (!title) { alert('Title is required.'); return; }
      const targetDate = form.querySelector('.ms-edit-date').value || null;
      const payload = { title };
      if (targetDate) payload.target_date = targetDate;
      else payload.clear_target_date = true;

      try {
        // Update milestone title/date
        const updatedGoal = await apiFetch('PUT', `/goals/${goalId}/milestones/${msId}`, payload);

        // Update metric associations from checkboxes
        const checkedIds   = [...form.querySelectorAll('.ms-linked-metric-cb:checked')].map(cb => parseInt(cb.dataset.metId));
        const uncheckedIds = [...form.querySelectorAll('.ms-linked-metric-cb:not(:checked)')].map(cb => parseInt(cb.dataset.metId));
        const metricUpdates = [];
        for (const metId of checkedIds) {
          const met = metrics.find(m => m.id === metId);
          if (!met || met.milestone_id !== msId) {
            metricUpdates.push(apiFetch('PUT', `/goals/${goalId}/metrics/${metId}`, { milestone_id: msId }));
          }
        }
        for (const metId of uncheckedIds) {
          const met = metrics.find(m => m.id === metId);
          if (met && met.milestone_id === msId) {
            metricUpdates.push(apiFetch('PUT', `/goals/${goalId}/metrics/${metId}`, { clear_milestone_id: true }));
          }
        }
        if (metricUpdates.length) await Promise.all(metricUpdates);

        const final = metricUpdates.length ? await apiFetch('GET', `/goals/${goalId}`) : updatedGoal;
        _updateGoal(final);
        renderGAll();
      } catch(e) { alert('Error: ' + e.message); }
    });
  });

  container.querySelectorAll('.goal-milestone-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const msId = parseInt(btn.dataset.msId);
      if (confirm('Delete this milestone?')) await doDeleteMilestone(goalId, msId);
    });
  });
}

function renderGHabits(habits, goalId) {
  const container = document.getElementById('d-g-habits');
  if (!container) return;
  if (!habits.length) {
    container.innerHTML = `<div style="font-size:14px;color:var(--text-muted);padding:6px 0">No habits yet — add one below.</div>`;
    return;
  }

  container.innerHTML = habits.map(h => {
    const weekAgoISO = (() => { const d = new Date(); d.setDate(d.getDate()-7); return d.toISOString().slice(0,10); })();
    const thisWeek = (h.log_entries || []).filter(e => e.logged_at.slice(0,10) >= weekAgoISO);
    const weekMin  = Math.round(thisWeek.reduce((s, e) => s + (e.value || 0), 0));
    const weekDays = new Set(thisWeek.map(e => e.logged_at.slice(0,10))).size;

    const statParts = [];
    if (h.weekly_target_minutes) statParts.push(`${parseFloat((weekMin/60).toFixed(2))} / ${parseFloat((h.weekly_target_minutes/60).toFixed(2))} hrs`);
    if (h.min_days_per_week)      statParts.push(`${weekDays} / ${h.min_days_per_week} days`);

    const loggedDates = (h.log_entries || []).map(e => e.logged_at.slice(0,10));

    const recentHTML = (h.log_entries || []).slice(0, 5).map(e => `
      <div class="goal-log-entry" style="font-size:13px" data-entry-id="${e.id}">
        <div>
          <span style="font-weight:500">${e.value != null ? parseFloat((e.value/60).toFixed(2)) + ' hrs' : '—'}</span>
          ${e.note ? `<span style="color:var(--text-muted)"> · ${escHtml(e.note)}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <span style="color:var(--text-muted)">${formatDateShort(e.logged_at.slice(0,10))}</span>
          <button class="goal-log-delete habit-log-del" data-entry-id="${e.id}" data-hid="${h.id}">×</button>
        </div>
      </div>`).join('');

    return `
      <div class="goal-habit-row" data-hid="${h.id}">
        <div class="goal-habit-header">
          <div class="goal-habit-label">${escHtml(h.label)}</div>
          <div style="display:flex;gap:4px">
            <button class="goal-metric-btn goal-h-edit-btn" data-hid="${h.id}">Edit</button>
            <button class="goal-metric-del goal-h-del-btn" data-hid="${h.id}">×</button>
          </div>
        </div>
        ${statParts.length ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px">${statParts.join(' · ')}<span style="color:var(--text-muted)"> this week</span></div>` : ''}
        ${streakDotsHTML(loggedDates)}
        <div class="goal-habit-inline-form" data-hid="${h.id}" style="display:none;padding:8px;background:var(--bg-card);border-radius:var(--radius-el);margin:6px 0;border:var(--border-subtle)">
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:6px;margin-bottom:6px">
            <input class="form-input hf-label" placeholder="Label" value="${escHtml(h.label)}" style="font-size:13px">
            <input class="form-input hf-weekly-min" type="number" step="0.25" placeholder="Hrs/week" value="${h.weekly_target_minutes != null ? parseFloat((h.weekly_target_minutes/60).toFixed(2)) : ''}" style="font-size:13px">
            <input class="form-input hf-min-days" type="number" placeholder="Days/week" value="${h.min_days_per_week ?? ''}" min="1" max="7" style="font-size:13px">
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-primary btn-sm hf-save" data-hid="${h.id}">Save</button>
            <button class="btn btn-secondary btn-sm hf-cancel" data-hid="${h.id}">Cancel</button>
          </div>
        </div>
        <div class="goal-habit-log" data-hid="${h.id}" style="margin-top:6px">
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
            <input type="date" class="hf-log-date" value="${todayISO()}" style="width:130px;font-size:13px;padding:5px 6px;border:var(--border-subtle);border-radius:var(--radius-el);background:var(--bg-input);outline:none;flex-shrink:0">
            <input type="number" step="0.25" class="form-input hf-log-value" placeholder="Hours" style="width:80px;font-size:13px;flex-shrink:0">
            <input class="form-input hf-log-note" placeholder="Note…" style="flex:1;min-width:0;font-size:13px">
            <button class="btn btn-primary btn-sm hf-log-btn" data-hid="${h.id}">Log</button>
          </div>
          <div class="goal-habit-log-history">${recentHTML}</div>
        </div>
      </div>`;
  }).join('');

  // Edit toggle
  container.querySelectorAll('.goal-h-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const hid = btn.dataset.hid;
      const form = container.querySelector(`.goal-habit-inline-form[data-hid="${hid}"]`);
      if (!form) return;
      const isOpen = form.style.display !== 'none';
      form.style.display = isOpen ? 'none' : 'block';
      btn.textContent = isOpen ? 'Edit' : 'Done';
      if (!isOpen) form.querySelector('.hf-label')?.focus();
    });
  });

  // Cancel edit
  container.querySelectorAll('.hf-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      const hid = btn.dataset.hid;
      const form = container.querySelector(`.goal-habit-inline-form[data-hid="${hid}"]`);
      const editBtn = container.querySelector(`.goal-h-edit-btn[data-hid="${hid}"]`);
      if (form) form.style.display = 'none';
      if (editBtn) editBtn.textContent = 'Edit';
    });
  });

  // Save edit
  container.querySelectorAll('.hf-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const hid = parseInt(btn.dataset.hid);
      const form = container.querySelector(`.goal-habit-inline-form[data-hid="${hid}"]`);
      if (!form) return;
      const label   = form.querySelector('.hf-label').value.trim();
      const wmHrs   = parseFloat(form.querySelector('.hf-weekly-min').value);
      const md      = parseInt(form.querySelector('.hf-min-days').value);
      const payload = {};
      if (label) payload.label = label;
      if (!isNaN(wmHrs)) payload.weekly_target_minutes = Math.round(wmHrs * 60);
      if (!isNaN(md)) payload.min_days_per_week = md;
      try {
        const updated = await apiFetch('PUT', `/goals/${goalId}/habits/${hid}`, payload);
        _updateGoal(updated);
        renderGStats(); renderGGrid();
        const pane = document.getElementById('goals-detail-pane');
        if (pane?.classList.contains('open')) renderGDetail(updated);
      } catch(e) { alert('Error: ' + e.message); }
    });
  });

  // Delete habit
  container.querySelectorAll('.goal-h-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const hid = parseInt(btn.dataset.hid);
      if (!confirm('Delete this habit?')) return;
      try {
        await apiFetch('DELETE', `/goals/${goalId}/habits/${hid}`);
        const updated = await apiFetch('GET', `/goals/${goalId}`);
        _updateGoal(updated);
        renderGStats(); renderGGrid();
        const pane = document.getElementById('goals-detail-pane');
        if (pane?.classList.contains('open')) renderGDetail(updated);
      } catch(e) { alert('Error: ' + e.message); }
    });
  });

  // Log entry
  container.querySelectorAll('.hf-log-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const hid = parseInt(btn.dataset.hid);
      const logSection = container.querySelector(`.goal-habit-log[data-hid="${hid}"]`);
      if (!logSection) return;
      const valueHrs = parseFloat(logSection.querySelector('.hf-log-value').value);
      const note  = logSection.querySelector('.hf-log-note').value.trim() || null;
      const logDate = logSection.querySelector('.hf-log-date').value || null;
      if (isNaN(valueHrs) && !note) { alert('Enter a value to log.'); return; }
      try {
        const updated = await apiFetch('POST', `/goals/${goalId}/log`, {
          value: isNaN(valueHrs) ? null : Math.round(valueHrs * 60),
          note,
          logged_at: logDate || null,
          habit_id: hid,
        });
        logSection.querySelector('.hf-log-value').value = '';
        logSection.querySelector('.hf-log-note').value  = '';
        _updateGoal(updated);
        renderGStats(); renderGGrid();
        const pane = document.getElementById('goals-detail-pane');
        if (pane?.classList.contains('open')) renderGDetail(updated);
      } catch(e) { alert('Error: ' + e.message); }
    });
  });

  // Delete log entry
  container.querySelectorAll('.habit-log-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const entryId = parseInt(btn.dataset.entryId);
      try {
        await apiFetch('DELETE', `/goals/${goalId}/log/${entryId}`);
        const updated = await apiFetch('GET', `/goals/${goalId}`);
        _updateGoal(updated);
        renderGStats(); renderGGrid();
        const pane = document.getElementById('goals-detail-pane');
        if (pane?.classList.contains('open')) renderGDetail(updated);
      } catch(e) { alert('Error: ' + e.message); }
    });
  });
}

function renderGLogHistory(g) {
  const container = document.getElementById('d-g-log-history');
  if (!container) return;

  const events = [];

  // Habit log entries
  for (const h of (g.habits || [])) {
    for (const e of (h.log_entries || [])) {
      const parts = [];
      if (e.value != null) parts.push(`${e.value} min`);
      if (e.note) parts.push(escHtml(e.note));
      events.push({
        type: 'habit', date: e.logged_at,
        label: escHtml(h.label),
        detail: parts.join(' · '),
        entryId: e.id,
      });
    }
  }

  // General log entries (no habit_id)
  for (const e of (g.log_entries || [])) {
    const parts = [];
    if (e.value != null) parts.push(String(e.value));
    if (e.note) parts.push(escHtml(e.note));
    events.push({
      type: 'log', date: e.logged_at,
      label: parts.join(' · ') || 'Note',
      entryId: e.id,
    });
  }

  // Milestone completions
  for (const m of (g.milestones || [])) {
    if (m.completed && m.completed_at) {
      events.push({ type: 'milestone', date: m.completed_at, label: escHtml(m.title) });
    }
  }

  // Metric completions
  for (const m of (g.metrics || [])) {
    if (m.completed && m.completed_at) {
      const u = m.unit ? ` ${escHtml(m.unit)}` : '';
      const detail = m.target_value != null ? `${m.target_value}${u}` : '';
      events.push({ type: 'metric', date: m.completed_at, label: escHtml(m.label), detail });
    }
  }

  // Task completions
  for (const t of (g.recent_tasks || [])) {
    if (t.completed_at) {
      events.push({ type: 'task', date: t.completed_at, label: escHtml(t.title) });
    }
  }

  events.sort((a, b) => b.date.localeCompare(a.date));

  if (!events.length) {
    container.innerHTML = `<div style="font-size:13px;color:var(--text-muted);padding:6px 0">No activity yet — log habits, complete milestones, or finish tasks to see history here.</div>`;
    return;
  }

  const TYPE_META = {
    habit:     { label: 'Habit',     cls: 'gh-type-habit'     },
    log:       { label: 'Log',       cls: 'gh-type-log'       },
    milestone: { label: 'Milestone', cls: 'gh-type-milestone' },
    metric:    { label: 'Target',    cls: 'gh-type-metric'    },
    task:      { label: 'Task',      cls: 'gh-type-task'      },
  };

  let lastDate = null;
  const rows = [];
  for (const ev of events.slice(0, 50)) {
    const evDate = ev.date.slice(0, 10);
    if (evDate !== lastDate) {
      rows.push(`<div class="gh-date-divider">${formatDate(evDate)}</div>`);
      lastDate = evDate;
    }
    const meta    = TYPE_META[ev.type] || TYPE_META.log;
    const delBtn  = ev.entryId != null
      ? `<button class="goal-log-delete" data-entry-id="${ev.entryId}" title="Delete">×</button>` : '';
    rows.push(`
      <div class="gh-event-row">
        <span class="gh-type-badge ${meta.cls}">${meta.label}</span>
        <span class="gh-event-label">${ev.label}${ev.detail ? `<span class="gh-event-detail"> · ${ev.detail}</span>` : ''}</span>
        ${delBtn}
      </div>`);
  }

  container.innerHTML = rows.join('');

  container.querySelectorAll('.goal-log-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      await doDeleteLogEntry(g.id, parseInt(btn.dataset.entryId));
    });
  });
}

// ── Metric rendering & actions ────────────────────────────────
function renderGMetrics(metrics, goalId, milestones) {
  milestones = milestones || [];
  const container = document.getElementById('d-g-metrics');
  if (!container) return;
  const active = metrics.filter(m => !m.completed);
  if (!active.length) {
    container.innerHTML = metrics.length
      ? `<div style="font-size:14px;color:var(--text-muted);padding:6px 0">All targets completed — see History for details.</div>`
      : `<div style="font-size:14px;color:var(--text-muted);padding:6px 0">No targets yet — add one below.</div>`;
    return;
  }
  container.innerHTML = active.map(m => {
    const sv   = m.start_value ?? 0;
    const cv   = m.current_value ?? sv;
    const tv   = m.target_value;
    const u    = m.unit ? ` ${escHtml(m.unit)}` : '';
    const done = !!m.completed;
    const pct  = done ? 100 : (tv != null && tv !== sv)
      ? Math.round(Math.max(0, Math.min(100, (cv - sv) / (tv - sv) * 100)))
      : null;
    const linkedMs = milestones.find(ms => ms.id === m.milestone_id);
    const msTagHTML = linkedMs
      ? `<span class="goal-ms-metric-tag" style="font-size:10px;margin-left:4px;vertical-align:middle">${escHtml(linkedMs.title)}</span>`
      : '';
    const msOptions = milestones.map(ms =>
      `<option value="${ms.id}"${m.milestone_id === ms.id ? ' selected' : ''}>${escHtml(ms.title)}</option>`
    ).join('');
    return `
      <div class="goal-metric-row${done ? ' goal-metric-completed' : ''}" data-mid="${m.id}">
        <div class="checkbox-square${done ? ' checked' : ''} goal-m-complete-btn" data-mid="${m.id}" style="margin-top:3px;flex-shrink:0" title="${done ? 'Mark incomplete' : 'Mark complete'}"></div>
        <div class="goal-metric-body">
          <div class="goal-metric-label${done ? ' done' : ''}">${escHtml(m.label)}${msTagHTML}</div>
          ${tv != null
            ? `<div class="goal-metric-values">${done ? `<span style="color:var(--text-muted)">Completed · ${tv}${u}</span>` : `${cv}${u} of ${tv}${u}${pct != null ? ` &middot; ${pct}%` : ''}${m.target_date ? ` &middot; <span style="color:var(--text-muted)">${formatDateShort(m.target_date)}</span>` : ''}`}</div>
               <div class="goal-metric-bar"><div class="goal-metric-bar-fill${done ? ' goal-metric-bar-done' : ''}" data-bar-mid="${m.id}" style="width:${pct ?? 0}%"></div></div>`
            : `<div class="goal-metric-values" style="color:var(--text-muted)">${done ? 'Completed' : 'No target set'}${m.target_date ? ` &middot; ${formatDateShort(m.target_date)}` : ''}</div>`}
        </div>
        <div class="goal-metric-actions">
          ${!done ? `<button class="goal-metric-btn goal-m-edit-btn" data-mid="${m.id}">Edit</button>` : ''}
          <button class="goal-metric-del goal-m-del-btn" data-mid="${m.id}" title="Delete">×</button>
        </div>
      </div>
      <div class="goal-metric-inline-form" data-mid="${m.id}" style="display:none;padding:10px;background:var(--bg-hover);border-radius:var(--radius-el);margin-bottom:6px">
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:6px;margin-bottom:8px">
          <input class="form-input me-label" placeholder="Label" value="${escHtml(m.label)}" style="font-size:13px">
          <input class="form-input me-start" type="number" placeholder="Start" value="${m.start_value ?? ''}" style="font-size:13px">
          <input class="form-input me-target" type="number" placeholder="Target" value="${m.target_value ?? ''}" style="font-size:13px">
          <input class="form-input me-unit" placeholder="Unit" value="${escHtml(m.unit || '')}" style="font-size:13px">
        </div>
        <div style="display:flex;gap:6px;margin-bottom:8px;align-items:center">
          <input class="form-input me-current" type="number" placeholder="Current value" value="${m.current_value ?? ''}" style="flex:1;font-size:13px">
          <input type="date" class="me-date" value="${m.target_date || ''}" style="flex:1;font-size:13px;padding:5px 8px;border:var(--border-subtle);border-radius:var(--radius-el);background:var(--bg-input);outline:none" title="Due date (optional)">
        </div>
        ${milestones.length ? `<div style="margin-bottom:8px">
          <select class="form-input me-milestone" style="width:100%;font-size:13px">
            <option value="">No milestone link</option>
            ${msOptions}
          </select>
        </div>` : ''}
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm me-save" data-mid="${m.id}">Update</button>
          <button class="btn btn-secondary btn-sm me-cancel" data-mid="${m.id}">Cancel</button>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.goal-m-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mid = btn.dataset.mid;
      const form = container.querySelector(`.goal-metric-inline-form[data-mid="${mid}"]`);
      if (!form) return;
      const isOpen = form.style.display !== 'none';
      form.style.display = isOpen ? 'none' : 'block';
      btn.textContent = isOpen ? 'Edit' : 'Done';
      if (!isOpen) form.querySelector('.me-current')?.focus();
    });
  });

  // Live bar preview while editing
  container.querySelectorAll('.goal-metric-inline-form').forEach(form => {
    const mid = form.dataset.mid;
    const row = container.querySelector(`.goal-metric-row[data-mid="${mid}"]`);
    if (!row) return;
    const updatePreview = () => {
      const sv  = parseFloat(form.querySelector('.me-start').value) || 0;
      const cv  = parseFloat(form.querySelector('.me-current').value);
      const tv  = parseFloat(form.querySelector('.me-target').value);
      const u   = form.querySelector('.me-unit').value.trim();
      const uStr = u ? ` ${escHtml(u)}` : '';
      if (isNaN(cv) || isNaN(tv)) return;
      const pct = tv === sv ? 0 : Math.round(Math.max(0, Math.min(100, (cv - sv) / (tv - sv) * 100)));
      const barFill    = container.querySelector(`.goal-metric-bar-fill[data-bar-mid="${mid}"]`);
      const valDisplay = row.querySelector('.goal-metric-values');
      if (barFill)    barFill.style.width = pct + '%';
      if (valDisplay) valDisplay.textContent = `${cv}${uStr} of ${tv}${uStr} · ${pct}%`;
    };
    form.querySelectorAll('.me-start, .me-current, .me-target, .me-unit').forEach(input => {
      input.addEventListener('input', updatePreview);
    });
  });

  container.querySelectorAll('.me-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      const mid = btn.dataset.mid;
      const form = container.querySelector(`.goal-metric-inline-form[data-mid="${mid}"]`);
      const editBtn = container.querySelector(`.goal-m-edit-btn[data-mid="${mid}"]`);
      if (form) form.style.display = 'none';
      if (editBtn) editBtn.textContent = 'Edit';
    });
  });

  container.querySelectorAll('.me-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const mid    = parseInt(btn.dataset.mid);
      const form   = container.querySelector(`.goal-metric-inline-form[data-mid="${mid}"]`);
      if (!form) return;
      const payload = {};
      const label   = form.querySelector('.me-label').value.trim();
      const start   = parseFloat(form.querySelector('.me-start').value);
      const target  = parseFloat(form.querySelector('.me-target').value);
      const current = parseFloat(form.querySelector('.me-current').value);
      const unit    = form.querySelector('.me-unit').value.trim();
      const msSel   = form.querySelector('.me-milestone');
      const msId    = msSel?.value ? parseInt(msSel.value) : null;
      const dateVal = form.querySelector('.me-date')?.value || null;
      if (label)           payload.label         = label;
      if (!isNaN(start))   payload.start_value   = start;
      if (!isNaN(target))  payload.target_value  = target;
      if (!isNaN(current)) payload.current_value = current;
      payload.unit = unit || null;
      if (msId) payload.milestone_id = msId;
      else payload.clear_milestone_id = true;
      if (dateVal) payload.target_date = dateVal;
      else payload.clear_target_date = true;
      try {
        const updated = await apiFetch('PUT', `/goals/${goalId}/metrics/${mid}`, payload);
        _updateGoal(updated);
        renderGStats();
        renderGGrid();
        const pane = document.getElementById('goals-detail-pane');
        if (pane?.classList.contains('open')) renderGDetail(updated);
      } catch(e) { alert('Error: ' + e.message); }
    });
  });

  container.querySelectorAll('.goal-m-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const mid = parseInt(btn.dataset.mid);
      if (confirm('Delete this target?')) await doDeleteMetric(goalId, mid);
    });
  });

  container.querySelectorAll('.goal-m-complete-btn').forEach(cb => {
    cb.addEventListener('click', async () => {
      const mid = parseInt(cb.dataset.mid);
      const g   = _goals.find(g => g.id === goalId);
      const m   = (g?.metrics || []).find(m => m.id === mid);
      if (!m) return;
      const completing = !m.completed;
      const payload = { completed: completing ? 1 : 0 };
      if (completing && m.target_value != null) payload.current_value = m.target_value;
      try {
        const updated = await apiFetch('PUT', `/goals/${goalId}/metrics/${mid}`, payload);
        _updateGoal(updated);
        renderGStats();
        renderGGrid();
        const pane = document.getElementById('goals-detail-pane');
        if (pane?.classList.contains('open')) renderGDetail(updated);
      } catch(e) { alert('Error: ' + e.message); }
    });
  });
}

async function doAddMetric(goalId) {
  const labelEl     = document.getElementById('d-g-m-label');
  const startEl     = document.getElementById('d-g-m-start');
  const targetEl    = document.getElementById('d-g-m-target');
  const unitEl      = document.getElementById('d-g-m-unit');
  const dateEl      = document.getElementById('d-g-m-date');
  const milestoneEl = document.getElementById('d-g-m-milestone');

  const label  = labelEl?.value.trim() || 'Target';
  const start  = parseFloat(startEl?.value);
  const target = parseFloat(targetEl?.value);
  const unit   = unitEl?.value.trim() || null;
  const msId   = milestoneEl?.value ? parseInt(milestoneEl.value) : null;
  const dateVal = dateEl?.value || null;

  const payload = { label, unit };
  if (!isNaN(start))  payload.start_value  = start;
  if (!isNaN(target)) payload.target_value = target;
  if (msId)           payload.milestone_id = msId;
  if (dateVal)        payload.target_date  = dateVal;

  try {
    const updated = await apiFetch('POST', `/goals/${goalId}/metrics`, payload);
    if (labelEl)     labelEl.value     = '';
    if (startEl)     startEl.value     = '';
    if (targetEl)    targetEl.value    = '';
    if (unitEl)      unitEl.value      = '';
    if (dateEl)      dateEl.value      = '';
    if (milestoneEl) milestoneEl.value = '';
    _updateGoal(updated);
    renderGAll();
  } catch(e) { alert('Error: ' + e.message); }
}

async function doDeleteMetric(goalId, metricId) {
  try {
    await apiFetch('DELETE', `/goals/${goalId}/metrics/${metricId}`);
    const updated = await apiFetch('GET', `/goals/${goalId}`);
    _updateGoal(updated);
    renderGAll();
  } catch(e) { alert('Error: ' + e.message); }
}

async function doAddHabit(goalId) {
  const pane = document.getElementById('goals-detail-pane');
  const label  = pane?.querySelector('#d-g-h-label')?.value.trim() || 'Habit';
  const wmHrs  = parseFloat(pane?.querySelector('#d-g-h-weekly-min')?.value);
  const md     = parseInt(pane?.querySelector('#d-g-h-min-days')?.value);

  const payload = { label };
  if (!isNaN(wmHrs)) payload.weekly_target_minutes = Math.round(wmHrs * 60);
  if (!isNaN(md)) payload.min_days_per_week = md;

  try {
    const updated = await apiFetch('POST', `/goals/${goalId}/habits`, payload);
    if (pane) {
      pane.querySelector('#d-g-h-label').value = '';
      pane.querySelector('#d-g-h-weekly-min').value = '';
      pane.querySelector('#d-g-h-min-days').value = '';
    }
    _updateGoal(updated);
    renderGStats(); renderGGrid();
    if (pane?.classList.contains('open')) renderGDetail(updated);
  } catch(e) { alert('Error: ' + e.message); }
}

// ── Goal actions ──────────────────────────────────────────────
async function saveGDetail(goalId) {
  const g = _goals.find(g => g.id === goalId);
  if (!g) return;

  const pane = document.getElementById('goals-detail-pane');
  const body = {
    title:       document.getElementById('d-g-title')?.value.trim() || g.title,
    description: document.getElementById('d-g-description')?.value || null,
    area:        _getSelectedAreas(pane),
    status:      document.getElementById('d-g-status')?.value,
  };

  const targetDate = document.getElementById('d-g-target-date')?.value;
  if (targetDate) body.target_date = targetDate;
  else body.clear_target_date = true;

  try {
    const updated = await apiFetch('PUT', `/goals/${goalId}`, body);
    _updateGoal(updated);
    renderGAll();
  } catch(e) { alert('Save failed: ' + e.message); }
}

async function doCompleteGoal(goalId) {
  const g = _goals.find(g => g.id === goalId);
  if (!g) return;
  if (!confirm(`Mark "${g.title}" as completed?\n\nThis will set all numeric targets to 100% and close the goal.`)) return;

  try {
    const metricsWithTarget = (g.metrics || []).filter(m => m.target_value != null);
    await Promise.all(
      metricsWithTarget.map(m =>
        apiFetch('PUT', `/goals/${goalId}/metrics/${m.id}`, { completed: 1, current_value: m.target_value })
      )
    );
    const updated = await apiFetch('PUT', `/goals/${goalId}`, { status: 'completed' });
    _updateGoal(updated);
    renderGAll();
  } catch(e) { alert('Error: ' + e.message); }
}

async function logGProgress(goalId) {
  const valueEl = document.getElementById('d-g-log-value');
  const noteEl  = document.getElementById('d-g-log-note');
  const dateEl  = document.getElementById('d-g-log-date');
  const value   = parseFloat(valueEl?.value);
  const note    = noteEl?.value.trim() || null;
  const logDate = dateEl?.value || null;

  if (isNaN(value) && !note) { alert('Enter a value to log.'); return; }

  try {
    const updated = await apiFetch('POST', `/goals/${goalId}/log`, {
      value: isNaN(value) ? null : value,
      note,
      logged_at: logDate || null,
    });
    if (valueEl) valueEl.value = '';
    if (noteEl)  noteEl.value  = '';
    _updateGoal(updated);
    renderGAll();
  } catch(e) { alert('Log failed: ' + e.message); }
}

async function doAddMilestone(goalId) {
  const titleEl = document.getElementById('d-g-ms-title');
  const dateEl  = document.getElementById('d-g-ms-date');
  const title   = titleEl?.value.trim();
  if (!title) { alert('Enter a milestone title.'); return; }

  const g = _goals.find(g => g.id === goalId);
  const sortOrder = g ? (g.milestones || []).length : 0;

  try {
    const updated = await apiFetch('POST', `/goals/${goalId}/milestones`, {
      title,
      target_date: dateEl?.value || null,
      sort_order: sortOrder,
    });
    if (titleEl) titleEl.value = '';
    if (dateEl)  dateEl.value  = '';
    _updateGoal(updated);
    renderGAll();
  } catch(e) { alert('Error: ' + e.message); }
}

async function doToggleMilestone(goalId, msId, currentCompleted) {
  try {
    const updated = await apiFetch('PUT', `/goals/${goalId}/milestones/${msId}`, {
      completed: currentCompleted ? 0 : 1,
    });
    _updateGoal(updated);
    renderGAll();
  } catch(e) { alert('Error: ' + e.message); }
}

async function doDeleteMilestone(goalId, msId) {
  try {
    await apiFetch('DELETE', `/goals/${goalId}/milestones/${msId}`);
    const g = _goals.find(g => g.id === goalId);
    if (g) g.milestones = (g.milestones || []).filter(m => m.id !== msId);
    const updated = await apiFetch('GET', `/goals/${goalId}`);
    _updateGoal(updated);
    renderGAll();
  } catch(e) { alert('Error: ' + e.message); }
}

async function doDeleteLogEntry(goalId, entryId) {
  try {
    await apiFetch('DELETE', `/goals/${goalId}/log/${entryId}`);
    const updated = await apiFetch('GET', `/goals/${goalId}`);
    _updateGoal(updated);
    renderGAll();
  } catch(e) { alert('Error: ' + e.message); }
}

async function doDeleteGoal(goalId) {
  try {
    await apiFetch('DELETE', `/goals/${goalId}`);
    _goals = _goals.filter(g => g.id !== goalId);
    closeGDetail();
    renderGAll();
  } catch(e) { alert('Error: ' + e.message); }
}

function _updateGoal(updated) {
  const idx = _goals.findIndex(g => g.id === updated.id);
  if (idx >= 0) _goals[idx] = updated;
  else _goals.unshift(updated);
}

// ── New goal sidebar ──────────────────────────────────────────
function openNewGoalSidebar() {
  _gSelectedId = null;
  document.querySelectorAll('.goal-card.selected').forEach(c => c.classList.remove('selected'));

  const pane = document.getElementById('goals-detail-pane');
  if (!pane) return;
  pane.classList.add('open');

  pane.innerHTML = `
    <div class="detail-panel">
      <div class="detail-header">
        <div style="font-size:16px;font-weight:600;color:var(--text-primary)">New Goal</div>
        <button class="detail-close-btn" id="ng-close">×</button>
      </div>
      <div class="detail-body">

        <div class="form-group" style="margin-bottom:16px">
          <label class="form-label">Title *</label>
          <input class="form-input" id="ng-title" placeholder="Goal title">
        </div>

        <div class="detail-grid">
          <div class="detail-field" style="grid-column:1/-1">
            <div class="detail-field-label">Target date</div>
            <input type="date" id="ng-target-date" style="width:auto">
          </div>
          <div class="detail-field" style="grid-column:1/-1">
            <div class="detail-field-label">Area</div>
            ${_areaPickerHTML('')}
          </div>
        </div>

        <div class="detail-section-title">Description</div>
        <textarea class="detail-notes" id="ng-description" placeholder="Describe your goal…" style="margin-bottom:14px"></textarea>

        <div class="divider"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div class="detail-section-title" style="margin-bottom:0">Habits <span style="font-size:13px;font-weight:400;color:var(--text-muted)">— optional</span></div>
          <button class="btn btn-secondary btn-sm" id="ng-add-habit">+ Add</button>
        </div>
        <div id="ng-habits-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:4px">
          <div style="font-size:14px;color:var(--text-muted)" id="ng-habits-empty">None yet</div>
        </div>

        <div class="divider"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div class="detail-section-title" style="margin-bottom:0">Numeric targets <span style="font-size:13px;font-weight:400;color:var(--text-muted)">— optional</span></div>
          <button class="btn btn-secondary btn-sm" id="ng-add-metric">+ Add</button>
        </div>
        <div id="ng-metrics-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:4px">
          <div style="font-size:14px;color:var(--text-muted)" id="ng-metrics-empty">None yet</div>
        </div>

        <div class="divider"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div class="detail-section-title" style="margin-bottom:0">Milestones <span style="font-size:13px;font-weight:400;color:var(--text-muted)">— optional</span></div>
          <button class="btn btn-secondary btn-sm" id="ng-add-milestone">+ Add</button>
        </div>
        <div id="ng-milestones-list" style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:14px;color:var(--text-muted)" id="ng-ms-empty">None yet</div>
        </div>

      </div>
      <div class="detail-footer">
        <button class="btn btn-secondary btn-sm" id="ng-cancel">Cancel</button>
        <button class="btn btn-primary btn-sm" id="ng-create">Create goal</button>
      </div>
    </div>`;

  _wireAreaPills(pane);
  pane.querySelector('#ng-close').addEventListener('click', closeGDetail);
  pane.querySelector('#ng-cancel').addEventListener('click', closeGDetail);

  pane.querySelector('#ng-add-metric').addEventListener('click', () => {
    pane.querySelector('#ng-metrics-empty')?.remove();
    const list = pane.querySelector('#ng-metrics-list');
    const row = document.createElement('div');
    row.className = 'ng-metric-row';
    row.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:6px;align-items:center';
    row.innerHTML = `
      <input class="form-input ng-m-label" placeholder="Label (e.g. Weight)" style="font-size:14px">
      <input class="form-input ng-m-start" type="number" placeholder="Start" style="font-size:14px">
      <input class="form-input ng-m-target" type="number" placeholder="Target" style="font-size:14px">
      <input class="form-input ng-m-unit" placeholder="Unit" style="font-size:14px">
      <button type="button" class="btn btn-danger btn-sm" style="padding:5px 9px">×</button>`;
    row.querySelector('.btn-danger').addEventListener('click', () => row.remove());
    list.appendChild(row);
    row.querySelector('.ng-m-label').focus();
  });

  pane.querySelector('#ng-add-habit').addEventListener('click', () => {
    pane.querySelector('#ng-habits-empty')?.remove();
    const list = pane.querySelector('#ng-habits-list');
    const row = document.createElement('div');
    row.className = 'ng-habit-row';
    row.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:6px;align-items:center';
    row.innerHTML = `
      <input class="form-input ng-h-label" placeholder="Label (e.g. Running)" style="font-size:14px">
      <input class="form-input ng-h-weekly-min" type="number" step="0.25" placeholder="Hrs/week" style="font-size:14px">
      <input class="form-input ng-h-min-days" type="number" placeholder="Days/week" min="1" max="7" style="font-size:14px">
      <button type="button" class="btn btn-danger btn-sm" style="padding:5px 9px">×</button>`;
    row.querySelector('.btn-danger').addEventListener('click', () => row.remove());
    list.appendChild(row);
    row.querySelector('.ng-h-label').focus();
  });

  pane.querySelector('#ng-add-milestone').addEventListener('click', () => {
    pane.querySelector('#ng-ms-empty')?.remove();
    const list = pane.querySelector('#ng-milestones-list');
    const row = document.createElement('div');
    row.className = 'ng-ms-row';
    row.style.cssText = 'display:grid;grid-template-columns:1fr auto auto;gap:6px;align-items:center';
    row.innerHTML = `
      <input class="form-input ng-ms-title" placeholder="Milestone title" style="font-size:14px">
      <input class="form-input ng-ms-date" type="date" style="font-size:14px;width:140px">
      <button type="button" class="btn btn-danger btn-sm" style="padding:5px 9px">×</button>`;
    row.querySelector('.btn-danger').addEventListener('click', () => row.remove());
    list.appendChild(row);
    row.querySelector('.ng-ms-title').focus();
  });

  pane.querySelector('#ng-create').addEventListener('click', async () => {
    const title = pane.querySelector('#ng-title').value.trim();
    if (!title) { alert('Title is required.'); return; }

    const payload = {
      title,
      description: pane.querySelector('#ng-description').value || null,
      area:        _getSelectedAreas(pane),
      target_date: pane.querySelector('#ng-target-date').value || null,
    };

    try {
      const created = await apiFetch('POST', '/goals', payload);

      for (const row of pane.querySelectorAll('.ng-habit-row')) {
        const label  = row.querySelector('.ng-h-label').value.trim() || 'Habit';
        const wmHrs  = parseFloat(row.querySelector('.ng-h-weekly-min').value);
        const md     = parseInt(row.querySelector('.ng-h-min-days').value);
        if (!isNaN(wmHrs) || !isNaN(md) || label !== 'Habit') {
          const hp = { label };
          if (!isNaN(wmHrs)) hp.weekly_target_minutes = Math.round(wmHrs * 60);
          if (!isNaN(md)) hp.min_days_per_week = md;
          await apiFetch('POST', `/goals/${created.id}/habits`, hp);
        }
      }

      for (const row of pane.querySelectorAll('.ng-metric-row')) {
        const label  = row.querySelector('.ng-m-label').value.trim() || 'Target';
        const start  = parseFloat(row.querySelector('.ng-m-start').value);
        const target = parseFloat(row.querySelector('.ng-m-target').value);
        const unit   = row.querySelector('.ng-m-unit').value.trim() || null;
        if (!isNaN(target) || label !== 'Target') {
          const mp = { label, unit };
          if (!isNaN(start))  mp.start_value  = start;
          if (!isNaN(target)) mp.target_value = target;
          await apiFetch('POST', `/goals/${created.id}/metrics`, mp);
        }
      }

      const msRows = pane.querySelectorAll('.ng-ms-row');
      for (let i = 0; i < msRows.length; i++) {
        const msTitle = msRows[i].querySelector('.ng-ms-title').value.trim();
        const msDate  = msRows[i].querySelector('.ng-ms-date').value || null;
        if (msTitle) {
          await apiFetch('POST', `/goals/${created.id}/milestones`, {
            title: msTitle, target_date: msDate, sort_order: i,
          });
        }
      }

      const updated = await apiFetch('GET', `/goals/${created.id}`);
      _updateGoal(updated);
      renderGStats();
      renderGGrid();
      openGDetail(updated.id);
    } catch(e) { alert('Error: ' + e.message); }
  });

  setTimeout(() => pane.querySelector('#ng-title')?.focus(), 50);
}

// ── Quick task creation for a goal ───────────────────────────
function openQuickTaskForGoal(goalId, goalTitle) {
  const body = `
    <div class="form-group">
      <label class="form-label">Title *</label>
      <input class="form-input" id="qt-title" placeholder="Task title" autofocus>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group">
        <label class="form-label">Priority</label>
        <select class="form-select" id="qt-priority">
          <option value="high">High</option>
          <option value="medium" selected>Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Due date</label>
        <input class="form-input" id="qt-due" type="date">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Goal</label>
      <div style="padding:6px 8px;border:var(--border-subtle);border-radius:var(--radius-el);background:var(--bg-input);font-size:14px;color:var(--text-secondary)">${escHtml(goalTitle)}</div>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="qt-notes" placeholder="Optional notes…"></textarea>
    </div>`;

  const modal = createModal('New task', body, async (overlay) => {
    const title = document.getElementById('qt-title').value.trim();
    if (!title) { alert('Title is required.'); return; }
    try {
      await apiFetch('POST', '/tasks', {
        title,
        priority:  document.getElementById('qt-priority').value,
        due_date:  document.getElementById('qt-due').value || null,
        notes:     document.getElementById('qt-notes').value || null,
        goal_id:   goalId,
        tag_ids:   [],
      });
      closeModal(overlay);
      overlay.remove();
      // Refresh goal so recent_tasks updates
      const updated = await apiFetch('GET', `/goals/${goalId}`);
      _updateGoal(updated);
      renderGAll();
    } catch(e) { alert('Error: ' + e.message); }
  }, 'Add task');

  openModal(modal);
}
