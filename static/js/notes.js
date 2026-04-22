// ── Module state ──────────────────────────────────────────────
let _notes        = [];
let _allTags      = [];
let _nGoals       = [];
let _nSelectedId  = null;
let _nTagFilters  = new Set();
let _nSearch      = '';
let _nPinnedOnly  = false;
let _nSort        = 'updated';
let _nFiltersOpen = false;
let _nSaveTimer   = null;
let _quill        = null;

// ── Entry point ───────────────────────────────────────────────
registerPage('notes', async function(content) {
  _nSelectedId = null;
  _quill       = null;

  try {
    const [nd, td, gd] = await Promise.all([
      apiFetch('GET', '/notes'),
      apiFetch('GET', '/tags'),
      apiFetch('GET', '/goals'),
    ]);
    _notes   = nd.items;
    _allTags = td.items;
    _nGoals  = gd.items;
  } catch(e) {
    content.innerHTML = `<div class="empty-state"><div class="empty-state-title">Couldn't load notes</div></div>`;
    return;
  }

  _renderListView();
  if (window._openNoteId) {
    const nid = window._openNoteId;
    window._openNoteId = null;
    openNote(nid);
  }
});

// ── List view ─────────────────────────────────────────────────
function _renderListView() {
  _nSelectedId = null;
  _quill       = null;
  const content = document.getElementById('content');
  if (!content) return;

  const activeFilterCount = _nTagFilters.size + (_nPinnedOnly ? 1 : 0);

  content.innerHTML = `
    <div class="notes-page">
      <div class="notes-header">
        <h1 class="page-title">Notes</h1>
        <input class="form-input" id="n-search" placeholder="Search notes…" value="${escHtml(_nSearch)}" style="flex:1;max-width:340px;font-size:13px">
        <button class="btn btn-secondary btn-sm" id="n-filters-btn">
          Filters${activeFilterCount > 0 ? ` <span class="n-filter-badge">${activeFilterCount}</span>` : ''}
        </button>
        <button class="btn btn-primary btn-sm" id="n-new-btn">+ New note</button>
      </div>

      <div id="n-filters-panel" class="notes-filters-panel" style="${_nFiltersOpen ? '' : 'display:none'}">
        <div class="notes-filters-row">
          <span class="notes-filter-label">Tags</span>
          <div style="display:flex;flex-wrap:wrap;gap:5px">
            ${_allTags.map(t => `
              <label class="n-tag-pill tag-${t.color}${_nTagFilters.has(t.id) ? ' checked' : ''}">
                <input type="checkbox" style="display:none" data-tid="${t.id}" ${_nTagFilters.has(t.id) ? 'checked' : ''}>
                ${escHtml(t.name)}
              </label>`).join('')}
          </div>
        </div>
        <div class="notes-filters-row">
          <span class="notes-filter-label">Options</span>
          <label class="notes-filter-option">
            <input type="checkbox" id="n-pinned-only" ${_nPinnedOnly ? 'checked' : ''}> Pinned only
          </label>
          <span class="notes-filter-label" style="margin-left:12px">Sort</span>
          <select id="n-sort" class="form-select" style="font-size:13px;padding:4px 8px;height:auto;width:auto">
            <option value="updated" ${_nSort==='updated'?'selected':''}>Last updated</option>
            <option value="created" ${_nSort==='created'?'selected':''}>Date created</option>
            <option value="title"   ${_nSort==='title'  ?'selected':''}>Title A–Z</option>
          </select>
        </div>
      </div>

      <div id="n-grid" class="notes-grid"></div>
    </div>`;

  // Search
  const searchEl = document.getElementById('n-search');
  searchEl.addEventListener('input', e => { _nSearch = e.target.value; _renderGrid(); });
  searchEl.addEventListener('keydown', e => { if (e.key === 'Escape') { _nSearch = ''; searchEl.value = ''; _renderGrid(); } });

  // Filters toggle
  document.getElementById('n-filters-btn').addEventListener('click', () => {
    _nFiltersOpen = !_nFiltersOpen;
    document.getElementById('n-filters-panel').style.display = _nFiltersOpen ? 'flex' : 'none';
  });

  // Tag checkboxes
  document.querySelectorAll('#n-filters-panel .n-tag-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const cb  = pill.querySelector('input');
      const tid = parseInt(cb.dataset.tid);
      cb.checked = !cb.checked;
      pill.classList.toggle('checked', cb.checked);
      cb.checked ? _nTagFilters.add(tid) : _nTagFilters.delete(tid);
      _updateFilterBtn();
      _renderGrid();
    });
  });

  document.getElementById('n-pinned-only').addEventListener('change', e => {
    _nPinnedOnly = e.target.checked;
    _updateFilterBtn();
    _renderGrid();
  });

  document.getElementById('n-sort').addEventListener('change', e => {
    _nSort = e.target.value;
    _renderGrid();
  });

  document.getElementById('n-new-btn').addEventListener('click', doCreateNote);

  _renderGrid();
}

