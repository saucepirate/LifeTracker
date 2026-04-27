// trips-templates.js — Phase 3: Packing template management page

let _tmplList    = [];
let _tmplCurrent = null;

registerPage('packing-templates', function(container) {
  _tmplCurrent = null;
  _loadTemplateList(container);
});

// ── List view ─────────────────────────────────────────────────

async function _loadTemplateList(container) {
  container.innerHTML = '<div class="loading-state">Loading templates…</div>';
  try {
    const data = await apiFetch('GET', '/packing-templates');
    _tmplList  = data.items || [];
    _renderTemplateList(container);
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p class="empty-state-text">${escHtml(e.message)}</p></div>`;
  }
}

function _renderTemplateList(container) {
  container.innerHTML = `
    <div class="tmpl-list-header">
      <div>
        <h1 class="page-title">Packing Templates</h1>
        <p class="tmpl-list-sub">Reusable packing lists you can apply to any trip.</p>
      </div>
      <button class="btn btn-primary" id="tmpl-new-btn">+ New Template</button>
    </div>

    ${_tmplList.length ? `
      <div class="tmpl-list">
        ${_tmplList.map(t => `
          <div class="tmpl-card">
            <div class="tmpl-card-body">
              <div class="tmpl-card-name">${escHtml(t.name)}</div>
              <div class="tmpl-card-meta">${t.category_count} categories · ${t.item_count} items</div>
            </div>
            <div class="tmpl-card-actions">
              <button class="btn btn-sm btn-secondary tmpl-open-btn" data-id="${t.id}">Edit</button>
              <button class="btn btn-sm btn-ghost tmpl-del-btn" data-id="${t.id}">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
    ` : `
      <div class="empty-state" style="margin-top:40px">
        <p class="empty-state-text">No packing templates yet.<br>Create one to quickly apply it to any trip.</p>
      </div>
    `}
  `;

  container.querySelector('#tmpl-new-btn').addEventListener('click', () => _openNewTemplateModal(container));

  container.querySelectorAll('.tmpl-open-btn').forEach(btn => {
    btn.addEventListener('click', () => _openTemplateEditor(container, parseInt(btn.dataset.id)));
  });

  container.querySelectorAll('.tmpl-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this template?')) return;
      try {
        await apiFetch('DELETE', `/packing-templates/${btn.dataset.id}`);
        _loadTemplateList(container);
      } catch (e) { alert(e.message); }
    });
  });
}

function _openNewTemplateModal(container) {
  const overlay = createModal('New Packing Template', `
    <div class="form-group">
      <label class="form-label">Template name</label>
      <input class="form-input" id="new-tmpl-name" type="text" placeholder="e.g. Beach Weekend, Business Trip">
    </div>
  `, async ov => {
    const name = ov.querySelector('#new-tmpl-name').value.trim();
    if (!name) { alert('Name is required.'); return; }
    try {
      const t = await apiFetch('POST', '/packing-templates', { name });
      closeModal(ov); ov.remove();
      _openTemplateEditor(container, t.id);
    } catch (e) { alert(e.message); }
  }, 'Create');
  openModal(overlay);
}

// ── Editor view ────────────────────────────────────────────────

