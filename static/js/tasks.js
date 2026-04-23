// ── Module state ─────────────────────────────────────────────
let _tasks = [];
let _tags = [];
let _tGoals = [];
let _goalItems = { metrics: [], milestones: [], habits: [] };
let _filter = 'all';
let _sort = 'due_date';
let _selectedId = null;
let _activeTagIds = new Set();
let _activeGoalId = null;
let _wideMode = true;
let _expandedTaskId = null;
let _showTargets = false;
let _showMilestones = false;
let _showHabits = false;

const LISTS_KEY = 'lt_task_lists';

// ── Entry point ───────────────────────────────────────────────
registerPage('tasks', async function(content) {
  _filter = 'all';
  _activeTagIds = new Set();
  _activeGoalId = null;
  _selectedId = null;
  _expandedTaskId = null;
  _wideMode = true;
  _showTargets = false;
  _showMilestones = false;
  _showHabits = false;
  _goalItems = { metrics: [], milestones: [], habits: [] };

  content.innerHTML = `
    <div class="tasks-shell">
      <div class="tasks-main" id="tasks-main">
        <div class="page-header">
          <h1 class="page-title">Tasks</h1>
          <div style="display:flex;gap:8px;align-items:center">
            <select class="form-select btn-sm" id="tasks-sort" style="font-size:13px;padding:5px 8px">
              <option value="due_date">Sort: Due date</option>
              <option value="priority">Sort: Priority</option>
              <option value="created">Sort: Created</option>
              <option value="alpha">Sort: A–Z</option>
            </select>
            <button class="btn btn-primary btn-sm" id="new-task-btn">+ New task</button>
          </div>
        </div>
        <div id="tasks-stats" class="stats-row" style="grid-template-columns:repeat(4,1fr)"></div>
        <div id="tasks-filter-bar"></div>
        <div class="task-lists-row" id="task-lists-row"></div>
      </div>
      <div class="tasks-detail-pane" id="tasks-detail-pane"></div>
    </div>`;

  document.getElementById('new-task-btn').addEventListener('click', openNewTaskModal);

  document.getElementById('tasks-sort').addEventListener('change', e => {
    _sort = e.target.value;
    renderAllLists();
  });

  await loadAll();
  renderAll();
});

// ── LocalStorage helpers ──────────────────────────────────────
function loadListConfigs() {
  try { return JSON.parse(localStorage.getItem(LISTS_KEY) || '[]'); }
  catch { return []; }
}
function saveListConfigs(configs) { localStorage.setItem(LISTS_KEY, JSON.stringify(configs)); }
function removeListConfig(id) { saveListConfigs(loadListConfigs().filter(c => c.id !== id)); }

// ── Data loading ──────────────────────────────────────────────
async function loadAll() {
  try { await apiFetch('POST', '/recurrences/generate'); } catch(e) { /* non-fatal */ }
  const [tr, gr, rr, gi] = await Promise.all([
    apiFetch('GET', '/tasks'),
    apiFetch('GET', '/goals'),
    apiFetch('GET', '/tags'),
    apiFetch('GET', '/goals/items').catch(() => ({ metrics: [], milestones: [], habits: [] })),
  ]);
  _tasks = tr.items;
  _tGoals = gr.items;
  _tags  = rr.items;
  _goalItems = gi;
}

// ── Render orchestration ──────────────────────────────────────
function renderAll() {
  renderStats();
  renderSecondaryFilters();
  renderAllLists();
  if (_selectedId) {
    const pane = document.getElementById('tasks-detail-pane');
    if (pane?.classList.contains('open')) {
      const t = _tasks.find(t => t.id === _selectedId);
      if (t) renderDetail(t); else closeDetail();
    }
  }
}

function renderStats() {
  const today = todayISO();
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekStartISO = weekStart.toISOString().slice(0, 10);

  const dueToday  = _tasks.filter(t => t.status === 'pending' && t.due_date === today).length;
  const overdue   = _tasks.filter(t => t.status === 'pending' && t.due_date && t.due_date < today).length;
  const doneWeek  = _tasks.filter(t => t.status === 'completed' && t.completed_at && t.completed_at >= weekStartISO).length;
  const recurring = _tasks.filter(t => t.is_recurring && t.status === 'pending').length;

  document.getElementById('tasks-stats').innerHTML = `
    <div class="stat-card stat-card--cyan"><div class="stat-label">Due today</div><div class="stat-value">${dueToday}</div></div>
    <div class="stat-card stat-card--red"><div class="stat-label">Overdue</div><div class="stat-value${overdue > 0 ? ' danger' : ''}">${overdue}</div></div>
    <div class="stat-card stat-card--green"><div class="stat-label">Completed this week</div><div class="stat-value">${doneWeek}</div></div>
    <div class="stat-card stat-card--purple"><div class="stat-label">Recurring active</div><div class="stat-value">${recurring}</div></div>`;
}

