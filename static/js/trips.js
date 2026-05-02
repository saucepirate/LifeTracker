/* ── Trips module ─────────────────────────────────────────────
   Manages: list page, workspace shell, Overview tab.
   Packing/Budget/Itinerary/Notes tabs are in their own files.
──────────────────────────────────────────────────────────────── */

const TRIP_COLORS = [
  { name: 'blue',   hex: '#4A90D9' },
  { name: 'teal',   hex: '#2BAE8E' },
  { name: 'amber',  hex: '#E8A624' },
  { name: 'purple', hex: '#8B5CF6' },
  { name: 'coral',  hex: '#E8614A' },
  { name: 'green',  hex: '#4CAF50' },
  { name: 'pink',   hex: '#E879A4' },
  { name: 'gray',   hex: '#8A8A8A' },
];

const TRIP_COLOR_HEX = Object.fromEntries(TRIP_COLORS.map(c => [c.name, c.hex]));

function tripColorHex(name) {
  return TRIP_COLOR_HEX[name] || TRIP_COLOR_HEX.blue;
}

let _currentTrip = null;
let _currentTab  = 'overview';

// ── Page registration ──────────────────────────────────────────

// The page loader checks location.pathname so browser back/forward works automatically
// via app.js's popstate → loadPage('trips') → this loader.
registerPage('trips', async function(container) {
  const m = location.pathname.match(/^\/trips\/(\d+)/);
  if (m) {
    await _loadWorkspace(container, parseInt(m[1]));
  } else {
    await _renderList(container);
  }
});

// ── List page ─────────────────────────────────────────────────