function _updateFilterBtn() {
  const btn = document.getElementById('n-filters-btn');
  if (!btn) return;
  const n = _nTagFilters.size + (_nPinnedOnly ? 1 : 0);
  btn.innerHTML = `Filters${n > 0 ? ` <span class="n-filter-badge">${n}</span>` : ''}`;
}

function _renderGrid() {
  const grid = document.getElementById('n-grid');
  if (!grid) return;

  let list = [..._notes];

  if (_nSearch) {
    const q = _nSearch.toLowerCase();
    list = list.filter(n =>
      n.title.toLowerCase().includes(q) ||
      _stripHtml(n.content || '').toLowerCase().includes(q)
    );
  }
  if (_nTagFilters.size) {
    list = list.filter(n =>
      [..._nTagFilters].every(tid => (n.tags || []).some(t => t.id === tid))
    );
  }
  if (_nPinnedOnly) list = list.filter(n => n.pinned);

  list.sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned - a.pinned;
    if (_nSort === 'title')   return a.title.localeCompare(b.title);
    if (_nSort === 'created') return b.created_at.localeCompare(a.created_at);
    return b.updated_at.localeCompare(a.updated_at);
  });

  if (!list.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;padding:64px;text-align:center;font-size:14px;color:var(--text-muted)">
      ${_nSearch || _nTagFilters.size || _nPinnedOnly ? 'No matching notes' : 'No notes yet — create one above'}
    </div>`;
    return;
  }

  grid.innerHTML = list.map(n => {
    const snippet = _stripHtml(n.content || '').slice(0, 140).trim();
    const date    = formatDateShort(n.updated_at.slice(0, 10));
    const tagsHTML = (n.tags || []).map(t =>
      `<span class="tag-badge tag-${t.color}" style="font-size:11px;padding:1px 6px">${escHtml(t.name)}</span>`
    ).join('');
    return `
      <div class="note-card" data-nid="${n.id}">
        ${n.pinned ? `<span class="note-card-pin">📌</span>` : ''}
        <div class="note-card-title">${escHtml(n.title)}</div>
        ${snippet ? `<div class="note-card-snippet">${escHtml(snippet)}</div>` : ''}
        <div class="note-card-footer">
          <div style="display:flex;flex-wrap:wrap;gap:3px">${tagsHTML}</div>
          <span class="note-card-date">${date}</span>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => openNote(parseInt(card.dataset.nid)));
  });
}

// ── Editor view ───────────────────────────────────────────────
async function openNote(noteId) {
  _nSelectedId = noteId;
  let note;
  try {
    note = await apiFetch('GET', `/notes/${noteId}`);
    _upsertNote(note);
  } catch(e) {
    note = _notes.find(n => n.id === noteId);
    if (!note) return;
  }
  await _renderEditorView(note);
}