function renderSecondaryFilters() {
  const container = document.getElementById('tasks-filter-bar');
  if (!container) return;

  const statusPills = ['all','today','upcoming','recurring','completed'].map(f =>
    `<button class="tf-pill tf-status${_filter === f ? ' active' : ''}" data-filter="${f}">${capitalize(f)}</button>`
  ).join('');

  const tagPills = _tags.map(tg => {
    const active = _activeTagIds.has(tg.id);
    return `<button class="tf-pill tag-filter-pill${active ? ' active' : ''}" data-tag-id="${tg.id}"
      style="${active ? `background:var(--tag-${tg.color}-bg);color:var(--tag-${tg.color}-text);border-color:transparent` : ''}"
    >${escHtml(tg.name)}</button>`;
  }).join('');

  const goalSelect = _tGoals.length ? `
    <select id="goal-filter-select" class="tf-goal-select">
      <option value="">All goals</option>
      ${_tGoals.map(g => `<option value="${g.id}"${_activeGoalId === g.id ? ' selected' : ''}>${escHtml(g.title)}</option>`).join('')}
    </select>` : '';

  const tagGroup   = _tags.length   ? `<div class="tf-group">${tagPills}</div>` : '';
  const tagSection = (_tags.length || _tGoals.length) ? `
    <div class="tf-sep"></div>${tagGroup}${goalSelect}` : '';

  container.innerHTML = `
    <div class="task-filter-bar">
      <div class="tf-group">${statusPills}</div>
      ${tagSection}
      <div class="tf-sep"></div>
      <span class="tf-label">Include</span>
      <button class="tf-pill goal-type-pill${_showTargets    ? ' active tf-active--cyan'   : ''}" data-type="targets">Targets</button>
      <button class="tf-pill goal-type-pill${_showMilestones ? ' active tf-active--purple' : ''}" data-type="milestones">Milestones</button>
      <button class="tf-pill goal-type-pill${_showHabits     ? ' active tf-active--green'  : ''}" data-type="habits">Habits</button>
    </div>`;

  container.querySelectorAll('.tf-status').forEach(pill => {
    pill.addEventListener('click', () => {
      _filter = pill.dataset.filter;
      renderSecondaryFilters();
      renderAllLists();
    });
  });

  container.querySelectorAll('.tag-filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const tagId = parseInt(pill.dataset.tagId);
      if (_activeTagIds.has(tagId)) _activeTagIds.delete(tagId);
      else _activeTagIds.add(tagId);
      renderSecondaryFilters();
      renderAllLists();
    });
  });

  const goalSel = container.querySelector('#goal-filter-select');
  if (goalSel) {
    goalSel.addEventListener('change', e => {
      _activeGoalId = parseInt(e.target.value) || null;
      renderAllLists();
    });
  }

  container.querySelectorAll('.goal-type-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const type = pill.dataset.type;
      if (type === 'targets')         _showTargets    = !_showTargets;
      else if (type === 'milestones') _showMilestones = !_showMilestones;
      else if (type === 'habits')     _showHabits     = !_showHabits;
      renderSecondaryFilters();
      renderAllLists();
    });
  });
}

// ── Multi-list board ──────────────────────────────────────────
function renderAllLists() {
  const row = document.getElementById('task-lists-row');
  if (!row) return;
  row.innerHTML = '';
  const newWideMode = loadListConfigs().length === 0;
  if (newWideMode !== _wideMode) _expandedTaskId = null;
  _wideMode = newWideMode;

  row.appendChild(buildListColumn({ id: 'master', name: 'All tasks', type: 'master' }, true));

  loadListConfigs().forEach(config => row.appendChild(buildListColumn(config, false)));

  const addCol = document.createElement('div');
  addCol.className = 'add-list-col';
  addCol.innerHTML = `<button class="add-list-col-btn">+ Add list</button>`;
  addCol.querySelector('button').addEventListener('click', openAddListModal);
  row.appendChild(addCol);
}

function buildListColumn(config, isMaster) {
  const col = document.createElement('div');
  col.className = `task-list-column${isMaster ? ' master' : ''}`;
  col.dataset.listId = config.id;

  let filterBadge = '';
  if (config.type === 'tag') {
    const tag = _tags.find(t => t.id === config.filter_id);
    if (tag) filterBadge = `<span class="tag-badge tag-${tag.color}" style="font-size:12px">${escHtml(tag.name)}</span>`;
  } else if (config.type === 'goal') {
    const goal = _tGoals.find(g => g.id === config.filter_id);
    if (goal) filterBadge = `<span class="tag-badge tag-amber" style="font-size:12px">${escHtml(goal.title)}</span>`;
  }

  const addBtn = (!isMaster && config.type === 'goal')
    ? `<button class="task-list-col-add" title="New task for this goal" data-goal-id="${config.filter_id}">+</button>`
    : '';
  col.innerHTML = `
    <div class="task-list-col-header">
      <span class="task-list-col-name">${escHtml(config.name)}</span>
      ${filterBadge}
      <div style="display:flex;gap:4px;margin-left:auto">
        ${addBtn}
        ${!isMaster ? `<button class="task-list-col-close" title="Remove list">×</button>` : ''}
      </div>
    </div>
    <div class="task-list-col-body"></div>`;

  if (!isMaster) {
    col.querySelector('.task-list-col-close').addEventListener('click', () => {
      removeListConfig(config.id);
      renderAllLists();
    });
    col.querySelector('.task-list-col-add')?.addEventListener('click', () => {
      openNewTaskModal(config.filter_id || null);
    });
  }

  renderColumnTasks(config, col.querySelector('.task-list-col-body'));
  return col;
}

function getTasksForConfig(config) {
  const today = todayISO();
  const in7   = new Date(); in7.setDate(in7.getDate() + 7);
  const in7ISO = in7.toISOString().slice(0, 10);

  let result;
  switch (_filter) {
    case 'today':
      result = _tasks.filter(t => t.status === 'pending' && (t.due_date === today || (t.due_date && t.due_date < today)));
      break;
    case 'upcoming':
      result = _tasks.filter(t => t.status === 'pending' && t.due_date && t.due_date > today && t.due_date <= in7ISO);
      break;
    case 'recurring':
      result = _tasks.filter(t => t.is_recurring && t.status !== 'abandoned');
      break;
    case 'completed':
      result = _tasks.filter(t => t.status === 'completed');
      break;
    default:
      result = _tasks.filter(t => t.status !== 'abandoned');
  }

  if (config.type === 'master') {
    if (_activeTagIds.size > 0)
      result = result.filter(t => t.tags && t.tags.some(tg => _activeTagIds.has(tg.id)));
    if (_activeGoalId)
      result = result.filter(t => t.goal_id === _activeGoalId);
  } else if (config.type === 'tag') {
    result = result.filter(t => t.tags && t.tags.some(tg => tg.id === config.filter_id));
  } else if (config.type === 'goal') {
    result = result.filter(t => t.goal_id === config.filter_id);
  }

  return sortedTasks(result);
}

