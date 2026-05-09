// trips-itinerary.js — two-panel layout with timeline

const ITIN_TYPES = {
  Flight:        { icon: '✈',  color: '#4A90D9', label: 'Flight' },
  Transit:       { icon: '🚌', color: '#4CAF50', label: 'Transit' },
  Accommodation: { icon: '🏨', color: '#8B5CF6', label: 'Accommodation' },
  Activity:      { icon: '🎯', color: '#2BAE8E', label: 'Activity' },
  Restaurant:    { icon: '🍽', color: '#E8A624', label: 'Restaurant' },
  Tour:          { icon: '🗺', color: '#E8614A', label: 'Tour' },
  'Free Time':   { icon: '☀',  color: '#94A3B8', label: 'Free Time', free: true },
  Other:         { icon: '📌', color: '#8A8A8A', label: 'Other' },
};

// Timeline geometry
const TL_HOUR_H = 60;   // px per hour
const TL_START  = 6;    // 6 am
const TL_END    = 24;   // midnight
const TL_SNAP   = 15;   // minutes per snap unit

let _itinTrip      = null;
let _itinData      = null;
let _itinDay       = null;
let _itinContainer = null;

// ─── Entry point ─────────────────────────────────────────────────────────────

async function renderItineraryTab(container, trip) {
  _itinTrip      = trip;
  _itinData      = null;
  _itinContainer = container;
  container.innerHTML = '<div class="loading-state">Loading itinerary…</div>';
  try {
    _itinData = await apiFetch('GET', `/trips/${trip.id}/itinerary`);
  } catch {
    container.innerHTML = '<div class="loading-state">Failed to load itinerary.</div>';
    return;
  }
  _itinDay = _defaultDay();
  _renderItin();
}

function _defaultDay() {
  if (_itinTrip.start_date) return _itinTrip.start_date;
  if (_itinData.dates.length) return _itinData.dates[0];
  return new Date().toISOString().slice(0, 10);
}

// ─── Main render ─────────────────────────────────────────────────────────────

function _renderItin() {
  const container = _itinContainer;
  const today = new Date().toISOString().slice(0, 10);
  const isPast = !!(_itinTrip.end_date && _itinTrip.end_date < today);

  container.innerHTML = `
    <div class="itin-shell">
      <div class="itin-left" id="itin-left"></div>
      <div class="itin-right">
        <div class="itin-right-header">
          <div class="itin-day-title" id="itin-day-title"></div>
          <button class="btn btn-primary itin-global-add" id="itin-global-add">+ Add Entry</button>
        </div>
        <div class="itin-right-body" id="itin-right-body"></div>
      </div>
    </div>`;

  const days = _buildDayList();
  _buildLeft(container.querySelector('#itin-left'), days, isPast);
  _buildRight(container.querySelector('#itin-right-body'));
  _updateDayTitle();

  container.querySelector('#itin-global-add').addEventListener('click', () => _openEntryModal(null));
}

// ─── Day list ────────────────────────────────────────────────────────────────