async function _renderList(container) {
  container.innerHTML = '<div class="loading-state">Loading trips…</div>';
  let data;
  try {
    data = await apiFetch('GET', '/trips');
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p class="empty-state-text">${escHtml(e.message)}</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="trips-page-header">
      <h1 class="page-title">Trips</h1>
      <button class="btn btn-primary" id="new-trip-btn">+ New Trip</button>
    </div>
    ${_sectionHTML('Upcoming', data.upcoming)}
    ${_sectionHTML('Planning', data.planning)}
    ${_sectionHTML('Past',     data.past)}
  `;

  container.querySelector('#new-trip-btn').addEventListener('click', () => _openCreateModal(container));

  container.querySelectorAll('.trip-card').forEach(card => {
    card.addEventListener('click', () => _openWorkspace(container, parseInt(card.dataset.id)));
  });

  container.querySelectorAll('.trip-highlight-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      try {
        await apiFetch('POST', `/trips/${parseInt(btn.dataset.tripId)}/highlight`);
        await _renderList(container);
      } catch(err) { /* silent */ }
    });
  });

  animateProgressBars(container);
}

function _sectionHTML(title, trips) {
  if (!trips || trips.length === 0) return '';
  return `
    <div class="trips-section">
      <div class="trips-section-title">${title}</div>
      <div class="trips-grid">
        ${trips.map(_tripCardHTML).join('')}
      </div>
    </div>`;
}

function _tripCardHTML(t) {
  const hex = t.color_hex || tripColorHex(t.color);
  const statusClass = 'trip-status-' + (t.status || 'planning').toLowerCase();
  const daysLabel = t.days_until != null
    ? (t.days_until === 0 ? 'Today!' : t.days_until === 1 ? 'Tomorrow' : `${t.days_until} days away`)
    : '';

  const taskPct = t.total_task_count > 0
    ? Math.round((1 - t.open_task_count / t.total_task_count) * 100)
    : 0;
  const taskLabel = t.open_task_count > 0
    ? `${t.open_task_count} open`
    : t.total_task_count > 0 ? 'All done' : 'None';

  const budgetTotal = t.budget_total || 0;
  const budgetUsed  = (t.budget_committed || 0) + (t.budget_spent || 0);
  const budgetPct   = budgetTotal > 0 ? Math.round(Math.min(100, budgetUsed / budgetTotal * 100)) : 0;
  const cur = t.budget_currency || 'USD';
  const budgetLabel = budgetTotal > 0
    ? `${_fmtMoney(budgetUsed, cur)} / ${_fmtMoney(budgetTotal, cur)}`
    : 'No budget set';

  const packPct   = t.packing_total > 0 ? Math.round(t.packing_checked / t.packing_total * 100) : 0;
  const packLabel = t.packing_total > 0
    ? `${t.packing_checked} / ${t.packing_total}`
    : 'No items';

  const dateRange = _formatDateRange(t.start_date, t.end_date);

  return `
    <div class="trip-card" data-id="${t.id}">
      <div class="trip-card-bar" style="background:${hex}"></div>
      <div class="trip-card-body">
        <div class="trip-card-header">
          <div class="trip-card-name">${escHtml(t.name)}</div>
          <div style="display:flex;gap:4px;align-items:center">
            <button class="trip-highlight-btn${t.is_highlighted ? ' active' : ''}" data-trip-id="${t.id}" title="${t.is_highlighted ? 'Remove from dashboard' : 'Highlight on dashboard'}" onclick="event.stopPropagation()">📌</button>
            <span class="trip-status-badge ${statusClass}">${escHtml(t.status)}</span>
          </div>
        </div>
        ${t.destination ? `<div class="trip-card-dest">${escHtml(t.destination)}</div>` : ''}
        <div class="trip-card-meta">
          <span>${dateRange}</span>
          ${daysLabel ? `<span class="trip-days-pill">${daysLabel}</span>` : ''}
        </div>
        <div class="trip-card-stats">
          <div class="trip-mini-stat">
            <span class="trip-mini-stat-label">Tasks</span>
            <div class="trip-mini-bar"><div class="trip-mini-fill" data-pct="${taskPct}" style="width:0%"></div></div>
            <span class="trip-mini-val">${taskLabel}</span>
          </div>
          <div class="trip-mini-stat">
            <span class="trip-mini-stat-label">Budget</span>
            <div class="trip-mini-bar"><div class="trip-mini-fill" data-pct="${budgetPct}" style="width:0%"></div></div>
            <span class="trip-mini-val">${budgetLabel}</span>
          </div>
          <div class="trip-mini-stat">
            <span class="trip-mini-stat-label">Packing</span>
            <div class="trip-mini-bar"><div class="trip-mini-fill" data-pct="${packPct}" style="width:0%"></div></div>
            <span class="trip-mini-val">${packLabel}</span>
          </div>
        </div>
      </div>
    </div>`;
}

// ── Create trip modal ──────────────────────────────────────────

function _openCreateModal(container) {
  let selectedColor = 'blue';
  const swatchHTML = TRIP_COLORS.map(c =>
    `<button type="button" class="trip-color-swatch color-${c.name}${c.name === selectedColor ? ' selected' : ''}" data-color="${c.name}" title="${c.name}"></button>`
  ).join('');

  const body = `
    <div class="form-group">
      <label class="form-label">Trip name *</label>
      <input class="form-input" id="tc-name" placeholder="e.g. Paris Summer 2026" />
    </div>
    <div class="form-group">
      <label class="form-label">Destination</label>
      <input class="form-input" id="tc-dest" placeholder="e.g. Paris, France" />
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group">
        <label class="form-label">Start date *</label>
        <input class="form-input" id="tc-start" type="date" placeholder="mm/dd/yy" />
      </div>
      <div class="form-group">
        <label class="form-label">End date *</label>
        <input class="form-input" id="tc-end" type="date" placeholder="mm/dd/yy" />
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-input" id="tc-status">
          <option value="Planning">Planning</option>
          <option value="Confirmed">Confirmed</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div class="trip-color-picker" id="tc-colors">${swatchHTML}</div>
      </div>
    </div>`;

  const overlay = createModal('New Trip', body, async (ov) => {
    const name  = ov.querySelector('#tc-name').value.trim();
    const dest  = ov.querySelector('#tc-dest').value.trim();
    const start = getDateVal(ov.querySelector('#tc-start'));
    const end   = getDateVal(ov.querySelector('#tc-end'));
    const status = ov.querySelector('#tc-status').value;
    if (!name || !start || !end) {
      alert('Name, start date, and end date are required.');
      return;
    }
    try {
      await apiFetch('POST', '/trips', { name, destination: dest || null, start_date: start, end_date: end, status, color: selectedColor });
      closeModal(ov);
      ov.remove();
      await _renderList(container);
    } catch (e) {
      alert(e.message);
    }
  }, 'Create Trip');

  overlay.querySelector('#tc-colors').addEventListener('click', e => {
    const swatch = e.target.closest('.trip-color-swatch');
    if (!swatch) return;
    selectedColor = swatch.dataset.color;
    overlay.querySelectorAll('.trip-color-swatch').forEach(s => s.classList.remove('selected'));
    swatch.classList.add('selected');
  });

  initSmartDates(overlay);
  openModal(overlay);
}

// ── Workspace ─────────────────────────────────────────────────

async function _openWorkspace(container, tripId) {
  history.pushState({ page: 'trips', tripId }, '', '/trips/' + tripId);
  await _loadWorkspace(container, tripId);
}

async function _loadWorkspace(container, tripId) {
  container.innerHTML = '<div class="loading-state">Loading trip…</div>';
  let trip;
  try {
    trip = await apiFetch('GET', `/trips/${tripId}`);
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p class="empty-state-text">${escHtml(e.message)}</p></div>`;
    return;
  }
  _currentTrip = trip;
  _renderWorkspace(container, trip);
}

