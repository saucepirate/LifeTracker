/* ── Quick Add FAB ──────────────────────────────────────────────
   Global floating action button. Context-aware: inherits page,
   goal, trip, project, note context from window._fabCtx.
   Uses .fab-assoc-badge radio buttons for entity association.
────────────────────────────────────────────────────────────────── */

let _fabIsOpen         = false;
let _fabType           = 'task';
let _fabTags           = [];
let _fabGoals          = [];
let _fabTrips          = [];
let _fabProjects       = [];
let _fabMilestones     = [];
let _fabInvSymbols     = [];
let _fabSelectedTagIds = new Set();

// Resolved entity names — set in _fabLoadData once all reference data is available
let _fabResolvedProjectId   = null;
let _fabResolvedProjectName = '';
let _fabResolvedTripId      = null;
let _fabResolvedTripName    = '';
let _fabResolvedGoalId      = null;
let _fabResolvedGoalName    = '';

// ── Mount on DOM ready ────────────────────────────────────────
window.addEventListener('DOMContentLoaded', _fabMount);

function _fabMount() {
  const wrap = document.createElement('div');
  wrap.id        = 'fab-wrap';
  wrap.className = 'fab-wrap';
  wrap.innerHTML = `
    <div class="fab-panel" id="fab-panel">
      <div class="fab-panel-inner">
        <div class="fab-panel-head">
          <div class="fab-type-tabs" id="fab-type-tabs"></div>
          <span class="fab-ctx-pill" id="fab-ctx-pill"></span>
        </div>
        <div id="fab-form-body" class="fab-form-body"></div>
        <div class="fab-panel-footer">
          <button class="btn btn-secondary btn-sm" id="fab-cancel-btn">Cancel</button>
          <button class="btn btn-primary btn-sm"   id="fab-submit-btn">Add</button>
        </div>
      </div>
    </div>
    <button class="fab-btn" id="fab-btn" title="Quick add" aria-label="Quick add">
      <svg class="fab-plus-icon" width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 3v12M3 9h12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      </svg>
    </button>`;
  document.body.appendChild(wrap);

  document.getElementById('fab-btn').addEventListener('click', _fabToggle);
  document.getElementById('fab-cancel-btn').addEventListener('click', _fabHide);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _fabIsOpen) _fabHide();
  });
  document.addEventListener('click', e => {
    if (_fabIsOpen && !e.composedPath().some(el => el?.id === 'fab-wrap')) _fabHide();
  });
}

// ── Open / close ──────────────────────────────────────────────
function _fabToggle() { _fabIsOpen ? _fabHide() : _fabShow(); }

async function _fabShow() {
  _fabIsOpen = true;
  _fabSelectedTagIds = new Set();
  document.getElementById('fab-btn').classList.add('open');
  document.getElementById('fab-panel').classList.add('visible');

  await _fabLoadData();

  // Always reset to the page's default type on each open
  const ctx   = window._fabCtx || {};
  const page  = ctx.page;
  const types = _fabGetTypes();
  if (page === 'day')          _fabType = 'day-item';
  else if (page === 'finance') _fabType = 'inv-action';
  else if (page === 'notes')   _fabType = 'note';
  else                         _fabType = 'task';
  // Ensure the chosen type exists in this context's type list
  if (!types.find(t => t.id === _fabType)) _fabType = types[0]?.id || 'task';

  _fabRenderAll();

  setTimeout(() => {
    const first = document.querySelector('#fab-form-body input:not([type=checkbox]), #fab-form-body textarea');
    if (first) first.focus();
  }, 60);
}

function _fabHide() {
  _fabIsOpen = false;
  _fabSelectedTagIds = new Set();
  document.getElementById('fab-btn').classList.remove('open');
  document.getElementById('fab-panel').classList.remove('visible');
}

