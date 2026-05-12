// trips-packing.js — Multi-list packing

let _packTrip         = null;
let _packData         = null;
let _packEdit         = false;
let _packUnpackedOnly = false;
let _packActiveListId = null;

// Called by trips.js _renderTab
async function renderPackingTab(container, trip) {
  _packTrip         = trip;
  _packEdit         = false;
  _packUnpackedOnly = false;
  _packActiveListId = null;
  container.innerHTML = '<div class="loading-state">Loading packing list…</div>';
  try {
    _packData = await apiFetch('GET', `/trips/${trip.id}/packing`);
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p class="empty-state-text">${escHtml(e.message)}</p></div>`;
    return;
  }
  _renderPacking(container);
}

// ── Helpers ────────────────────────────────────────────────────

function _packAllItems() {
  return (_packData.lists || []).flatMap(l => l.categories.flatMap(c => c.items));
}

function _packActiveList() {
  const lists = _packData.lists || [];
  return lists.find(l => l.id === _packActiveListId) || lists[0] || null;
}

const _ownerLabels = { shared: 'Shared', men: '♂ Men', women: '♀ Women', all_travelers: '' };

function _ownerBadgeHTML(owner_type) {
  if (!owner_type || owner_type === 'all_travelers') return '';
  return `<span class="pack-owner-badge pack-owner-${owner_type}">${_ownerLabels[owner_type] || owner_type}</span>`;
}

// ── Render ──────────────────────────────────────────────────────

function _renderPacking(container) {
  const data   = _packData;
  const edit   = _packEdit;
  const pct    = data.pct || 0;
  const lists  = data.lists || [];

  if (_packActiveListId === null && lists.length > 0) {
    _packActiveListId = lists[0].id;
  }
  const activeList = _packActiveList();
  const categories = activeList ? activeList.categories : [];

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

    <div class="pack-lists-bar" id="pack-lists-bar">
      ${lists.map(l => `
        <button class="pack-list-tab${l.list_type === 'shared' ? ' shared' : ''}${l.id === (activeList ? activeList.id : -1) ? ' active' : ''}"
                data-list-id="${l.id}">
          ${l.list_type === 'shared' ? '<svg class="pack-list-icon" viewBox="0 0 14 14" fill="none"><circle cx="5" cy="4" r="2" fill="currentColor" opacity=".8"/><circle cx="9" cy="4" r="2" fill="currentColor" opacity=".5"/><path d="M1 11c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".8"/><path d="M9 7.5c1.7.3 3 1.5 3 3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".5"/></svg>' : ''}
          <span class="pack-list-tab-name">${escHtml(l.name)}</span>
          <span class="pack-list-tab-count">${l.checked_count}/${l.item_count}</span>
          ${edit ? `
            <span class="pack-list-tab-acts">
              <button class="pack-list-rename-btn" data-list-id="${l.id}" title="Rename">✎</button>
              <button class="pack-list-del-btn" data-list-id="${l.id}" title="Delete list">✕</button>
            </span>` : ''}
        </button>`).join('')}
      ${edit ? `<button class="btn btn-sm btn-ghost pack-list-add-btn" id="pack-add-list-btn">+ List</button>` : ''}
    </div>

    <div class="pack-cats" id="pack-cats">
      ${activeList
        ? (categories.length
            ? categories.map(cat => _catHTML(cat, edit)).join('')
            : (edit ? '' : `<div class="empty-state" style="padding:30px 0"><p class="empty-state-text">No items yet — click Edit to start building this list.</p></div>`))
        : `<div class="empty-state" style="padding:40px 0">
             <p class="empty-state-text">No packing lists yet.<br>Click <strong>✎ Edit</strong> then <strong>+ List</strong> to get started,<br>or use <strong>Templates ▾</strong> to apply a preset.</p>
           </div>`}
    </div>

    ${edit && activeList ? `
      <div class="pack-add-cat-row">
        <input class="input input-sm" type="text" id="pack-new-cat" placeholder="New category name…">
        <button class="btn btn-sm btn-secondary" id="pack-add-cat-btn">+ Category</button>
      </div>
    ` : ''}
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
  const ownerBadge = _ownerBadgeHTML(item.owner_type);
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
          ${ownerBadge}
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

  // Filter toggle
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

  // List tab switching
  container.querySelectorAll('.pack-list-tab').forEach(tab => {
    tab.addEventListener('click', e => {
      if (e.target.closest('.pack-list-tab-acts')) return;
      _packActiveListId = parseInt(tab.dataset.listId);
      _renderPacking(container);
    });
  });

  // Add list
  get('#pack-add-list-btn')?.addEventListener('click', () => {
    _openAddListModal(container, trip);
  });

  // Rename list
  container.querySelectorAll('.pack-list-rename-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const listId = parseInt(btn.dataset.listId);
      const lst = (_packData.lists || []).find(l => l.id === listId);
      if (!lst) return;
      const name = prompt('Rename list:', lst.name);
      if (!name || name.trim() === lst.name) return;
      try {
        _packData = await apiFetch('PATCH', `/trips/${trip.id}/packing/lists/${listId}`, { name: name.trim() });
        _renderPacking(container);
      } catch (err) { alert(err.message); }
    });
  });

  // Delete list
  container.querySelectorAll('.pack-list-del-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const listId = parseInt(btn.dataset.listId);
      const lst = (_packData.lists || []).find(l => l.id === listId);
      if (!confirm(`Delete list "${lst ? lst.name : ''}" and all its items?`)) return;
      try {
        await apiFetch('DELETE', `/trips/${trip.id}/packing/lists/${listId}`);
        if (_packActiveListId === listId) _packActiveListId = null;
        _packData = await apiFetch('GET', `/trips/${trip.id}/packing`);
        _renderPacking(container);
      } catch (err) { alert(err.message); }
    });
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

  // Check/uncheck items
  container.querySelectorAll('.pack-check').forEach(btn => {
    btn.addEventListener('click', async () => {
      const itemId = parseInt(btn.dataset.itemId);
      const item   = _packAllItems().find(i => i.id === itemId);
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
      const itemId = parseInt(btn.dataset.itemId);
      const item   = _packAllItems().find(i => i.id === itemId);
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
      const activeList = _packActiveList();
      try {
        _packData = await apiFetch('POST', `/trips/${trip.id}/packing/categories`, {
          name,
          list_id: activeList ? activeList.id : undefined,
        });
        _renderPacking(container);
      } catch (e) { alert(e.message); }
    };
    addCatBtn.addEventListener('click', doAdd);
    newCatInput.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
  }

  // Drag-to-reorder categories
  _initCatDrag(container, trip);
  container.querySelectorAll('.pack-cat-items').forEach(el => {
    _initItemDrag(el, container, trip, parseInt(el.dataset.catId));
  });
}

// ── Add list modal ─────────────────────────────────────────────

function _openAddListModal(container, trip) {
  const bodyHTML = `
    <div class="form-group">
      <label class="form-label">List name</label>
      <input class="form-input" id="new-list-name" type="text" placeholder="e.g. Eddie, Sarah, Shared…" autofocus>
    </div>
    <div class="form-group">
      <label class="form-label">Type</label>
      <select class="form-input" id="new-list-type">
        <option value="personal">Personal (one traveler)</option>
        <option value="shared">Shared (group items)</option>
      </select>
    </div>`;

  const overlay = createModal('Add Packing List', bodyHTML, async ov => {
    const name      = ov.querySelector('#new-list-name').value.trim();
    const list_type = ov.querySelector('#new-list-type').value;
    if (!name) { alert('Enter a list name.'); return; }
    try {
      _packData = await apiFetch('POST', `/trips/${trip.id}/packing/lists`, { name, list_type });
      const newList = (_packData.lists || []).find(l => l.name === name);
      if (newList) _packActiveListId = newList.id;
      closeModal(ov); ov.remove();
      _renderPacking(container);
    } catch (e) { alert(e.message); }
  }, 'Add List');
  openModal(overlay);
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

  const ownerType = item.owner_type || 'all_travelers';

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
        <label class="form-label">Intended for</label>
        <select class="form-input" id="pitem-owner">
          <option value="all_travelers"${ownerType === 'all_travelers' ? ' selected' : ''}>All travelers</option>
          <option value="shared"${ownerType === 'shared' ? ' selected' : ''}>Shared (group item)</option>
          <option value="men"${ownerType === 'men' ? ' selected' : ''}>Men</option>
          <option value="women"${ownerType === 'women' ? ' selected' : ''}>Women</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Assigned to attendee</label>
      <select class="form-input" id="pitem-who">${attOpts}</select>
    </div>
    <div class="form-group">
      <label class="form-label">Note</label>
      <input class="form-input" id="pitem-note" type="text" value="${escHtml(item.note || '')}" placeholder="Optional note…">
    </div>`;

  const overlay = createModal('Edit Item', bodyHTML, async ov => {
    const name      = ov.querySelector('#pitem-name').value.trim();
    if (!name) { alert('Name is required.'); return; }
    const qty       = parseInt(ov.querySelector('#pitem-qty').value) || 1;
    const attId     = parseInt(ov.querySelector('#pitem-who').value) || null;
    const ownerType = ov.querySelector('#pitem-owner').value;
    const note      = ov.querySelector('#pitem-note').value.trim();
    const body      = { name, quantity: qty, owner_type: ownerType };
    if (attId)                          body.for_attendee_id = attId;
    if (!attId && item.for_attendee_id) body.clear_attendee  = true;
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

// ── Preset packing lists ────────────────────────────────────────

const PACKING_PRESETS = [
  {
    id: 'weekend',
    name: 'Weekend Getaway',
    icon: '🚗',
    filterTripType: 'general', filterDestination: 'domestic', filterLength: 'weekend',
    categories: [
      { name: 'Clothing',     items: [{ name: 'Casual outfits (2-3 changes)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Underwear & socks', quantity: 3, owner_type: 'all_travelers' }, { name: 'Sleepwear', quantity: 1, owner_type: 'all_travelers' }, { name: 'Comfortable shoes', quantity: 1, owner_type: 'all_travelers' }, { name: 'Light jacket or sweater', quantity: 1, owner_type: 'all_travelers' }, { name: 'Compact umbrella, if rain forecast', quantity: 1, owner_type: 'all_travelers' }] },
      { name: 'Toiletries',   items: [{ name: 'Toothbrush & toothpaste', quantity: 1, owner_type: 'all_travelers' }, { name: 'Deodorant', quantity: 1, owner_type: 'all_travelers' }, { name: 'Shampoo & conditioner', quantity: 1, owner_type: 'all_travelers' }, { name: 'Face wash & moisturizer', quantity: 1, owner_type: 'all_travelers' }, { name: 'Razor & shaving cream', quantity: 1, owner_type: 'men' }, { name: 'Makeup bag & brushes', quantity: 1, owner_type: 'women' }, { name: 'Feminine hygiene items', quantity: 1, owner_type: 'women' }] },
      { name: 'Electronics',  items: [{ name: 'Phone charger', quantity: 1, owner_type: 'all_travelers' }, { name: 'Earbuds or headphones', quantity: 1, owner_type: 'all_travelers' }, { name: 'Portable battery pack', quantity: 1, owner_type: 'shared' }] },
      { name: 'Essentials',   items: [{ name: 'Car snacks & drinks', quantity: 1, owner_type: 'shared' }, { name: 'First aid travel kit', quantity: 1, owner_type: 'shared' }, { name: 'Booking confirmation (downloaded offline)', quantity: 1, owner_type: 'shared' }, { name: 'ID / passport', quantity: 1, owner_type: 'all_travelers' }, { name: 'Wallet & cash', quantity: 1, owner_type: 'all_travelers' }, { name: 'Keys', quantity: 1, owner_type: 'all_travelers' }, { name: 'Reusable water bottle', quantity: 1, owner_type: 'all_travelers' }, { name: 'Medications', quantity: 1, owner_type: 'all_travelers' }] },
    ],
  },
  {
    id: 'beach',
    name: 'Beach & Resort',
    icon: '🏖️',
    filterTripType: 'beach', filterDestination: 'any', filterLength: 'any',
    categories: [
      { name: 'Clothing',     items: [{ name: 'Swimsuit', quantity: 2, owner_type: 'all_travelers' }, { name: 'Cover-up or light layer', quantity: 1, owner_type: 'all_travelers' }, { name: 'Casual resort outfits', quantity: 3, owner_type: 'all_travelers' }, { name: 'Flip flops / sandals', quantity: 1, owner_type: 'all_travelers' }, { name: 'Evening outfit', quantity: 1, owner_type: 'all_travelers' }, { name: 'Rashguard or extra board shorts', quantity: 1, owner_type: 'men' }, { name: 'Sarong or wrap', quantity: 1, owner_type: 'women' }] },
      { name: 'Beach Gear',   items: [{ name: 'Sunscreen SPF 50+', quantity: 1, owner_type: 'shared' }, { name: 'After-sun lotion', quantity: 1, owner_type: 'shared' }, { name: 'Insect repellent', quantity: 1, owner_type: 'shared' }, { name: 'Waterproof speaker', quantity: 1, owner_type: 'shared' }, { name: 'Camera (if bringing)', quantity: 1, owner_type: 'shared' }, { name: 'Sunglasses', quantity: 1, owner_type: 'all_travelers' }, { name: 'Beach towel', quantity: 1, owner_type: 'all_travelers' }, { name: 'Hat / sun hat', quantity: 1, owner_type: 'all_travelers' }, { name: 'Waterproof phone case', quantity: 1, owner_type: 'all_travelers' }] },
      { name: 'Toiletries',   items: [{ name: 'Deodorant & personal toiletries', quantity: 1, owner_type: 'all_travelers' }, { name: 'Razor', quantity: 1, owner_type: 'men' }, { name: 'Feminine hygiene items', quantity: 1, owner_type: 'women' }, { name: 'Makeup & skincare essentials', quantity: 1, owner_type: 'women' }] },
      { name: 'Electronics',  items: [{ name: 'Phone charger / cables', quantity: 1, owner_type: 'shared' }, { name: 'Portable battery pack', quantity: 1, owner_type: 'all_travelers' }] },
      { name: 'Essentials',   items: [{ name: 'Booking confirmations', quantity: 1, owner_type: 'shared' }, { name: 'Travel insurance documents', quantity: 1, owner_type: 'shared' }, { name: 'Passport / ID', quantity: 1, owner_type: 'all_travelers' }, { name: 'Wallet & cards', quantity: 1, owner_type: 'all_travelers' }, { name: 'Reusable water bottle', quantity: 1, owner_type: 'all_travelers' }, { name: 'Medications', quantity: 1, owner_type: 'all_travelers' }] },
    ],
  },
  {
    id: 'sightseeing',
    name: 'City & Sightseeing',
    icon: '🏛️',
    filterTripType: 'sightseeing', filterDestination: 'any', filterLength: 'any',
    categories: [
      { name: 'Clothing',           items: [{ name: 'Comfortable walking outfits', quantity: 1, owner_type: 'all_travelers' }, { name: 'Smart casual dinner outfit', quantity: 1, owner_type: 'all_travelers' }, { name: 'Comfortable walking shoes', quantity: 1, owner_type: 'all_travelers' }, { name: 'Light jacket / layers', quantity: 1, owner_type: 'all_travelers' }, { name: 'Rain jacket or compact umbrella', quantity: 1, owner_type: 'all_travelers' }, { name: 'Comfortable flats (for evenings)', quantity: 1, owner_type: 'women' }] },
      { name: 'Day Bag Essentials', items: [{ name: 'City map or guidebook', quantity: 1, owner_type: 'shared' }, { name: 'Snacks for the day', quantity: 1, owner_type: 'shared' }, { name: 'Universal power adapter', quantity: 1, owner_type: 'shared' }, { name: 'Hotel confirmation', quantity: 1, owner_type: 'shared' }, { name: 'Activity passes / confirmations (offline)', quantity: 1, owner_type: 'shared' }, { name: 'Daypack / small backpack', quantity: 1, owner_type: 'all_travelers' }, { name: 'Reusable water bottle', quantity: 1, owner_type: 'all_travelers' }, { name: 'Portable battery pack', quantity: 1, owner_type: 'all_travelers' }] },
      { name: 'Toiletries',         items: [{ name: 'Travel toiletries kit', quantity: 1, owner_type: 'all_travelers' }, { name: 'Blister pads / moleskin', quantity: 1, owner_type: 'all_travelers' }, { name: 'Hand sanitizer', quantity: 1, owner_type: 'all_travelers' }, { name: 'Sunscreen', quantity: 1, owner_type: 'all_travelers' }, { name: 'Razor & shaving kit', quantity: 1, owner_type: 'men' }, { name: 'Compact makeup essentials', quantity: 1, owner_type: 'women' }, { name: 'Feminine hygiene items', quantity: 1, owner_type: 'women' }] },
      { name: 'Electronics',        items: [{ name: 'Phone charger', quantity: 1, owner_type: 'all_travelers' }, { name: 'Camera', quantity: 1, owner_type: 'all_travelers' }, { name: 'Earbuds', quantity: 1, owner_type: 'all_travelers' }] },
      { name: 'Documents',          items: [{ name: 'Travel insurance card', quantity: 1, owner_type: 'shared' }, { name: 'Passport / ID', quantity: 1, owner_type: 'all_travelers' }, { name: 'Wallet & cards', quantity: 1, owner_type: 'all_travelers' }, { name: 'Medications', quantity: 1, owner_type: 'all_travelers' }] },
    ],
  },
  {
    id: 'international',
    name: 'International Travel',
    icon: '🌍',
    filterTripType: 'general', filterDestination: 'international', filterLength: 'any',
    categories: [
      { name: 'Clothing',          items: [{ name: 'Versatile mix-and-match outfits', quantity: 1, owner_type: 'all_travelers' }, { name: 'Underwear & socks (enough for trip)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Sleepwear', quantity: 2, owner_type: 'all_travelers' }, { name: 'Comfortable walking shoes', quantity: 1, owner_type: 'all_travelers' }, { name: 'Light jacket / layers', quantity: 1, owner_type: 'all_travelers' }, { name: 'Rain jacket or packable layer', quantity: 1, owner_type: 'all_travelers' }, { name: 'Dressier shoes', quantity: 1, owner_type: 'men' }, { name: 'Dress shirt + tie (for formal occasions)', quantity: 1, owner_type: 'men' }, { name: 'Dressier shoes or heels', quantity: 1, owner_type: 'women' }, { name: 'Versatile dress (smart casual / formal)', quantity: 1, owner_type: 'women' }, { name: 'Swimsuit', quantity: 1, owner_type: 'women' }] },
      { name: 'Documents & Money', items: [{ name: 'Universal power adapter', quantity: 1, owner_type: 'shared' }, { name: 'Emergency contact sheet', quantity: 1, owner_type: 'shared' }, { name: 'Travel insurance policy', quantity: 1, owner_type: 'shared' }, { name: 'Flight & hotel confirmations (offline)', quantity: 1, owner_type: 'shared' }, { name: 'Local currency / travel card', quantity: 1, owner_type: 'shared' }, { name: 'eSIM or local SIM / roaming plan', quantity: 1, owner_type: 'shared' }, { name: 'Snacks for the flight', quantity: 1, owner_type: 'shared' }, { name: 'Passport (6+ months validity)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Passport + visa copies (digital & one printed)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Visa documents', quantity: 1, owner_type: 'all_travelers' }, { name: 'Backup payment card', quantity: 1, owner_type: 'all_travelers' }, { name: 'Vaccination records (if required)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Wallet & cards', quantity: 1, owner_type: 'all_travelers' }] },
      { name: 'Toiletries',        items: [{ name: 'Travel-size toiletries kit', quantity: 1, owner_type: 'all_travelers' }, { name: 'Prescription medications (extra supply)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Anti-diarrhea & stomach meds', quantity: 1, owner_type: 'all_travelers' }, { name: 'Insect repellent (if destination warrants)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Sunscreen', quantity: 1, owner_type: 'all_travelers' }, { name: 'Razor & shaving kit', quantity: 1, owner_type: 'men' }, { name: 'Makeup bag', quantity: 1, owner_type: 'women' }, { name: 'Feminine hygiene items', quantity: 1, owner_type: 'women' }] },
      { name: 'Electronics',       items: [{ name: 'Phone charger', quantity: 1, owner_type: 'all_travelers' }, { name: 'Portable battery pack', quantity: 1, owner_type: 'all_travelers' }, { name: 'Camera', quantity: 1, owner_type: 'all_travelers' }, { name: 'Earbuds / noise-cancelling headphones', quantity: 1, owner_type: 'all_travelers' }] },
      { name: 'Comfort & Travel',  items: [{ name: 'Neck pillow', quantity: 1, owner_type: 'all_travelers' }, { name: 'Eye mask & earplugs', quantity: 1, owner_type: 'all_travelers' }, { name: 'Compression socks (long haul)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Reusable water bottle', quantity: 1, owner_type: 'all_travelers' }, { name: 'Luggage lock', quantity: 1, owner_type: 'all_travelers' }] },
    ],
  },
  {
    id: 'hiking',
    name: 'Hiking & Day Adventure',
    icon: '🥾',
    filterTripType: 'hiking', filterDestination: 'any', filterLength: 'any',
    categories: [
      { name: 'Clothing',          items: [{ name: 'Moisture-wicking base layers', quantity: 3, owner_type: 'all_travelers' }, { name: 'Hiking pants / shorts', quantity: 2, owner_type: 'all_travelers' }, { name: 'Fleece or mid-layer', quantity: 1, owner_type: 'all_travelers' }, { name: 'Waterproof outer jacket', quantity: 1, owner_type: 'all_travelers' }, { name: 'Hiking boots (broken in)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Wool hiking socks', quantity: 2, owner_type: 'all_travelers' }, { name: 'Hat & gloves', quantity: 1, owner_type: 'all_travelers' }, { name: 'Sports bra', quantity: 2, owner_type: 'women' }] },
      { name: 'Gear',              items: [{ name: 'Map / trail guide', quantity: 1, owner_type: 'shared' }, { name: 'Compass', quantity: 1, owner_type: 'shared' }, { name: 'Water filter / purification tabs', quantity: 1, owner_type: 'shared' }, { name: 'First aid kit', quantity: 1, owner_type: 'shared' }, { name: 'Emergency bivvy / space blanket', quantity: 1, owner_type: 'shared' }, { name: 'Group trail snacks', quantity: 1, owner_type: 'shared' }, { name: 'Hiking backpack', quantity: 1, owner_type: 'all_travelers' }, { name: 'Trekking poles (optional)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Headlamp & extra batteries', quantity: 1, owner_type: 'all_travelers' }, { name: 'Reusable water bottle (×2 recommended)', quantity: 1, owner_type: 'all_travelers' }] },
      { name: 'Safety & Personal', items: [{ name: 'Blister pads', quantity: 1, owner_type: 'all_travelers' }, { name: 'Sunscreen SPF 50+', quantity: 1, owner_type: 'all_travelers' }, { name: 'Insect repellent', quantity: 1, owner_type: 'all_travelers' }, { name: 'Emergency whistle', quantity: 1, owner_type: 'all_travelers' }, { name: 'Electrolyte packets', quantity: 1, owner_type: 'all_travelers' }, { name: 'Medications', quantity: 1, owner_type: 'all_travelers' }, { name: 'Grooming wipes / compact razor', quantity: 1, owner_type: 'men' }, { name: 'Feminine hygiene items', quantity: 1, owner_type: 'women' }] },
      { name: 'Essentials',        items: [{ name: 'ID / emergency card', quantity: 1, owner_type: 'all_travelers' }, { name: 'Travel insurance documents', quantity: 1, owner_type: 'all_travelers' }, { name: 'Portable battery pack', quantity: 1, owner_type: 'all_travelers' }, { name: 'Device with offline maps', quantity: 1, owner_type: 'all_travelers' }] },
    ],
  },
  {
    id: 'camping',
    name: 'Camping Trip',
    icon: '🏕️',
    filterTripType: 'camping', filterDestination: 'any', filterLength: 'any',
    categories: [
      { name: 'Clothing',               items: [{ name: 'Moisture-wicking layers', quantity: 3, owner_type: 'all_travelers' }, { name: 'Fleece or warm layer', quantity: 1, owner_type: 'all_travelers' }, { name: 'Waterproof jacket', quantity: 1, owner_type: 'all_travelers' }, { name: 'Hiking boots or trail shoes', quantity: 1, owner_type: 'all_travelers' }, { name: 'Wool socks', quantity: 4, owner_type: 'all_travelers' }, { name: 'Hat & gloves', quantity: 1, owner_type: 'all_travelers' }, { name: 'Sports bra', quantity: 2, owner_type: 'women' }] },
      { name: 'Shelter & Camp Setup',   items: [{ name: 'Tent', quantity: 1, owner_type: 'shared' }, { name: 'Tent footprint / groundsheet', quantity: 1, owner_type: 'shared' }, { name: 'Camp stove & fuel', quantity: 1, owner_type: 'shared' }, { name: 'Cooking pots & utensils', quantity: 1, owner_type: 'shared' }, { name: 'Lantern / camp lights', quantity: 1, owner_type: 'shared' }, { name: 'Cooler', quantity: 1, owner_type: 'shared' }] },
      { name: 'Sleeping',               items: [{ name: 'Sleeping bag (temp-rated)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Sleeping pad / mat', quantity: 1, owner_type: 'all_travelers' }, { name: 'Pillow', quantity: 1, owner_type: 'all_travelers' }] },
      { name: 'Food & Water Supplies',  items: [{ name: 'Camp meals / food supplies', quantity: 1, owner_type: 'shared' }, { name: 'Water containers', quantity: 1, owner_type: 'shared' }, { name: 'Water filter or purification tabs', quantity: 1, owner_type: 'shared' }, { name: 'Bear canister (if required)', quantity: 1, owner_type: 'shared' }, { name: 'Biodegradable soap & sponge', quantity: 1, owner_type: 'shared' }] },
      { name: 'Safety & Leave No Trace',items: [{ name: 'First aid kit', quantity: 1, owner_type: 'shared' }, { name: 'Waste bags / trowel', quantity: 1, owner_type: 'shared' }, { name: 'Fire starter & matches', quantity: 1, owner_type: 'shared' }, { name: 'Campsite reservation (downloaded offline)', quantity: 1, owner_type: 'shared' }, { name: 'Emergency whistle', quantity: 1, owner_type: 'all_travelers' }] },
      { name: 'Essentials',             items: [{ name: 'ID / emergency card', quantity: 1, owner_type: 'all_travelers' }, { name: 'Headlamp & extra batteries', quantity: 1, owner_type: 'all_travelers' }, { name: 'Offline maps downloaded', quantity: 1, owner_type: 'all_travelers' }, { name: 'Reusable water bottle', quantity: 1, owner_type: 'all_travelers' }, { name: 'Insect repellent', quantity: 1, owner_type: 'all_travelers' }, { name: 'Sunscreen', quantity: 1, owner_type: 'all_travelers' }, { name: 'Medications', quantity: 1, owner_type: 'all_travelers' }, { name: 'Grooming wipes / compact razor', quantity: 1, owner_type: 'men' }, { name: 'Feminine hygiene items', quantity: 1, owner_type: 'women' }] },
    ],
  },
  {
    id: 'business',
    name: 'Business Trip',
    icon: '💼',
    filterTripType: 'business', filterDestination: 'any', filterLength: 'any',
    categories: [
      { name: 'Professional Attire', items: [{ name: 'Smart casual options', quantity: 1, owner_type: 'all_travelers' }, { name: 'Light jacket / layers', quantity: 1, owner_type: 'all_travelers' }, { name: 'Business suits / dress outfits', quantity: 1, owner_type: 'men' }, { name: 'Dress shoes', quantity: 1, owner_type: 'men' }, { name: 'Ties & pocket squares', quantity: 1, owner_type: 'men' }, { name: 'Travel iron or steamer', quantity: 1, owner_type: 'men' }, { name: 'Professional outfits (blazer + trousers or dress)', quantity: 1, owner_type: 'women' }, { name: 'Dress shoes or heeled pumps', quantity: 1, owner_type: 'women' }, { name: 'Jewelry / professional accessories', quantity: 1, owner_type: 'women' }] },
      { name: 'Work Essentials',     items: [{ name: 'Shared presentation materials', quantity: 1, owner_type: 'shared' }, { name: 'Approved USB drive, if needed', quantity: 1, owner_type: 'shared' }, { name: 'Laptop & charger', quantity: 1, owner_type: 'all_travelers' }, { name: 'Laptop bag / briefcase', quantity: 1, owner_type: 'all_travelers' }, { name: 'Business cards', quantity: 1, owner_type: 'all_travelers' }, { name: 'Notebook & pens', quantity: 1, owner_type: 'all_travelers' }] },
      { name: 'Electronics',         items: [{ name: 'Power strip / multi-socket', quantity: 1, owner_type: 'shared' }, { name: 'USB-C hub / display adapters', quantity: 1, owner_type: 'shared' }, { name: 'Phone charger', quantity: 1, owner_type: 'all_travelers' }, { name: 'Portable battery pack', quantity: 1, owner_type: 'all_travelers' }, { name: 'Earbuds for calls', quantity: 1, owner_type: 'all_travelers' }] },
      { name: 'Toiletries',          items: [{ name: 'Travel toiletries kit', quantity: 1, owner_type: 'all_travelers' }, { name: 'Reusable water bottle', quantity: 1, owner_type: 'all_travelers' }, { name: 'Medications', quantity: 1, owner_type: 'all_travelers' }, { name: 'Razor & grooming kit', quantity: 1, owner_type: 'men' }, { name: 'Makeup & grooming kit', quantity: 1, owner_type: 'women' }, { name: 'Feminine hygiene items', quantity: 1, owner_type: 'women' }] },
      { name: 'Documents',           items: [{ name: 'Expense receipts folder', quantity: 1, owner_type: 'shared' }, { name: 'Passport / ID', quantity: 1, owner_type: 'all_travelers' }, { name: 'Company travel documents', quantity: 1, owner_type: 'all_travelers' }, { name: 'Hotel & flight confirmations', quantity: 1, owner_type: 'all_travelers' }] },
    ],
  },
  {
    id: 'roadtrip',
    name: 'Road Trip',
    icon: '🚙',
    filterTripType: 'roadtrip', filterDestination: 'domestic', filterLength: 'any',
    categories: [
      { name: 'Clothing',      items: [{ name: 'Casual outfits', quantity: 1, owner_type: 'all_travelers' }, { name: 'Comfortable driving / travel clothes', quantity: 1, owner_type: 'all_travelers' }, { name: 'Light jacket or layers', quantity: 1, owner_type: 'all_travelers' }, { name: 'Compact umbrella, if forecast calls for it', quantity: 1, owner_type: 'all_travelers' }, { name: 'Comfortable shoes', quantity: 1, owner_type: 'all_travelers' }, { name: 'Sunglasses', quantity: 1, owner_type: 'all_travelers' }, { name: 'Razor & shaving kit', quantity: 1, owner_type: 'men' }, { name: 'Makeup essentials', quantity: 1, owner_type: 'women' }, { name: 'Feminine hygiene items', quantity: 1, owner_type: 'women' }] },
      { name: 'Car Essentials', items: [{ name: 'Vehicle registration & insurance card', quantity: 1, owner_type: 'shared' }, { name: 'Roadside emergency kit', quantity: 1, owner_type: 'shared' }, { name: 'Car phone mount', quantity: 1, owner_type: 'shared' }, { name: 'Car charger / USB adapter', quantity: 1, owner_type: 'shared' }, { name: 'Offline maps (downloaded)', quantity: 1, owner_type: 'shared' }, { name: 'Toll transponder or toll cash', quantity: 1, owner_type: 'shared' }, { name: 'Car trash bag', quantity: 1, owner_type: 'shared' }, { name: 'Road trip snacks & drinks', quantity: 1, owner_type: 'shared' }] },
      { name: 'Essentials',    items: [{ name: 'Reusable water bottle', quantity: 1, owner_type: 'all_travelers' }, { name: 'Phone charger', quantity: 1, owner_type: 'all_travelers' }, { name: 'Earbuds or headphones', quantity: 1, owner_type: 'all_travelers' }, { name: 'Travel pillow (for passengers)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Entertainment (downloaded shows, audiobooks)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Passport / ID', quantity: 1, owner_type: 'all_travelers' }, { name: 'Wallet & cash', quantity: 1, owner_type: 'all_travelers' }, { name: 'Medications', quantity: 1, owner_type: 'all_travelers' }] },
    ],
  },
  {
    id: 'event',
    name: 'Event / Wedding / Conference',
    icon: '🎟️',
    filterTripType: 'event', filterDestination: 'any', filterLength: 'any',
    categories: [
      { name: 'Event Outfit',    items: [{ name: 'Event outfit (per dress code)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Comfortable backup shoes', quantity: 1, owner_type: 'all_travelers' }, { name: 'Light layer for venue air conditioning', quantity: 1, owner_type: 'all_travelers' }, { name: 'Approved bag or clutch (check venue policy)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Blister pads (if wearing new shoes)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Dress shoes', quantity: 1, owner_type: 'men' }, { name: 'Tie or bow tie (if formal)', quantity: 1, owner_type: 'men' }, { name: 'Dressy shoes or heels', quantity: 1, owner_type: 'women' }, { name: 'Jewelry / accessories', quantity: 1, owner_type: 'women' }] },
      { name: 'Event Documents', items: [{ name: 'Event tickets / registration (offline)', quantity: 1, owner_type: 'shared' }, { name: 'Venue address & schedule', quantity: 1, owner_type: 'shared' }, { name: 'Accommodation confirmation', quantity: 1, owner_type: 'shared' }, { name: 'Transportation / parking details', quantity: 1, owner_type: 'shared' }] },
      { name: 'Essentials',      items: [{ name: 'Portable battery pack', quantity: 1, owner_type: 'all_travelers' }, { name: 'Phone charger', quantity: 1, owner_type: 'all_travelers' }, { name: 'ID / passport', quantity: 1, owner_type: 'all_travelers' }, { name: 'Wallet & cards', quantity: 1, owner_type: 'all_travelers' }, { name: 'Medications', quantity: 1, owner_type: 'all_travelers' }, { name: 'Razor & grooming kit', quantity: 1, owner_type: 'men' }, { name: 'Makeup touch-up kit', quantity: 1, owner_type: 'women' }, { name: 'Feminine hygiene items', quantity: 1, owner_type: 'women' }] },
    ],
  },
  {
    id: 'family',
    name: 'Family Trip',
    icon: '👨‍👩‍👧',
    filterTripType: 'family', filterDestination: 'any', filterLength: 'any',
    categories: [
      { name: 'Clothing',          items: [{ name: 'Outfits (+1 extra per day for young children)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Underwear & socks (extra for children)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Comfortable shoes', quantity: 1, owner_type: 'all_travelers' }, { name: 'Light jacket / layers', quantity: 1, owner_type: 'all_travelers' }, { name: 'Sleepwear', quantity: 1, owner_type: 'all_travelers' }, { name: 'Razor & shaving kit', quantity: 1, owner_type: 'men' }, { name: 'Makeup essentials', quantity: 1, owner_type: 'women' }, { name: 'Feminine hygiene items', quantity: 1, owner_type: 'women' }] },
      { name: 'Family Essentials', items: [{ name: "First aid kit + children's medications", quantity: 1, owner_type: 'shared' }, { name: 'Travel snacks & drinks', quantity: 1, owner_type: 'shared' }, { name: 'Reusable water bottles', quantity: 1, owner_type: 'shared' }, { name: 'Entertainment (tablet, downloaded shows, games)', quantity: 1, owner_type: 'shared' }, { name: 'Stroller / baby carrier, if applicable', quantity: 1, owner_type: 'shared' }, { name: 'Car seat or booster, if applicable', quantity: 1, owner_type: 'shared' }, { name: 'Laundry bag', quantity: 1, owner_type: 'shared' }, { name: 'Booking / travel confirmations (offline)', quantity: 1, owner_type: 'shared' }] },
      { name: 'Essentials',        items: [{ name: 'Personal toiletries', quantity: 1, owner_type: 'all_travelers' }, { name: 'Phone charger', quantity: 1, owner_type: 'all_travelers' }, { name: 'ID / passport', quantity: 1, owner_type: 'all_travelers' }, { name: 'Wallet & cards', quantity: 1, owner_type: 'all_travelers' }, { name: 'Medications (prescription + personal)', quantity: 1, owner_type: 'all_travelers' }] },
    ],
  },
  {
    id: 'cruise',
    name: 'Cruise',
    icon: '🚢',
    filterTripType: 'cruise', filterDestination: 'any', filterLength: 'any',
    categories: [
      { name: 'Clothing',         items: [{ name: 'Formal dinner outfits (check dress code)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Resort casual outfits', quantity: 4, owner_type: 'all_travelers' }, { name: 'Swimsuit', quantity: 2, owner_type: 'all_travelers' }, { name: 'Flip flops / sandals', quantity: 1, owner_type: 'all_travelers' }, { name: 'Comfortable walking shoes (port days)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Light jacket or layers (indoor A/C)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Dress shoes', quantity: 1, owner_type: 'men' }, { name: 'Blazer or sport coat (formal nights)', quantity: 1, owner_type: 'men' }, { name: 'Formal dress (one per formal night)', quantity: 1, owner_type: 'women' }, { name: 'Dressy shoes or heels', quantity: 1, owner_type: 'women' }, { name: 'Cover-up or beach wrap', quantity: 1, owner_type: 'women' }] },
      { name: 'Cruise Documents', items: [{ name: 'Cruise booking confirmation & boarding documents', quantity: 1, owner_type: 'shared' }, { name: 'Luggage tags (cruise line — attach before check-in)', quantity: 1, owner_type: 'shared' }, { name: 'Cruise line app (downloaded, logged in)', quantity: 1, owner_type: 'shared' }, { name: 'Group excursion booking confirmations', quantity: 1, owner_type: 'shared' }, { name: 'Travel insurance documents', quantity: 1, owner_type: 'shared' }, { name: 'Passport (required for international ports)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Wallet & cards', quantity: 1, owner_type: 'all_travelers' }] },
      { name: 'Health & Comfort', items: [{ name: 'Motion sickness medication', quantity: 1, owner_type: 'all_travelers' }, { name: 'Prescription medications (bring extra)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Sunscreen', quantity: 1, owner_type: 'all_travelers' }, { name: 'After-sun lotion', quantity: 1, owner_type: 'all_travelers' }, { name: 'Razor & grooming kit', quantity: 1, owner_type: 'men' }, { name: 'Makeup bag', quantity: 1, owner_type: 'women' }, { name: 'Feminine hygiene items', quantity: 1, owner_type: 'women' }] },
      { name: 'Port Day Gear',    items: [{ name: 'Daypack for port excursions', quantity: 1, owner_type: 'all_travelers' }, { name: 'Reusable water bottle (port days)', quantity: 1, owner_type: 'all_travelers' }, { name: 'Portable battery pack', quantity: 1, owner_type: 'all_travelers' }, { name: 'Phone charger', quantity: 1, owner_type: 'all_travelers' }, { name: 'Cruise card holder or lanyard', quantity: 1, owner_type: 'all_travelers' }] },
    ],
  },
];

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

  // Sort presets for the dropdown — length-matched first, then everything else
  const tripLen = (() => {
    if (!trip || !trip.start_date || !trip.end_date) return null;
    const days = Math.round((new Date(trip.end_date) - new Date(trip.start_date)) / 86400000) + 1;
    return days <= 3 ? 'weekend' : days <= 6 ? 'short' : days <= 10 ? 'weeklong' : 'extended';
  })();
  const sortedPresets = tripLen
    ? [...PACKING_PRESETS].sort((a, b) => {
        const aMatch = a.filterLength === tripLen ? 1 : 0;
        const bMatch = b.filterLength === tripLen ? 1 : 0;
        return bMatch - aMatch;
      })
    : PACKING_PRESETS;

  dd.innerHTML = `
    <button class="pack-dd-item" id="pack-dd-browse">🔍 Browse with filters…</button>
    <div class="pack-dd-sep"></div>
    <div class="pack-dd-section">Preset lists</div>
    ${sortedPresets.map(p => `
      <button class="pack-dd-item pack-apply-preset" data-preset-id="${p.id}">
        <span class="pack-dd-preset-icon">${p.icon}</span>
        ${escHtml(p.name)}
        <span class="pack-dd-meta">${p.categories.length} categories</span>
      </button>`).join('')}
    <div class="pack-dd-sep"></div>
    <div class="pack-dd-section">Saved templates</div>
    ${templates.length ? templates.map(t => `
      <button class="pack-dd-item pack-apply-tmpl" data-id="${t.id}">
        ${escHtml(t.name)}
        <span class="pack-dd-meta">${t.category_count} cats · ${t.item_count} items</span>
      </button>`).join('') : '<div class="pack-dd-empty">No saved templates yet</div>'}
    <div class="pack-dd-sep"></div>
    <button class="pack-dd-item" id="pack-dd-save">Save list as template…</button>
    <button class="pack-dd-item" id="pack-dd-manage">Manage templates →</button>
  `;

  dd.querySelector('#pack-dd-browse').addEventListener('click', () => {
    dd.hidden = true;
    _openPackingPickerModal(container, trip);
  });

  dd.querySelectorAll('.pack-apply-preset').forEach(btn => {
    btn.addEventListener('click', async () => {
      dd.hidden = true;
      const preset = PACKING_PRESETS.find(p => p.id === btn.dataset.presetId);
      if (preset) await _applyPreset(container, trip, preset);
    });
  });

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

async function _applyPreset(container, trip, preset) {
  const hasShared = preset.categories.some(c => c.items.some(i => i.owner_type === 'shared'));
  const attendees = trip.attendees || [];

  const bodyHTML = `
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
      How would you like to apply <strong>${escHtml(preset.name)}</strong>?
    </p>
    <div style="display:flex;flex-direction:column;gap:10px">
      <label class="pack-apply-opt" style="display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:var(--radius-el);border:1px solid var(--border-subtle);cursor:pointer">
        <input type="radio" name="apply-mode" value="single" checked style="margin-top:2px;flex-shrink:0">
        <div>
          <div style="font-size:13px;font-weight:500">Single list</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Add all items to the active packing list</div>
        </div>
      </label>
      ${hasShared ? `
      <label class="pack-apply-opt" style="display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:var(--radius-el);border:1px solid var(--border-subtle);cursor:pointer">
        <input type="radio" name="apply-mode" value="per_list" style="margin-top:2px;flex-shrink:0">
        <div>
          <div style="font-size:13px;font-weight:500">Per-traveler lists</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
            Create a <strong>Shared</strong> list for group gear and
            ${attendees.length ? `one personal list per attendee (${attendees.map(a => a.name).join(', ')})` : 'a <strong>Personal</strong> list for individual items'}
          </div>
        </div>
      </label>` : ''}
    </div>
    <div class="form-group" style="margin-top:14px">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="apply-merge" checked>
        Merge with existing items (uncheck to replace current list)
      </label>
    </div>`;

  const overlay = createModal(`Apply: ${preset.name}`, bodyHTML, async ov => {
    const mode  = ov.querySelector('input[name="apply-mode"]:checked')?.value || 'single';
    const merge = ov.querySelector('#apply-merge').checked;
    try {
      _packData = await apiFetch('POST', `/trips/${trip.id}/packing/apply-inline-preset`, {
        categories: preset.categories,
        merge,
        mode,
        list_id: mode === 'single' ? (_packActiveList()?.id ?? null) : undefined,
      });
      if (mode === 'per_list') {
        _packActiveListId = (_packData.lists || [])[0]?.id ?? null;
      }
      closeModal(ov); ov.remove();
      _renderPacking(container);
    } catch (e) { alert(e.message); }
  }, 'Apply');
  openModal(overlay);
}

async function _doApplyTemplate(container, trip, tmplId) {
  const merge = confirm(
    'Merge template with existing packing list?\n\n' +
    'OK = merge (add missing items to existing categories)\n' +
    'Cancel = replace (clear list first, then apply template)'
  );
  const activeList = _packActiveList();
  try {
    _packData = await apiFetch('POST', `/trips/${trip.id}/packing/apply-template`, {
      template_id: tmplId,
      merge,
      list_id: activeList?.id ?? null,
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
  const catsEl = container.querySelector('#pack-cats');
  if (!catsEl) return;
  let dragging = null;

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

// ── Packing template picker modal ────────────────────────────

function _pkpickBuildLists({ total, men, women }) {
  if (total <= 1) return { names: ['Personal'], genders: ['any'] };
  const other = Math.max(0, total - men - women);
  const names = [], genders = [];
  const mixedGender = men > 0 && women > 0;
  for (let i = 0; i < men; i++) {
    names.push(mixedGender ? (men > 1 ? `Man ${i + 1}` : 'Man') : `Traveler ${i + 1}`);
    genders.push('men');
  }
  for (let i = 0; i < women; i++) {
    names.push(mixedGender ? (women > 1 ? `Woman ${i + 1}` : 'Woman') : `Traveler ${men + i + 1}`);
    genders.push('women');
  }
  for (let i = 0; i < other; i++) {
    names.push(`Traveler ${men + women + i + 1}`);
    genders.push('any');
  }
  return { names, genders };
}

function _pkpickListPreviewHTML({ total, men, women }) {
  const { names } = _pkpickBuildLists({ total, men, women });
  const allNames = total > 1 ? ['Shared', ...names] : names;
  return 'Lists: ' + allNames.map(n => `<span class="pkpick-list-pill">${escHtml(n)}</span>`).join('');
}

async function _openPackingPickerModal(container, trip, opts = {}) {
  const pkState = {
    filters: Object.assign({ type: 'any', dest: 'any', length: 'any' }, opts.preFilters || {}),
    selectedPresetId: null,
    selectedTemplateId: null,
    travelers: { total: Math.max(1, (trip.attendees || []).length), men: 0, women: 0 },
    templates: [],
  };

  function _passes(p) {
    const { type, dest, length } = pkState.filters;
    const pt = p.filterTripType || 'any', pd = p.filterDestination || 'any', pl = p.filterLength || 'any';
    return (type === 'any' || pt === 'any' || pt === type)
        && (dest === 'any' || pd === 'any' || pd === dest)
        && (length === 'any' || pl === 'any' || pl === length);
  }

  const TYPE_CHIPS   = [['any','Any'],['beach','Beach'],['camping','Camping'],['hiking','Hiking'],
                        ['sightseeing','Sightseeing'],['business','Business'],['general','General'],
                        ['roadtrip','Road Trip'],['event','Event'],['family','Family'],['cruise','Cruise']];
  const DEST_CHIPS   = [['any','Any'],['domestic','Domestic'],['international','International']];
  const LENGTH_CHIPS = [['any','Any'],['weekend','Weekend'],['short','Short trip'],
                        ['weeklong','1 Week'],['extended','Extended']];

  function _renderBody(ov) {
    const { filters, travelers, selectedPresetId, selectedTemplateId, templates } = pkState;
    let filtered = PACKING_PRESETS.filter(_passes);

    // Sort: type-specific matches first when a type filter is active, then by specificity
    if (filters.type !== 'any' || filters.dest !== 'any' || filters.length !== 'any') {
      filtered = [...filtered].sort((a, b) => {
        const scorePreset = p => {
          let s = 0;
          if (filters.type !== 'any' && p.filterTripType !== 'any' && p.filterTripType === filters.type) s += 4;
          if (filters.dest !== 'any' && p.filterDestination !== 'any' && p.filterDestination === filters.dest) s += 2;
          if (filters.length !== 'any' && p.filterLength !== 'any' && p.filterLength === filters.length) s += 1;
          return s;
        };
        return scorePreset(b) - scorePreset(a);
      });
    }
    // First filtered preset is the best match when any filter is active and there's something specific
    const bestMatchId = (filters.type !== 'any' || filters.dest !== 'any' || filters.length !== 'any')
      && filtered.length > 0
      && (filtered[0].filterTripType !== 'any' || filtered[0].filterDestination !== 'any' || filtered[0].filterLength !== 'any')
      ? filtered[0].id : null;

    ov.querySelector('#pkpick-body').innerHTML = `
      <div class="pkpick-filters">
        ${[{label:'Trip type',g:'type',chips:TYPE_CHIPS},{label:'Destination',g:'dest',chips:DEST_CHIPS},{label:'Length',g:'length',chips:LENGTH_CHIPS}].map(f => `
          <div class="pkpick-filter-row">
            <span class="pkpick-filter-label">${f.label}</span>
            <div class="pkpick-chips" data-group="${f.g}">
              ${f.chips.map(([v,l]) => `<button type="button" class="pkpick-chip${filters[f.g]===v?' active':''}" data-val="${v}">${l}</button>`).join('')}
            </div>
          </div>`).join('')}
      </div>

      <div class="pkpick-section-hdr">Preset lists</div>
      <div class="pkpick-grid">
        ${filtered.length ? filtered.map(p => `
          <button type="button" class="pkpick-card${selectedPresetId===p.id?' selected':''}" data-preset="${p.id}">
            ${p.id === bestMatchId ? '<span class="tpm-tmpl-badge">Best match</span>' : ''}
            <span class="pkpick-card-icon">${p.icon}</span>
            <span class="pkpick-card-name">${escHtml(p.name)}</span>
            <span class="pkpick-card-meta">${p.categories.length} categories</span>
          </button>`).join('')
          : `<p class="pkpick-empty">No presets match — try different filters.</p>`}
      </div>

      ${templates.length ? (() => {
        const filteredTmpls = templates.filter(t => {
          const ft = t.filter_trip_type || 'any', fd = t.filter_destination || 'any', fl = t.filter_length || 'any';
          const { type, dest, length } = filters;
          return (type === 'any' || ft === 'any' || ft === type)
              && (dest === 'any' || fd === 'any' || fd === dest)
              && (length === 'any' || fl === 'any' || fl === length);
        });
        if (!filteredTmpls.length) return '';
        return `
          <div class="pkpick-section-hdr">My templates</div>
          <div class="pkpick-grid">
            ${filteredTmpls.map(t => `
              <button type="button" class="pkpick-card${selectedTemplateId===t.id?' selected':''}" data-tmpl="${t.id}">
                <span class="pkpick-card-icon">${escHtml(t.icon || '📄')}</span>
                <span class="pkpick-card-name">${escHtml(t.name)}</span>
                <span class="pkpick-card-meta">${t.item_count} items</span>
              </button>`).join('')}
          </div>`;
      })() : ''}

      <div class="pkpick-travelers">
        <div class="pkpick-travelers-label">Traveler composition</div>
        <div class="pkpick-traveler-inputs">
          <div class="pkpick-traveler-field"><label>Total</label>
            <input class="form-input" id="pk-total" type="number" min="1" max="30" value="${travelers.total}"></div>
          <div class="pkpick-traveler-field"><label>Men</label>
            <input class="form-input" id="pk-men" type="number" min="0" max="30" value="${travelers.men}"></div>
          <div class="pkpick-traveler-field"><label>Women</label>
            <input class="form-input" id="pk-women" type="number" min="0" max="30" value="${travelers.women}"></div>
        </div>
        <div class="pkpick-preview" id="pkpick-preview">${_pkpickListPreviewHTML(travelers)}</div>
      </div>
    `;

    const body = ov.querySelector('#pkpick-body');

    body.querySelectorAll('.pkpick-chips').forEach(grp => {
      grp.querySelectorAll('.pkpick-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          pkState.filters[grp.dataset.group] = chip.dataset.val;
          _renderBody(ov);
        });
      });
    });

    body.querySelectorAll('.pkpick-card[data-preset]').forEach(card => {
      card.addEventListener('click', () => {
        pkState.selectedPresetId   = card.dataset.preset;
        pkState.selectedTemplateId = null;
        body.querySelectorAll('.pkpick-card').forEach(c => c.classList.toggle('selected', c === card));
        ov.querySelector('.modal-submit-btn').disabled = false;
      });
    });

    body.querySelectorAll('.pkpick-card[data-tmpl]').forEach(card => {
      card.addEventListener('click', () => {
        pkState.selectedTemplateId = parseInt(card.dataset.tmpl);
        pkState.selectedPresetId   = null;
        body.querySelectorAll('.pkpick-card').forEach(c => c.classList.toggle('selected', c === card));
        ov.querySelector('.modal-submit-btn').disabled = false;
      });
    });

    const syncTravelers = () => {
      const total = Math.max(1, parseInt(ov.querySelector('#pk-total').value) || 1);
      const men   = Math.max(0, parseInt(ov.querySelector('#pk-men').value)   || 0);
      const women = Math.max(0, parseInt(ov.querySelector('#pk-women').value) || 0);
      pkState.travelers.total = Math.max(total, men + women);
      pkState.travelers.men   = men;
      pkState.travelers.women = women;
      ov.querySelector('#pk-total').value = pkState.travelers.total;
      ov.querySelector('#pkpick-preview').innerHTML = _pkpickListPreviewHTML(pkState.travelers);
    };
    ov.querySelector('#pk-total').addEventListener('input', syncTravelers);
    ov.querySelector('#pk-men').addEventListener('input', syncTravelers);
    ov.querySelector('#pk-women').addEventListener('input', syncTravelers);

    ov.querySelector('.modal-submit-btn').disabled = !pkState.selectedPresetId && !pkState.selectedTemplateId;
  }

  const overlay = createModal(opts.modalTitle || 'Choose Packing Template',
    '<div id="pkpick-body" class="pkpick-body"></div>',
    async ov => {
      if (!pkState.selectedPresetId && !pkState.selectedTemplateId) {
        alert('Select a preset or template first.');
        return false;
      }
      const { names, genders }  = _pkpickBuildLists(pkState.travelers);
      const isPerList = pkState.travelers.total > 1;
      const activeListId = _packData ? (_packActiveList()?.id ?? null) : null;
      try {
        if (pkState.selectedPresetId) {
          const preset = PACKING_PRESETS.find(p => p.id === pkState.selectedPresetId);
          if (!preset) return false;
          _packData = await apiFetch('POST', `/trips/${trip.id}/packing/apply-inline-preset`, {
            categories: preset.categories,
            merge: true,
            mode: isPerList ? 'per_list' : 'single',
            ...(isPerList
              ? { traveler_names: names, traveler_genders: genders }
              : { list_id: activeListId }),
          });
          if (isPerList && _packData.lists?.length) _packActiveListId = _packData.lists[0].id;
        } else {
          const fullTmpl = await apiFetch('GET', `/packing-templates/${pkState.selectedTemplateId}`);
          _packData = await apiFetch('POST', `/trips/${trip.id}/packing/apply-inline-preset`, {
            categories: fullTmpl.categories.map(cat => ({
              name: cat.name,
              items: cat.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                owner_type: item.owner_type || 'all_travelers',
              })),
            })),
            merge: true,
            mode: isPerList ? 'per_list' : 'single',
            ...(isPerList
              ? { traveler_names: names, traveler_genders: genders }
              : { list_id: activeListId }),
          });
          if (isPerList && _packData.lists?.length) _packActiveListId = _packData.lists[0].id;
        }
        if (container) _renderPacking(container);
        if (opts.onApplied) opts.onApplied();
      } catch (e) { alert(e.message); return false; }
    }, 'Apply'
  );

  _renderBody(overlay);
  openModal(overlay);

  if (opts.skipLabel || opts.onSkip) {
    const cancelBtn = overlay.querySelector('.modal-cancel-btn');
    if (opts.skipLabel) cancelBtn.textContent = opts.skipLabel;
    if (opts.onSkip) {
      const onSkipCb = () => opts.onSkip();
      cancelBtn.addEventListener('click', onSkipCb);
      overlay.querySelector('.modal-close').addEventListener('click', onSkipCb);
      addOverlayDismiss(overlay, onSkipCb);
    }
  }

  // Load saved templates in background (re-render body if any exist)
  apiFetch('GET', '/packing-templates').then(d => {
    pkState.templates = d.items || [];
    if (pkState.templates.length) _renderBody(overlay);
  }).catch(() => {});
}

// ── Packing Template Manager ───────────────────────────────────

async function _openPackingMgrModal(listPageContainer) {
  let customTemplates = [];
  try {
    const d = await apiFetch('GET', '/packing-templates');
    customTemplates = d.items || [];
  } catch(e) { /* ignore */ }

  const FILTER_LABELS = {
    type: { any:'Any type',beach:'Beach',camping:'Camping',hiking:'Hiking',sightseeing:'Sightseeing',
            business:'Business',general:'General',roadtrip:'Road Trip',event:'Event',family:'Family',cruise:'Cruise' },
    dest: { any:'Any dest',domestic:'Domestic',international:'International' },
    length: { any:'Any length',weekend:'Weekend',short:'Short',weeklong:'1 Week',extended:'Extended' },
  };

  function filterBadge(t) {
    const parts = [];
    if (t.filter_trip_type && t.filter_trip_type !== 'any') parts.push(FILTER_LABELS.type[t.filter_trip_type] || t.filter_trip_type);
    if (t.filter_destination && t.filter_destination !== 'any') parts.push(FILTER_LABELS.dest[t.filter_destination] || t.filter_destination);
    if (t.filter_length && t.filter_length !== 'any') parts.push(FILTER_LABELS.length[t.filter_length] || t.filter_length);
    return parts.length ? parts.map(p => `<span class="pktmpl-filter-badge">${escHtml(p)}</span>`).join('') : '';
  }

  function renderBody(ov) {
    const bodyEl = ov.querySelector('#pkmgr-body');
    bodyEl.innerHTML = `
      <div class="proj-tmgr-section">
        <div class="proj-tmgr-section-hdr">
          <span class="proj-tmgr-section-title">🔒 Built-in Presets</span>
        </div>
        <div class="proj-tmgr-grid">
          ${PACKING_PRESETS.map(p => `
            <div class="proj-tmgr-card proj-tmgr-card--default">
              <div class="proj-tmgr-card-top">
                <span class="proj-tmgr-card-icon">${escHtml(p.icon)}</span>
                <div>
                  <div class="proj-tmgr-card-name">${escHtml(p.name)}</div>
                  <div class="proj-tmgr-card-desc">${p.categories.length} categories</div>
                  <div style="margin-top:4px">${filterBadge({ filter_trip_type: p.filterTripType, filter_destination: p.filterDestination, filter_length: p.filterLength })}</div>
                </div>
              </div>
              <div style="display:flex;gap:6px;margin-top:8px">
                <span class="proj-tmgr-badge proj-tmgr-badge--builtin">🔒 Built-in</span>
                <button class="btn btn-sm" data-copy-preset="${escHtml(p.id)}">Make a copy</button>
              </div>
            </div>`).join('')}
        </div>
      </div>

      <div class="proj-tmgr-section">
        <div class="proj-tmgr-section-hdr">
          <span class="proj-tmgr-section-title">✎ My Templates</span>
          <button class="btn btn-primary btn-sm" id="pkmgr-new-btn">+ New Template</button>
        </div>
        ${customTemplates.length ? `
          <div class="proj-tmgr-custom-grid">
            ${customTemplates.map(t => {
              const srcName = t.source_id ? (PACKING_PRESETS.find(p => p.id === t.source_id)?.name || null) : null;
              return `
              <div class="proj-tmgr-card" data-tmpl-id="${t.id}">
                <div class="proj-tmgr-card-top">
                  <span class="proj-tmgr-card-icon">${escHtml(t.icon || '📋')}</span>
                  <div>
                    <div class="proj-tmgr-card-name">${escHtml(t.name)}</div>
                    <div class="proj-tmgr-card-desc">${t.item_count} items</div>
                    ${srcName ? `<div style="font-size:11px;color:var(--text-muted);margin-top:1px">Based on: ${escHtml(srcName)}</div>` : ''}
                    <div style="margin-top:4px">${filterBadge(t)}</div>
                  </div>
                </div>
                <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
                  <span class="proj-tmgr-badge proj-tmgr-badge--custom">✎ Custom</span>
                  <button class="btn btn-sm" data-edit-tmpl="${t.id}">Edit</button>
                  <button class="btn btn-danger btn-sm" data-del-tmpl="${t.id}">Delete</button>
                </div>
              </div>`;
            }).join('')}
          </div>` : `<p class="empty-state-text" style="font-size:13px;padding:12px 0">No custom templates yet — make a copy of a built-in preset to get started.</p>`}
      </div>
    `;

    bodyEl.querySelectorAll('[data-copy-preset]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const presetId = btn.dataset.copyPreset;
        const preset = PACKING_PRESETS.find(p => p.id === presetId);
        if (!preset) return;
        const initData = {
          name: preset.name + ' (copy)',
          icon: preset.icon,
          source_id: preset.id,
          filter_trip_type: preset.filterTripType || 'any',
          filter_destination: preset.filterDestination || 'any',
          filter_length: preset.filterLength || 'any',
          categories: preset.categories.map(cat => ({
            name: cat.name,
            items: cat.items.map(item => ({ name: item.name, quantity: item.quantity, owner_type: item.owner_type || 'all_travelers' })),
          })),
        };
        _openPackingTemplateEditorModal(initData, async saved => {
          try {
            await apiFetch('POST', '/packing-templates/from-preset', saved);
            const d = await apiFetch('GET', '/packing-templates');
            customTemplates = d.items || [];
            renderBody(ov);
          } catch(e) { alert(e.message); }
        });
      });
    });

    bodyEl.querySelector('#pkmgr-new-btn').addEventListener('click', () => {
      _openPackingTemplateEditorModal({
        name: '', icon: '📋', filter_trip_type: 'any', filter_destination: 'any', filter_length: 'any', categories: [],
      }, async saved => {
        try {
          await apiFetch('POST', '/packing-templates/from-preset', saved);
          const d = await apiFetch('GET', '/packing-templates');
          customTemplates = d.items || [];
          renderBody(ov);
        } catch(e) { alert(e.message); }
      });
    });

    bodyEl.querySelectorAll('[data-edit-tmpl]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tmplId = parseInt(btn.dataset.editTmpl);
        try {
          const full = await apiFetch('GET', `/packing-templates/${tmplId}`);
          const initData = {
            id: full.id,
            name: full.name,
            icon: full.icon || '📋',
            source_id: full.source_id || null,
            filter_trip_type: full.filter_trip_type || 'any',
            filter_destination: full.filter_destination || 'any',
            filter_length: full.filter_length || 'any',
            categories: full.categories.map(cat => ({
              name: cat.name,
              items: cat.items.map(item => ({ name: item.name, quantity: item.quantity, owner_type: item.owner_type || 'all_travelers' })),
            })),
          };
          _openPackingTemplateEditorModal(initData, async saved => {
            try {
              await apiFetch('PUT', `/packing-templates/${tmplId}/replace`, saved);
              const d = await apiFetch('GET', '/packing-templates');
              customTemplates = d.items || [];
              renderBody(ov);
            } catch(e) { alert(e.message); }
          });
        } catch(e) { alert(e.message); }
      });
    });

    bodyEl.querySelectorAll('[data-del-tmpl]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tmplId = parseInt(btn.dataset.delTmpl);
        const tmpl = customTemplates.find(t => t.id === tmplId);
        if (!confirm(`Delete "${tmpl?.name || 'this template'}"? This cannot be undone.`)) return;
        try {
          await apiFetch('DELETE', `/packing-templates/${tmplId}`);
          customTemplates = customTemplates.filter(t => t.id !== tmplId);
          renderBody(ov);
        } catch(e) { alert(e.message); }
      });
    });
  }

  const overlay = createModal('Packing Templates',
    '<div id="pkmgr-body"></div>',
    async () => {}, 'Close'
  );
  overlay.querySelector('.modal').style.maxWidth = '820px';
  // Hide redundant cancel button (submit button already says "Close")
  const cancelBtn = overlay.querySelector('.modal-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = 'none';

  renderBody(overlay);
  openModal(overlay);
}