function renderColumnTasks(config, bodyEl) {
  const tasks = getTasksForConfig(config);
  const isWideMaster = config.type === 'master' && _wideMode;

  if (config.type === 'master') {
    bodyEl.innerHTML = groupedTasksHTML(tasks, isWideMaster);
  } else if (!tasks.length) {
    if (config.type === 'goal') {
      const goalTitle = (_tGoals.find(g => g.id === config.filter_id) || {}).title || 'this goal';
      bodyEl.innerHTML = `
        <div class="empty-state" style="padding:20px 12px;text-align:center">
          <div class="empty-state-text" style="margin-bottom:6px">No tasks linked to<br>"${escHtml(goalTitle)}"</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Open a task's detail pane and set its Linked goal to add it here.</div>
          <button class="btn btn-secondary btn-sm col-new-task-btn" data-goal-id="${config.filter_id}" style="font-size:12px">+ New task for this goal</button>
        </div>`;
    } else {
      bodyEl.innerHTML = `<div class="empty-state" style="padding:28px 12px;text-align:center">
        <div class="empty-state-text">No tasks</div></div>`;
    }
  } else {
    bodyEl.innerHTML = tasks.map(t => taskRowHTML(t, false)).join('');
  }

  bodyEl.querySelectorAll('.col-new-task-btn').forEach(btn => {
    btn.addEventListener('click', () => openNewTaskModal(parseInt(btn.dataset.goalId) || null));
  });

  bodyEl.querySelectorAll('.task-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.task-row-check') || e.target.closest('.task-expand-body')) return;
      if (isWideMaster) {
        toggleExpand(parseInt(row.dataset.id));
      } else {
        openDetail(parseInt(row.dataset.id));
      }
    });
  });

  bodyEl.querySelectorAll('.checkbox-circle').forEach(cb => {
    cb.addEventListener('click', e => {
      e.stopPropagation();
      const taskRow = cb.closest('.task-row');
      if (!taskRow) return;
      const taskId = parseInt(taskRow.dataset.id);
      const task = _tasks.find(t => t.id === taskId);
      if (task && task.status === 'pending') doCompleteTask(taskId);
    });
  });

  // Goal item events (master only)
  if (config.type === 'master') {
    bodyEl.querySelectorAll('.milestone-row .goal-item-check .checkbox-circle').forEach(cb => {
      cb.addEventListener('click', async e => {
        e.stopPropagation();
        const row = cb.closest('.milestone-row');
        const msId  = parseInt(row.dataset.msId);
        const goalId = parseInt(row.dataset.goalId);
        try {
          await apiFetch('PUT', `/goals/${goalId}/milestones/${msId}`, { completed: 1 });
          row.style.cssText = 'opacity:0;transition:opacity 0.25s';
          setTimeout(() => {
            row.remove();
            _goalItems.milestones = _goalItems.milestones.filter(m => m.id !== msId);
          }, 260);
        } catch(err) { /* silent */ }
      });
    });

    bodyEl.querySelectorAll('.metric-row, .habit-row').forEach(row => {
      row.addEventListener('click', () => {
        const goalId = parseInt(row.dataset.goalId);
        if (goalId) { window._openGoalId = goalId; loadPage('goals'); }
      });
    });
  }

  // Restore expanded state after re-render
  if (isWideMaster && _expandedTaskId) {
    const expandRow = bodyEl.querySelector(`.task-row[data-id="${_expandedTaskId}"]`);
    if (expandRow) {
      expandRow.classList.add('expanded', 'selected');
      const expandBodyEl = expandRow.querySelector('.task-expand-body');
      const task = _tasks.find(t => t.id === _expandedTaskId);
      if (expandBodyEl && task) populateExpandBody(task, expandBodyEl);
    }
  }

  if (_selectedId && !isWideMaster) {
    const sel = bodyEl.querySelector(`.task-row[data-id="${_selectedId}"]`);
    if (sel) sel.classList.add('selected');
  }
}