async function _renderEditorView(note) {
  const content = document.getElementById('content');
  if (!content) return;

  await _ensureQuill();

  content.innerHTML = `
    <div class="notes-editor-page">
      <div class="notes-editor-header">
        <button class="btn btn-secondary btn-sm" id="n-back-btn">← Back</button>
        <input class="notes-title-input" id="n-title" value="${escHtml(note.title)}" placeholder="Untitled">
        <span id="n-save-status" style="font-size:12px;color:var(--text-muted);white-space:nowrap;min-width:60px;text-align:right"></span>
        <button class="n-pin-btn${note.pinned ? ' pinned' : ''}" id="n-pin-btn">${note.pinned ? '📌 Pinned' : '📌 Pin'}</button>
        <button class="btn btn-danger btn-sm" id="n-delete-btn">Delete</button>
      </div>

      <div class="notes-tags-bar" id="n-tags-bar">
        ${_allTags.map(t => {
          const checked = (note.tags || []).some(nt => nt.id === t.id);
          return `<label class="n-tag-pill tag-${t.color}${checked ? ' checked' : ''}">
            <input type="checkbox" style="display:none" data-tid="${t.id}" ${checked ? 'checked' : ''}>
            ${escHtml(t.name)}
          </label>`;
        }).join('')}
      </div>

      <div class="notes-goal-bar" id="n-goal-bar">
        ${_goalBarHTML(note)}
      </div>

      <div class="notes-editor-body">
        <div class="notes-quill-wrap">
          <div id="n-quill-editor"></div>
        </div>

        <div class="notes-tasks-sidebar${localStorage.getItem('notes_tasks_open') === 'false' ? ' collapsed' : ''}" id="n-tasks-sidebar">
          <button class="notes-tasks-toggle-btn" id="n-tasks-toggle"
            title="${localStorage.getItem('notes_tasks_open') === 'false' ? 'Show tasks' : 'Hide tasks'}">
            ${localStorage.getItem('notes_tasks_open') === 'false' ? '›' : '‹'}
          </button>
          <div class="notes-tasks-body">
            <div class="notes-tasks-header">
              <span class="notes-tasks-label" id="n-tasks-label">${_noteTasksLabel(note.tasks || [])}</span>
              <button class="btn btn-secondary btn-sm" id="n-task-add-btn" style="padding:2px 8px;font-size:12px">+ Add</button>
            </div>
            <div id="n-tasks-list">${_noteTasksListHTML(note.tasks || [])}</div>
            <div id="n-task-form" class="notes-task-form" style="display:none">
              <input class="form-input" id="n-task-title" placeholder="Task title…" style="font-size:12px">
              <div style="display:flex;gap:4px;flex-wrap:wrap">
                <select id="n-task-priority" class="form-select" style="font-size:12px;padding:3px 6px;height:auto;flex:1">
                  <option value="high">High</option>
                  <option value="medium" selected>Medium</option>
                  <option value="low">Low</option>
                </select>
                <input type="date" id="n-task-due" class="form-input" style="font-size:12px;flex:1">
              </div>
              <div style="display:flex;gap:4px">
                <button class="btn btn-primary btn-sm" id="n-task-submit" style="flex:1;font-size:12px">Add</button>
                <button class="btn btn-secondary btn-sm" id="n-task-cancel" style="font-size:12px">✕</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="notes-editor-footer">
        Created ${formatDate(note.created_at.slice(0,10))} · Updated ${formatDate(note.updated_at.slice(0,10))}
      </div>
    </div>`;

  // Init Quill
  _quill = new Quill('#n-quill-editor', {
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

  if (note.content) _quill.clipboard.dangerouslyPasteHTML(note.content);

  // Hotkeys — capture phase so we fire before Quill's own keyboard module.
  // Use e.code (physical key) for period/slash: e.key can change when Ctrl is
  // held on Windows. stopImmediatePropagation prevents Quill from also seeing
  // the event and double-toggling.
  _quill.root.addEventListener('keydown', e => {
    if (e.ctrlKey && !e.shiftKey && e.code === 'Period') {         // Ctrl+.        → bullet list
      e.preventDefault();
      e.stopImmediatePropagation();
      const fmt = _quill.getFormat();
      _quill.format('list', fmt.list === 'bullet' ? false : 'bullet', 'user');
    } else if (e.ctrlKey && e.shiftKey && e.code === 'Period') {  // Ctrl+Shift+.  → ordered list
      e.preventDefault();
      e.stopImmediatePropagation();
      const fmt = _quill.getFormat();
      _quill.format('list', fmt.list === 'ordered' ? false : 'ordered', 'user');
    } else if (e.ctrlKey && !e.shiftKey && e.key === 'k') {       // Ctrl+K  → hyperlink
      e.preventDefault();
      const sel = _quill.getSelection();
      if (sel && sel.length > 0) {
        const url = prompt('Enter URL:');
        if (url) _quill.formatText(sel.index, sel.length, 'link', url);
      }
    }
  }, true);  // capture phase — runs before Quill's bubble-phase handlers

  // Auto-save
  const sched = () => {
    _setStatus('Unsaved…');
    clearTimeout(_nSaveTimer);
    _nSaveTimer = setTimeout(() => _autoSave(note.id), 1200);
  };
  document.getElementById('n-title').addEventListener('input', sched);
  _quill.on('text-change', sched);

  // Tasks sidebar toggle
  document.getElementById('n-tasks-toggle').addEventListener('click', () => {
    const sidebar = document.getElementById('n-tasks-sidebar');
    const btn     = document.getElementById('n-tasks-toggle');
    const closing = !sidebar.classList.contains('collapsed');
    sidebar.classList.toggle('collapsed', closing);
    btn.textContent = closing ? '›' : '‹';
    btn.title       = closing ? 'Show tasks' : 'Hide tasks';
    localStorage.setItem('notes_tasks_open', !closing);
  });

  // Tasks section
  document.getElementById('n-task-add-btn').addEventListener('click', () => {
    document.getElementById('n-task-form').style.display = 'flex';
    document.getElementById('n-task-add-btn').style.display = 'none';
    document.getElementById('n-task-title').focus();
  });
  document.getElementById('n-task-cancel').addEventListener('click', _hideNoteTaskForm);
  document.getElementById('n-task-submit').addEventListener('click', () => _createNoteTask(note));
  document.getElementById('n-task-title').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); _createNoteTask(note); }
    if (e.key === 'Escape') _hideNoteTaskForm();
  });
  _wireNoteTaskActions(note);

  // Goal link bar
  _wireGoalBar(note);

  // Tags
  content.querySelectorAll('#n-tags-bar .n-tag-pill').forEach(pill => {
    pill.addEventListener('click', async () => {
      const cb = pill.querySelector('input');
      cb.checked = !cb.checked;
      pill.classList.toggle('checked', cb.checked);
      const tagIds = [...content.querySelectorAll('#n-tags-bar input:checked')].map(i => parseInt(i.dataset.tid));
      try {
        const updated = await apiFetch('PUT', `/notes/${note.id}`, { tag_ids: tagIds });
        _upsertNote(updated);
        note.tags = updated.tags;
      } catch(e) {}
    });
  });

  // Pin
  document.getElementById('n-pin-btn').addEventListener('click', async () => {
    const updated = await apiFetch('PUT', `/notes/${note.id}`, { pinned: note.pinned ? 0 : 1 });
    _upsertNote(updated);
    note.pinned = updated.pinned;
    const btn = document.getElementById('n-pin-btn');
    if (btn) { btn.classList.toggle('pinned', !!note.pinned); btn.textContent = note.pinned ? '📌 Pinned' : '📌 Pin'; }
  });

  // Back — flush any pending save first
  document.getElementById('n-back-btn').addEventListener('click', async () => {
    if (_nSaveTimer) { clearTimeout(_nSaveTimer); await _autoSave(note.id); }
    _renderListView();
  });

  // Delete
  document.getElementById('n-delete-btn').addEventListener('click', async () => {
    if (!confirm(`Delete "${note.title}"?`)) return;
    clearTimeout(_nSaveTimer);
    await apiFetch('DELETE', `/notes/${note.id}`);
    _notes = _notes.filter(n => n.id !== note.id);
    _renderListView();
  });
}