async function _openTemplateEditor(container, tmplId) {
  container.innerHTML = '<div class="loading-state">Loading…</div>';
  try {
    _tmplCurrent = await apiFetch('GET', `/packing-templates/${tmplId}`);
    _renderTemplateEditor(container);
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p class="empty-state-text">${escHtml(e.message)}</p></div>`;
  }
}

function _renderTemplateEditor(container) {
  const t       = _tmplCurrent;
  const tmplId  = t.id;
  const itemCnt = t.categories.reduce((s, c) => s + c.items.length, 0);

  container.innerHTML = `
    <div class="tmpl-editor">
      <div class="tmpl-editor-nav">
        <button class="btn btn-ghost btn-sm" id="tmpl-back-btn">← All Templates</button>
      </div>

      <div class="tmpl-editor-title-row">
        <span class="tmpl-editor-name pack-editable" contenteditable="true"
              id="tmpl-name-el" data-orig="${escHtml(t.name)}">${escHtml(t.name)}</span>
        <span class="tmpl-editor-meta">${t.categories.length} categories · ${itemCnt} items</span>
      </div>

      <div class="tmpl-section-hdr">Categories &amp; Items</div>

      <div class="tmpl-cats" id="tmpl-cats">
        ${t.categories.map(cat => _tmplCatHTML(cat, tmplId)).join('')}
      </div>

      <div class="tmpl-add-cat-row">
        <input class="input input-sm" type="text" id="tmpl-new-cat" placeholder="New category name…">
        <button class="btn btn-sm btn-secondary" id="tmpl-add-cat-btn">+ Category</button>
      </div>

      <div class="tmpl-section-hdr" style="margin-top:28px">Suggested Tasks
        <span class="tmpl-section-hint">Tasks to auto-create when applying this template to a trip</span>
      </div>

      <div class="tmpl-sugg-list" id="tmpl-sugg-list">
        ${t.suggested_tasks.map(st => _suggTaskHTML(st)).join('')}
        ${t.suggested_tasks.length === 0 ? '<div class="pack-cat-empty">No suggested tasks yet</div>' : ''}
      </div>

      <div class="tmpl-add-sugg-row">
        <input class="input input-sm" type="text" id="tmpl-new-sugg-title" placeholder="Task title…" style="flex:2">
        <input class="input input-sm" type="number" id="tmpl-new-sugg-days" placeholder="Days before" style="flex:1" min="0">
        <select class="input input-sm" id="tmpl-new-sugg-prio" style="flex:1">
          <option value="low">Low</option>
          <option value="medium" selected>Medium</option>
          <option value="high">High</option>
        </select>
        <button class="btn btn-sm btn-secondary" id="tmpl-add-sugg-btn">+ Task</button>
      </div>
    </div>
  `;

  _bindEditorEvents(container, tmplId);
}

function _tmplCatHTML(cat, tmplId) {
  return `
    <div class="tmpl-cat" data-cat-id="${cat.id}">
      <div class="tmpl-cat-hdr">
        <span class="tmpl-cat-name pack-editable" contenteditable="true"
              data-orig="${escHtml(cat.name)}">${escHtml(cat.name)}</span>
        <span class="tmpl-cat-count">${cat.items.length} items</span>
        <button class="tmpl-cat-del btn-icon-danger" data-cat-id="${cat.id}" title="Delete category">✕</button>
      </div>
      <div class="tmpl-cat-items">
        ${cat.items.map(item => _tmplItemHTML(item, cat.id, tmplId)).join('')}
        <div class="tmpl-add-item-row" data-cat-id="${cat.id}">
          <input class="input input-sm" type="text" placeholder="Add item…" style="flex:3">
          <input class="input input-sm" type="number" min="1" placeholder="Qty" style="flex:1">
          <button class="btn btn-sm btn-ghost tmpl-add-item-btn" data-cat-id="${cat.id}">Add</button>
        </div>
      </div>
    </div>
  `;
}

function _tmplItemHTML(item, catId, tmplId) {
  return `
    <div class="tmpl-item" data-item-id="${item.id}">
      <span class="tmpl-item-name">${escHtml(item.name)}</span>
      ${item.quantity > 1 ? `<span class="pack-item-qty">×${item.quantity}</span>` : ''}
      ${item.always_bring ? '<span class="tmpl-item-always" title="Always bring">★</span>' : ''}
      <button class="tmpl-item-del btn-icon-danger" data-item-id="${item.id}" data-cat-id="${catId}" title="Delete">✕</button>
    </div>
  `;
}

function _suggTaskHTML(st) {
  return `
    <div class="tmpl-sugg-task" data-sugg-id="${st.id}">
      <span class="tmpl-sugg-title">${escHtml(st.title)}</span>
      ${st.days_before_departure != null
        ? `<span class="tmpl-sugg-days">${st.days_before_departure}d before</span>`
        : ''}
      <span class="tmpl-sugg-prio tmpl-prio-${st.priority}">${capitalize(st.priority)}</span>
      <button class="tmpl-sugg-del btn-icon-danger" data-sugg-id="${st.id}" title="Delete">✕</button>
    </div>
  `;
}

function _bindEditorEvents(container, tmplId) {
  const get = sel => container.querySelector(sel);

  // Back to list
  get('#tmpl-back-btn').addEventListener('click', () => _loadTemplateList(container));

  // Rename template inline
  const nameEl = get('#tmpl-name-el');
  nameEl.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); nameEl.blur(); }
    if (e.key === 'Escape') { nameEl.textContent = nameEl.dataset.orig; nameEl.blur(); }
  });
  nameEl.addEventListener('blur', async () => {
    const name = nameEl.textContent.trim();
    if (!name || name === nameEl.dataset.orig) { nameEl.textContent = nameEl.dataset.orig; return; }
    try {
      await apiFetch('PUT', `/packing-templates/${tmplId}`, { name });
      nameEl.dataset.orig = name;
    } catch (e) {
      nameEl.textContent = nameEl.dataset.orig;
      alert(e.message);
    }
  });

  // Category inline rename
  container.querySelectorAll('.tmpl-cat-name.pack-editable').forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { el.textContent = el.dataset.orig; el.blur(); }
    });
    el.addEventListener('blur', async () => {
      const catId = parseInt(el.closest('.tmpl-cat').dataset.catId);
      const name  = el.textContent.trim();
      if (!name || name === el.dataset.orig) { el.textContent = el.dataset.orig; return; }
      try {
        _tmplCurrent = await apiFetch('PUT', `/packing-templates/${tmplId}/categories/${catId}`, { name });
        el.dataset.orig = name;
      } catch (e) {
        el.textContent = el.dataset.orig;
        alert(e.message);
      }
    });
  });

  // Delete category
  container.querySelectorAll('.tmpl-cat-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this category and all its items?')) return;
      const catId = parseInt(btn.dataset.catId);
      try {
        await apiFetch('DELETE', `/packing-templates/${tmplId}/categories/${catId}`);
        _tmplCurrent = await apiFetch('GET', `/packing-templates/${tmplId}`);
        _renderTemplateEditor(container);
      } catch (e) { alert(e.message); }
    });
  });

  // Add category
  const newCatInput = get('#tmpl-new-cat');
  const addCatBtn   = get('#tmpl-add-cat-btn');
  const doAddCat = async () => {
    const name = newCatInput.value.trim();
    if (!name) return;
    try {
      _tmplCurrent = await apiFetch('POST', `/packing-templates/${tmplId}/categories`, { name });
      _renderTemplateEditor(container);
    } catch (e) { alert(e.message); }
  };
  addCatBtn.addEventListener('click', doAddCat);
  newCatInput.addEventListener('keydown', e => { if (e.key === 'Enter') doAddCat(); });

  // Add item to category
  container.querySelectorAll('.tmpl-add-item-btn').forEach(btn => {
    const catId   = parseInt(btn.dataset.catId);
    const row     = btn.closest('.tmpl-add-item-row');
    const nameIn  = row.querySelector('input[type="text"]');
    const qtyIn   = row.querySelector('input[type="number"]');
    const doAdd   = async () => {
      const name = nameIn.value.trim();
      if (!name) return;
      const qty = parseInt(qtyIn.value) || 1;
      try {
        _tmplCurrent = await apiFetch(
          'POST', `/packing-templates/${tmplId}/categories/${catId}/items`,
          { name, quantity: qty }
        );
        _renderTemplateEditor(container);
      } catch (e) { alert(e.message); }
    };
    btn.addEventListener('click', doAdd);
    nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
  });

  // Delete item
  container.querySelectorAll('.tmpl-item-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const itemId = parseInt(btn.dataset.itemId);
      const catId  = parseInt(btn.dataset.catId);
      try {
        await apiFetch('DELETE', `/packing-templates/${tmplId}/categories/${catId}/items/${itemId}`);
        _tmplCurrent = await apiFetch('GET', `/packing-templates/${tmplId}`);
        _renderTemplateEditor(container);
      } catch (e) { alert(e.message); }
    });
  });

  // Add suggested task
  const suggTitle = get('#tmpl-new-sugg-title');
  const suggDays  = get('#tmpl-new-sugg-days');
  const suggPrio  = get('#tmpl-new-sugg-prio');
  const addSuggBtn = get('#tmpl-add-sugg-btn');
  const doAddSugg = async () => {
    const title = suggTitle.value.trim();
    if (!title) return;
    const days = parseInt(suggDays.value) || null;
    try {
      _tmplCurrent = await apiFetch('POST', `/packing-templates/${tmplId}/suggested-tasks`, {
        title,
        priority: suggPrio.value,
        days_before_departure: days,
      });
      _renderTemplateEditor(container);
    } catch (e) { alert(e.message); }
  };
  addSuggBtn.addEventListener('click', doAddSugg);
  suggTitle.addEventListener('keydown', e => { if (e.key === 'Enter') doAddSugg(); });

  // Delete suggested task
  container.querySelectorAll('.tmpl-sugg-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const suggId = parseInt(btn.dataset.suggId);
      try {
        await apiFetch('DELETE', `/packing-templates/${tmplId}/suggested-tasks/${suggId}`);
        _tmplCurrent = await apiFetch('GET', `/packing-templates/${tmplId}`);
        _renderTemplateEditor(container);
      } catch (e) { alert(e.message); }
    });
  });
}
