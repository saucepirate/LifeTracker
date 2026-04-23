// ── Module state ─────────────────────────────────────────────
let _tasks = [];
let _tags = [];
let _tGoals = [];
let _filter = 'all';
let _sort = 'due_date';
let _selectedId = null;
let _activeTagIds = new Set();
let _activeGoalId = null;
let _wideMode = true;
let _expandedTaskId = null;

const LISTS_KEY = 'lt_task_lists';

// ── Entry point ───────────────────────────────────────────────
registerPage('tasks', async function(content) {
  _filter = 'all';
  _activeTagIds = new Set();
  _activeGoalId = null;
  _selectedId = null;
  _expandedTaskId = null;
  _wideMode = true;

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
        <div class="filter-pills" id="tasks-filter-pills">
          ${['all','today','upcoming','recurring','completed'].map(f =>
            `<button class="filter-pill${f==='all'?' active':''}" data-filter="${f}">${capitalize(f)}</button>`
          ).join('')}
        </div>
        <div id="tasks-secondary-filters"></div>
        <div class="task-lists-row" id="task-lists-row"></div>
      </div>
      <div class="tasks-detail-pane" id="tasks-detail-pane"></div>
    </div>`;

  document.getElementById('new-task-btn').addEventListener('click', openNewTaskModal);

  document.getElementById('tasks-filter-pills').addEventListener('click', e => {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;
    _filter = pill.dataset.filter;
    document.querySelectorAll('#tasks-filter-pills .filter-pill').forEach(p =>
      p.classList.toggle('active', p === pill)
    );
    renderAllLists();
  });

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
  const [tr, gr, rr] = await Promise.all([
    apiFetch('GET', '/tasks'),
    apiFetch('GET', '/goals'),
    apiFetch('GET', '/tags'),
  ]);
  _tasks = tr.items;
  _tGoals = gr.items;
  _tags  = rr.items;
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
  const container = document.getElementById('tasks-secondary-filters');
  if (!container) return;
  const hasGoals = _tGoals.length > 0;

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      <span style="font-size:13px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap">Tags:</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${_tags.map(tg => {
          const active = _activeTagIds.has(tg.id);
          return `<button class="filter-pill tag-filter-pill${active ? ' active' : ''}" data-tag-id="${tg.id}"
            style="${active ? `background:var(--tag-${tg.color}-bg);color:var(--tag-${tg.color}-text);border-color:transparent` : ''}"
          >${escHtml(tg.name)}</button>`;
        }).join('')}
      </div>
      ${hasGoals ? `<select id="goal-filter-select" style="font-size:13px;padding:4px 8px;border:var(--border-subtle);border-radius:var(--radius-pill);background:var(--bg-card);color:var(--text-secondary);cursor:pointer;outline:none">
        <option value="">All goals</option>
        ${_tGoals.map(g => `<option value="${g.id}"${_activeGoalId === g.id ? ' selected' : ''}>${escHtml(g.title)}</option>`).join('')}
      </select>` : ''}
    </div>`;

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

  col.innerHTML = `
    <div class="task-list-col-header">
      <span class="task-list-col-name">${escHtml(config.name)}</span>
      ${filterBadge}
      ${!isMaster ? `<button class="task-list-col-close" title="Remove list">×</button>` : ''}
    </div>
    <div class="task-list-col-body"></div>`;

  if (!isMaster) {
    col.querySelector('.task-list-col-close').addEventListener('click', () => {
      removeListConfig(config.id);
      renderAllLists();
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

  if (!tasks.length) {
    bodyEl.innerHTML = `<div class="empty-state" style="padding:28px 12px;text-align:center">
      <div class="empty-state-text">No tasks</div></div>`;
  } else if (config.type === 'master') {
    bodyEl.innerHTML = groupedTasksHTML(tasks, isWideMaster);
  } else {
    bodyEl.innerHTML = tasks.map(t => taskRowHTML(t, false)).join('');
  }

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
      const taskId = parseInt(cb.closest('.task-row').dataset.id);
      const task = _tasks.find(t => t.id === taskId);
      if (task && task.status === 'pending') doCompleteTask(taskId);
    });
  });

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
  const groups = [
    { label: 'Overdue',   items: tasks.filter(t => t.status === 'pending' && t.due_date && t.due_date < today) },
    { label: 'Today',     items: tasks.filter(t => t.status === 'pending' && t.due_date === today) },
    { label: 'Upcoming',  items: tasks.filter(t => t.status === 'pending' && t.due_date && t.due_date > today) },
    { label: 'No date',   items: tasks.filter(t => t.status === 'pending' && !t.due_date) },
    { label: 'Completed', items: tasks.filter(t => t.status === 'completed') },
  ];
  return groups.filter(g => g.items.length).map(g => `
    <div class="task-group">
      <div class="section-header">${g.label} <span style="opacity:.5;font-weight:400">(${g.items.length})</span></div>
      ${g.items.map(t => taskRowHTML(t, isWide)).join('')}
    </div>`).join('');
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

  const body = { tag_ids, notes, goal_id };
  if (title)    body.title    = title;
  if (priority) body.priority = priority;
  if (due_date) body.due_date = due_date;
  else          body.clear_due_date = true;

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
function openNewTaskModal() {
  const tagOpts = _tags.map(tg =>
    `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
      <input type="checkbox" name="tag" value="${tg.id}"> ${escHtml(tg.name)}
    </label>`).join('');

  const goalOpts = _tGoals.map(g =>
    `<option value="${g.id}">${escHtml(g.title)}</option>`).join('');

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