// ── Reference data ────────────────────────────────────────────
async function _fabLoadData() {
  const ctx = window._fabCtx || {};
  try {
    const [tRes, gRes, trRes, prRes] = await Promise.all([
      apiFetch('GET', '/tags'),
      apiFetch('GET', '/goals?status=active'),
      apiFetch('GET', '/trips'),
      apiFetch('GET', '/projects'),
    ]);
    _fabTags     = tRes?.items  || tRes  || [];
    _fabGoals    = gRes?.items  || gRes  || [];
    // Trips endpoint returns { upcoming, planning, past } — flatten to array
    _fabTrips    = [
      ...(trRes?.upcoming || []),
      ...(trRes?.planning || []),
      ...(trRes?.past     || []),
      ...(trRes?.items    || []),
    ];
    _fabProjects = prRes?.items || prRes || [];
  } catch(e) { /* fail silently */ }

  // Load milestones from project context (direct project or trip's linked project)
  _fabMilestones = [];
  const projId = ctx.projectId || ctx.tripProjectId;
  if (projId) {
    // ctx.projectMilestones may already be set by the module
    if (ctx.projectMilestones) {
      _fabMilestones = ctx.projectMilestones;
    } else {
      try {
        const pd = await apiFetch('GET', `/projects/${projId}`);
        _fabMilestones = (pd.milestones || [])
          .filter(m => m.status !== 'completed')
          .map(m => ({ id: m.id, title: m.title }));
      } catch(e) { /* fail silently */ }
    }
  }

  // Load known investment symbols for inv-note
  _fabInvSymbols = [];
  if ((ctx.page === 'finance') || _fabType === 'inv-action' || _fabType === 'inv-note') {
    try {
      const pos = await apiFetch('GET', '/investments/positions');
      const rows = pos?.items || pos || [];
      const syms = [...new Set(rows.map(r => r.symbol).filter(Boolean))].sort();
      _fabInvSymbols = syms;
    } catch(e) { /* fail silently */ }
  }

  // Pre-resolve entity names now that all reference data is loaded
  // ctx.projectName / .tripName / .goalName are set by modules; fall back to list lookup
  const rProjId = ctx.tripProjectId || ctx.projectId || null;
  _fabResolvedProjectId   = rProjId;
  _fabResolvedProjectName = rProjId
    ? (ctx.projectName || _fabProjects.find(p => p.id === rProjId)?.title || '')
    : '';

  const rTripId = ctx.tripId || ctx.projectTripId || null;
  _fabResolvedTripId   = rTripId;
  _fabResolvedTripName = rTripId
    ? (ctx.tripName || _fabTrips.find(t => t.id === rTripId)?.name || '')
    : '';

  _fabResolvedGoalId   = ctx.goalId || null;
  _fabResolvedGoalName = ctx.goalId
    ? (ctx.goalName || _fabGoals.find(g => g.id === ctx.goalId)?.title || '')
    : '';
}

// ── Available types ───────────────────────────────────────────
function _fabGetTypes() {
  const ctx  = window._fabCtx || {};
  const page = ctx.page;
  if (page === 'day')
    return [{ id: 'day-item', label: 'Day Item' }, { id: 'task', label: 'Task' }, { id: 'note', label: 'Note' }];
  if (page === 'finance')
    return [{ id: 'inv-action', label: 'Action' }, { id: 'inv-note', label: 'Inv Note' }, { id: 'task', label: 'Task' }];
  if (ctx.tripId)
    return [{ id: 'task', label: 'Task' }, { id: 'pack', label: 'Packing' }, { id: 'note', label: 'Note' }];
  if (page === 'notes')
    return [{ id: 'note', label: 'Note' }, { id: 'task', label: 'Task' }];
  return [{ id: 'task', label: 'Task' }, { id: 'note', label: 'Note' }];
}

// ── Render ────────────────────────────────────────────────────
function _fabRenderAll() {
  _fabRenderCtxPill();
  _fabRenderTabs();
  _fabRenderForm();
  const btn = document.getElementById('fab-submit-btn');
  btn.disabled    = false;
  btn.textContent = _fabSubmitLabel();
  btn.onclick = _fabSubmit;
}

function _fabRenderCtxPill() {
  const ctx  = window._fabCtx || {};
  const pill = document.getElementById('fab-ctx-pill');
  if (!pill) return;
  let label = '';
  if (ctx.tripName)         label = '✈ ' + ctx.tripName;
  else if (ctx.goalName)    label = '◎ ' + ctx.goalName;
  else if (ctx.projectName) label = '▤ ' + ctx.projectName;
  pill.textContent   = label;
  pill.style.display = label ? '' : 'none';
}