function _renderWorkspace(container, trip) {
  const hex = trip.color_hex || tripColorHex(trip.color);
  const statusClass = 'trip-status-' + (trip.status || 'planning').toLowerCase();
  const daysLabel = trip.days_until != null
    ? (trip.days_until === 0 ? 'Happening today' : trip.days_until === 1 ? 'Tomorrow' : `${trip.days_until} days away`)
    : (trip.status === 'Completed' ? 'Completed' : '');

  const attendeePills = (trip.attendees || []).map(a =>
    `<span class="trip-attendee-pill${a.is_me ? ' is-me' : ''}">${escHtml(a.name)}</span>`
  ).join('');

  const TABS = ['Overview', 'Packing', 'Tasks', 'Budget', 'Itinerary', 'Notes'];

  container.innerHTML = `
    <div class="trip-workspace">
      <button class="trip-ws-back" id="trip-back-btn">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M9 2L4 7l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        All Trips
      </button>

      <div class="trip-ws-header">
        <div class="trip-ws-header-left">
          <div class="trip-ws-color-dot" style="background:${hex}"></div>
          <div>
            <div class="trip-ws-name">${escHtml(trip.name)}</div>
            <div class="trip-ws-meta">
              ${trip.destination ? `<span>${escHtml(trip.destination)}</span>` : ''}
              <span>${_formatDateRange(trip.start_date, trip.end_date)}</span>
              ${daysLabel ? `<span class="trip-days-pill">${daysLabel}</span>` : ''}
            </div>
            ${attendeePills ? `<div class="trip-attendees-row" style="margin-top:8px">${attendeePills}</div>` : ''}
          </div>
        </div>
        <div class="trip-ws-header-right">
          <span class="trip-status-badge ${statusClass}">${escHtml(trip.status)}</span>
          <button class="btn btn-secondary btn-sm" id="trip-edit-btn">Edit</button>
        </div>
      </div>

      <nav class="trip-tabs">
        ${TABS.map(t => `<button class="trip-tab${t.toLowerCase() === _currentTab ? ' active' : ''}" data-tab="${t.toLowerCase()}">${t}</button>`).join('')}
      </nav>

      <div class="trip-tab-content" id="trip-tab-content"></div>
    </div>`;

  container.querySelector('#trip-back-btn').addEventListener('click', () => {
    _currentTab = 'overview';
    history.pushState({ page: 'trips' }, '', '/trips');
    _renderList(container);
  });

  container.querySelector('#trip-edit-btn').addEventListener('click', () => _openEditModal(container, trip));

  container.querySelectorAll('.trip-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _currentTab = btn.dataset.tab;
      container.querySelectorAll('.trip-tab').forEach(b => b.classList.toggle('active', b === btn));
      _renderTab(container.querySelector('#trip-tab-content'), trip, _currentTab);
    });
  });

  _renderTab(container.querySelector('#trip-tab-content'), trip, _currentTab);
}

function _renderTab(tabContent, trip, tab) {
  switch (tab) {
    case 'overview':   _renderOverviewTab(tabContent, trip); break;
    case 'packing':    renderPackingTab(tabContent, trip);   break;
    case 'tasks':      _renderTasksTab(tabContent, trip);     break;
    case 'budget':     renderBudgetTab(tabContent, trip);    break;
    case 'itinerary':  renderItineraryTab(tabContent, trip); break;
    case 'notes':      renderNotesTab(tabContent, trip); break;
    default:
      tabContent.innerHTML = '<div class="trip-tab-placeholder"><div>Coming soon</div></div>';
  }
}

// ── Overview tab ───────────────────────────────────────────────

