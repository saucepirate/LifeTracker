// trips-packing.js — Phase 3: Packing list tab

let _packTrip         = null;
let _packData         = null;
let _packEdit         = false;
let _packUnpackedOnly = false;

// Called by trips.js _renderTab
async function renderPackingTab(container, trip) {
  _packTrip         = trip;
  _packEdit         = false;
  _packUnpackedOnly = false;
  container.innerHTML = '<div class="loading-state">Loading packing list…</div>';
  try {
    _packData = await apiFetch('GET', `/trips/${trip.id}/packing`);
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p class="empty-state-text">${escHtml(e.message)}</p></div>`;
    return;
  }
  _renderPacking(container);
}

function _renderPacking(container) {
  const data = _packData;
  const edit = _packEdit;
  const pct  = data.pct || 0;

  container.innerHTML = `
    <div class="pack-toolbar">
      <div class="pack-progress-wrap">
        <div class="pack-bar">
          <div class="pack-bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="pack-bar-label">${data.checked} / ${data.total} packed</span>
      </div>
      <div class="pack-toolbar-actions">
        ${!edit ? `<button class="btn btn-sm ${_packUnpackedOnly ? 'btn-primary' : 'btn-ghost'}" id="pack-filter-toggle">
          ${_packUnpackedOnly ? 'All items' : 'Remaining only'}
        </button>` : ''}
        <button class="btn btn-sm ${edit ? 'btn-primary' : 'btn-secondary'}" id="pack-edit-toggle">
          ${edit ? 'Done' : '✎ Edit'}
        </button>
        <div class="pack-tmpl-wrap">
          <button class="btn btn-sm btn-ghost" id="pack-tmpl-btn">Templates ▾</button>
          <div class="pack-tmpl-dd" id="pack-tmpl-dd" hidden></div>
        </div>
      </div>
    </div>

    <div class="pack-cats" id="pack-cats">
      ${data.categories.map(cat => _catHTML(cat, edit)).join('')}
    </div>

    ${edit ? `
      <div class="pack-add-cat-row">
        <input class="input input-sm" type="text" id="pack-new-cat" placeholder="New category name…">
        <button class="btn btn-sm btn-secondary" id="pack-add-cat-btn">+ Category</button>
      </div>
    ` : (data.total === 0 ? `
      <div class="empty-state" style="padding:40px 0">
        <p class="empty-state-text">No items yet — click Edit to start building your list.</p>
      </div>
    ` : '')}
  `;

  _bindPackEvents(container);
}

function _catHTML(cat, edit) {
  const visibleItems = _packUnpackedOnly ? cat.items.filter(i => !i.checked) : cat.items;
  if (_packUnpackedOnly && visibleItems.length === 0) return '';
  const done = cat.item_count > 0 && cat.checked_count === cat.item_count;
  return `
    <div class="pack-cat${done ? ' pack-cat-done' : ''}" data-cat-id="${cat.id}"${edit ? ' draggable="true"' : ''}>
      <div class="pack-cat-hdr">
        ${edit ? '<span class="pack-drag pack-cat-drag" title="Drag to reorder">⠿</span>' : ''}
        <span class="pack-cat-name${edit ? ' pack-editable' : ''}"
              ${edit ? `contenteditable="true" data-orig="${escHtml(cat.name)}"` : ''}
        >${escHtml(cat.name)}</span>
        <span class="pack-cat-count">${cat.checked_count}/${cat.item_count}</span>
        <button class="pack-cat-toggle btn-icon" title="Collapse">▾</button>
        ${edit ? `<button class="pack-cat-del btn-icon-danger" data-cat-id="${cat.id}" title="Delete category">✕</button>` : ''}
      </div>
      <div class="pack-cat-items" data-cat-id="${cat.id}">
        ${visibleItems.map(item => _itemHTML(item, edit)).join('')}
        ${edit ? `
          <div class="pack-add-item-row" data-cat-id="${cat.id}">
            <input class="input input-sm" type="text" placeholder="Add item…">
            <button class="btn btn-sm btn-ghost pack-add-item-btn" data-cat-id="${cat.id}">Add</button>
          </div>
        ` : (visibleItems.length === 0 ? '<div class="pack-cat-empty">No items</div>' : '')}
      </div>
    </div>
  `;
}

function _itemHTML(item, edit) {
  const done = !!item.checked;
  return `
    <div class="pack-item${done ? ' pack-item-done' : ''}" data-item-id="${item.id}"${edit ? ' draggable="true"' : ''}>
      ${edit ? '<span class="pack-drag pack-item-drag" title="Drag to reorder">⠿</span>' : ''}
      ${!edit ? `
        <button class="pack-check ${done ? 'checked' : ''}" data-item-id="${item.id}" title="${done ? 'Mark unpacked' : 'Mark packed'}">
          ${done ? '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6l3 3 5-5"/></svg>' : ''}
        </button>
      ` : ''}
      <div class="pack-item-body">
        <span class="pack-item-name">${escHtml(item.name)}</span>
        <span class="pack-item-meta">
          ${item.quantity > 1 ? `<span class="pack-item-qty">×${item.quantity}</span>` : ''}
          ${item.for_attendee_name ? `<span class="pack-item-who">${escHtml(item.for_attendee_name)}</span>` : ''}
          ${item.note ? `<span class="pack-item-note">${escHtml(item.note)}</span>` : ''}
        </span>
      </div>
      ${edit ? `
        <div class="pack-item-acts">
          <button class="pack-item-edit-btn btn-icon" data-item-id="${item.id}" title="Edit">✎</button>
          <button class="pack-item-del-btn btn-icon-danger" data-item-id="${item.id}" title="Delete">✕</button>
        </div>
      ` : ''}
    </div>
  `;
}

// ── Event binding ──────────────────────────────────────────────

function _bindPackEvents(container) {
  const trip = _packTrip;
  const get  = sel => container.querySelector(sel);

  // Filter toggle (only in pack mode)
  get('#pack-filter-toggle')?.addEventListener('click', () => {
    _packUnpackedOnly = !_packUnpackedOnly;
    _renderPacking(container);
  });

  // Edit toggle
  get('#pack-edit-toggle').addEventListener('click', () => {
    _packEdit = !_packEdit;
    _renderPacking(container);
  });

  // Templates dropdown
  const tmplBtn = get('#pack-tmpl-btn');
  const tmplDd  = get('#pack-tmpl-dd');
  tmplBtn.addEventListener('click', async e => {
    e.stopPropagation();
    if (!tmplDd.hidden) { tmplDd.hidden = true; return; }
    await _fillTemplatesDropdown(tmplDd, container, trip);
    tmplDd.hidden = false;
    setTimeout(() => document.addEventListener('click', () => { tmplDd.hidden = true; }, { once: true }), 0);
  });

  // Collapse categories
  container.querySelectorAll('.pack-cat-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const itemsEl = btn.closest('.pack-cat').querySelector('.pack-cat-items');
      const closed  = itemsEl.hidden;
      itemsEl.hidden = !closed;
      btn.textContent = closed ? '▾' : '▸';
    });
  });

  // Check/uncheck items (pack mode)
  container.querySelectorAll('.pack-check').forEach(btn => {
    btn.addEventListener('click', async () => {
      const itemId = parseInt(btn.dataset.itemId);
      const allItems = _packData.categories.flatMap(c => c.items);
      const item     = allItems.find(i => i.id === itemId);
      try {
        _packData = await apiFetch('PUT', `/trips/${trip.id}/packing/items/${itemId}`, {
          checked: item.checked ? 0 : 1,
        });
        _renderPacking(container);
      } catch (e) { alert(e.message); }
    });
  });

  if (!_packEdit) return;

  // Category inline rename
  container.querySelectorAll('.pack-cat-name.pack-editable').forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { el.textContent = el.dataset.orig; el.blur(); }
    });
    el.addEventListener('blur', async () => {
      const catId = parseInt(el.closest('.pack-cat').dataset.catId);
      const name  = el.textContent.trim();
      if (!name || name === el.dataset.orig) { el.textContent = el.dataset.orig; return; }
      try {
        _packData = await apiFetch('PUT', `/trips/${trip.id}/packing/categories/${catId}`, { name });
        el.dataset.orig = name;
      } catch (e) {
        el.textContent = el.dataset.orig;
        alert(e.message);
      }
    });
  });

  // Delete category
  container.querySelectorAll('.pack-cat-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this category and all its items?')) return;
      const catId = parseInt(btn.dataset.catId);
      try {
        await apiFetch('DELETE', `/trips/${trip.id}/packing/categories/${catId}`);
        _packData = await apiFetch('GET', `/trips/${trip.id}/packing`);
        _renderPacking(container);
      } catch (e) { alert(e.message); }
    });
  });

  // Add item inline
  container.querySelectorAll('.pack-add-item-row').forEach(row => {
    const catId = parseInt(row.dataset.catId);
    const input = row.querySelector('input');
    const btn   = row.querySelector('.pack-add-item-btn');
    const doAdd = async (refocus) => {
      const name = input.value.trim();
      if (!name) return;
      try {
        _packData = await apiFetch('POST', `/trips/${trip.id}/packing/categories/${catId}/items`, { name });
        _renderPacking(container);
        if (refocus) {
          const newInput = container.querySelector(`.pack-add-item-row[data-cat-id="${catId}"] input`);
          if (newInput) newInput.focus();
        }
      } catch (e) { alert(e.message); }
    };
    btn.addEventListener('click', () => doAdd(false));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(true); });
  });

  // Edit item modal
  container.querySelectorAll('.pack-item-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const itemId   = parseInt(btn.dataset.itemId);
      const allItems = _packData.categories.flatMap(c => c.items);
      const item     = allItems.find(i => i.id === itemId);
      _openItemEditModal(container, trip, item);
    });
  });

  // Delete item
  container.querySelectorAll('.pack-item-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const itemId = parseInt(btn.dataset.itemId);
      try {
        await apiFetch('DELETE', `/trips/${trip.id}/packing/items/${itemId}`);
        _packData = await apiFetch('GET', `/trips/${trip.id}/packing`);
        _renderPacking(container);
      } catch (e) { alert(e.message); }
    });
  });

  // Add category
  const newCatInput = get('#pack-new-cat');
  const addCatBtn   = get('#pack-add-cat-btn');
  if (addCatBtn && newCatInput) {
    const doAdd = async () => {
      const name = newCatInput.value.trim();
      if (!name) return;
      try {
        _packData = await apiFetch('POST', `/trips/${trip.id}/packing/categories`, { name });
        _renderPacking(container);
      } catch (e) { alert(e.message); }
    };
    addCatBtn.addEventListener('click', doAdd);
    newCatInput.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
  }

  // Drag-to-reorder categories
  _initCatDrag(container, trip);
  // Drag-to-reorder items within each category
  container.querySelectorAll('.pack-cat-items').forEach(el => {
    _initItemDrag(el, container, trip, parseInt(el.dataset.catId));
  });
}

// ── Item edit modal ────────────────────────────────────────────

function _openItemEditModal(container, trip, item) {
  const attendees = (_packTrip.attendees || []);
  const attOpts   = [
    `<option value="">— no one specific —</option>`,
    ...attendees.map(a =>
      `<option value="${a.id}"${item.for_attendee_id === a.id ? ' selected' : ''}>${escHtml(a.name)}</option>`
    ),
  ].join('');

  const bodyHTML = `
    <div class="form-group">
      <label class="form-label">Item name</label>
      <input class="form-input" id="pitem-name" type="text" value="${escHtml(item.name)}">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group">
        <label class="form-label">Quantity</label>
        <input class="form-input" id="pitem-qty" type="number" min="1" value="${item.quantity}">
      </div>
      <div class="form-group">
        <label class="form-label">For</label>
        <select class="form-input" id="pitem-who">${attOpts}</select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Note</label>
      <input class="form-input" id="pitem-note" type="text" value="${escHtml(item.note || '')}" placeholder="Optional note…">
    </div>`;

  const overlay = createModal('Edit Item', bodyHTML, async ov => {
    const name = ov.querySelector('#pitem-name').value.trim();
    if (!name) { alert('Name is required.'); return; }
    const qty    = parseInt(ov.querySelector('#pitem-qty').value) || 1;
    const attId  = parseInt(ov.querySelector('#pitem-who').value) || null;
    const note   = ov.querySelector('#pitem-note').value.trim();
    const body   = { name, quantity: qty };
    if (attId)                         body.for_attendee_id = attId;
    if (!attId && item.for_attendee_id) body.clear_attendee = true;
    if (note)                           body.note = note;
    if (!note && item.note)             body.clear_note = true;
    try {
      _packData = await apiFetch('PUT', `/trips/${trip.id}/packing/items/${item.id}`, body);
      closeModal(ov); ov.remove();
      _renderPacking(container);
    } catch (e) { alert(e.message); }
  }, 'Save');
  openModal(overlay);
}

// ── Templates dropdown ─────────────────────────────────────────

async function _fillTemplatesDropdown(dd, container, trip) {
  dd.innerHTML = '<div class="pack-dd-loading">Loading…</div>';
  let templates = [];
  try {
    const data = await apiFetch('GET', '/packing-templates');
    templates  = data.items || [];
  } catch (e) {
    dd.innerHTML = `<div class="pack-dd-err">${escHtml(e.message)}</div>`;
    return;
  }

  dd.innerHTML = `
    <div class="pack-dd-section">Apply to this trip</div>
    ${templates.length ? templates.map(t => `
      <button class="pack-dd-item pack-apply-tmpl" data-id="${t.id}">
        ${escHtml(t.name)}
        <span class="pack-dd-meta">${t.category_count} cats · ${t.item_count} items</span>
      </button>`).join('') : '<div class="pack-dd-empty">No templates yet</div>'}
    <div class="pack-dd-sep"></div>
    <button class="pack-dd-item" id="pack-dd-save">Save list as template…</button>
    <button class="pack-dd-item" id="pack-dd-manage">Manage templates →</button>
  `;

  dd.querySelectorAll('.pack-apply-tmpl').forEach(btn => {
    btn.addEventListener('click', async () => {
      dd.hidden = true;
      await _doApplyTemplate(container, trip, parseInt(btn.dataset.id));
    });
  });

  dd.querySelector('#pack-dd-save').addEventListener('click', async () => {
    dd.hidden = true;
    await _openSaveAsTemplateModal(container, trip, templates);
  });

  dd.querySelector('#pack-dd-manage').addEventListener('click', () => {
    dd.hidden = true;
    loadPage('packing-templates');
  });
}

async function _doApplyTemplate(container, trip, tmplId) {
  const merge = confirm(
    'Merge template with existing packing list?\n\n' +
    'OK = merge (add missing items to existing categories)\n' +
    'Cancel = replace (clear list first, then apply template)'
  );
  try {
    _packData = await apiFetch('POST', `/trips/${trip.id}/packing/apply-template`, {
      template_id: tmplId,
      merge,
    });
    _renderPacking(container);
  } catch (e) { alert(e.message); }
}

async function _openSaveAsTemplateModal(container, trip, templates) {
  const opts = templates.map(t =>
    `<option value="${t.id}">${escHtml(t.name)}</option>`
  ).join('');

  const bodyHTML = `
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
      Save the current packing list as a reusable template.
    </p>
    <div class="form-group">
      <label class="form-label">Destination</label>
      <select class="form-input" id="save-tmpl-sel">
        <option value="">— create new template —</option>
        ${opts}
      </select>
    </div>
    <div id="save-tmpl-name-wrap" class="form-group" style="display:none">
      <label class="form-label">New template name</label>
      <input class="form-input" id="save-tmpl-name" type="text" placeholder="e.g. Beach Weekend">
    </div>`;

  const overlay = createModal('Save as Template', bodyHTML, async ov => {
    const sel    = ov.querySelector('#save-tmpl-sel').value;
    let   tmplId = sel ? parseInt(sel) : null;
    if (!tmplId) {
      const name = ov.querySelector('#save-tmpl-name').value.trim();
      if (!name) { alert('Enter a template name.'); return; }
      try {
        const t = await apiFetch('POST', '/packing-templates', { name });
        tmplId  = t.id;
      } catch (e) { alert(e.message); return; }
    }
    try {
      await apiFetch('POST', `/trips/${trip.id}/packing/push-to-template`, { template_id: tmplId });
      closeModal(ov); ov.remove();
      alert('Saved to template!');
    } catch (e) { alert(e.message); }
  }, 'Save');

  overlay.querySelector('#save-tmpl-sel').addEventListener('change', e => {
    overlay.querySelector('#save-tmpl-name-wrap').style.display = e.target.value ? 'none' : '';
  });

  openModal(overlay);
}

// ── Drag-to-reorder ────────────────────────────────────────────

function _initCatDrag(container, trip) {
  const catsEl  = container.querySelector('#pack-cats');
  if (!catsEl) return;
  let dragging  = null;

  catsEl.querySelectorAll('.pack-cat[draggable]').forEach(el => {
    el.addEventListener('dragstart', e => {
      dragging = el;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => el.classList.add('drag-ghost'), 0);
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('drag-ghost');
      dragging = null;
    });
    el.addEventListener('dragover', e => {
      e.preventDefault();
      if (!dragging || dragging === el) return;
      const mid = el.getBoundingClientRect().top + el.offsetHeight / 2;
      catsEl.insertBefore(dragging, e.clientY < mid ? el : el.nextSibling);
    });
    el.addEventListener('drop', async e => {
      e.preventDefault();
      const ids = [...catsEl.querySelectorAll('.pack-cat')].map(c => parseInt(c.dataset.catId));
      try {
        _packData = await apiFetch('POST', `/trips/${trip.id}/packing/categories/reorder`, { ids });
      } catch (err) { alert(err.message); }
    });
  });
}

function _initItemDrag(catItemsEl, container, trip, catId) {
  let dragging = null;

  catItemsEl.querySelectorAll('.pack-item[draggable]').forEach(el => {
    el.addEventListener('dragstart', e => {
      dragging = el;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => el.classList.add('drag-ghost'), 0);
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('drag-ghost');
      dragging = null;
    });
    el.addEventListener('dragover', e => {
      e.preventDefault();
      if (!dragging || dragging === el) return;
      const mid = el.getBoundingClientRect().top + el.offsetHeight / 2;
      catItemsEl.insertBefore(dragging, e.clientY < mid ? el : el.nextSibling);
    });
    el.addEventListener('drop', async e => {
      e.preventDefault();
      const ids = [...catItemsEl.querySelectorAll('.pack-item')].map(i => parseInt(i.dataset.itemId));
      try {
        _packData = await apiFetch('POST', `/trips/${trip.id}/packing/categories/${catId}/reorder-items`, { ids });
      } catch (err) { alert(err.message); }
    });
  });
}