function groupedTasksHTML(tasks, isWide = false) {
  const today = todayISO();
  const canShow = ['all', 'today', 'upcoming'].includes(_filter);

  // Collect and filter goal items
  let metrics    = (canShow && _showTargets)    ? (_goalItems.metrics    || []) : [];
  let milestones = (canShow && _showMilestones) ? (_goalItems.milestones || []) : [];
  let habits     = (canShow && _showHabits)     ? (_goalItems.habits     || []) : [];

  if (_activeGoalId) {
    metrics    = metrics.filter(m => m.goal_id === _activeGoalId);
    milestones = milestones.filter(m => m.goal_id === _activeGoalId);
    habits     = habits.filter(h => h.goal_id === _activeGoalId);
  }

  // Narrow date-gated items when filter = today / upcoming
  if (_filter === 'today') {
    metrics    = metrics.filter(m => !m.target_date || m.target_date <= today);
    milestones = milestones.filter(m => !m.target_date || m.target_date <= today);
  } else if (_filter === 'upcoming') {
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const in7ISO = in7.toISOString().slice(0, 10);
    metrics    = metrics.filter(m => m.target_date && m.target_date > today && m.target_date <= in7ISO);
    milestones = milestones.filter(m => m.target_date && m.target_date > today && m.target_date <= in7ISO);
    habits     = habits; // habits always show when enabled
  }

  const groups = [
    {
      label: 'Overdue',
      tasks:      tasks.filter(t => t.status === 'pending' && t.due_date && t.due_date < today),
      metrics:    metrics.filter(m => m.target_date && m.target_date < today),
      milestones: milestones.filter(m => m.target_date && m.target_date < today),
    },
    {
      label: 'Today',
      tasks:      tasks.filter(t => t.status === 'pending' && t.due_date === today),
      metrics:    metrics.filter(m => m.target_date === today),
      milestones: milestones.filter(m => m.target_date === today),
    },
    {
      label: 'Upcoming',
      tasks:      tasks.filter(t => t.status === 'pending' && t.due_date && t.due_date > today),
      metrics:    metrics.filter(m => m.target_date && m.target_date > today),
      milestones: milestones.filter(m => m.target_date && m.target_date > today),
    },
    {
      label: 'No date',
      tasks:      tasks.filter(t => t.status === 'pending' && !t.due_date),
      metrics:    metrics.filter(m => !m.target_date),
      milestones: milestones.filter(m => !m.target_date),
    },
    {
      label: 'Completed',
      tasks:      tasks.filter(t => t.status === 'completed'),
      metrics:    [],
      milestones: [],
    },
  ];

  let html = groups
    .filter(g => g.tasks.length || g.metrics.length || g.milestones.length)
    .map(g => {
      const total = g.tasks.length + g.metrics.length + g.milestones.length;
      return `
        <div class="task-group">
          <div class="section-header">${g.label} <span style="opacity:.5;font-weight:400">(${total})</span></div>
          ${g.tasks.map(t => taskRowHTML(t, isWide)).join('')}
          ${g.milestones.map(m => milestoneRowHTML(m)).join('')}
          ${g.metrics.map(m => metricRowHTML(m)).join('')}
        </div>`;
    }).join('');

  if (habits.length) {
    html += `
      <div class="task-group">
        <div class="section-header">Habits this week <span style="opacity:.5;font-weight:400">(${habits.length})</span></div>
        ${habits.map(h => habitRowHTML(h)).join('')}
      </div>`;
  }

  return html || `<div class="empty-state" style="padding:28px 12px;text-align:center"><div class="empty-state-text">No tasks</div></div>`;
}

// ── Task row HTML ─────────────────────────────────────────────
function taskRowHTML(task, isWide = false) {
  const today = todayISO();
  const done    = task.status === 'completed';
  const overdue = !done && task.due_date && task.due_date < today;
  const isToday2 = !done && task.due_date === today;

  let dueLabelHTML = '';
  if (task.due_date) {
    let cls = 'due-label';
    if (overdue) cls += ' overdue';
    else if (isToday2) cls += ' today-due';
    const label = overdue
      ? `Overdue · ${formatDateShort(task.due_date)}`
      : isToday2 ? 'Today' : formatDateShort(task.due_date);
    dueLabelHTML = `<span class="${cls}">${label}</span>`;
  }

  const recurHTML = task.is_recurring
    ? `<span class="recur-icon">↺ <span style="color:var(--text-muted)">${task.recurrence?.cadence || 'recurring'}</span></span>`
    : '';

  const innerContent = `
    ${priorityDotHTML(task.priority)}
    <div class="task-row-check">
      <div class="checkbox-circle${done ? ' checked' : ''}"></div>
    </div>
    <div class="task-row-body">
      <div class="task-row-title${done ? ' done' : ''}">${escHtml(task.title)}</div>
      ${task.tags.length || task.is_recurring
        ? `<div class="task-row-meta">${tagsHTML(task.tags)}${recurHTML}</div>`
        : ''}
    </div>
    <div class="task-row-right">${dueLabelHTML}</div>`;

  if (!isWide) {
    return `<div class="task-row${done ? ' done-row' : ''}" data-id="${task.id}">${innerContent}</div>`;
  }

  const preview = previewContentHTML(task);
  const hasPreview = !!preview;
  return `
    <div class="task-row wide${done ? ' done-row' : ''}${hasPreview ? ' has-preview' : ''}" data-id="${task.id}">
      <div class="task-row-head">${innerContent}</div>
      <div class="task-row-preview">${preview}</div>
      <div class="task-expand-body"></div>
    </div>`;
}

function milestoneRowHTML(ms) {
  const today = todayISO();
  const overdue = ms.target_date && ms.target_date < today;
  const isToday = ms.target_date === today;
  let dueLabelHTML = '';
  if (ms.target_date) {
    let cls = 'due-label';
    if (overdue) cls += ' overdue';
    else if (isToday) cls += ' today-due';
    const label = overdue
      ? `Overdue · ${formatDateShort(ms.target_date)}`
      : isToday ? 'Today' : formatDateShort(ms.target_date);
    dueLabelHTML = `<span class="${cls}">${label}</span>`;
  }
  return `
    <div class="goal-item-row milestone-row" data-ms-id="${ms.id}" data-goal-id="${ms.goal_id}">
      <div class="goal-item-check"><div class="checkbox-circle"></div></div>
      <div class="goal-item-body">
        <div class="goal-item-title">${escHtml(ms.title)}</div>
        <div class="goal-item-meta">
          <span class="goal-item-type-badge badge-milestone">milestone</span>
          <span class="tag-badge tag-amber" style="font-size:11px">${escHtml(ms.goal_title)}</span>
        </div>
      </div>
      <div class="goal-item-right">${dueLabelHTML}</div>
    </div>`;
}

