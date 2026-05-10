// ── Trip Notes tab — full notes experience scoped to a trip ───
let _tnNotes      = [];
let _tnAllTags    = [];
let _tnGoals      = [];
let _tnProjects   = [];
let _tnSelectedId = null;
let _tnSaveTimer  = null;
let _tnQuill      = null;
let _tnContainer  = null;
let _tnTrip       = null;
let _tnSearch     = '';
let _tnPinnedOnly = false;
let _tnSort       = 'updated';

async function renderNotesTab(container, trip) {
  _tnTrip       = trip;
  _tnContainer  = container;
  _tnSelectedId = null;
  _tnQuill      = null;
  _tnSearch     = '';
  _tnPinnedOnly = false;
  clearTimeout(_tnSaveTimer);

  container.innerHTML = '<div class="loading-state" style="padding:40px 0">Loading notes…</div>';

  try {
    const [nd, td, gd, pd] = await Promise.all([
      apiFetch('GET', `/notes?trip_id=${trip.id}`),
      apiFetch('GET', '/tags'),
      apiFetch('GET', '/goals'),
      apiFetch('GET', '/projects/?status=active').catch(() => ({ items: [] })),
    ]);
    _tnNotes    = nd.items;
    _tnAllTags  = td.items;
    _tnGoals    = gd.items;
    _tnProjects = pd.items || [];
  } catch(e) {
    container.innerHTML = `<div class="trip-tab-placeholder"><div>${escHtml(e.message)}</div></div>`;
    return;
  }

  _tnRenderList();
}

// ── List view ─────────────────────────────────────────────────
function _tnRenderList() {
  _tnSelectedId = null;
  _tnQuill      = null;
  clearTimeout(_tnSaveTimer);
  if (!_tnContainer) return;

  _tnContainer.innerHTML = `
    <div class="notes-page">
      <div class="notes-header">
        <h1 class="page-title" style="font-size:16px;margin:0">Notes</h1>
        <input class="form-input" id="tn-search" placeholder="Search…"
          value="${escHtml(_tnSearch)}" style="flex:1;max-width:280px;font-size:13px">
        <label class="notes-filter-option" style="font-size:13px;white-space:nowrap">
          <input type="checkbox" id="tn-pinned-only" ${_tnPinnedOnly ? 'checked' : ''}> Pinned only
        </label>
        <select id="tn-sort" class="form-select" style="font-size:13px;padding:4px 8px;height:auto;width:auto">
          <option value="updated"  ${_tnSort==='updated' ?'selected':''}>Last updated</option>
          <option value="created"  ${_tnSort==='created' ?'selected':''}>Date created</option>
          <option value="title"    ${_tnSort==='title'   ?'selected':''}>Title A–Z</option>
        </select>
        <button class="btn btn-primary btn-sm" id="tn-new-btn">+ New note</button>
      </div>
      <div id="tn-grid" class="notes-grid"></div>
    </div>`;

  const C = _tnContainer;
  C.querySelector('#tn-search').addEventListener('input', e => { _tnSearch = e.target.value; _tnRenderGrid(); });
  C.querySelector('#tn-search').addEventListener('keydown', e => {
    if (e.key === 'Escape') { _tnSearch = ''; C.querySelector('#tn-search').value = ''; _tnRenderGrid(); }
  });
  C.querySelector('#tn-pinned-only').addEventListener('change', e => { _tnPinnedOnly = e.target.checked; _tnRenderGrid(); });
  C.querySelector('#tn-sort').addEventListener('change', e => { _tnSort = e.target.value; _tnRenderGrid(); });
  C.querySelector('#tn-new-btn').addEventListener('click', _tnCreate);

  _tnRenderGrid();
}