function _buildDayList() {
  const { start_date, end_date } = _itinTrip;
  if (start_date && end_date) {
    const days = [];
    let cur = new Date(start_date + 'T00:00:00');
    const last = new Date(end_date + 'T00:00:00');
    let n = 1;
    while (cur <= last) {
      days.push({ date: cur.toISOString().slice(0, 10), dayNum: n++ });
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }
  // No date range: show dates with entries
  const dates = new Set([..._itinData.dates]);
  if (_itinDay) dates.add(_itinDay);
  return [...dates].sort().map(d => ({ date: d, dayNum: null }));
}

// ─── Left panel ──────────────────────────────────────────────────────────────

function _buildLeft(panel, days, isPast) {
  const today = new Date().toISOString().slice(0, 10);

  panel.innerHTML = days.map(({ date, dayNum }) => {
    const entries = _itinData.by_date[date] || [];
    const isSelected = date === _itinDay;
    const isToday = date === today;
    const dt = new Date(date + 'T00:00:00');
    const dow = dt.toLocaleDateString('en-US', { weekday: 'short' });
    const dateLabel = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const previewRows = entries.slice(0, 3).map(e => {
      const t = ITIN_TYPES[e.entry_type] || ITIN_TYPES.Other;
      return `<div class="idc-row">
        <span class="idc-row-icon" style="color:${t.color}">${t.icon}</span>
        <span class="idc-row-title">${_esc(e.title)}</span>
      </div>`;
    }).join('');

    const moreCount = entries.length - 3;
    const more = moreCount > 0 ? `<div class="idc-more">+${moreCount} more</div>` : '';
    const empty = entries.length === 0 ? '<div class="idc-empty">+ Add</div>' : '';

    const journal = isPast
      ? `<textarea class="idc-journal" data-date="${date}" placeholder="How did this day go…">${_esc(_itinData.day_notes?.[date] || '')}</textarea>`
      : '';

    return `<div class="idc${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}" data-date="${date}">
      <div class="idc-header">
        <div class="idc-header-left">
          ${dayNum !== null ? `<span class="idc-daynum">Day ${dayNum}</span>` : ''}
          <span class="idc-dow">${dow}</span>
        </div>
        <span class="idc-date">${dateLabel}</span>
      </div>
      <div class="idc-entries">${previewRows}${more}${empty}</div>
      ${journal}
    </div>`;
  }).join('');

  // Day card click → switch day
  panel.querySelectorAll('.idc').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.classList.contains('idc-journal')) return;
      _itinDay = card.dataset.date;
      panel.querySelectorAll('.idc').forEach(c => c.classList.toggle('selected', c === card));
      _buildRight(document.getElementById('itin-right-body'));
      _updateDayTitle();
    });
  });

  // Journal autosave (debounced)
  panel.querySelectorAll('.idc-journal').forEach(ta => {
    let timer;
    ta.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        apiFetch('PUT', `/trips/${_itinTrip.id}/itinerary/day-note/${ta.dataset.date}`, { notes: ta.value });
      }, 700);
    });
  });
}

function _daySummary(entries) {
  if (!entries.length) return '';
  // Deduplicate icons and show up to 5
  const seen = new Set();
  const icons = [];
  for (const e of entries) {
    const icon = (ITIN_TYPES[e.entry_type] || ITIN_TYPES.Other).icon;
    if (!seen.has(icon)) { seen.add(icon); icons.push(icon); }
    if (icons.length >= 5) break;
  }
  return icons.map(i => `<span class="idc-sum-icon">${i}</span>`).join('');
}