function metricRowHTML(m) {
  const today = todayISO();
  const sv  = m.start_value || 0;
  const cv  = m.current_value != null ? m.current_value : sv;
  const tv  = m.target_value;
  const u   = m.unit ? ` ${escHtml(m.unit)}` : '';
  const pct = tv != null && tv !== sv
    ? Math.round(Math.max(0, Math.min(100, (cv - sv) / (tv - sv) * 100))) : 0;
  let dueLabelHTML = '';
  if (m.target_date) {
    const overdue = m.target_date < today;
    const isToday = m.target_date === today;
    let cls = 'due-label';
    if (overdue) cls += ' overdue';
    else if (isToday) cls += ' today-due';
    const label = overdue
      ? `Overdue · ${formatDateShort(m.target_date)}`
      : isToday ? 'Today' : formatDateShort(m.target_date);
    dueLabelHTML = `<span class="${cls}">${label}</span>`;
  }
  const progressHTML = tv != null ? `
    <div class="goal-item-progress">
      <div class="progress-bar" style="flex:1;height:3px"><div class="progress-fill" style="width:${pct}%"></div></div>
      <span style="font-size:11px;color:var(--text-muted)">${cv}${u} / ${tv}${u} &middot; ${pct}%</span>
    </div>` : '';
  return `
    <div class="goal-item-row metric-row" data-goal-id="${m.goal_id}" style="cursor:pointer">
      <div class="goal-item-icon">≡</div>
      <div class="goal-item-body">
        <div class="goal-item-title">${escHtml(m.label)}</div>
        <div class="goal-item-meta">
          <span class="goal-item-type-badge badge-metric">target</span>
          <span class="tag-badge tag-amber" style="font-size:11px">${escHtml(m.goal_title)}</span>
        </div>
        ${progressHTML}
      </div>
      <div class="goal-item-right">${dueLabelHTML}</div>
    </div>`;
}