async function _autoSave(noteId) {
  const title   = document.getElementById('n-title')?.value.trim() || 'Untitled';
  const raw     = _quill?.root.innerHTML ?? '';
  const content = raw === '<p><br></p>' ? '' : raw;
  try {
    const updated = await apiFetch('PUT', `/notes/${noteId}`, { title, content });
    _upsertNote(updated);
    _setStatus('Saved');
    setTimeout(() => _setStatus(''), 2000);
  } catch(e) { _setStatus('Save failed'); }
}

function _setStatus(msg) {
  const el = document.getElementById('n-save-status');
  if (el) el.textContent = msg;
}

// ── Create ────────────────────────────────────────────────────
async function doCreateNote() {
  const created = await apiFetch('POST', '/notes', { title: 'Untitled' });
  _notes.unshift(created);
  await openNote(created.id);
  setTimeout(() => { const el = document.getElementById('n-title'); if (el) { el.focus(); el.select(); } }, 80);
}

// ── Quill loader ──────────────────────────────────────────────
async function _ensureQuill() {
  if (window.Quill) return;
  if (!document.querySelector('link[href*="quill"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.quilljs.com/1.3.7/quill.snow.css';
    document.head.appendChild(link);
  }
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.quilljs.com/1.3.7/quill.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ── Helpers ───────────────────────────────────────────────────
function _stripHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || d.innerText || '';
}

function _upsertNote(updated) {
  const idx = _notes.findIndex(n => n.id === updated.id);
  if (idx >= 0) _notes[idx] = updated; else _notes.unshift(updated);
}

// ── Goal link bar ─────────────────────────────────────────────
function _goalBarHTML(note) {
  if (note.linked_goal) {
    return `
      <span class="notes-goal-chip">
        <span class="notes-goal-chip-label">${escHtml(note.linked_goal.title)}</span>
        <button class="notes-goal-unlink" id="n-goal-unlink" title="Unlink goal">×</button>
      </span>
      <button class="btn btn-secondary btn-sm" id="n-goal-nav" style="font-size:12px;padding:2px 10px">Open goal →</button>`;
  }
  const opts = _nGoals.map(g => `<option value="${g.id}">${escHtml(g.title)}</option>`).join('');
  return `
    <select class="form-select" id="n-goal-select" style="font-size:12px;padding:3px 8px;height:auto;max-width:260px;display:none">
      <option value="">— Choose goal —</option>
      ${opts}
    </select>
    <button class="btn btn-secondary btn-sm" id="n-goal-link-btn" style="font-size:12px;padding:2px 10px">+ Link to goal</button>`;
}

function _wireGoalBar(note) {
  const bar = document.getElementById('n-goal-bar');
  if (!bar) return;

  bar.querySelector('#n-goal-unlink')?.addEventListener('click', async () => {
    try {
      const updated = await apiFetch('PUT', `/notes/${note.id}`, { clear_goal: true });
      note.linked_goal = null;
      note.goal_id = null;
      _upsertNote(updated);
      bar.innerHTML = _goalBarHTML(note);
      _wireGoalBar(note);
    } catch(e) {}
  });

  bar.querySelector('#n-goal-nav')?.addEventListener('click', () => {
    window._openGoalId = note.linked_goal.id;
    loadPage('goals');
  });

  const linkBtn = bar.querySelector('#n-goal-link-btn');
  if (linkBtn) {
    linkBtn.addEventListener('click', () => {
      linkBtn.style.display = 'none';
      const sel = bar.querySelector('#n-goal-select');
      sel.style.display = '';
      sel.focus();
    });
  }

  const sel = bar.querySelector('#n-goal-select');
  if (sel) {
    sel.addEventListener('change', async () => {
      const gid = parseInt(sel.value);
      if (!gid) {
        sel.style.display = 'none';
        bar.querySelector('#n-goal-link-btn').style.display = '';
        return;
      }
      try {
        const updated = await apiFetch('PUT', `/notes/${note.id}`, { goal_id: gid });
        const g = _nGoals.find(g => g.id === gid);
        note.linked_goal = g ? { id: g.id, title: g.title } : null;
        note.goal_id = gid;
        _upsertNote(updated);
        bar.innerHTML = _goalBarHTML(note);
        _wireGoalBar(note);
      } catch(e) {}
    });
    sel.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        sel.style.display = 'none';
        bar.querySelector('#n-goal-link-btn').style.display = '';
      }
    });
  }
}