function _updateDayTitle() {
  const el = document.getElementById('itin-day-title');
  if (!el || !_itinDay) return;
  const dt = new Date(_itinDay + 'T00:00:00');
  el.textContent = dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ─── Right panel ─────────────────────────────────────────────────────────────

function _buildRight(container) {
  if (!container) return;
  const date = _itinDay;
  const entries = _itinData.by_date[date] || [];
  const timed   = entries.filter(e => e.start_time);
  const untimed = entries.filter(e => !e.start_time);

  const typePickerBtns = Object.entries(ITIN_TYPES).map(([k, v]) =>
    `<button type="button" class="iun-type-btn${k === 'Activity' ? ' sel' : ''}"
      data-type="${k}" title="${v.label}" style="--tc:${v.color}">${v.icon}</button>`
  ).join('');

  container.innerHTML = `
    <div class="itin-unsched-section">
      <div class="itin-section-label">All Day</div>
      <div class="itin-unsched-list" id="itin-unsched-list">
        ${untimed.map(e => {
          const t = ITIN_TYPES[e.entry_type] || ITIN_TYPES.Other;
          return `<div class="itin-unsched-row" data-id="${e.id}">
            <span class="iun-icon" style="color:${t.color}">${t.icon}</span>
            <span class="iun-title">${_esc(e.title)}</span>
            <div class="iun-acts">
              <button class="btn-icon iun-edit-btn" data-id="${e.id}" title="Edit">✎</button>
              <button class="btn-icon iun-del-btn"  data-id="${e.id}" title="Delete">✕</button>
            </div>
          </div>`;
        }).join('')}
        <div class="iun-quick-row">
          <input class="iun-quick-input" type="text" placeholder="Add item… press Enter" />
          <div class="iun-type-row">${typePickerBtns}</div>
        </div>
      </div>
    </div>
    <div class="itin-tl-section">
      <div class="itin-section-label">Timeline</div>
      <div class="itin-tl-outer" id="itin-tl-outer">
        ${_buildTimelineHTML(date, timed)}
      </div>
    </div>`;

  // Quick-add type picker
  let quickType = 'Activity';
  container.querySelectorAll('.iun-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.iun-type-btn').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      quickType = btn.dataset.type;
      container.querySelector('.iun-quick-input').focus();
    });
  });

  // Quick-add submit
  const qi = container.querySelector('.iun-quick-input');
  qi.addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const title = qi.value.trim();
    if (!title) return;
    qi.value = '';
    _itinData = await apiFetch('POST', `/trips/${_itinTrip.id}/itinerary/entries`, {
      entry_date: date, entry_type: quickType, title,
    });
    _renderItin();
  });

  // Unscheduled edit/delete — use class selectors to avoid any data-attr conflicts
  container.querySelectorAll('.iun-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = _findEntry(parseInt(btn.dataset.id));
      if (entry) _openEntryModal(entry);
    });
  });
  container.querySelectorAll('.iun-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      if (!confirm('Delete this entry?')) return;
      await apiFetch('DELETE', `/trips/${_itinTrip.id}/itinerary/entries/${id}`);
      await _refresh();
    });
  });

  // Timeline drag-to-create
  const grid = container.querySelector('.tl-grid');
  if (grid) _initCreateDrag(grid, date);

  // Entry block events
  container.querySelectorAll('.tl-entry').forEach(el => {
    const id = parseInt(el.dataset.id);
    const entry = _findEntry(id);
    if (!entry) return;
    _initMoveDrag(el, entry);
    el.querySelector('.tl-edit-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      _openEntryModal(entry);
    });
    el.querySelector('.tl-del-btn')?.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete?')) return;
      await apiFetch('DELETE', `/trips/${_itinTrip.id}/itinerary/entries/${id}`);
      await _refresh();
    });
  });

  // Auto-scroll timeline to first entry or 9am
  requestAnimationFrame(() => {
    const body = document.getElementById('itin-right-body');
    if (!body) return;
    const tlSec = body.querySelector('.itin-tl-section');
    if (!tlSec) return;
    const targetMins = timed.length
      ? Math.max(TL_START * 60, _timeToMins(timed[0].start_time) - 60)
      : 9 * 60;
    body.scrollTop = tlSec.offsetTop + _topFromMins(targetMins) - 20;
  });
}

// ─── Timeline HTML ────────────────────────────────────────────────────────────

function _buildTimelineHTML(date, timedEntries) {
  const totalH = (TL_END - TL_START) * TL_HOUR_H;
  const colMap = _calcColumns(timedEntries);

  let gutterHTML = '';
  let gridLines = '';
  for (let h = TL_START; h <= TL_END; h++) {
    const top = (h - TL_START) * TL_HOUR_H;
    const label = h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
    gutterHTML += `<div class="tl-label" style="top:${top}px">${label}</div>`;
    if (h < TL_END) {
      gridLines += `<div class="tl-hour-line" style="top:${top}px"></div>`;
      gridLines += `<div class="tl-half-line" style="top:${top + TL_HOUR_H / 2}px"></div>`;
    }
  }
  gridLines += `<div class="tl-hour-line" style="top:${totalH}px"></div>`;

  const blocks = timedEntries.map(e => _entryBlockHTML(e, colMap.get(e.id) || { col: 0, totalCols: 1 })).join('');

  return `
    <div class="tl-gutter" style="height:${totalH}px">${gutterHTML}</div>
    <div class="tl-grid" style="height:${totalH}px" data-date="${date}">
      ${gridLines}${blocks}
    </div>`;
}