function habitRowHTML(h) {
  const entries  = h.week_entries || [];
  const totalMin = Math.round(entries.reduce((s, e) => s + (e.value || 0), 0));
  const days     = new Set(entries.map(e => e.logged_at.slice(0, 10))).size;
  const wtMin    = h.weekly_target_minutes;
  const mdTarget = h.min_days_per_week;
  const statParts = [];
  let pct = 0;
  if (wtMin) {
    const hrs = parseFloat((totalMin / 60).toFixed(1));
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
  const done = hasTarget && (wtMin ? totalMin >= wtMin : true) && (mdTarget ? days >= mdTarget : true);
  return `
    <div class="goal-item-row habit-row${done ? ' habit-done' : ''}" data-goal-id="${h.goal_id}" style="cursor:pointer">
      <div class="goal-item-icon">↺</div>
      <div class="goal-item-body">
        <div class="goal-item-title">${escHtml(h.label)}${done ? '<span class="di-done-badge" style="margin-left:6px;font-size:10px">✓ Done</span>' : ''}</div>
        <div class="goal-item-meta">
          <span class="goal-item-type-badge badge-habit">habit</span>
          <span class="tag-badge tag-amber" style="font-size:11px">${escHtml(h.goal_title)}</span>
          <span style="font-size:11px;color:var(--text-muted)">${statParts.join(' · ')}</span>
        </div>
        ${hasTarget ? `<div class="goal-item-progress">
          <div class="progress-bar" style="flex:1;height:3px">
            <div class="progress-fill${done ? ' di-habit-bar-on' : ''}" style="width:${pct}%"></div>
          </div>
        </div>` : ''}
      </div>
    </div>`;
}

function previewContentHTML(task) {
  const parts = [];
  if (task.subtasks && task.subtasks.length > 0) {
    const done = task.subtasks.filter(s => s.completed).length;
    const total = task.subtasks.length;
    parts.push(`<span class="preview-subtasks">☐ ${done}/${total}</span>`);
  }
  if (task.notes && task.notes.trim()) {
    const snippet = task.notes.trim().replace(/\n+/g, ' · ').slice(0, 140);
    parts.push(`<span class="preview-notes">${escHtml(snippet)}</span>`);
  }
  return parts.join('');
}

// ── Inline expand (wide mode) ─────────────────────────────────
function toggleExpand(taskId) {
  const masterBody = document.querySelector('.task-list-column.master .task-list-col-body');
  if (!masterBody) return;

  // Collapse currently expanded
  if (_expandedTaskId !== null) {
    const prev = masterBody.querySelector(`.task-row[data-id="${_expandedTaskId}"]`);
    if (prev) {
      prev.classList.remove('expanded', 'selected');
      const pb = prev.querySelector('.task-expand-body');
      if (pb) pb.innerHTML = '';
    }
    if (_expandedTaskId === taskId) { _expandedTaskId = null; return; }
  }

  _expandedTaskId = taskId;
  const row = masterBody.querySelector(`.task-row[data-id="${taskId}"]`);
  if (!row) return;

  row.classList.add('expanded', 'selected');
  const expandBodyEl = row.querySelector('.task-expand-body');
  const task = _tasks.find(t => t.id === taskId);
  if (expandBodyEl && task) populateExpandBody(task, expandBodyEl);
}

function populateExpandBody(task, bodyEl) {
  const subtasksHTML = task.subtasks && task.subtasks.length
    ? `<div class="expand-subtasks">
        <div class="expand-section-label">Subtasks</div>
        ${task.subtasks.map(s => `
          <div class="subtask-row" data-sub-id="${s.id}">
            <div class="checkbox-square${s.completed ? ' checked' : ''}" data-sub-id="${s.id}"></div>
            <span class="subtask-title${s.completed ? ' done' : ''}">${escHtml(s.title)}</span>
          </div>`).join('')}
       </div>`
    : '';

  bodyEl.innerHTML = `
    <div class="expand-notes-col">
      <textarea class="expand-notes-input" placeholder="Add notes…" data-task-id="${task.id}">${escHtml(task.notes || '')}</textarea>
    </div>
    <div class="expand-meta-col">
      ${subtasksHTML}
      <div class="expand-actions">
        <button class="btn btn-ghost btn-sm expand-edit-btn" style="font-size:13px;padding:3px 8px;margin-left:-4px">Edit task →</button>
      </div>
    </div>`;

  autoResizeTextarea(bodyEl.querySelector('.expand-notes-input'));

  bodyEl.querySelector('.expand-notes-input').addEventListener('input', e => autoResizeTextarea(e.target));
  bodyEl.querySelector('.expand-notes-input').addEventListener('blur', async e => {
    const newNotes = e.target.value || null;
    try {
      const updated = await apiFetch('PUT', `/tasks/${task.id}`, { notes: newNotes });
      const idx = _tasks.findIndex(t => t.id === task.id);
      if (idx >= 0) {
        _tasks[idx] = updated;
        const preview = bodyEl.closest('.task-row')?.querySelector('.task-row-preview');
        if (preview) preview.innerHTML = previewContentHTML(updated);
      }
    } catch(e) { /* silent */ }
  });

  bodyEl.querySelectorAll('.checkbox-square').forEach(cb => {
    cb.addEventListener('click', async () => {
      const subId = parseInt(cb.dataset.subId);
      const t = _tasks.find(t => t.id === task.id);
      if (!t) return;
      const sub = t.subtasks.find(s => s.id === subId);
      if (!sub) return;
      await apiFetch('PUT', `/tasks/${task.id}/subtasks/${subId}`, { completed: sub.completed ? 0 : 1 });
      const updated = await apiFetch('GET', `/tasks/${task.id}`);
      const idx = _tasks.findIndex(t => t.id === task.id);
      if (idx >= 0) _tasks[idx] = updated;
      populateExpandBody(updated, bodyEl);
      const preview = bodyEl.closest('.task-row')?.querySelector('.task-row-preview');
      if (preview) preview.innerHTML = previewContentHTML(updated);
    });
  });

  bodyEl.querySelector('.expand-edit-btn').addEventListener('click', e => {
    e.stopPropagation();
    openDetail(task.id);
  });
}

// ── Detail panel ──────────────────────────────────────────────
function openDetail(taskId) {
  _selectedId = taskId;
  document.querySelectorAll('.task-row').forEach(r =>
    r.classList.toggle('selected', parseInt(r.dataset.id) === taskId)
  );
  const task = _tasks.find(t => t.id === taskId);
  if (task) renderDetail(task);
}

function closeDetail() {
  _selectedId = null;
  document.querySelectorAll('.task-row.selected').forEach(r => r.classList.remove('selected'));
  const pane = document.getElementById('tasks-detail-pane');
  if (pane) { pane.classList.remove('open'); pane.innerHTML = ''; }
  // Restore selected highlight on inline-expanded task if present
  if (_expandedTaskId) {
    const row = document.querySelector(`.task-row[data-id="${_expandedTaskId}"]`);
    if (row) row.classList.add('selected');
  }
}

function renderDetail(task) {
  const pane = document.getElementById('tasks-detail-pane');
  if (!pane) return;
  pane.classList.add('open');

  const goalOptions = _tGoals.map(g =>
    `<option value="${g.id}"${task.goal_id === g.id ? ' selected' : ''}>${escHtml(g.title)}</option>`
  ).join('');

  const tagCheckboxes = _tags.map(tg => {
    const checked = task.tags.some(t => t.id === tg.id);
    return `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
      <input type="checkbox" data-tag-id="${tg.id}" ${checked ? 'checked' : ''}> ${escHtml(tg.name)}
    </label>`;
  }).join('');

  const recurLabel = task.is_recurring && task.recurrence
    ? `↺ ${capitalize(task.recurrence.cadence)}` : 'One-time task';

  pane.innerHTML = `
    <div class="detail-panel">
      <div class="detail-header">
        <textarea class="detail-title-input" id="detail-title" rows="1">${escHtml(task.title)}</textarea>
        <button class="detail-close-btn" id="detail-close">×</button>
      </div>
      <div class="detail-body">
        <div class="recurrence-card">${recurLabel}</div>
        <div class="detail-grid">
          <div class="detail-field">
            <div class="detail-field-label">Priority</div>
            <select id="detail-priority">
              <option value="high"${task.priority === 'high' ? ' selected' : ''}>High</option>
              <option value="medium"${task.priority === 'medium' ? ' selected' : ''}>Medium</option>
              <option value="low"${task.priority === 'low' ? ' selected' : ''}>Low</option>
            </select>
          </div>
          <div class="detail-field">
            <div class="detail-field-label">Due date</div>
            <input type="date" id="detail-due" value="${task.due_date || ''}">
          </div>
          <div class="detail-field" style="grid-column:1/-1">
            <div class="detail-field-label">Linked goal</div>
            <select id="detail-goal">
              <option value="">None</option>
              ${goalOptions}
            </select>
          </div>
          ${task.linked_note ? `
          <div class="detail-field" style="grid-column:1/-1">
            <div class="detail-field-label">From note</div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <span style="font-size:13px;color:var(--text-secondary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(task.linked_note.title)}</span>
              <button class="btn btn-secondary btn-sm" id="detail-open-note" style="padding:2px 8px;font-size:12px;flex-shrink:0">Open note →</button>
            </div>
          </div>` : ''}
        </div>
        <div class="detail-section-title" style="margin-bottom:8px">Tags</div>
        <div id="detail-tags" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">${tagCheckboxes}</div>
        <div class="detail-section-title">Subtasks</div>
        <div class="subtask-list" id="detail-subtasks"></div>
        <div class="add-subtask-row">
          <input class="add-subtask-input" id="subtask-input" placeholder="Add subtask…" type="text">
          <button class="btn btn-secondary btn-sm" id="subtask-add-btn">Add</button>
        </div>
        <div class="divider"></div>
        <div class="detail-section-title">Notes</div>
        <textarea class="detail-notes" id="detail-notes" placeholder="Add notes…">${escHtml(task.notes || '')}</textarea>
      </div>
      <div class="detail-footer">
        <button class="btn btn-danger btn-sm" id="detail-delete">Delete</button>
        <button class="btn btn-primary btn-sm" id="detail-save">Save</button>
      </div>
    </div>`;

  renderSubtasks(task.subtasks || []);
  autoResizeTextarea(pane.querySelector('#detail-title'));
  pane.querySelector('#detail-title').addEventListener('input', e => autoResizeTextarea(e.target));
  pane.querySelector('#detail-close').addEventListener('click', closeDetail);
  pane.querySelector('#detail-save').addEventListener('click', () => saveDetail(task.id));
  pane.querySelector('#detail-notes').addEventListener('blur', () => saveDetail(task.id, true));
  pane.querySelector('#detail-delete').addEventListener('click', () => {
    if (confirm(`Delete "${task.title}"?`)) doDeleteTask(task.id);
  });
  pane.querySelector('#subtask-add-btn').addEventListener('click', () => addSubtask(task.id));
  pane.querySelector('#subtask-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addSubtask(task.id); }
  });
  pane.querySelector('#detail-open-note')?.addEventListener('click', () => {
    window._openNoteId = task.linked_note.id;
    loadPage('notes');
  });
}