function _fabRenderTabs() {
  const bar   = document.getElementById('fab-type-tabs');
  const types = _fabGetTypes();
  bar.innerHTML = types.map(t =>
    `<button class="fab-type-tab${t.id === _fabType ? ' active' : ''}" data-type="${t.id}">${t.label}</button>`
  ).join('');
  bar.querySelectorAll('.fab-type-tab').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _fabType = btn.dataset.type;
      _fabSelectedTagIds = new Set();
      _fabPreSelectContextTags();
      _fabRenderAll();
    })
  );
}

function _fabRenderForm() {
  _fabPreSelectContextTags();
  const body = document.getElementById('fab-form-body');
  if (_fabType === 'task')       body.innerHTML = _fabTaskHTML();
  else if (_fabType === 'note')  body.innerHTML = _fabNoteHTML();
  else if (_fabType === 'pack')  body.innerHTML = _fabPackHTML();
  else if (_fabType === 'day-item') body.innerHTML = _fabDayItemHTML();
  else if (_fabType === 'inv-action') body.innerHTML = _fabInvActionHTML();
  else if (_fabType === 'inv-note')   body.innerHTML = _fabInvNoteHTML();

  initSmartDates(body);
  _fabWireAssocBadges(body);
  _fabWireTagPills(body);
  _fabWireMilestoneVisibility(body);

  const moreBtn = body.querySelector('.fab-more-btn');
  if (moreBtn) moreBtn.addEventListener('click', e => { e.stopPropagation(); _fabMoreOptions(); });
}

function _fabPreSelectContextTags() {
  const ctx = window._fabCtx || {};
  _fabSelectedTagIds = new Set(ctx.tagIds || []);
}

function _fabSubmitLabel() {
  if (_fabType === 'note')       return 'Add note';
  if (_fabType === 'pack')       return 'Add item';
  if (_fabType === 'day-item')   return 'Add';
  if (_fabType === 'inv-action') return 'Add action';
  if (_fabType === 'inv-note')   return 'Add note';
  return 'Add task';
}

// ── Association badges ────────────────────────────────────────
function _fabBuildAssocOptions(type) {
  const ctx    = window._fabCtx || {};
  const badges = [];

  if (type === 'task' || type === 'note') {
    if (_fabResolvedProjectId) {
      badges.push({ val: `project:${_fabResolvedProjectId}`, label: _fabResolvedProjectName || 'Project', assocType: 'project' });
    }
    if (_fabResolvedTripId) {
      badges.push({ val: `trip:${_fabResolvedTripId}`, label: _fabResolvedTripName || 'Trip', assocType: 'trip' });
    }
    if (_fabResolvedGoalId) {
      badges.push({ val: `goal:${_fabResolvedGoalId}`, label: _fabResolvedGoalName || 'Goal', assocType: 'goal' });
    }
    if (badges.length) badges.push({ val: '', label: 'None', assocType: 'none' });
  }

  return badges;
}

function _fabAssocBadgesHTML(type) {
  const badges   = _fabBuildAssocOptions(type);
  if (!badges.length) return '';

  const defaultVal = badges[0].val;

  return `<div class="fab-assoc-section">
    <div class="fab-assoc-label">Link to</div>
    <div class="fab-assoc-row" id="fab-assoc-row">
      ${badges.map(b => `
        <button type="button"
          class="fab-assoc-badge${b.val === defaultVal ? ' active' : ''}"
          data-assoc-val="${escHtml(b.val)}"
          data-assoc-type="${b.assocType}">
          ${b.assocType !== 'none' ? '<span class="fab-assoc-dot"></span>' : ''}
          ${escHtml(b.label)}
        </button>`).join('')}
    </div>
    ${_fabMilestoneSelectHTML(defaultVal)}
  </div>`;
}