function _tnRenderGrid() {
  const grid = _tnContainer?.querySelector('#tn-grid');
  if (!grid) return;

  let list = [..._tnNotes];

  if (_tnSearch) {
    const q = _tnSearch.toLowerCase();
    list = list.filter(n =>
      n.title.toLowerCase().includes(q) ||
      _stripHtml(n.content || '').toLowerCase().includes(q)
    );
  }
  if (_tnPinnedOnly) list = list.filter(n => n.pinned);

  list.sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned - a.pinned;
    if (_tnSort === 'title')   return a.title.localeCompare(b.title);
    if (_tnSort === 'created') return b.created_at.localeCompare(a.created_at);
    return b.updated_at.localeCompare(a.updated_at);
  });

  if (!list.length) {
    if (_tnSearch || _tnPinnedOnly) {
      grid.innerHTML = `<div style="grid-column:1/-1;padding:64px;text-align:center;font-size:14px;color:var(--text-muted)">No matching notes</div>`;
    } else {
      grid.innerHTML = `<div style="grid-column:1/-1;padding:48px 24px;text-align:center">
        <div style="font-size:32px;margin-bottom:12px;opacity:.4">📝</div>
        <div style="font-size:15px;font-weight:500;color:var(--text-primary);margin-bottom:6px">No notes yet</div>
        <div style="font-size:13px;color:var(--text-muted);max-width:280px;margin:0 auto 16px">Keep packing lists, hotel details, local tips, and anything else you'll need.</div>
        <button class="btn btn-primary btn-sm" id="tn-empty-create">+ Create first note</button>
      </div>`;
      grid.querySelector('#tn-empty-create')?.addEventListener('click', _tnCreate);
    }
    return;
  }

  grid.innerHTML = list.map(n => {
    const snippet   = _stripHtml(n.content || '').slice(0, 140).trim();
    const date      = formatDateShort(n.updated_at.slice(0, 10));
    const tagsHTML  = (n.tags || []).map(t =>
      `<span class="tag-badge tag-${t.color}" style="font-size:11px;padding:1px 6px">${escHtml(t.name)}</span>`
    ).join('');
    const linksHTML = _noteCardLinksHTML(n, _tnGoals, [], _tnProjects, { skipTrip: true });
    return `
      <div class="note-card" data-nid="${n.id}">
        ${n.pinned ? `<span class="note-card-pin">📌</span>` : ''}
        <div class="note-card-title">${escHtml(n.title)}</div>
        ${snippet ? `<div class="note-card-snippet">${escHtml(snippet)}</div>` : ''}
        ${linksHTML}
        <div class="note-card-footer">
          <div style="display:flex;flex-wrap:wrap;gap:3px">${tagsHTML}</div>
          <span class="note-card-date">${date}</span>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => _tnOpenNote(parseInt(card.dataset.nid)));
  });
}

// ── Editor view ───────────────────────────────────────────────
async function _tnOpenNote(noteId) {
  _tnSelectedId = noteId;
  let note;
  try {
    note = await apiFetch('GET', `/notes/${noteId}`);
    _tnUpsert(note);
  } catch(e) {
    note = _tnNotes.find(n => n.id === noteId);
    if (!note) return;
  }
  await _tnRenderEditor(note);
}

async function _tnRenderEditor(note) {
  if (!_tnContainer) return;
  await _ensureQuill();

  _tnContainer.innerHTML = `
    <div class="notes-editor-page">
      <div class="notes-editor-header">
        <button class="btn btn-secondary btn-sm" id="tn-back-btn">← Notes</button>
        <input class="notes-title-input" id="tn-title" value="${escHtml(note.title)}" placeholder="Untitled">
        <span id="tn-save-status" style="font-size:12px;color:var(--text-muted);white-space:nowrap;min-width:60px;text-align:right"></span>
        <button class="n-pin-btn${note.pinned ? ' pinned' : ''}" id="tn-pin-btn">${note.pinned ? '📌 Pinned' : '📌 Pin'}</button>
        <button class="btn btn-danger btn-sm" id="tn-delete-btn">Delete</button>
      </div>

      <div class="notes-tags-bar" id="tn-tags-bar">
        ${_tnAllTags.map(t => {
          const checked = (note.tags || []).some(nt => nt.id === t.id);
          return `<label class="n-tag-pill tag-${t.color}${checked ? ' checked' : ''}">
            <input type="checkbox" style="display:none" data-tid="${t.id}" ${checked ? 'checked' : ''}>
            ${escHtml(t.name)}
          </label>`;
        }).join('')}
      </div>

      <div class="notes-editor-body">
        <div class="notes-quill-wrap">
          <div id="tn-quill-editor"></div>
        </div>

        <div class="notes-tasks-sidebar${localStorage.getItem('notes_tasks_open') === 'false' ? ' collapsed' : ''}" id="tn-tasks-sidebar">
          <button class="notes-tasks-toggle-btn" id="tn-tasks-toggle"
            title="${localStorage.getItem('notes_tasks_open') === 'false' ? 'Show tasks' : 'Hide tasks'}">
            ${localStorage.getItem('notes_tasks_open') === 'false' ? '›' : '‹'}
          </button>
          <div class="notes-tasks-body">
            <div class="notes-sidebar-section">
              <div class="notes-tasks-label" style="margin-bottom:6px">GOAL</div>
              <div id="tn-goal-bar">${_tnGoalBarHTML(note)}</div>
            </div>
            <div class="divider" style="margin:8px 0"></div>
            <div class="notes-tasks-header">
              <span class="notes-tasks-label" id="tn-tasks-label">${_tnTasksLabel(note.tasks || [])}</span>
              <button class="btn btn-secondary btn-sm" id="tn-task-add-btn" style="padding:2px 8px;font-size:12px">+ Add</button>
            </div>
            <div id="tn-tasks-list">${_tnTasksListHTML(note.tasks || [])}</div>
            <div id="tn-task-form" class="notes-task-form" style="display:none">
              <input class="form-input" id="tn-task-title" placeholder="Task title…" style="font-size:12px">
              <div style="display:flex;gap:4px;flex-wrap:wrap">
                <select id="tn-task-priority" class="form-select" style="font-size:12px;padding:3px 6px;height:auto;flex:1">
                  <option value="high">High</option>
                  <option value="medium" selected>Medium</option>
                  <option value="low">Low</option>
                </select>
                <input type="date" id="tn-task-due" class="form-input" style="font-size:12px;flex:1">
              </div>
              <div style="display:flex;gap:4px">
                <button class="btn btn-primary btn-sm" id="tn-task-submit" style="flex:1;font-size:12px">Add</button>
                <button class="btn btn-secondary btn-sm" id="tn-task-cancel" style="font-size:12px">✕</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="notes-editor-footer">
        Created ${formatDate(note.created_at.slice(0,10))} · Updated ${formatDate(note.updated_at.slice(0,10))}
      </div>
    </div>`;

  const C = _tnContainer;

  _tnQuill = new Quill('#tn-quill-editor', {
    theme: 'snow',
    placeholder: 'Start writing…',
    modules: {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ color: [] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link', 'blockquote', 'code-block'],
        ['clean'],
      ],
    },
  });

  if (note.content) _tnQuill.clipboard.dangerouslyPasteHTML(note.content);

  _tnQuill.root.addEventListener('keydown', e => {
    if (e.ctrlKey && !e.shiftKey && e.code === 'Period') {
      e.preventDefault(); e.stopImmediatePropagation();
      const fmt = _tnQuill.getFormat();
      _tnQuill.format('list', fmt.list === 'bullet' ? false : 'bullet', 'user');
    } else if (e.ctrlKey && e.shiftKey && e.code === 'Period') {
      e.preventDefault(); e.stopImmediatePropagation();
      const fmt = _tnQuill.getFormat();
      _tnQuill.format('list', fmt.list === 'ordered' ? false : 'ordered', 'user');
    } else if (e.ctrlKey && !e.shiftKey && e.key === 'k') {
      e.preventDefault();
      const sel = _tnQuill.getSelection();
      if (sel && sel.length > 0) {
        const url = prompt('Enter URL:');
        if (url) _tnQuill.formatText(sel.index, sel.length, 'link', url);
      }
    }
  }, true);

  const sched = () => {
    _tnSetStatus('Unsaved…');
    clearTimeout(_tnSaveTimer);
    _tnSaveTimer = setTimeout(() => _tnAutoSave(note.id), 1200);
  };
  C.querySelector('#tn-title').addEventListener('input', sched);
  _tnQuill.on('text-change', sched);

  C.querySelector('#tn-tasks-toggle').addEventListener('click', () => {
    const sidebar = C.querySelector('#tn-tasks-sidebar');
    const btn     = C.querySelector('#tn-tasks-toggle');
    const closing = !sidebar.classList.contains('collapsed');
    sidebar.classList.toggle('collapsed', closing);
    btn.textContent = closing ? '›' : '‹';
    btn.title       = closing ? 'Show tasks' : 'Hide tasks';
    localStorage.setItem('notes_tasks_open', !closing);
  });

  C.querySelector('#tn-task-add-btn').addEventListener('click', () => {
    C.querySelector('#tn-task-form').style.display = 'flex';
    C.querySelector('#tn-task-add-btn').style.display = 'none';
    C.querySelector('#tn-task-title').focus();
  });
  C.querySelector('#tn-task-cancel').addEventListener('click', _tnHideTaskForm);
  C.querySelector('#tn-task-submit').addEventListener('click', () => _tnCreateTask(note));
  C.querySelector('#tn-task-title').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); _tnCreateTask(note); }
    if (e.key === 'Escape') _tnHideTaskForm();
  });
  _tnWireTaskActions(note);
  _tnWireGoalBar(note);

  C.querySelectorAll('#tn-tags-bar .n-tag-pill').forEach(pill => {
    pill.addEventListener('click', async () => {
      const cb = pill.querySelector('input');
      cb.checked = !cb.checked;
      pill.classList.toggle('checked', cb.checked);
      const tagIds = [...C.querySelectorAll('#tn-tags-bar input:checked')].map(i => parseInt(i.dataset.tid));
      try {
        const updated = await apiFetch('PUT', `/notes/${note.id}`, { tag_ids: tagIds });
        _tnUpsert(updated);
        note.tags = updated.tags;
      } catch(e) {}
    });
  });

  C.querySelector('#tn-pin-btn').addEventListener('click', async () => {
    const updated = await apiFetch('PUT', `/notes/${note.id}`, { pinned: note.pinned ? 0 : 1 });
    _tnUpsert(updated);
    note.pinned = updated.pinned;
    const btn = C.querySelector('#tn-pin-btn');
    if (btn) { btn.classList.toggle('pinned', !!note.pinned); btn.textContent = note.pinned ? '📌 Pinned' : '📌 Pin'; }
  });

  C.querySelector('#tn-back-btn').addEventListener('click', async () => {
    if (_tnSaveTimer) { clearTimeout(_tnSaveTimer); await _tnAutoSave(note.id); }
    _tnRenderList();
  });

  C.querySelector('#tn-delete-btn').addEventListener('click', async () => {
    if (!confirm(`Delete "${note.title}"?`)) return;
    clearTimeout(_tnSaveTimer);
    await apiFetch('DELETE', `/notes/${note.id}`);
    _tnNotes = _tnNotes.filter(n => n.id !== note.id);
    _tnRenderList();
  });
}

async function _tnAutoSave(noteId) {
  const title   = _tnContainer?.querySelector('#tn-title')?.value.trim() || 'Untitled';
  const raw     = _tnQuill?.root.innerHTML ?? '';
  const content = raw === '<p><br></p>' ? '' : raw;
  try {
    const updated = await apiFetch('PUT', `/notes/${noteId}`, { title, content });
    _tnUpsert(updated);
    _tnSetStatus('Saved');
    setTimeout(() => _tnSetStatus(''), 2000);
  } catch(e) { _tnSetStatus('Save failed'); }
}

function _tnSetStatus(msg) {
  const el = _tnContainer?.querySelector('#tn-save-status');
  if (el) el.textContent = msg;
}

async function _tnCreate() {
  try {
    const created = await apiFetch('POST', '/notes', { title: 'Untitled', trip_id: _tnTrip.id });
    _tnNotes.unshift(created);
    await _tnOpenNote(created.id);
    setTimeout(() => {
      const el = _tnContainer?.querySelector('#tn-title');
      if (el) { el.focus(); el.select(); }
    }, 80);
  } catch(e) {}
}

// ── Helpers ───────────────────────────────────────────────────
function _tnUpsert(updated) {
  const idx = _tnNotes.findIndex(n => n.id === updated.id);
  if (idx >= 0) _tnNotes[idx] = updated; else _tnNotes.unshift(updated);
}

// ── Goal bar ──────────────────────────────────────────────────
function _tnGoalBarHTML(note) {
  if (note.linked_goal) {
    return `
      <div class="notes-goal-chip">
        <span class="notes-goal-chip-label">${escHtml(note.linked_goal.title)}</span>
        <button class="notes-goal-unlink" id="tn-goal-unlink" title="Unlink goal">×</button>
      </div>
      <button class="btn btn-secondary btn-sm" id="tn-goal-nav" style="font-size:11px;padding:2px 6px;margin-top:5px;width:100%">Open goal →</button>`;
  }
  const opts = _tnGoals.map(g => `<option value="${g.id}">${escHtml(g.title)}</option>`).join('');
  return `
    <select class="form-select" id="tn-goal-select" style="font-size:12px;padding:3px 6px;height:auto;width:100%;display:none">
      <option value="">— Choose goal —</option>${opts}
    </select>
    <button class="btn btn-secondary btn-sm" id="tn-goal-link-btn" style="font-size:12px;padding:2px 6px;width:100%">+ Link goal</button>`;
}

function _tnWireGoalBar(note) {
  const bar = _tnContainer?.querySelector('#tn-goal-bar');
  if (!bar) return;

  bar.querySelector('#tn-goal-unlink')?.addEventListener('click', async () => {
    try {
      const updated = await apiFetch('PUT', `/notes/${note.id}`, { clear_goal: true });
      note.linked_goal = null; note.goal_id = null;
      _tnUpsert(updated);
      bar.innerHTML = _tnGoalBarHTML(note);
      _tnWireGoalBar(note);
    } catch(e) {}
  });

  bar.querySelector('#tn-goal-nav')?.addEventListener('click', () => {
    window._openGoalId = note.linked_goal.id;
    loadPage('goals');
  });

  const linkBtn = bar.querySelector('#tn-goal-link-btn');
  if (linkBtn) {
    linkBtn.addEventListener('click', () => {
      linkBtn.style.display = 'none';
      const sel = bar.querySelector('#tn-goal-select');
      sel.style.display = '';
      sel.focus();
    });
  }

  const sel = bar.querySelector('#tn-goal-select');
  if (sel) {
    sel.addEventListener('change', async () => {
      const gid = parseInt(sel.value);
      if (!gid) {
        sel.style.display = 'none';
        bar.querySelector('#tn-goal-link-btn').style.display = '';
        return;
      }
      try {
        const updated = await apiFetch('PUT', `/notes/${note.id}`, { goal_id: gid });
        const g = _tnGoals.find(g => g.id === gid);
        note.linked_goal = g ? { id: g.id, title: g.title } : null;
        note.goal_id = gid;
        _tnUpsert(updated);
        bar.innerHTML = _tnGoalBarHTML(note);
        _tnWireGoalBar(note);
      } catch(e) {}
    });
    sel.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        sel.style.display = 'none';
        bar.querySelector('#tn-goal-link-btn').style.display = '';
      }
    });
  }
}

// ── Note tasks ────────────────────────────────────────────────
function _tnTasksLabel(tasks) {
  const pending = tasks.filter(t => t.status !== 'completed').length;
  const total   = tasks.length;
  if (!total) return 'Tasks';
  return `Tasks <span class="n-task-count">${pending}/${total}</span>`;
}

function _tnTasksListHTML(tasks) {
  if (!tasks.length) {
    return `<div style="font-size:12px;color:var(--text-muted);padding:2px 0">No linked tasks yet</div>`;
  }
  return tasks.map(t => {
    const done   = t.status === 'completed';
    const dueCls = !done && t.due_date
      ? (isOverdue(t.due_date) ? 'overdue' : isToday(t.due_date) ? 'today-due' : '')
      : '';
    const hasMeta = t.priority !== 'medium' || t.due_date;
    return `<div class="notes-task-row${done ? ' completed' : ''}">
      <div class="checkbox-circle${done ? ' checked' : ''}" data-tid="${t.id}" style="width:15px;height:15px;min-width:15px"></div>
      <div class="notes-task-body">
        <span class="notes-task-title${done ? ' done' : ''}">${escHtml(t.title)}</span>
        ${hasMeta ? `<div class="notes-task-meta">
          ${t.priority !== 'medium' ? priorityDotHTML(t.priority) : ''}
          ${t.due_date ? `<span class="due-label ${dueCls}" style="font-size:11px">${formatDateShort(t.due_date)}</span>` : ''}
        </div>` : ''}
      </div>
      <button class="notes-task-del" data-tid="${t.id}">×</button>
    </div>`;
  }).join('');
}

function _tnHideTaskForm() {
  const form = _tnContainer?.querySelector('#tn-task-form');
  const btn  = _tnContainer?.querySelector('#tn-task-add-btn');
  if (form) form.style.display = 'none';
  if (btn)  btn.style.display = '';
}

async function _tnCreateTask(note) {
  const titleEl = _tnContainer?.querySelector('#tn-task-title');
  const title   = titleEl?.value.trim();
  if (!title) return;
  try {
    const created = await apiFetch('POST', '/tasks', {
      title,
      priority: _tnContainer?.querySelector('#tn-task-priority')?.value || 'medium',
      due_date: getDateVal(_tnContainer?.querySelector('#tn-task-due')),
      note_id:  note.id,
      tag_ids:  [],
    });
    note.tasks = [...(note.tasks || []), created];
    _tnUpsert(note);
    _tnRefreshTasks(note);
    if (titleEl) titleEl.value = '';
    const dueEl = _tnContainer?.querySelector('#tn-task-due');
    if (dueEl) dueEl.value = '';
    titleEl?.focus();
  } catch(e) { alert('Error: ' + e.message); }
}

function _tnWireTaskActions(note) {
  const list = _tnContainer?.querySelector('#tn-tasks-list');
  if (!list) return;

  list.querySelectorAll('.checkbox-circle[data-tid]').forEach(cb => {
    cb.addEventListener('click', async () => {
      const tid  = parseInt(cb.dataset.tid);
      const task = (note.tasks || []).find(t => t.id === tid);
      if (!task) return;
      try {
        const updated = task.status === 'completed'
          ? await apiFetch('PUT', `/tasks/${tid}`, { status: 'pending' })
          : await apiFetch('POST', `/tasks/${tid}/complete`);
        const idx = (note.tasks || []).findIndex(t => t.id === tid);
        if (idx >= 0) note.tasks[idx] = updated;
        _tnUpsert(note);
        _tnRefreshTasks(note);
      } catch(e) {}
    });
  });

  list.querySelectorAll('.notes-task-del[data-tid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tid = parseInt(btn.dataset.tid);
      try {
        await apiFetch('DELETE', `/tasks/${tid}`);
        note.tasks = (note.tasks || []).filter(t => t.id !== tid);
        _tnUpsert(note);
        _tnRefreshTasks(note);
      } catch(e) {}
    });
  });
}

function _tnRefreshTasks(note) {
  const list  = _tnContainer?.querySelector('#tn-tasks-list');
  const label = _tnContainer?.querySelector('#tn-tasks-label');
  if (list)  list.innerHTML = _tnTasksListHTML(note.tasks || []);
  if (label) label.innerHTML = _tnTasksLabel(note.tasks || []);
  _tnWireTaskActions(note);
}