function renderSubtasks(subtasks) {
  const container = document.getElementById('detail-subtasks');
  if (!container) return;
  container.innerHTML = subtasks.map(s => `
    <div class="subtask-row" data-sub-id="${s.id}">
      <div class="checkbox-square${s.completed ? ' checked' : ''}" data-sub-id="${s.id}"></div>
      <span class="subtask-title${s.completed ? ' done' : ''}">${escHtml(s.title)}</span>
      <button class="subtask-delete-btn" data-sub-id="${s.id}" title="Delete">×</button>
    </div>`).join('');

  container.querySelectorAll('.checkbox-square').forEach(cb => {
    cb.addEventListener('click', async () => {
      const task = _tasks.find(t => t.id === _selectedId);
      if (!task) return;
      const subId = parseInt(cb.dataset.subId);
      const sub = task.subtasks.find(s => s.id === subId);
      if (!sub) return;
      await apiFetch('PUT', `/tasks/${_selectedId}/subtasks/${subId}`, { completed: sub.completed ? 0 : 1 });
      await refreshSelectedTask();
    });
  });

  container.querySelectorAll('.subtask-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const subId = parseInt(btn.dataset.subId);
      await apiFetch('DELETE', `/tasks/${_selectedId}/subtasks/${subId}`);
      await refreshSelectedTask();
    });
  });
}

async function addSubtask(taskId) {
  const input = document.getElementById('subtask-input');
  const title = input.value.trim();
  if (!title) return;
  input.value = '';
  const task = _tasks.find(t => t.id === taskId);
  const sortOrder = task ? (task.subtasks || []).length : 0;
  await apiFetch('POST', `/tasks/${taskId}/subtasks`, { title, sort_order: sortOrder });
  await refreshSelectedTask();
}

// ── Task actions ──────────────────────────────────────────────
async function saveDetail(taskId, silent = false) {
  const title    = document.getElementById('detail-title')?.value.trim();
  const priority = document.getElementById('detail-priority')?.value;
  const due_date = document.getElementById('detail-due')?.value || null;
  const goal_id  = parseInt(document.getElementById('detail-goal')?.value) || null;
  const notes    = document.getElementById('detail-notes')?.value ?? null;
  const tag_ids  = Array.from(document.querySelectorAll('#detail-tags input[type=checkbox]'))
    .filter(c => c.checked).map(c => parseInt(c.dataset.tagId));

  const body = { tag_ids, notes };
  if (title)    body.title    = title;
  if (priority) body.priority = priority;
  if (due_date) body.due_date = due_date;
  else          body.clear_due_date = true;
  if (goal_id)  body.goal_id  = goal_id;
  else          body.clear_goal_id = true;

  try {
    const updated = await apiFetch('PUT', `/tasks/${taskId}`, body);
    const idx = _tasks.findIndex(t => t.id === taskId);
    if (idx >= 0) _tasks[idx] = updated;
    renderStats();
    renderAllLists();
    const pane = document.getElementById('tasks-detail-pane');
    if (!silent && pane?.classList.contains('open')) renderDetail(updated);
  } catch(e) {
    if (!silent) alert('Save failed: ' + e.message);
  }
}

async function doCompleteTask(taskId) {
  try {
    const updated = await apiFetch('POST', `/tasks/${taskId}/complete`);
    const idx = _tasks.findIndex(t => t.id === taskId);
    if (idx >= 0) _tasks[idx] = updated;
    if (_expandedTaskId === taskId) _expandedTaskId = null;
    if (_selectedId === taskId) closeDetail();
    renderAll();
  } catch(e) { alert('Error: ' + e.message); }
}

async function doDeleteTask(taskId) {
  try {
    await apiFetch('DELETE', `/tasks/${taskId}`);
    _tasks = _tasks.filter(t => t.id !== taskId);
    if (_expandedTaskId === taskId) _expandedTaskId = null;
    closeDetail();
    renderAll();
  } catch(e) { alert('Error: ' + e.message); }
}

async function refreshSelectedTask() {
  if (!_selectedId) return;
  const updated = await apiFetch('GET', `/tasks/${_selectedId}`);
  const idx = _tasks.findIndex(t => t.id === _selectedId);
  if (idx >= 0) _tasks[idx] = updated;
  renderSubtasks(updated.subtasks || []);
}