function _openPackingTemplateEditorModal(initData, onSave) {
  const state = {
    name: initData.name || '',
    icon: initData.icon || '📋',
    source_id: initData.source_id || null,
    filter_trip_type: initData.filter_trip_type || 'any',
    filter_destination: initData.filter_destination || 'any',
    filter_length: initData.filter_length || 'any',
    categories: (initData.categories || []).map(cat => ({
      name: cat.name,
      items: (cat.items || []).map(item => ({
        name: item.name,
        quantity: item.quantity ?? 1,
        owner_type: item.owner_type || 'all_travelers',
      })),
    })),
  };

  const TYPE_OPTS   = [['any','Any type'],['beach','Beach'],['camping','Camping'],['hiking','Hiking'],
                       ['sightseeing','Sightseeing'],['business','Business'],['general','General'],
                       ['roadtrip','Road Trip'],['event','Event'],['family','Family'],['cruise','Cruise']];
  const DEST_OPTS   = [['any','Any'],['domestic','Domestic'],['international','International']];
  const LENGTH_OPTS = [['any','Any'],['weekend','Weekend'],['short','Short'],['weeklong','1 Week'],['extended','Extended']];
  const OWNER_OPTS  = [['all_travelers','Everyone'],['shared','Shared'],['men','Men only'],['women','Women only']];

  function selOpts(opts, val) {
    return opts.map(([v,l]) => `<option value="${v}"${v===val?' selected':''}>${escHtml(l)}</option>`).join('');
  }

  function syncFromModal(ov) {
    state.name              = ov.querySelector('#pktmed-name').value.trim();
    state.icon              = ov.querySelector('#pktmed-icon').value.trim() || '📋';
    state.filter_trip_type  = ov.querySelector('#pktmed-ftype').value;
    state.filter_destination= ov.querySelector('#pktmed-fdest').value;
    state.filter_length     = ov.querySelector('#pktmed-flength').value;
    ov.querySelectorAll('.pktmed-cat-block').forEach((block, ci) => {
      if (!state.categories[ci]) return;
      state.categories[ci].name = block.querySelector('.pktmed-cat-name').value;
      block.querySelectorAll('.pktmed-item-row').forEach((row, ii) => {
        if (!state.categories[ci].items[ii]) return;
        state.categories[ci].items[ii].name       = row.querySelector('.pktmed-item-name').value;
        state.categories[ci].items[ii].quantity   = parseInt(row.querySelector('.pktmed-item-qty').value) || 1;
        state.categories[ci].items[ii].owner_type = row.querySelector('.pktmed-item-owner').value;
      });
    });
  }

  function renderEditor(ov) {
    ov.querySelector('#pktmed-body').innerHTML = `
      <div class="pktmed-section">
        <div class="pktmed-section-hdr">Template Info</div>
        <div style="display:grid;grid-template-columns:56px 1fr;gap:8px;align-items:end;margin-bottom:10px">
          <div>
            <label class="form-label" style="font-size:11px">Icon</label>
            <input class="form-input" id="pktmed-icon" value="${escHtml(state.icon)}" maxlength="4" style="text-align:center;font-size:18px">
          </div>
          <div>
            <label class="form-label" style="font-size:11px">Name</label>
            <input class="form-input" id="pktmed-name" value="${escHtml(state.name)}" placeholder="Template name…">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div>
            <label class="form-label" style="font-size:11px">Trip type filter</label>
            <select class="form-input" id="pktmed-ftype">${selOpts(TYPE_OPTS, state.filter_trip_type)}</select>
          </div>
          <div>
            <label class="form-label" style="font-size:11px">Destination filter</label>
            <select class="form-input" id="pktmed-fdest">${selOpts(DEST_OPTS, state.filter_destination)}</select>
          </div>
          <div>
            <label class="form-label" style="font-size:11px">Length filter</label>
            <select class="form-input" id="pktmed-flength">${selOpts(LENGTH_OPTS, state.filter_length)}</select>
          </div>
        </div>
        ${state.source_id ? (() => {
          const srcName = PACKING_PRESETS.find(p => p.id === state.source_id)?.name || state.source_id;
          return `<p class="pktmed-hint" style="margin-top:8px">Based on: <strong>${escHtml(srcName)}</strong></p>`;
        })() : ''}
      </div>

      <div class="pktmed-section">
        <div class="pktmed-section-hdr" style="display:flex;align-items:center;justify-content:space-between">
          <span>Categories &amp; Items</span>
          <button type="button" class="btn btn-primary btn-sm" id="pktmed-add-cat">+ Category</button>
        </div>
        <p class="pktmed-hint">Items with "Everyone" owner type go to each traveler's list; "Shared" goes to the shared list.</p>
        <div id="pktmed-cats">
          ${state.categories.map((cat, ci) => _pktmedCatHTML(cat, ci)).join('')}
          ${!state.categories.length ? '<p class="pktmed-hint" style="text-align:center;padding:16px 0">No categories yet — click "+ Category" to add one.</p>' : ''}
        </div>
      </div>
    `;

    const body = ov.querySelector('#pktmed-body');

    body.querySelector('#pktmed-add-cat').addEventListener('click', () => {
      syncFromModal(ov);
      state.categories.push({ name: 'New Category', items: [] });
      renderEditor(ov);
    });

    body.querySelectorAll('.pktmed-del-cat').forEach((btn, ci) => {
      btn.addEventListener('click', () => {
        syncFromModal(ov);
        state.categories.splice(ci, 1);
        renderEditor(ov);
      });
    });

    body.querySelectorAll('.pktmed-add-item').forEach((btn, ci) => {
      btn.addEventListener('click', () => {
        syncFromModal(ov);
        state.categories[ci].items.push({ name: '', quantity: 1, owner_type: 'all_travelers' });
        renderEditor(ov);
        // Focus the new item name input
        const catBlock = body.querySelectorAll('.pktmed-cat-block')[ci];
        const rows = catBlock.querySelectorAll('.pktmed-item-row');
        const lastRow = rows[rows.length - 1];
        if (lastRow) lastRow.querySelector('.pktmed-item-name').focus();
      });
    });

    body.querySelectorAll('.pktmed-del-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const ci = parseInt(btn.dataset.cat);
        const ii = parseInt(btn.dataset.item);
        syncFromModal(ov);
        state.categories[ci].items.splice(ii, 1);
        renderEditor(ov);
      });
    });
  }

  function _pktmedCatHTML(cat, ci) {
    return `
      <div class="pktmed-cat-block" data-ci="${ci}">
        <div class="pktmed-cat-hdr">
          <input class="form-input pktmed-cat-name" value="${escHtml(cat.name)}" placeholder="Category name…" style="font-weight:600;font-size:13px">
          <button type="button" class="pktmed-del-cat btn-icon-danger" title="Delete category">✕</button>
        </div>
        <table class="pktmed-item-table">
          <thead><tr>
            <th>Item name</th><th style="width:60px">Qty</th><th style="width:120px">Owner</th><th style="width:28px"></th>
          </tr></thead>
          <tbody>
            ${cat.items.map((item, ii) => `
              <tr class="pktmed-item-row">
                <td><input class="form-input pktmed-item-name" value="${escHtml(item.name)}" placeholder="Item name…"></td>
                <td><input class="form-input pktmed-item-qty" type="number" min="1" value="${item.quantity}" style="text-align:center"></td>
                <td><select class="form-input pktmed-item-owner">${selOpts(OWNER_OPTS, item.owner_type)}</select></td>
                <td><button type="button" class="pktmed-del-item tmpl-del-btn" data-cat="${ci}" data-item="${ii}" title="Remove">✕</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
        <button type="button" class="btn btn-sm pktmed-add-item" style="margin-top:6px">+ Item</button>
      </div>`;
  }

  const overlay = createModal(initData.id ? 'Edit Template' : 'New Template',
    '<div id="pktmed-body" class="pktmed-body"></div>',
    async ov => {
      syncFromModal(ov);
      if (!state.name) { alert('Template name is required.'); return false; }
      await onSave({ ...state });
    }, 'Save Template'
  );
  overlay.querySelector('.modal').style.maxWidth = '740px';
  renderEditor(overlay);
  openModal(overlay);
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