function _fabMilestoneSelectHTML(activeVal) {
  if (!_fabMilestones.length) return '';
  const showProject = activeVal && activeVal.startsWith('project:');
  return `<div class="fab-milestone-row" id="fab-ms-row" style="${showProject ? '' : 'display:none'}">
    <select class="form-select" id="fab-milestone-sel">
      <option value="">No milestone</option>
      ${_fabMilestones.map(m => `<option value="${m.id}">${escHtml(m.title)}</option>`).join('')}
    </select>
  </div>`;
}

function _fabWireAssocBadges(root) {
  const badges = root.querySelectorAll('.fab-assoc-badge');
  badges.forEach(badge =>
    badge.addEventListener('click', () => {
      badges.forEach(b => b.classList.remove('active'));
      badge.classList.add('active');
      // Show/hide milestone select
      const msRow = root.querySelector('#fab-ms-row');
      if (msRow) msRow.style.display = badge.dataset.assocVal?.startsWith('project:') ? '' : 'none';
    })
  );
}

function _fabWireMilestoneVisibility(root) {
  // Already wired via badge click; this handles initial state (done in HTML)
}

function _fabGetActiveAssocVal() {
  return document.querySelector('#fab-assoc-row .fab-assoc-badge.active')?.dataset.assocVal ?? '';
}

// ── Tag pills ─────────────────────────────────────────────────
function _fabTagPillsHTML() {
  if (!_fabTags.length) return '';
  return `<div class="fab-tag-row">${_fabTags.map(t =>
    `<button type="button" class="tag-badge tag-${t.color} fab-tag-pill${_fabSelectedTagIds.has(t.id) ? ' fab-tag-sel' : ''}" data-tag-id="${t.id}">${escHtml(t.name)}</button>`
  ).join('')}</div>`;
}

function _fabWireTagPills(root) {
  root.querySelectorAll('.fab-tag-pill').forEach(btn =>
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.tagId);
      if (_fabSelectedTagIds.has(id)) { _fabSelectedTagIds.delete(id); btn.classList.remove('fab-tag-sel'); }
      else { _fabSelectedTagIds.add(id); btn.classList.add('fab-tag-sel'); }
    })
  );
}

// ── Form HTML ─────────────────────────────────────────────────
function _fabTaskHTML() {
  return `
    <div class="fab-fg">
      <input class="form-input" id="fab-t-title" placeholder="Task title…">
    </div>
    <div class="fab-form-row">
      <input class="form-input" id="fab-t-due" type="date">
      <select class="form-select" id="fab-t-priority">
        <option value="medium" selected>Medium</option>
        <option value="high">High</option>
        <option value="low">Low</option>
      </select>
    </div>
    ${_fabAssocBadgesHTML('task')}
    ${_fabTagPillsHTML()}
    <button type="button" class="fab-more-btn">More options →</button>`;
}

function _fabNoteHTML() {
  return `
    <div class="fab-fg">
      <input class="form-input" id="fab-n-title" placeholder="Note title…">
    </div>
    <div class="fab-fg">
      <textarea class="form-textarea fab-textarea" id="fab-n-body" placeholder="Content… (optional)" rows="3"></textarea>
    </div>
    ${_fabAssocBadgesHTML('note')}
    ${_fabTagPillsHTML()}
    <button type="button" class="fab-more-btn">More options →</button>`;
}

function _fabPackHTML() {
  const ctx = window._fabCtx || {};
  return `
    <div class="fab-ctx-pack-lbl">Adding to: <strong>${escHtml(ctx.tripName || 'trip')}</strong></div>
    <div class="fab-fg">
      <input class="form-input" id="fab-p-item" placeholder="Item name…">
    </div>
    <div class="fab-fg">
      <input class="form-input" id="fab-p-cat" placeholder="Category (e.g. Clothing, Gear…)">
    </div>`;
}