// ── Note tasks ────────────────────────────────────────────────
function _noteTasksLabel(tasks) {
  const pending = tasks.filter(t => t.status !== 'completed').length;
  const total   = tasks.length;
  if (!total) return 'Tasks';
  return `Tasks <span class="n-task-count">${pending}/${total}</span>`;
}

function _noteTasksListHTML(tasks) {
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

function _hideNoteTaskForm() {
  const form = document.getElementById('n-task-form');
  const btn  = document.getElementById('n-task-add-btn');
  if (form) { form.style.display = 'none'; }
  if (btn)  { btn.style.display = ''; }
}

async function _createNoteTask(note) {
  const titleEl = document.getElementById('n-task-title');
  const title   = titleEl?.value.trim();
  if (!title) return;
  try {
    const created = await apiFetch('POST', '/tasks', {
      title,
      priority: document.getElementById('n-task-priority')?.value || 'medium',
      due_date: document.getElementById('n-task-due')?.value || null,
      note_id:  note.id,
      tag_ids:  [],
    });
    note.tasks = [...(note.tasks || []), created];
    _upsertNote(note);
    _refreshNoteTasksUI(note);
    if (titleEl) titleEl.value = '';
    const dueEl = document.getElementById('n-task-due');
    if (dueEl) dueEl.value = '';
    titleEl?.focus();
  } catch(e) { alert('Error: ' + e.message); }
}

function _wireNoteTaskActions(note) {
  const list = document.getElementById('n-tasks-list');
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
        _upsertNote(note);
        _refreshNoteTasksUI(note);
      } catch(e) {}
    });
  });

  list.querySelectorAll('.notes-task-del[data-tid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tid = parseInt(btn.dataset.tid);
      try {
        await apiFetch('DELETE', `/tasks/${tid}`);
        note.tasks = (note.tasks || []).filter(t => t.id !== tid);
        _upsertNote(note);
        _refreshNoteTasksUI(note);
      } catch(e) {}
    });
  });
}

function _refreshNoteTasksUI(note) {
  const list  = document.getElementById('n-tasks-list');
  const label = document.getElementById('n-tasks-label');
  if (list)  list.innerHTML = _noteTasksListHTML(note.tasks || []);
  if (label) label.innerHTML = _noteTasksLabel(note.tasks || []);
  _wireNoteTaskActions(note);
}