async function _renderOverviewTab(tabContent, trip) {
  tabContent.innerHTML = '<div class="loading-state" style="padding:40px 0">Loading overview…</div>';
  let ov;
  try {
    ov = await apiFetch('GET', `/trips/${trip.id}/overview`);
  } catch (e) {
    tabContent.innerHTML = `<div class="trip-tab-placeholder"><div>${escHtml(e.message)}</div></div>`;
    return;
  }

  const cur = ov.budget_currency || 'USD';
  const budgetTotal = ov.budget_total || 0;
  const budgetUsed  = (ov.budget_committed || 0) + (ov.budget_spent || 0);
  const budgetPct   = budgetTotal > 0 ? Math.min(100, budgetUsed / budgetTotal * 100) : 0;
  const packPct     = ov.packing_total > 0 ? ov.packing_checked / ov.packing_total * 100 : 0;

  const taskSub = ov.next_due_task
    ? `Next: ${escHtml(ov.next_due_task.title)}${ov.next_due_task.due_date ? ' · ' + formatDateShort(ov.next_due_task.due_date) : ''}`
    : ov.open_task_count === 0 ? 'All clear' : '';

  const budgetSub = budgetTotal > 0
    ? `${_fmtMoney(budgetUsed, cur)} used of ${_fmtMoney(budgetTotal, cur)}`
    : 'No budget set';

  const packSub = ov.packing_total > 0
    ? `${ov.packing_checked} of ${ov.packing_total} items packed`
    : 'No items added';

  const itinHTML = _itineraryPreviewHTML(ov.itinerary_preview);

  tabContent.innerHTML = `
    <div class="trip-overview-widgets">
      <div class="trip-widget">
        <div class="trip-widget-label">Open Tasks</div>
        <div class="trip-widget-value">${ov.open_task_count}</div>
        <div class="trip-widget-sub">${taskSub}</div>
      </div>
      <div class="trip-widget">
        <div class="trip-widget-label">Budget</div>
        <div class="trip-widget-value">${budgetTotal > 0 ? _fmtMoney(budgetUsed, cur) : '—'}</div>
        <div class="trip-widget-sub">${budgetSub}</div>
        ${budgetTotal > 0 ? `<div class="trip-widget-bar">${progressBarHTML(budgetPct)}</div>` : ''}
      </div>
      <div class="trip-widget">
        <div class="trip-widget-label">Packing</div>
        <div class="trip-widget-value">${ov.packing_total > 0 ? Math.round(packPct) + '%' : '—'}</div>
        <div class="trip-widget-sub">${packSub}</div>
        ${ov.packing_total > 0 ? `<div class="trip-widget-bar">${progressBarHTML(packPct)}</div>` : ''}
      </div>
    </div>

    <div class="trip-overview-grid">
      ${_confirmCardHTML(trip)}
      <div class="trip-itin-preview">
        <div class="trip-itin-preview-header">Upcoming (next 2 days)</div>
        ${itinHTML || '<div style="padding:16px;font-size:13px;color:var(--text-muted)">No itinerary entries for the next 2 days.</div>'}
      </div>
    </div>`;

  animateProgressBars(tabContent);
  _initConfirmCard(tabContent, trip);
}

function _confirmCardHTML(trip) {
  const fields = [
    { key: 'flight_confirmation', label: 'Flight confirmation' },
    { key: 'hotel_confirmation',  label: 'Hotel confirmation' },
    { key: 'car_rental',          label: 'Car rental' },
    { key: 'address',             label: 'Address' },
    { key: 'emergency_contact',   label: 'Emergency contact' },
    { key: 'passport_notes',      label: 'Passport / ID notes' },
    {
      key: 'custom_field_1_value',
      label: trip.custom_field_1_label || 'Custom field 1',
      labelKey: 'custom_field_1_label',
    },
    {
      key: 'custom_field_2_value',
      label: trip.custom_field_2_label || 'Custom field 2',
      labelKey: 'custom_field_2_label',
    },
  ];

  const fieldsHTML = fields.map(f => {
    const val = trip[f.key] || '';
    const isEmpty = !val;
    return `
      <div class="confirm-field">
        <span class="confirm-field-label">${escHtml(f.label)}</span>
        <span class="confirm-field-value${isEmpty ? ' empty' : ''}"
              contenteditable="true"
              data-field="${f.key}"
              title="Click to edit">${escHtml(val) || '—'}</span>
      </div>`;
  }).join('');

  return `
    <div class="confirm-card">
      <div class="confirm-card-header">
        <span class="confirm-card-title">Confirmation &amp; Info</span>
        <button class="btn btn-ghost btn-sm" id="confirm-copy-btn">Copy all</button>
      </div>
      <div class="confirm-fields" id="confirm-fields">${fieldsHTML}</div>
    </div>`;
}

function _initConfirmCard(tabContent, trip) {
  const FIELD_LABELS = {
    flight_confirmation: 'Flight confirmation',
    hotel_confirmation:  'Hotel confirmation',
    car_rental:          'Car rental',
    address:             'Address',
    emergency_contact:   'Emergency contact',
    passport_notes:      'Passport / ID notes',
    custom_field_1_value: trip.custom_field_1_label || 'Custom field 1',
    custom_field_2_value: trip.custom_field_2_label || 'Custom field 2',
  };

  tabContent.querySelectorAll('.confirm-field-value').forEach(el => {
    const field = el.dataset.field;

    el.addEventListener('focus', () => {
      if (el.classList.contains('empty')) {
        el.textContent = '';
        el.classList.remove('empty');
      }
    });

    el.addEventListener('blur', async () => {
      const val = el.textContent.trim();
      if (val === (trip[field] || '')) return;

      try {
        const updated = await apiFetch('PUT', `/trips/${trip.id}`, { [field]: val || null });
        Object.assign(trip, updated);
        _currentTrip = trip;
        if (!val) {
          el.textContent = '—';
          el.classList.add('empty');
        }
      } catch (e) {
        el.textContent = trip[field] || '—';
        if (!trip[field]) el.classList.add('empty');
      }
    });

    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') {
        el.textContent = trip[field] || '—';
        if (!trip[field]) el.classList.add('empty');
        el.blur();
      }
    });
  });

  const copyBtn = tabContent.querySelector('#confirm-copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const lines = [`${trip.name}${trip.destination ? ' — ' + trip.destination : ''}`, ''];
      tabContent.querySelectorAll('.confirm-field').forEach(row => {
        const label = row.querySelector('.confirm-field-label').textContent.trim();
        const val   = row.querySelector('.confirm-field-value').textContent.trim();
        if (val && val !== '—') lines.push(`${label}: ${val}`);
      });
      navigator.clipboard.writeText(lines.join('\n')).catch(() => {});
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy all'; }, 2000);
    });
  }
}