function _entryBlockHTML(entry, { col, totalCols }) {
  const t = ITIN_TYPES[entry.entry_type] || ITIN_TYPES.Other;
  const startMins = _timeToMins(entry.start_time);
  const endMins = entry.end_time ? _timeToMins(entry.end_time) : startMins + 60;
  const top = _topFromMins(startMins);
  const height = Math.max((endMins - startMins) * TL_HOUR_H / 60, 22);
  const pct = 100 / totalCols;
  const isFree = t.free;
  const sizeClass = height < 30 ? ' tl-entry--xs' : height < 50 ? ' tl-entry--sm' : '';
  const showIcon = height >= 30;

  return `<div class="tl-entry${isFree ? ' tl-entry-free' : ''}${sizeClass}" data-id="${entry.id}"
    style="top:${top}px;height:${height}px;left:calc(${col * pct}% + 2px);width:calc(${pct}% - 4px);--ec:${t.color}">
    <div class="tl-entry-body">
      ${showIcon ? `<span class="tl-entry-icon">${t.icon}</span>` : ''}
      <span class="tl-entry-name">${_esc(entry.title)}</span>
      ${height >= 44 && entry.location ? `<span class="tl-entry-loc">📍 ${_esc(entry.location)}</span>` : ''}
    </div>
    <div class="tl-entry-acts">
      <button class="tl-edit-btn btn-icon" title="Edit">✎</button>
      <button class="tl-del-btn btn-icon" title="Delete">✕</button>
    </div>
  </div>`;
}

// ─── Overlap layout ───────────────────────────────────────────────────────────

function _calcColumns(entries) {
  if (!entries.length) return new Map();
  const sorted = [...entries].sort((a, b) => _timeToMins(a.start_time) - _timeToMins(b.start_time));
  const result = new Map();
  const colEnds = [];

  for (const e of sorted) {
    const s = _timeToMins(e.start_time);
    const end = e.end_time ? _timeToMins(e.end_time) : s + 60;
    let col = colEnds.findIndex(ce => ce <= s);
    if (col === -1) col = colEnds.length;
    colEnds[col] = end;
    result.set(e.id, { col, totalCols: 1 });
  }

  // Pass 2: set totalCols = max concurrent overlaps for each entry's group
  for (const e of sorted) {
    const s = _timeToMins(e.start_time);
    const end = e.end_time ? _timeToMins(e.end_time) : s + 60;
    let concurrent = 0;
    for (const e2 of sorted) {
      const s2 = _timeToMins(e2.start_time);
      const end2 = e2.end_time ? _timeToMins(e2.end_time) : s2 + 60;
      if (s2 < end && end2 > s) concurrent++;
    }
    result.get(e.id).totalCols = concurrent;
  }

  return result;
}

// ─── Timeline drag-to-create ──────────────────────────────────────────────────