function _fabDayItemHTML() {
  const ctx = window._fabCtx || {};
  const dayDate = ctx.dayDate || '';
  return `
    <div class="fab-fg">
      <input class="form-input" id="fab-d-title" placeholder="What to do…">
    </div>
    <div class="fab-assoc-section">
      <div class="fab-assoc-label">Section</div>
      <div class="fab-assoc-row" id="fab-assoc-row">
        <button type="button" class="fab-assoc-badge active" data-assoc-val="must_do" data-assoc-type="must_do">
          <span class="fab-assoc-dot"></span>Must Do
        </button>
        <button type="button" class="fab-assoc-badge" data-assoc-val="like_to_do" data-assoc-type="like_to_do">
          <span class="fab-assoc-dot"></span>Like to Do
        </button>
        <button type="button" class="fab-assoc-badge" data-assoc-val="later" data-assoc-type="none">
          Later
        </button>
      </div>
    </div>
    <input type="hidden" id="fab-d-date" value="${escHtml(dayDate)}">`;
}

function _fabInvSymbolsDatalist() {
  if (!_fabInvSymbols.length) return '';
  return `<datalist id="fab-inv-syms">${_fabInvSymbols.map(s => `<option value="${escHtml(s)}">`).join('')}</datalist>`;
}

function _fabInvActionHTML() {
  return `
    ${_fabInvSymbolsDatalist()}
    <div class="fab-form-row">
      <input class="form-input" id="fab-ia-symbol" placeholder="Symbol (e.g. NVDA)" list="fab-inv-syms" style="text-transform:uppercase">
      <select class="form-select" id="fab-ia-type">
        <option value="research">Research</option>
        <option value="buy">Buy</option>
        <option value="sell">Sell</option>
        <option value="review">Review</option>
        <option value="other">Other</option>
      </select>
    </div>
    <div class="fab-fg">
      <input class="form-input" id="fab-ia-title" placeholder="Action title…">
    </div>
    <div class="fab-fg">
      <input class="form-input" id="fab-ia-due" type="date">
    </div>`;
}

function _fabInvNoteHTML() {
  return `
    ${_fabInvSymbolsDatalist()}
    <div class="fab-form-row">
      <input class="form-input" id="fab-in-symbol" placeholder="Symbol (e.g. NVDA)" list="fab-inv-syms" style="text-transform:uppercase">
      <select class="form-select" id="fab-in-type">
        <option value="general" selected>General</option>
        <option value="thesis">Thesis</option>
        <option value="action">Action</option>
        <option value="watchlist">Watchlist</option>
      </select>
    </div>
    <div class="fab-fg">
      <textarea class="form-textarea fab-textarea" id="fab-in-content" placeholder="Note…" rows="3"></textarea>
    </div>`;
}

// ── More options ──────────────────────────────────────────────
function _fabMoreOptions() {
  const ctx = window._fabCtx || {};
  _fabHide();
  if (_fabType === 'task') {
    window._fabQuickAdd = { type: 'task', goalId: ctx.goalId || null };
    loadPage('tasks');
  } else if (_fabType === 'note') {
    window._fabQuickAdd = { type: 'note' };
    loadPage('notes');
  }
}

// ── Submit ────────────────────────────────────────────────────
async function _fabSubmit() {
  const btn = document.getElementById('fab-submit-btn');
  btn.disabled    = true;
  btn.textContent = '…';
  try {
    if (_fabType === 'task')       await _fabDoTask();
    if (_fabType === 'note')       await _fabDoNote();
    if (_fabType === 'pack')       await _fabDoPack();
    if (_fabType === 'day-item')   await _fabDoDayItem();
    if (_fabType === 'inv-action') await _fabDoInvAction();
    if (_fabType === 'inv-note')   await _fabDoInvNote();
    _fabHide();
    _fabFlash();
    // Notify the current page so it can refresh its data
    const addedType = _fabType;
    const onAdded = window._fabCtx?._onAdded;
    if (typeof onAdded === 'function') onAdded(addedType);
  } catch(e) {
    alert(e.message || 'Failed to save.');
    btn.disabled    = false;
    btn.textContent = _fabSubmitLabel();
  }
}