function _itineraryPreviewHTML(entries) {
  if (!entries || entries.length === 0) return '';
  let html = '';
  let lastDate = null;
  for (const e of entries) {
    if (e.entry_date !== lastDate) {
      lastDate = e.entry_date;
      html += `<div class="trip-itin-date-group">${formatDate(e.entry_date)}</div>`;
    }
    html += `
      <div class="trip-itin-preview-entry">
        <span class="trip-itin-time">${e.start_time || ''}</span>
        <span class="trip-itin-type-dot"></span>
        <span class="trip-itin-title">${escHtml(e.title)}</span>
      </div>`;
  }
  return html;
}

// ── Tasks tab ─────────────────────────────────────────────────

async function _renderTasksTab(tabContent, trip) {
  if (!trip.tag_id) {
    tabContent.innerHTML = `
      <div class="trip-tab-placeholder">
        <div class="trip-tab-placeholder-title">Tasks unavailable</div>
        <div>No system tag found for this trip. Try deleting and recreating the trip.</div>
      </div>`;
    return;
  }

  tabContent.innerHTML = '<div class="loading-state" style="padding:40px 0">Loading tasks…</div>';

  let allTasks, tags;
  try {
    [{ items: allTasks }, { items: tags }] = await Promise.all([
      apiFetch('GET', `/tasks?tag_id=${trip.tag_id}`),
      apiFetch('GET', '/tags'),
    ]);
  } catch (e) {
    tabContent.innerHTML = `<div class="trip-tab-placeholder"><div>${escHtml(e.message)}</div></div>`;
    return;
  }

  const today     = todayISO();
  const in7Date   = new Date(); in7Date.setDate(in7Date.getDate() + 7);
  const in7ISO    = in7Date.toISOString().slice(0, 10);
  const departure = trip.start_date;

  const pending   = allTasks.filter(t => t.status === 'pending');
  const completed = allTasks.filter(t => t.status === 'completed');

  function bucket(task) {
    const due = task.due_date;
    if (!due)             return 'before';   // No date → prep bucket
    if (due >= departure) return 'after';    // During/after trip (checked before 7-day window)
    if (due <= in7ISO)    return 'now';      // Overdue or due soon
    return 'before';                          // More than 7 days out, before departure
  }

  const doNow       = pending.filter(t => bucket(t) === 'now');
  const beforeTrip  = pending.filter(t => bucket(t) === 'before');
  const afterDepart = pending.filter(t => bucket(t) === 'after');

  const byDue = (a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  };
  doNow.sort(byDue); beforeTrip.sort(byDue); afterDepart.sort(byDue);

  tabContent.innerHTML = `
    <div class="trip-tasks-header">
      <span class="trip-tasks-summary">${pending.length} open · ${completed.length} completed</span>
      <button class="btn btn-primary btn-sm" id="trip-new-task-btn">+ New task</button>
    </div>
    ${_bucketHTML('Do now', doNow, trip.tag_id, 'Nothing urgent — you\'re on track!')}
    ${_bucketHTML('Before the trip', beforeTrip, trip.tag_id, 'No upcoming prep tasks.')}
    ${_bucketHTML('After departure', afterDepart, trip.tag_id, 'No post-departure tasks.')}
    ${completed.length ? `
      <div class="trip-task-bucket">
        <div class="trip-bucket-header">
          <span class="trip-bucket-title">Completed</span>
          <span class="trip-bucket-count">${completed.length}</span>
          <button class="trip-bucket-toggle" id="trip-completed-toggle">Show</button>
        </div>
        <div id="trip-completed-list" style="display:none">
          <div class="trip-task-row-wrap">${completed.map(t => _tripTaskRowHTML(t, trip.tag_id)).join('')}</div>
        </div>
      </div>` : ''}`;

  tabContent.querySelector('#trip-new-task-btn').addEventListener('click', () =>
    _openTripNewTaskModal(tabContent, trip, tags)
  );

  tabContent.querySelector('#trip-completed-toggle')?.addEventListener('click', e => {
    const panel = tabContent.querySelector('#trip-completed-list');
    const showing = panel.style.display !== 'none';
    panel.style.display = showing ? 'none' : 'block';
    e.target.textContent = showing ? 'Show' : 'Hide';
    if (!showing) _bindTaskRowEvents(panel, trip, tags, tabContent);
  });

  _bindTaskRowEvents(tabContent, trip, tags, tabContent);
}