function _initCreateDrag(grid, date) {
  let drag = null;
  let preview = null;

  grid.addEventListener('mousedown', e => {
    if (e.target.closest('.tl-entry') || e.button !== 0) return;
    e.preventDefault();

    const y = e.clientY - grid.getBoundingClientRect().top;
    const startMins = _clampMins(_snapMins(y));
    drag = { startMins, endMins: startMins + TL_SNAP };

    preview = document.createElement('div');
    preview.className = 'tl-preview';
    preview.style.top = _topFromMins(startMins) + 'px';
    preview.style.height = (TL_SNAP * TL_HOUR_H / 60) + 'px';
    grid.appendChild(preview);

    const onMove = e => {
      if (!drag) return;
      const y2 = e.clientY - grid.getBoundingClientRect().top;
      const endMins = Math.max(_clampMins(_snapMins(y2)), drag.startMins + TL_SNAP);
      drag.endMins = endMins;
      preview.style.height = ((endMins - drag.startMins) * TL_HOUR_H / 60) + 'px';
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!preview) return;
      preview.remove();
      const { startMins, endMins } = drag;
      drag = null; preview = null;
      _showInlineCreate(grid, date, startMins, endMins);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function _showInlineCreate(grid, date, startMins, endMins) {
  const height = Math.max((endMins - startMins) * TL_HOUR_H / 60, 64);
  const form = document.createElement('div');
  form.className = 'tl-inline-form';
  form.style.top    = _topFromMins(startMins) + 'px';
  form.style.height = height + 'px';

  const typeButtons = Object.entries(ITIN_TYPES).map(([k, v]) =>
    `<button type="button" class="tl-type-btn${k === 'Activity' ? ' sel' : ''}"
      data-type="${k}" title="${v.label}" style="--tc:${v.color}">${v.icon}</button>`
  ).join('');

  form.innerHTML = `
    <input class="tl-inline-input" type="text" placeholder="Add a title…" />
    <div class="tl-inline-types">${typeButtons}</div>
    <div class="tl-inline-hint">Enter to save · Esc to cancel</div>`;
  grid.appendChild(form);

  const input = form.querySelector('.tl-inline-input');
  input.focus();

  form.querySelectorAll('.tl-type-btn').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault()); // keep focus on input
    btn.addEventListener('click', () => {
      form.querySelectorAll('.tl-type-btn').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
    });
  });

  let saved = false;
  const save = async () => {
    if (saved) return;
    saved = true;
    form.remove();
    const title = input.value.trim();
    if (!title) return;
    const type = form.querySelector('.tl-type-btn.sel')?.dataset.type || 'Activity';
    await apiFetch('POST', `/trips/${_itinTrip.id}/itinerary/entries`, {
      entry_date: date, entry_type: type, title,
      start_time: _minsToTime(startMins),
      end_time: _minsToTime(endMins),
    });
    await _refresh();
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') { saved = true; form.remove(); }
  });

  input.addEventListener('blur', () => setTimeout(save, 150));
}

// ─── Drag-to-move entry ───────────────────────────────────────────────────────