async function _fabDoTask() {
  const title = document.getElementById('fab-t-title')?.value?.trim();
  if (!title) throw new Error('Title is required.');

  const assocVal  = _fabGetActiveAssocVal();
  const priority  = document.getElementById('fab-t-priority').value;
  const dueDate   = getDateVal(document.getElementById('fab-t-due'));
  const tagIds    = [..._fabSelectedTagIds];
  const msId      = document.getElementById('fab-milestone-sel')?.value || null;

  if (assocVal.startsWith('project:')) {
    const projId = parseInt(assocVal.slice(8));
    await apiFetch('POST', `/projects/${projId}/tasks`, {
      title, priority, due_date: dueDate,
      milestone_id: msId ? parseInt(msId) : null,
    });
  } else {
    const goalId = assocVal.startsWith('goal:') ? parseInt(assocVal.slice(5)) : null;
    const tripId = assocVal.startsWith('trip:') ? parseInt(assocVal.slice(5)) : null;
    // When linking to a trip, also add the trip's tag so it appears in the trip's task view
    const ctx = window._fabCtx || {};
    const finalTagIds = [...tagIds];
    if (tripId && ctx.tripTagId && !finalTagIds.includes(ctx.tripTagId)) {
      finalTagIds.push(ctx.tripTagId);
    }
    await apiFetch('POST', '/tasks', { title, priority, due_date: dueDate, goal_id: goalId, trip_id: tripId, tag_ids: finalTagIds });
  }
}

async function _fabDoNote() {
  const title   = document.getElementById('fab-n-title')?.value?.trim() || 'Untitled';
  const content = document.getElementById('fab-n-body')?.value?.trim()  || null;
  const assocVal = _fabGetActiveAssocVal();
  const tagIds   = [..._fabSelectedTagIds];

  const payload = { title, content, tag_ids: tagIds };
  let goalId = null;

  if (assocVal.startsWith('project:'))    payload.project_id = parseInt(assocVal.slice(8));
  else if (assocVal.startsWith('trip:'))  payload.trip_id    = parseInt(assocVal.slice(5));
  else if (assocVal.startsWith('goal:'))  goalId             = parseInt(assocVal.slice(5));

  const created = await apiFetch('POST', '/notes', payload);
  if (goalId) await apiFetch('PUT', `/notes/${created.id}`, { goal_id: goalId, tag_ids: tagIds });
}

async function _fabDoPack() {
  const ctx = window._fabCtx || {};
  if (!ctx.tripId) throw new Error('No trip context.');
  const itemName = document.getElementById('fab-p-item')?.value?.trim();
  if (!itemName)  throw new Error('Item name is required.');
  const category = document.getElementById('fab-p-cat')?.value?.trim() || 'General';
  await apiFetch('POST', `/trips/${ctx.tripId}/packing/apply-inline-preset`, {
    categories: [{ name: category, items: [{ name: itemName, quantity: 1 }] }],
    mode: 'merge',
  });
}

async function _fabDoDayItem() {
  const title   = document.getElementById('fab-d-title')?.value?.trim();
  if (!title) throw new Error('Title is required.');
  const section  = _fabGetActiveAssocVal() || 'later';
  const planDate = document.getElementById('fab-d-date')?.value || todayISO();
  await apiFetch('POST', '/day/items', { title, section, plan_date: planDate, status: 'planned' });
}

async function _fabDoInvAction() {
  const symbol = (document.getElementById('fab-ia-symbol')?.value?.trim() || '').toUpperCase();
  if (!symbol) throw new Error('Symbol is required.');
  const actionType = document.getElementById('fab-ia-type')?.value || 'research';
  const title      = document.getElementById('fab-ia-title')?.value?.trim() || symbol + ' ' + actionType;
  const dueDate    = getDateVal(document.getElementById('fab-ia-due'));
  await apiFetch('POST', '/investments/actions', { symbol, action_type: actionType, title, due_date: dueDate });
}

async function _fabDoInvNote() {
  const symbol = (document.getElementById('fab-in-symbol')?.value?.trim() || '').toUpperCase();
  if (!symbol) throw new Error('Symbol is required.');
  const noteType = document.getElementById('fab-in-type')?.value || 'general';
  const content  = document.getElementById('fab-in-content')?.value?.trim();
  if (!content) throw new Error('Note content is required.');
  await apiFetch('POST', '/investments/notes', { symbol, note_type: noteType, content });
}

function _fabFlash() {
  const btn = document.getElementById('fab-btn');
  if (!btn) return;
  btn.classList.add('fab-success');
  setTimeout(() => btn.classList.remove('fab-success'), 1400);
}