function _bucketHTML(title, tasks, tripTagId, emptyMsg) {
  const rows = tasks.length
    ? `<div class="trip-task-row-wrap">${tasks.map(t => _tripTaskRowHTML(t, tripTagId)).join('')}</div>`
    : `<div class="trip-bucket-empty">${emptyMsg}</div>`;
  return `
    <div class="trip-task-bucket">
      <div class="trip-bucket-header">
        <span class="trip-bucket-title">${title}</span>
        <span class="trip-bucket-count">${tasks.length}</span>
      </div>
      ${rows}
    </div>`;
}

function _tripTaskRowHTML(task, tripTagId) {
  const done    = task.status === 'completed';
  const today   = todayISO();
  const overdue = !done && task.due_date && task.due_date < today;
  const isToday = !done && task.due_date === today;
  const visible = (task.tags || []).filter(t => t.id !== tripTagId);

  let dueHTML = '';
  if (task.due_date) {
    let cls = 'due-label';
    if (overdue)       cls += ' overdue';
    else if (isToday)  cls += ' today-due';
    const label = overdue
      ? `Overdue · ${formatDateShort(task.due_date)}`
      : isToday ? 'Today' : formatDateShort(task.due_date);
    dueHTML = `<span class="${cls}">${label}</span>`;
  }

  return `
    <div class="task-row${done ? ' done-row' : ''}" data-id="${task.id}" style="cursor:pointer">
      ${priorityDotHTML(task.priority)}
      <div class="task-row-check">
        <div class="checkbox-circle${done ? ' checked' : ''}"></div>
      </div>
      <div class="task-row-body">
        <div class="task-row-title${done ? ' done' : ''}">${escHtml(task.title)}</div>
        ${visible.length ? `<div class="task-row-meta">${tagsHTML(visible)}</div>` : ''}
      </div>
      <div class="task-row-right">
        ${dueHTML}
        ${done ? `<button class="task-reopen-btn" data-id="${task.id}" title="Reopen">↩</button>` : ''}
      </div>
    </div>`;
}

function _bindTaskRowEvents(root, trip, tags, tabContent) {
  root.querySelectorAll('.task-row').forEach(row => {
    const taskId = parseInt(row.dataset.id);

    row.querySelector('.checkbox-circle')?.addEventListener('click', async e => {
      e.stopPropagation();
      const isPending = !row.classList.contains('done-row');
      if (!isPending) return;
      try {
        await apiFetch('POST', `/tasks/${taskId}/complete`);
        await _renderTasksTab(tabContent, trip);
      } catch (err) { alert(err.message); }
    });

    row.querySelector('.task-reopen-btn')?.addEventListener('click', async e => {
      e.stopPropagation();
      try {
        await apiFetch('PUT', `/tasks/${taskId}`, { status: 'pending' });
        await _renderTasksTab(tabContent, trip);
      } catch (err) { alert(err.message); }
    });

    row.addEventListener('click', e => {
      if (e.target.closest('.task-row-check') || e.target.closest('.task-reopen-btn')) return;
      _openTripTaskEditModal(taskId, trip, tags, tabContent);
    });
  });
}

function _openTripNewTaskModal(tabContent, trip, tags) {
  const tagOpts = tags.map(tg => `
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
      <input type="checkbox" name="tag" value="${tg.id}"> ${escHtml(tg.name)}
    </label>`).join('');

  const body = `
    <div class="form-group">
      <label class="form-label">Title *</label>
      <input class="form-input" id="tnt-title" placeholder="Task title" />
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group">
        <label class="form-label">Priority</label>
        <select class="form-select" id="tnt-priority">
          <option value="high">High</option>
          <option value="medium" selected>Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Due date</label>
        <input class="form-input" id="tnt-due" type="date" />
      </div>
    </div>
    ${tags.length ? `
    <div class="form-group">
      <label class="form-label">Additional tags</label>
      <div style="display:flex;flex-wrap:wrap;gap:10px">${tagOpts}</div>
    </div>` : ''}
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="tnt-notes" placeholder="Optional notes…"></textarea>
    </div>`;

  const overlay = createModal('New Task', body, async ov => {
    const title = ov.querySelector('#tnt-title').value.trim();
    if (!title) { alert('Title is required.'); return; }
    const extra = Array.from(ov.querySelectorAll('input[name=tag]:checked')).map(c => parseInt(c.value));
    try {
      await apiFetch('POST', '/tasks', {
        title,
        priority: ov.querySelector('#tnt-priority').value,
        due_date: getDateVal(ov.querySelector('#tnt-due')) || null,
        notes:    ov.querySelector('#tnt-notes').value || null,
        tag_ids:  [trip.tag_id, ...extra],
      });
      closeModal(ov); ov.remove();
      await _renderTasksTab(tabContent, trip);
    } catch (e) { alert(e.message); }
  }, 'Add Task');

  initSmartDates(overlay);
  openModal(overlay);
}