function _initMoveDrag(el, entry) {
  el.addEventListener('mousedown', e => {
    if (e.target.closest('.tl-entry-acts') || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startMins = _timeToMins(entry.start_time);
    const dur = entry.end_time ? _timeToMins(entry.end_time) - startMins : 60;
    const offsetY = e.clientY - el.getBoundingClientRect().top;
    el.classList.add('tl-dragging');

    const grid = el.closest('.tl-grid');

    const onMove = e => {
      const y = e.clientY - grid.getBoundingClientRect().top - offsetY;
      const snapped = Math.max(TL_START * 60, Math.min(TL_END * 60 - dur, _snapMins(y)));
      el.style.top = _topFromMins(snapped) + 'px';
      el.dataset.pendingStart = snapped;
    };

    const onUp = async () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      el.classList.remove('tl-dragging');
      const pending = el.dataset.pendingStart ? parseInt(el.dataset.pendingStart) : null;
      if (pending !== null && pending !== startMins) {
        await apiFetch('PUT', `/trips/${_itinTrip.id}/itinerary/entries/${entry.id}`, {
          start_time: _minsToTime(pending),
          ...(entry.end_time ? { end_time: _minsToTime(pending + dur) } : { clear_end_time: true }),
        });
        await _refresh();
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ─── Add / Edit modal ─────────────────────────────────────────────────────────

function _openEntryModal(entry) {
  const isEdit  = !!entry;
  const selType = entry?.entry_type || 'Activity';
  const defDate = _itinDay || _itinTrip.start_date || '';

  const typePicker = Object.entries(ITIN_TYPES).map(([k, v]) =>
    `<button type="button" class="itin-type-opt${selType === k ? ' selected' : ''}"
      data-type="${k}" style="--itin-opt-color:${v.color}"
      tabindex="${selType === k ? '0' : '-1'}">${v.icon} ${v.label}</button>`
  ).join('');

  const body = `
    <div class="form-group">
      <label>Type</label>
      <input type="hidden" id="itin-type" value="${selType}">
      <div class="itin-type-picker" id="itin-type-picker">${typePicker}</div>
    </div>
    <div class="form-group">
      <label>Title <span class="req">*</span></label>
      <input id="itin-title" class="form-input" type="text"
        value="${_esc(entry?.title || '')}" placeholder="e.g. Flight to Paris" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Date <span class="req">*</span></label>
        <input id="itin-date" class="form-input" type="date" value="${entry?.entry_date || defDate}" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Start Time</label>
        <input id="itin-start" class="form-input" type="time" value="${entry?.start_time || ''}" />
      </div>
      <div class="form-group">
        <label>End Time</label>
        <input id="itin-end" class="form-input" type="time" value="${entry?.end_time || ''}" />
      </div>
    </div>
    <div class="form-group">
      <label>Location</label>
      <input id="itin-loc" class="form-input" type="text"
        value="${_esc(entry?.location || '')}" placeholder="Optional" />
    </div>
    <div class="form-group">
      <label>Confirmation #</label>
      <input id="itin-conf" class="form-input" type="text"
        value="${_esc(entry?.confirmation_number || '')}" placeholder="Optional" />
    </div>
    <div class="form-group">
      <label>Notes</label>
      <textarea id="itin-notes" class="form-input" rows="3"
        placeholder="Optional">${_esc(entry?.notes || '')}</textarea>
    </div>`;

  const overlay = createModal(
    isEdit ? 'Edit Entry' : 'Add Entry',
    body,
    async () => {
      const type  = document.getElementById('itin-type').value;
      const date  = getDateVal(document.getElementById('itin-date'));
      const title = document.getElementById('itin-title').value.trim();
      if (!date || !title) { alert('Date and Title are required.'); return false; }
      const start = document.getElementById('itin-start').value || null;
      const end   = document.getElementById('itin-end').value   || null;
      const loc   = document.getElementById('itin-loc').value.trim()  || null;
      const conf  = document.getElementById('itin-conf').value.trim() || null;
      const notes = document.getElementById('itin-notes').value.trim() || null;

      if (isEdit) {
        _itinData = await apiFetch('PUT', `/trips/${_itinTrip.id}/itinerary/entries/${entry.id}`, {
          entry_date: date, entry_type: type, title,
          clear_start_time: !start, start_time: start,
          clear_end_time:   !end,   end_time:   end,
          clear_location:     !loc,   location:      loc,
          clear_confirmation: !conf,  confirmation_number: conf,
          clear_notes:        !notes, notes,
        });
      } else {
        _itinData = await apiFetch('POST', `/trips/${_itinTrip.id}/itinerary/entries`, {
          entry_date: date, entry_type: type, title,
          start_time: start, end_time: end,
          location: loc, confirmation_number: conf, notes,
        });
      }
      if (date !== _itinDay) _itinDay = date;
      _renderItin();
    },
    isEdit ? 'Save Changes' : 'Add Entry'
  );

  openModal(overlay);

  // Wire type picker
  const hidden = overlay.querySelector('#itin-type');
  const opts   = Array.from(overlay.querySelectorAll('.itin-type-opt'));
  opts.forEach(opt => {
    opt.addEventListener('click', () => {
      opts.forEach(o => { o.classList.remove('selected'); o.tabIndex = -1; });
      opt.classList.add('selected');
      opt.tabIndex = 0;
      hidden.value = opt.dataset.type;
      opt.focus();
    });
    opt.addEventListener('keydown', e => {
      const idx = opts.indexOf(opt);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault(); opts[(idx + 1) % opts.length].click();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault(); opts[(idx - 1 + opts.length) % opts.length].click();
      }
    });
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function _refresh() {
  const body = document.getElementById('itin-right-body');
  const scrollY = body?.scrollTop || 0;
  _itinData = await apiFetch('GET', `/trips/${_itinTrip.id}/itinerary`);
  _renderItin();
  requestAnimationFrame(() => {
    const b = document.getElementById('itin-right-body');
    if (b) b.scrollTop = scrollY;
  });
}

function _findEntry(id) {
  return _itinData.entries.find(e => e.id === id);
}

function _timeToMins(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function _minsToTime(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function _snapMins(px) {
  const mins = TL_START * 60 + (px / TL_HOUR_H) * 60;
  return Math.round(mins / TL_SNAP) * TL_SNAP;
}

function _clampMins(m) {
  return Math.max(TL_START * 60, Math.min(TL_END * 60, m));
}

function _topFromMins(mins) {
  return (mins - TL_START * 60) * TL_HOUR_H / 60;
}

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