// ── New task modal ────────────────────────────────────────────
function openNewTaskModal(prefilledGoalId = null) {
  const tagOpts = _tags.map(tg =>
    `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
      <input type="checkbox" name="tag" value="${tg.id}"> ${escHtml(tg.name)}
    </label>`).join('');

  const goalOpts = _tGoals.map(g =>
    `<option value="${g.id}"${g.id === prefilledGoalId ? ' selected' : ''}>${escHtml(g.title)}</option>`).join('');

  const body = `
    <div class="form-group">
      <label class="form-label">Title *</label>
      <input class="form-input" id="nt-title" placeholder="Task title" autofocus>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group">
        <label class="form-label">Priority</label>
        <select class="form-select" id="nt-priority">
          <option value="high">High</option>
          <option value="medium" selected>Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Due date</label>
        <input class="form-input" id="nt-due" type="date">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Linked goal</label>
      <select class="form-select" id="nt-goal">
        <option value="">None</option>${goalOpts}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Tags</label>
      <div style="display:flex;flex-wrap:wrap;gap:10px">${tagOpts}</div>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="nt-notes" placeholder="Optional notes…"></textarea>
    </div>
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px">
        <input type="checkbox" id="nt-recurring"> Make recurring
      </label>
    </div>
    <div id="nt-recur-options" style="display:none;padding:10px;background:var(--bg-input);border-radius:8px;margin-top:-8px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Cadence</label>
          <select class="form-select" id="nt-cadence">
            <option value="daily">Daily</option>
            <option value="weekly" selected>Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Every N</label>
          <input class="form-input" id="nt-interval" type="number" value="1" min="1">
        </div>
      </div>
    </div>`;

  const modal = createModal('New task', body, async (overlay) => {
    const title = document.getElementById('nt-title').value.trim();
    if (!title) { alert('Title is required.'); return; }
    const checkedTags = Array.from(overlay.querySelectorAll('input[name=tag]:checked')).map(c => parseInt(c.value));
    const isRecurring = document.getElementById('nt-recurring').checked;
    const payload = {
      title,
      priority: document.getElementById('nt-priority').value,
      due_date: document.getElementById('nt-due').value || null,
      goal_id:  parseInt(document.getElementById('nt-goal').value) || null,
      notes:    document.getElementById('nt-notes').value || null,
      tag_ids:  checkedTags,
      make_recurring: isRecurring,
    };
    if (isRecurring) {
      payload.recurrence_cadence  = document.getElementById('nt-cadence').value;
      payload.recurrence_interval = parseInt(document.getElementById('nt-interval').value) || 1;
    }
    try {
      const created = await apiFetch('POST', '/tasks', payload);
      _tasks.unshift(created);
      closeModal(overlay);
      overlay.remove();
      renderAll();
    } catch(e) { alert('Error: ' + e.message); }
  });

  modal.querySelector('#nt-recurring').addEventListener('change', e => {
    modal.querySelector('#nt-recur-options').style.display = e.target.checked ? 'block' : 'none';
  });
  openModal(modal);
}

// ── Add list modal ────────────────────────────────────────────
function openAddListModal() {
  const tagOpts  = _tags.map(tg => `<option value="tag-${tg.id}">${escHtml(tg.name)}</option>`).join('');
  const goalOpts = _tGoals.map(g  => `<option value="goal-${g.id}">${escHtml(g.title)}</option>`).join('');

  if (!tagOpts && !goalOpts) {
    alert('Create some tags or goals first to build a filtered list.');
    return;
  }

  const body = `
    <div class="form-group">
      <label class="form-label">Filter by</label>
      <select class="form-select" id="al-filter">
        <option value="">— pick a tag or goal —</option>
        ${tagOpts  ? `<optgroup label="Tags">${tagOpts}</optgroup>`   : ''}
        ${goalOpts ? `<optgroup label="Goals">${goalOpts}</optgroup>` : ''}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">List name</label>
      <input class="form-input" id="al-name" placeholder="e.g. Health tasks">
    </div>`;

  const modal = createModal('Add task list', body, (overlay) => {
    const filterVal = document.getElementById('al-filter').value;
    const name = document.getElementById('al-name').value.trim();
    if (!filterVal || !name) { alert('Please select a filter and enter a name.'); return; }
    const [type, id] = filterVal.split('-');
    const configs = loadListConfigs();
    configs.push({ id: 'list-' + Date.now(), name, type, filter_id: parseInt(id) });
    saveListConfigs(configs);
    closeModal(overlay);
    overlay.remove();
    renderAllLists();
  });

  modal.querySelector('#al-filter').addEventListener('change', e => {
    const val = e.target.value;
    if (!val) return;
    const nameInput = modal.querySelector('#al-name');
    if (nameInput.value) return;
    const [type, id] = val.split('-');
    if (type === 'tag') {
      const tag = _tags.find(t => t.id === parseInt(id));
      if (tag) nameInput.value = tag.name;
    } else {
      const goal = _tGoals.find(g => g.id === parseInt(id));
      if (goal) nameInput.value = goal.title;
    }
  });

  openModal(modal);
}

// ── Utilities ─────────────────────────────────────────────────
function sortedTasks(arr) {
  const order = { high: 0, medium: 1, low: 2 };
  return [...arr].sort((a, b) => {
    switch (_sort) {
      case 'priority': return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
      case 'created':  return b.created_at.localeCompare(a.created_at);
      case 'alpha':    return a.title.localeCompare(b.title);
      default: {
        const ad = a.due_date || 'zzzz', bd = b.due_date || 'zzzz';
        return ad.localeCompare(bd);
      }
    }
  });
}