async function _openTripTaskEditModal(taskId, trip, tags, tabContent) {
  let task;
  try {
    task = await apiFetch('GET', `/tasks/${taskId}`);
  } catch (e) { alert(e.message); return; }

  const taskTagIds = new Set((task.tags || []).filter(t => t.id !== trip.tag_id).map(t => t.id));
  const tagOpts = tags.map(tg => `
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
      <input type="checkbox" name="tag" value="${tg.id}"${taskTagIds.has(tg.id) ? ' checked' : ''}> ${escHtml(tg.name)}
    </label>`).join('');

  const body = `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input class="form-input" id="tet-title" value="${escHtml(task.title)}" />
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group">
        <label class="form-label">Priority</label>
        <select class="form-select" id="tet-priority">
          <option value="high"${task.priority==='high'?' selected':''}>High</option>
          <option value="medium"${task.priority==='medium'?' selected':''}>Medium</option>
          <option value="low"${task.priority==='low'?' selected':''}>Low</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Due date</label>
        <input class="form-input" id="tet-due" type="date" value="${task.due_date || ''}" />
      </div>
    </div>
    ${tags.length ? `
    <div class="form-group">
      <label class="form-label">Additional tags</label>
      <div style="display:flex;flex-wrap:wrap;gap:10px">${tagOpts}</div>
    </div>` : ''}
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="tet-notes">${escHtml(task.notes || '')}</textarea>
    </div>
    <div style="margin-top:12px;padding-top:12px;border-top:var(--border-subtle)">
      <button type="button" class="btn btn-danger btn-sm" id="tet-delete-btn">Delete task</button>
    </div>`;

  const overlay = createModal('Edit Task', body, async ov => {
    const title = ov.querySelector('#tet-title').value.trim();
    if (!title) { alert('Title is required.'); return; }
    const extra = Array.from(ov.querySelectorAll('input[name=tag]:checked')).map(c => parseInt(c.value));
    const due   = getDateVal(ov.querySelector('#tet-due'));
    const body_ = {
      title,
      priority: ov.querySelector('#tet-priority').value,
      notes:    ov.querySelector('#tet-notes').value || null,
      tag_ids:  [trip.tag_id, ...extra],
    };
    if (due) body_.due_date = due;
    else     body_.clear_due_date = true;
    try {
      await apiFetch('PUT', `/tasks/${taskId}`, body_);
      closeModal(ov); ov.remove();
      await _renderTasksTab(tabContent, trip);
    } catch (e) { alert(e.message); }
  }, 'Save');

  overlay.querySelector('#tet-delete-btn').addEventListener('click', async () => {
    if (!confirm(`Delete "${task.title}"?`)) return;
    try {
      await apiFetch('DELETE', `/tasks/${taskId}`);
      closeModal(overlay); overlay.remove();
      await _renderTasksTab(tabContent, trip);
    } catch (e) { alert(e.message); }
  });

  initSmartDates(overlay);
  openModal(overlay);
}

// ── Notes tab (Phase 5 placeholder) ───────────────────────────


// ── Edit trip modal ────────────────────────────────────────────

function _openEditModal(container, trip) {
  let selectedColor = trip.color || 'blue';
  const swatchHTML = TRIP_COLORS.map(c =>
    `<button type="button" class="trip-color-swatch color-${c.name}${c.name === selectedColor ? ' selected' : ''}" data-color="${c.name}" title="${c.name}"></button>`
  ).join('');

  const body = `
    <div class="form-group">
      <label class="form-label">Trip name</label>
      <input class="form-input" id="te-name" value="${escHtml(trip.name)}" />
    </div>
    <div class="form-group">
      <label class="form-label">Destination</label>
      <input class="form-input" id="te-dest" value="${escHtml(trip.destination || '')}" />
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group">
        <label class="form-label">Start date</label>
        <input class="form-input" id="te-start" type="date" value="${trip.start_date || ''}" />
      </div>
      <div class="form-group">
        <label class="form-label">End date</label>
        <input class="form-input" id="te-end" type="date" value="${trip.end_date || ''}" />
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-input" id="te-status">
          <option value="Planning"${trip.status==='Planning'?' selected':''}>Planning</option>
          <option value="Confirmed"${trip.status==='Confirmed'?' selected':''}>Confirmed</option>
          <option value="Completed"${trip.status==='Completed'?' selected':''}>Completed</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div class="trip-color-picker" id="te-colors">${swatchHTML}</div>
      </div>
    </div>
    <hr style="margin:12px 0;border:none;border-top:var(--border-subtle)">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group">
        <label class="form-label">Total budget</label>
        <input class="form-input" id="te-budget" type="number" step="0.01" min="0" value="${trip.budget_total != null ? trip.budget_total : ''}" placeholder="e.g. 2000" />
      </div>
      <div class="form-group">
        <label class="form-label">Currency</label>
        <input class="form-input" id="te-currency" value="${escHtml(trip.budget_currency || 'USD')}" placeholder="USD" maxlength="5" />
      </div>
    </div>
    <hr style="margin:12px 0;border:none;border-top:var(--border-subtle)">
    <div class="form-group">
      <label class="form-label">Attendees</label>
      <div id="te-attendees-list">${_attendeesEditHTML(trip.attendees || [])}</div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <input class="form-input" id="te-new-attendee" placeholder="Add name…" style="flex:1" />
        <button type="button" class="btn btn-secondary btn-sm" id="te-add-attendee-btn">Add</button>
      </div>
    </div>
    <div style="margin-top:16px">
      <button type="button" class="btn btn-danger btn-sm" id="te-delete-btn">Delete Trip</button>
    </div>`;

  const overlay = createModal(`Edit Trip`, body, async (ov) => {
    const updates = {
      name:       ov.querySelector('#te-name').value.trim(),
      destination: ov.querySelector('#te-dest').value.trim() || null,
      start_date: getDateVal(ov.querySelector('#te-start')),
      end_date:   getDateVal(ov.querySelector('#te-end')),
      status:     ov.querySelector('#te-status').value,
      color:      selectedColor,
      budget_currency: ov.querySelector('#te-currency').value.trim() || 'USD',
    };
    const budgetVal = ov.querySelector('#te-budget').value;
    if (budgetVal === '') { updates.clear_budget_total = true; }
    else { updates.budget_total = parseFloat(budgetVal) || null; }

    if (!updates.name) { alert('Trip name is required.'); return; }
    try {
      const updated = await apiFetch('PUT', `/trips/${trip.id}`, updates);
      _currentTrip = updated;
      closeModal(ov);
      ov.remove();
      _renderWorkspace(container, updated);
    } catch (e) {
      alert(e.message);
    }
  }, 'Save Changes');

  overlay.querySelector('#te-colors').addEventListener('click', e => {
    const sw = e.target.closest('.trip-color-swatch');
    if (!sw) return;
    selectedColor = sw.dataset.color;
    overlay.querySelectorAll('.trip-color-swatch').forEach(s => s.classList.remove('selected'));
    sw.classList.add('selected');
  });

  overlay.querySelector('#te-add-attendee-btn').addEventListener('click', async () => {
    const inp = overlay.querySelector('#te-new-attendee');
    const name = inp.value.trim();
    if (!name) return;
    try {
      await apiFetch('POST', `/trips/${trip.id}/attendees`, { name });
      const updated = await apiFetch('GET', `/trips/${trip.id}`);
      trip.attendees = updated.attendees;
      overlay.querySelector('#te-attendees-list').innerHTML = _attendeesEditHTML(trip.attendees);
      _bindAttendeeRemove(overlay, trip);
      inp.value = '';
    } catch (e) { alert(e.message); }
  });

  _bindAttendeeRemove(overlay, trip);

  overlay.querySelector('#te-delete-btn').addEventListener('click', async () => {
    if (!confirm(`Delete "${trip.name}"? This cannot be undone.`)) return;
    try {
      await apiFetch('DELETE', `/trips/${trip.id}`);
      closeModal(overlay);
      overlay.remove();
      _currentTab = 'overview';
      history.pushState({ page: 'trips' }, '', '/trips');
      await _renderList(container);
    } catch (e) { alert(e.message); }
  });

  initSmartDates(overlay);
  openModal(overlay);
}

function _attendeesEditHTML(attendees) {
  if (!attendees.length) return '<div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">No attendees yet.</div>';
  return attendees.map(a => `
    <div style="display:flex;align-items:center;gap:8px;padding:4px 0" data-att-id="${a.id}">
      <span style="flex:1;font-size:14px">${escHtml(a.name)}${a.is_me ? ' <span style="font-size:12px;color:var(--text-muted)">(me)</span>' : ''}</span>
      <button type="button" class="btn btn-ghost btn-sm att-remove-btn" data-id="${a.id}" title="Remove">×</button>
    </div>`).join('');
}

function _bindAttendeeRemove(overlay, trip) {
  overlay.querySelectorAll('.att-remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const attId = parseInt(btn.dataset.id);
      try {
        await apiFetch('DELETE', `/trips/${trip.id}/attendees/${attId}`);
        trip.attendees = trip.attendees.filter(a => a.id !== attId);
        overlay.querySelector('#te-attendees-list').innerHTML = _attendeesEditHTML(trip.attendees);
        _bindAttendeeRemove(overlay, trip);
      } catch (e) { alert(e.message); }
    });
  });
}

// ── Shared helpers ─────────────────────────────────────────────

function _formatDateRange(start, end) {
  if (!start) return '';
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end   + 'T00:00:00');
  const sm = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (!end || start === end) return sm + ', ' + s.getFullYear();
  const em = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return s.getFullYear() === e.getFullYear()
    ? `${sm} – ${em}, ${e.getFullYear()}`
    : `${sm}, ${s.getFullYear()} – ${em}, ${e.getFullYear()}`;
}

function _fmtMoney(amount, currency) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(amount);
}
