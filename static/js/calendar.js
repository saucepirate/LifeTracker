// ── State ────────────────────────────────────────────────────────────────────
let _calView = 'month';
let _calYear, _calMonth;
let _calWeekStart;
let _calData = {};
let _selectedDate = null;
let _calNotes = [];
let _calTasks = [];
let _calGridStart = null;
let _calGridEnd = null;
let _calWeekEnd = null;
let _calFilters = { events: true, tasks: true, milestones: true, metrics: true, hideRecurring: true };
let _calGoals = [];
let _calTrips = [];
let _calTripId = null;
let _calDayDate = null;

const CAL_HOUR_START = 7;
const CAL_HOUR_END = 21;
const CAL_HOUR_HEIGHT = 52;

// ── Entry ────────────────────────────────────────────────────────────────────
registerPage('calendar', async function(content) {
  const today = calDateISO(new Date());
  const [y, m] = today.split('-').map(Number);
  _calYear = y;
  _calMonth = m;
  _calWeekStart = calGetMonday(today);
  _calDayDate = today;
  _calData = {};
  _selectedDate = null;

  content.innerHTML = `
    <div class="calendar-shell">
      <div class="calendar-main">
        <div class="page-header" style="margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:100%">
            <h1 class="page-title" style="margin:0;margin-right:auto">Calendar</h1>
            <div class="tf-group" style="margin:0">
              <button class="tf-pill cal-view-btn active" data-view="month">Month</button>
              <button class="tf-pill cal-view-btn" data-view="week">Week</button>
              <button class="tf-pill cal-view-btn" data-view="day">Day</button>
            </div>
            <div style="display:flex;align-items:center;gap:4px;margin-left:4px">
              <button class="cal-nav-btn" id="cal-prev" aria-label="Previous">&larr;</button>
              <span id="cal-label" style="min-width:140px;text-align:center;font-weight:600;font-size:13px"></span>
              <button class="cal-nav-btn" id="cal-next" aria-label="Next">&rarr;</button>
              <button class="btn btn-secondary btn-sm" id="cal-today-btn" style="margin-left:2px">Today</button>
            </div>
            <button class="btn btn-primary btn-sm" id="cal-new-event-btn">+ New event</button>
          </div>
        </div>
        <div class="cal-filter-bar">
          <span class="cal-filter-label">Show:</span>
          <button class="tf-pill cal-type-btn active" data-type="events">Events</button>
          <button class="tf-pill cal-type-btn active" data-type="tasks">Tasks</button>
          <button class="tf-pill cal-type-btn active" data-type="milestones">Milestones</button>
          <button class="tf-pill cal-type-btn active" data-type="metrics">Targets</button>
          <span class="cal-filter-sep"></span>
          <button class="tf-pill cal-type-btn active cal-recurring-toggle" data-type="hideRecurring">Hide recurring</button>
          <span class="cal-filter-sep"></span>
          <select id="cal-trip-filter" class="form-select" style="font-size:13px;padding:4px 8px;height:auto;width:auto;min-width:110px">
            <option value="">All trips</option>
          </select>
          <span style="flex:1"></span>
          <span class="cal-legend">
            <span class="cal-legend-item"><span class="cal-legend-dot" style="background:var(--neon-blue)"></span>Event</span>
            <span class="cal-legend-item"><span class="cal-legend-dot" style="background:#f59e0b"></span>Task</span>
            <span class="cal-legend-item"><span class="cal-legend-dot" style="background:var(--priority-high)"></span>Overdue</span>
            <span class="cal-legend-item"><span class="cal-legend-dot" style="background:var(--neon-purple)"></span>Milestone</span>
            <span class="cal-legend-item"><span class="cal-legend-dot" style="background:var(--neon-cyan)"></span>Target</span>
          </span>
        </div>
        <div id="cal-month-view"></div>
        <div id="cal-week-view" style="display:none"></div>
        <div id="cal-day-view" style="display:none"></div>
        <div class="cal-day-panel" id="cal-day-panel"></div>
      </div>
    </div>`;

  content.querySelector('#cal-prev').addEventListener('click', () => calNav(-1));
  content.querySelector('#cal-next').addEventListener('click', () => calNav(1));
  content.querySelector('#cal-today-btn').addEventListener('click', calGoToday);
  content.querySelector('#cal-new-event-btn').addEventListener('click', e => showCalAddMenu(e.currentTarget, _selectedDate || _calDayDate || calDateISO(new Date())));

  content.querySelectorAll('.cal-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _calView = btn.dataset.view;
      content.querySelectorAll('.cal-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === _calView));
      content.querySelector('#cal-month-view').style.display = _calView === 'month' ? '' : 'none';
      content.querySelector('#cal-week-view').style.display = _calView === 'week' ? '' : 'none';
      content.querySelector('#cal-day-view').style.display = _calView === 'day' ? '' : 'none';
      const dayPanel = content.querySelector('#cal-day-panel');
      if (dayPanel) dayPanel.style.display = _calView === 'day' ? 'none' : '';
      if (_calView === 'week' && !_calWeekStart) {
        _calWeekStart = calGetMonday(calDateISO(new Date()));
      }
      if (_calView === 'day') {
        _calDayDate = _selectedDate || calDateISO(new Date());
        calCloseSidePane();
      }
      calUpdateLabel();
      calLoadAndRender();
    });
  });

  content.querySelectorAll('.cal-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      if (type === 'hideRecurring') {
        _calFilters.hideRecurring = !_calFilters.hideRecurring;
        btn.classList.toggle('active', _calFilters.hideRecurring);
      } else {
        _calFilters[type] = !_calFilters[type];
        btn.classList.toggle('active', _calFilters[type]);
      }
      calRerender();
    });
  });

  await calLoadMeta();
  calUpdateLabel();
  await calLoadAndRender();
});

// ── Meta ─────────────────────────────────────────────────────────────────────
async function calLoadMeta() {
  try {
    const [notes, tasks, goals, trips] = await Promise.all([
      apiFetch('GET', '/notes'),
      apiFetch('GET', '/tasks?status=pending'),
      apiFetch('GET', '/goals'),
      apiFetch('GET', '/trips').catch(() => ({ upcoming: [], planning: [], past: [] })),
    ]);
    _calNotes = Array.isArray(notes) ? notes : (notes.items || []);
    _calTasks = Array.isArray(tasks) ? tasks : (tasks.items || []);
    _calGoals = Array.isArray(goals) ? goals : (goals.items || []);
    _calTrips = [...(trips.upcoming || []), ...(trips.planning || []), ...(trips.past || [])];
  } catch(e) {
    _calNotes = [];
    _calTasks = [];
    _calGoals = [];
    _calTrips = [];
  }
  // Populate trip dropdown
  const sel = document.getElementById('cal-trip-filter');
  if (sel && _calTrips.length) {
    _calTrips.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      if (_calTripId === t.id) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', e => {
      _calTripId = parseInt(e.target.value) || null;
      calRerender();
    });
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────
function calNav(dir) {
  if (_calView === 'month') {
    _calMonth += dir;
    if (_calMonth > 12) { _calMonth = 1; _calYear++; }
    if (_calMonth < 1) { _calMonth = 12; _calYear--; }
  } else if (_calView === 'week') {
    const d = calLocalDate(_calWeekStart);
    d.setDate(d.getDate() + dir * 7);
    _calWeekStart = calDateISO(d);
  } else {
    const d = calLocalDate(_calDayDate);
    d.setDate(d.getDate() + dir);
    _calDayDate = calDateISO(d);
  }
  _selectedDate = null;
  calCloseSidePane();
  calUpdateLabel();
  calLoadAndRender();
}

function calGoToday() {
  const today = calDateISO(new Date());
  const [y, m] = today.split('-').map(Number);
  _calYear = y;
  _calMonth = m;
  _calWeekStart = calGetMonday(today);
  _calDayDate = today;
  _selectedDate = null;
  calCloseSidePane();
  calUpdateLabel();
  calLoadAndRender();
}

function calUpdateLabel() {
  const el = document.getElementById('cal-label');
  if (!el) return;
  if (_calView === 'month') {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    el.textContent = `${months[_calMonth - 1]} ${_calYear}`;
  } else if (_calView === 'week') {
    const ws = calLocalDate(_calWeekStart);
    const we = new Date(ws);
    we.setDate(we.getDate() + 6);
    const opts = { month: 'short', day: 'numeric' };
    el.textContent = `${ws.toLocaleDateString(undefined, opts)} – ${we.toLocaleDateString(undefined, opts)}`;
  } else {
    const d = calLocalDate(_calDayDate);
    const today = calDateISO(new Date());
    el.textContent = _calDayDate === today
      ? 'Today'
      : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
}

function calRerender() {
  if (_calView === 'month') renderMonthGrid();
  else if (_calView === 'week' && _calWeekEnd) renderWeekGrid(_calWeekStart, _calWeekEnd);
  else if (_calView === 'day') renderDayView(_calDayDate);
}

async function calLoadAndRender() {
  try {
    if (_calView === 'month') {
      const data = await apiFetch('GET', `/calendar/month?year=${_calYear}&month=${_calMonth}`);
      _calData = data.days || {};
      _calGridStart = data.grid_start;
      _calGridEnd = data.grid_end;
      renderMonthGrid(data.grid_start, data.grid_end);
    } else if (_calView === 'week') {
      const data = await apiFetch('GET', `/calendar/week?date=${_calWeekStart}`);
      _calData = data.days || {};
      _calWeekEnd = data.week_end;
      renderWeekGrid(data.week_start, data.week_end);
    } else {
      const data = await apiFetch('GET', `/calendar/day?date=${_calDayDate}`);
      _calData = { [_calDayDate]: data };
      renderDayView(_calDayDate);
    }
  } catch(e) {
    console.error('Calendar load failed', e);
    const viewId = _calView === 'month' ? 'cal-month-view' : _calView === 'week' ? 'cal-week-view' : 'cal-day-view';
    const container = document.getElementById(viewId);
    if (container) container.innerHTML = `<div class="empty-state"><div class="empty-state-title">Couldn't load calendar</div><p class="empty-state-text">${e.message || 'Server error'} — try restarting the server.</p></div>`;
  }
}

// ── Month grid ────────────────────────────────────────────────────────────────
function renderMonthGrid(gridStart, gridEnd) {
  if (!gridStart) gridStart = _calGridStart;
  if (!gridEnd) gridEnd = _calGridEnd;
  if (!gridStart || !gridEnd) return;
  const container = document.getElementById('cal-month-view');
  if (!container) return;
  const today = calDateISO(new Date());
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  let html = `<div class="cal-grid-wrap"><div class="cal-grid-headers">`;
  days.forEach(d => {
    html += `<div class="cal-grid-header">${d}</div>`;
  });
  html += `</div><div class="cal-grid">`;

  let cur = calLocalDate(gridStart);
  const endDate = calLocalDate(gridEnd);
  while (cur <= endDate) {
    const iso = calDateISO(cur);
    const isToday = iso === today;
    const isSelected = iso === _selectedDate;
    const isOtherMonth = cur.getMonth() + 1 !== _calMonth;
    const dayData = _calData[iso] || {};

    let classes = 'cal-day-cell';
    if (isToday) classes += ' today';
    if (isSelected) classes += ' selected';
    if (isOtherMonth) classes += ' other-month';

    const allItems = [
      ...(dayData.events || []).map(e => ({ type: 'event', obj: e })),
      ...(dayData.tasks || []).map(t => ({ type: 'task', obj: t })),
      ...(dayData.milestones || []).map(m => ({ type: 'milestone', obj: m })),
      ...(dayData.metrics || []).map(m => ({ type: 'metric', obj: m })),
    ];
    const visibleItems = allItems.filter(item => {
      if (item.type === 'event' && !_calFilters.events) return false;
      if (item.type === 'task') {
        if (!_calFilters.tasks) return false;
        if (_calFilters.hideRecurring && item.obj.is_recurring) return false;
        if (_calTripId) {
          const trip = _calTrips.find(t => t.id === _calTripId);
          if (trip?.tag_id) {
            const full = _calTasks.find(ct => ct.id === item.obj.id);
            if (!full?.tags?.some(tg => tg.id === trip.tag_id)) return false;
          }
        }
      }
      if (item.type === 'milestone' && !_calFilters.milestones) return false;
      if (item.type === 'metric' && !_calFilters.metrics) return false;
      return true;
    });
    const maxPills = 3;
    const shown = visibleItems.slice(0, maxPills);
    const overflow = visibleItems.length - maxPills;
    const hasHiddenRecurring = _calFilters.hideRecurring && (dayData.tasks || []).some(t => t.is_recurring);

    let pillsHtml = '';
    shown.forEach(item => {
      const label = item.type === 'metric' ? (item.obj.label || 'Target') : item.obj.title;
      let pillClass = 'cal-item-pill';
      if (item.type === 'event') pillClass += ' pill-event';
      else if (item.type === 'task') {
        if (item.obj.status === 'completed') pillClass += ' pill-task-done';
        else pillClass += iso < today ? ' pill-task-high' : ' pill-task';
      }
      else if (item.type === 'milestone') pillClass += ' pill-milestone';
      else pillClass += ' pill-metric';
      pillsHtml += `<div class="${pillClass}" title="${esc(label)}">${esc(label)}</div>`;
    });
    if (overflow > 0) {
      pillsHtml += `<div class="cal-overflow-chip">+${overflow} more</div>`;
    }

    html += `<div class="${classes}" data-date="${iso}">
      <div class="cal-day-header-row">
        <div class="cal-day-number${isToday ? ' today-num' : ''}">${cur.getDate()}</div>
        ${hasHiddenRecurring ? '<span class="cal-recurring-dot" title="Has hidden recurring tasks"></span>' : ''}
      </div>
      ${pillsHtml}
    </div>`;
    cur.setDate(cur.getDate() + 1);
  }
  html += `</div></div>`;
  container.innerHTML = html;

  container.querySelectorAll('.cal-day-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date;
      if (_selectedDate === date) {
        _selectedDate = null;
        calCloseSidePane();
        container.querySelectorAll('.cal-day-cell').forEach(c => c.classList.remove('selected'));
      } else {
        _selectedDate = date;
        container.querySelectorAll('.cal-day-cell').forEach(c => c.classList.remove('selected'));
        cell.classList.add('selected');
        openDayPanel(date);
      }
    });
  });
}

// ── Day panel ─────────────────────────────────────────────────────────────────
function openDayPanel(dateStr) {
  const pane = document.getElementById('cal-day-panel');
  if (!pane) return;
  _selectedDate = dateStr;
  pane.classList.add('open');
  const dayData = _calData[dateStr] || {};
  const d = calLocalDate(dateStr);
  const label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  // Apply active filters
  const events = _calFilters.events ? (dayData.events || []) : [];
  const tasks = _calFilters.tasks
    ? (dayData.tasks || []).filter(t => {
        if (_calFilters.hideRecurring && t.is_recurring) return false;
        if (_calTripId) {
          const trip = _calTrips.find(tr => tr.id === _calTripId);
          if (trip?.tag_id) {
            const full = _calTasks.find(ct => ct.id === t.id);
            if (!full?.tags?.some(tg => tg.id === trip.tag_id)) return false;
          }
        }
        return true;
      })
    : [];
  const milestones = _calFilters.milestones ? (dayData.milestones || []) : [];
  const metrics = _calFilters.metrics ? (dayData.metrics || []) : [];

  let evHtml = '';
  if (events.length) {
    events.forEach(ev => {
      const timeStr = ev.all_day ? 'All day' : `${calFmtTime(ev.start_time)}${ev.end_time ? ' – ' + calFmtTime(ev.end_time) : ''}`;
      const noteBtn = ev.note_id
        ? `<button class="btn btn-secondary btn-sm cal-note-link-btn" data-note-id="${ev.note_id}" title="Open linked note">&#8594; Note</button>`
        : '';
      const taskChip = ev.task_title
        ? `<span class="badge" style="background:var(--bg-input);color:var(--text-muted);font-size:11px">&#9679; ${esc(ev.task_title)}</span>`
        : '';
      evHtml += `<div class="cal-event-card" data-event-id="${ev.id}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px">
          <div style="flex:1;min-width:0">
            <div class="cal-event-title">${esc(ev.title)}</div>
            <div class="cal-event-time">${timeStr}</div>
            ${ev.notes ? `<div class="cal-event-notes">${esc(ev.notes)}</div>` : ''}
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${noteBtn}${taskChip}</div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button class="btn btn-secondary btn-sm cal-edit-event-btn" data-event-id="${ev.id}" title="Edit">&#9998;</button>
            <button class="btn btn-secondary btn-sm cal-del-event-btn" data-event-id="${ev.id}" title="Delete" style="color:var(--neon-red)">&#10005;</button>
          </div>
        </div>
      </div>`;
    });
  }

  let taskHtml = '';
  if (tasks.length) {
    tasks.forEach(t => {
      const done = t.status === 'completed';
      const prio = (t.priority || 'medium').toLowerCase();
      const prioColor = prio === 'high' ? 'var(--priority-high)' : prio === 'low' ? 'var(--priority-low)' : 'var(--priority-medium)';
      const prioLabel = prio === 'high' ? 'High priority' : prio === 'low' ? 'Low priority' : 'Medium priority';
      taskHtml += `<div class="cal-task-row" data-task-id="${t.id}">
        <button class="checkbox-circle${done ? ' checked' : ''}" data-task-id="${t.id}"></button>
        <span class="cal-task-title" style="${done ? 'text-decoration:line-through;opacity:.45' : ''}">${esc(t.title)}</span>
        <span class="priority-dot" style="background:${prioColor};flex-shrink:0" title="${prioLabel}"></span>
        <button class="cal-task-nav-btn" title="Go to tasks" style="background:none;border:none;padding:2px 8px;font-size:14px;color:var(--color-accent);opacity:.65;flex-shrink:0;cursor:pointer" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.65">&#8594;</button>
      </div>`;
    });
  }

  let goalHtml = '';
  const goalItems = [
    ...milestones.map(m => ({ type: 'milestone', obj: m })),
    ...metrics.map(m => ({ type: 'metric', obj: m })),
  ];
  if (goalItems.length) {
    goalItems.forEach(item => {
      if (item.type === 'milestone') {
        const m = item.obj;
        const done = m.completed;
        goalHtml += `<div class="cal-goal-row">
          <button class="checkbox-square${done ? ' checked' : ''}" data-ms-id="${m.id}" data-goal-id="${m.goal_id}"></button>
          <div style="flex:1;min-width:0">
            <div class="cal-goal-title">${esc(m.title)}</div>
            <div class="cal-goal-sub"><span class="badge-milestone">Milestone</span> <span style="color:var(--text-muted);font-size:11px">${esc(m.goal_title || '')}</span></div>
          </div>
          <button class="cal-goal-nav-btn" data-goal-id="${m.goal_id}" title="Go to goal" style="background:none;border:none;padding:2px 8px;font-size:14px;color:var(--color-accent);opacity:.65;flex-shrink:0;cursor:pointer" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.65">&#8594;</button>
        </div>`;
      } else {
        const m = item.obj;
        const pct = m.target_value ? Math.round(((m.current_value || 0) - (m.start_value || 0)) / (m.target_value - (m.start_value || 0)) * 100) : 0;
        goalHtml += `<div class="cal-goal-row">
          <div style="width:18px;flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div class="cal-goal-title">${esc(m.label || 'Target')}</div>
            <div class="cal-goal-sub"><span class="badge-metric">Target</span> <span style="color:var(--text-muted);font-size:11px">${esc(m.goal_title || '')}</span></div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
              <div style="flex:1;height:4px;background:var(--bg-input);border-radius:2px">
                <div style="width:${Math.min(100,Math.max(0,pct))}%;height:100%;background:var(--neon-cyan);border-radius:2px"></div>
              </div>
              <span style="font-size:11px;color:var(--text-muted)">${m.current_value ?? '–'}${m.unit ? ' ' + m.unit : ''} / ${m.target_value ?? '–'}${m.unit ? ' ' + m.unit : ''}</span>
            </div>
          </div>
          <button class="cal-goal-nav-btn" data-goal-id="${m.goal_id}" title="Go to goal" style="background:none;border:none;padding:2px 8px;font-size:14px;color:var(--color-accent);opacity:.65;flex-shrink:0;cursor:pointer" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.65">&#8594;</button>
        </div>`;
      }
    });
  }

  pane.innerHTML = `
    <div class="cal-panel-header">
      <div class="cal-side-date-label">${label}</div>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="btn btn-primary btn-sm" id="cal-panel-add-event" title="Add event to this day">+ Add</button>
        <button class="btn btn-secondary btn-sm" id="cal-side-close" title="Close">&#10005;</button>
      </div>
    </div>
    <div class="cal-panel-scroll-wrap">
      <div class="cal-panel-body">
        <div class="cal-panel-col">
          <div class="cal-section-label">Events</div>
          ${evHtml || '<div class="cal-panel-empty">No events</div>'}
        </div>
        <div class="cal-panel-col">
          <div class="cal-section-label">Tasks</div>
          ${taskHtml || '<div class="cal-panel-empty">No tasks due</div>'}
        </div>
        <div class="cal-panel-col">
          <div class="cal-section-label">Milestones &amp; Targets</div>
          ${goalHtml || '<div class="cal-panel-empty">No milestones or targets</div>'}
        </div>
      </div>
    </div>`;

  // Highlight selected column in week view
  if (_calView === 'week') {
    document.querySelectorAll('.cal-week-day-header, .cal-week-allday-cell').forEach(el => el.classList.remove('selected'));
    document.querySelector(`.cal-week-day-header[data-date="${dateStr}"]`)?.classList.add('selected');
    document.querySelector(`.cal-week-allday-cell[data-date="${dateStr}"]`)?.classList.add('selected');
  }

  pane.querySelector('#cal-side-close').addEventListener('click', () => {
    _selectedDate = null;
    calCloseSidePane();
    document.querySelectorAll('.cal-day-cell').forEach(c => c.classList.remove('selected'));
  });

  pane.querySelector('#cal-panel-add-event').addEventListener('click', e => showCalAddMenu(e.currentTarget, dateStr));

  pane.querySelectorAll('.cal-note-link-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window._openNoteId = parseInt(btn.dataset.noteId);
      loadPage('notes');
    });
  });

  pane.querySelectorAll('.cal-edit-event-btn').forEach(btn => {
    const evId = parseInt(btn.dataset.eventId);
    btn.addEventListener('click', () => {
      const ev = ((_calData[dateStr] || {}).events || []).find(e => e.id === evId);
      if (ev) openEventModal(dateStr, null, ev);
    });
  });

  pane.querySelectorAll('.cal-del-event-btn').forEach(btn => {
    const evId = parseInt(btn.dataset.eventId);
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this event?')) return;
      await apiFetch('DELETE', `/calendar/events/${evId}`);
      calRemoveEventFromData(evId);
      openDayPanel(dateStr);
      if (_calView === 'month') renderMonthGrid(null, null, true);
      else calLoadAndRender();
    });
  });

  pane.querySelectorAll('.checkbox-circle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const taskId = parseInt(btn.dataset.taskId);
      const row = btn.closest('.cal-task-row');
      const alreadyDone = btn.classList.contains('checked');
      if (alreadyDone) return;
      btn.classList.add('checked');
      if (row) row.querySelector('.cal-task-title')?.classList.add('completed-text');
      try {
        await apiFetch('POST', `/tasks/${taskId}/complete`);
        const t = (_calData[dateStr]?.tasks || []).find(t => t.id === taskId);
        if (t) t.status = 'completed';
        if (_calView === 'month') {
          renderMonthGrid(null, null, true);
        }
      } catch(e) {
        btn.classList.remove('checked');
        if (row) row.querySelector('.cal-task-title')?.classList.remove('completed-text');
      }
    });
  });

  pane.querySelectorAll('.checkbox-square').forEach(btn => {
    btn.addEventListener('click', async () => {
      const msId = parseInt(btn.dataset.msId);
      const goalId = parseInt(btn.dataset.goalId);
      const alreadyDone = btn.classList.contains('checked');
      if (alreadyDone) return;
      btn.classList.add('checked');
      try {
        await apiFetch('PUT', `/goals/${goalId}/milestones/${msId}`, { completed: true });
        const ms = (_calData[dateStr]?.milestones || []).find(m => m.id === msId);
        if (ms) ms.completed = true;
      } catch(e) {
        btn.classList.remove('checked');
      }
    });
  });

  pane.querySelectorAll('.cal-task-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => loadPage('tasks'));
  });

  pane.querySelectorAll('.cal-goal-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window._openGoalId = parseInt(btn.dataset.goalId);
      loadPage('goals');
    });
  });
}

function calCloseSidePane() {
  const pane = document.getElementById('cal-day-panel');
  if (pane) {
    pane.classList.remove('open');
    pane.innerHTML = '';
  }
  document.querySelectorAll('.cal-week-day-header.selected, .cal-week-allday-cell.selected').forEach(el => el.classList.remove('selected'));
}

// ── Day view ──────────────────────────────────────────────────────────────────
function renderDayView(dateStr) {
  const container = document.getElementById('cal-day-view');
  if (!container) return;
  const today = calDateISO(new Date());
  const dayData = _calData[dateStr] || {};

  const events = _calFilters.events ? (dayData.events || []) : [];
  const tasks = _calFilters.tasks
    ? (dayData.tasks || []).filter(t => {
        if (_calFilters.hideRecurring && t.is_recurring) return false;
        if (_calTripId) {
          const trip = _calTrips.find(tr => tr.id === _calTripId);
          if (trip?.tag_id) {
            const full = _calTasks.find(ct => ct.id === t.id);
            if (!full?.tags?.some(tg => tg.id === trip.tag_id)) return false;
          }
        }
        return true;
      })
    : [];
  const milestones = _calFilters.milestones ? (dayData.milestones || []) : [];
  const metrics = _calFilters.metrics ? (dayData.metrics || []) : [];

  let inner = '';

  if (events.length) {
    inner += `<div class="cal-section-label">Events</div>`;
    events.forEach(ev => {
      const timeStr = ev.all_day ? 'All day' : `${calFmtTime(ev.start_time)}${ev.end_time ? ' – ' + calFmtTime(ev.end_time) : ''}`;
      const noteBtn = ev.note_id
        ? `<button class="btn btn-secondary btn-sm cal-note-link-btn" data-note-id="${ev.note_id}">&#8594; Note</button>`
        : '';
      inner += `<div class="cal-event-card" data-event-id="${ev.id}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <div style="flex:1;min-width:0">
            <div class="cal-event-title">${esc(ev.title)}</div>
            <div class="cal-event-time">${timeStr}</div>
            ${ev.notes ? `<div class="cal-event-notes">${esc(ev.notes)}</div>` : ''}
            ${noteBtn ? `<div style="margin-top:5px">${noteBtn}</div>` : ''}
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button class="btn btn-secondary btn-sm cal-edit-event-btn" data-event-id="${ev.id}" title="Edit">&#9998;</button>
            <button class="btn btn-secondary btn-sm cal-del-event-btn" data-event-id="${ev.id}" title="Delete" style="color:var(--neon-red)">&#10005;</button>
          </div>
        </div>
      </div>`;
    });
  }

  if (tasks.length) {
    inner += `<div class="cal-section-label">Tasks</div>`;
    tasks.forEach(t => {
      const done = t.status === 'completed';
      const prio = (t.priority || 'medium').toLowerCase();
      const prioColor = prio === 'high' ? 'var(--priority-high)' : prio === 'low' ? 'var(--priority-low)' : 'var(--priority-medium)';
      const prioLabel = prio === 'high' ? 'High priority' : prio === 'low' ? 'Low priority' : 'Medium priority';
      inner += `<div class="cal-task-row" data-task-id="${t.id}">
        <button class="checkbox-circle${done ? ' checked' : ''}" data-task-id="${t.id}"></button>
        <span class="cal-task-title" style="${done ? 'text-decoration:line-through;opacity:.45' : ''}">${esc(t.title)}</span>
        <span class="priority-dot" style="background:${prioColor};flex-shrink:0" title="${prioLabel}"></span>
        <button class="cal-task-nav-btn" title="Go to tasks" style="background:none;border:none;padding:2px 8px;font-size:14px;color:var(--color-accent);opacity:.65;flex-shrink:0;cursor:pointer" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.65">&#8594;</button>
      </div>`;
    });
  }

  const goalItems = [
    ...milestones.map(m => ({ type: 'milestone', obj: m })),
    ...metrics.map(m => ({ type: 'metric', obj: m })),
  ];
  if (goalItems.length) {
    inner += `<div class="cal-section-label">Milestones &amp; Targets</div>`;
    goalItems.forEach(item => {
      if (item.type === 'milestone') {
        const m = item.obj;
        const done = m.completed;
        inner += `<div class="cal-goal-row">
          <button class="checkbox-square${done ? ' checked' : ''}" data-ms-id="${m.id}" data-goal-id="${m.goal_id}"></button>
          <div style="flex:1;min-width:0">
            <div class="cal-goal-title">${esc(m.title)}</div>
            <div class="cal-goal-sub"><span class="badge-milestone">Milestone</span> <span style="color:var(--text-muted);font-size:11px">${esc(m.goal_title || '')}</span></div>
          </div>
          <button class="cal-goal-nav-btn" data-goal-id="${m.goal_id}" title="Go to goal" style="background:none;border:none;padding:2px 8px;font-size:14px;color:var(--color-accent);opacity:.65;flex-shrink:0;cursor:pointer" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.65">&#8594;</button>
        </div>`;
      } else {
        const m = item.obj;
        const pct = m.target_value ? Math.round(((m.current_value || 0) - (m.start_value || 0)) / (m.target_value - (m.start_value || 0)) * 100) : 0;
        inner += `<div class="cal-goal-row">
          <div style="width:18px;flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div class="cal-goal-title">${esc(m.label || 'Target')}</div>
            <div class="cal-goal-sub"><span class="badge-metric">Target</span> <span style="color:var(--text-muted);font-size:11px">${esc(m.goal_title || '')}</span></div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
              <div style="flex:1;height:4px;background:var(--bg-input);border-radius:2px">
                <div style="width:${Math.min(100,Math.max(0,pct))}%;height:100%;background:var(--neon-cyan);border-radius:2px"></div>
              </div>
              <span style="font-size:11px;color:var(--text-muted)">${m.current_value ?? '–'}${m.unit ? ' '+m.unit : ''} / ${m.target_value ?? '–'}${m.unit ? ' '+m.unit : ''}</span>
            </div>
          </div>
          <button class="cal-goal-nav-btn" data-goal-id="${m.goal_id}" title="Go to goal" style="background:none;border:none;padding:2px 8px;font-size:14px;color:var(--color-accent);opacity:.65;flex-shrink:0;cursor:pointer" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.65">&#8594;</button>
        </div>`;
      }
    });
  }

  if (!inner) {
    inner = `<div class="empty-state" style="flex:1"><div class="empty-state-title">Nothing scheduled</div><div class="empty-state-text">Use "+ Add" to add an event, task, or milestone.</div></div>`;
  }

  container.innerHTML = `<div class="cal-day-view-inner">${inner}</div>`;

  container.querySelectorAll('.cal-note-link-btn').forEach(btn => {
    btn.addEventListener('click', () => { window._openNoteId = parseInt(btn.dataset.noteId); loadPage('notes'); });
  });
  container.querySelectorAll('.cal-edit-event-btn').forEach(btn => {
    const evId = parseInt(btn.dataset.eventId);
    btn.addEventListener('click', () => {
      const ev = ((_calData[dateStr] || {}).events || []).find(e => e.id === evId);
      if (ev) openEventModal(dateStr, null, ev);
    });
  });
  container.querySelectorAll('.cal-del-event-btn').forEach(btn => {
    const evId = parseInt(btn.dataset.eventId);
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this event?')) return;
      await apiFetch('DELETE', `/calendar/events/${evId}`);
      await calLoadAndRender();
    });
  });
  container.querySelectorAll('.checkbox-circle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const taskId = parseInt(btn.dataset.taskId);
      if (btn.classList.contains('checked')) return;
      btn.classList.add('checked');
      const title = btn.closest('.cal-task-row')?.querySelector('.cal-task-title');
      if (title) title.setAttribute('style', 'text-decoration:line-through;opacity:.45');
      try { await apiFetch('POST', `/tasks/${taskId}/complete`); } catch(e) { btn.classList.remove('checked'); }
    });
  });
  container.querySelectorAll('.cal-task-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => loadPage('tasks'));
  });
  container.querySelectorAll('.checkbox-square').forEach(btn => {
    btn.addEventListener('click', async () => {
      const msId = parseInt(btn.dataset.msId);
      const goalId = parseInt(btn.dataset.goalId);
      if (btn.classList.contains('checked')) return;
      btn.classList.add('checked');
      try { await apiFetch('PUT', `/goals/${goalId}/milestones/${msId}`, { completed: true }); } catch(e) { btn.classList.remove('checked'); }
    });
  });
  container.querySelectorAll('.cal-goal-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => { window._openGoalId = parseInt(btn.dataset.goalId); loadPage('goals'); });
  });
}

// ── Week grid ─────────────────────────────────────────────────────────────────
function renderWeekGrid(weekStart, weekEnd) {
  const container = document.getElementById('cal-week-view');
  if (!container) return;
  const today = calDateISO(new Date());
  const days = [];
  let cur = calLocalDate(weekStart);
  for (let i = 0; i < 7; i++) {
    days.push(calDateISO(cur));
    cur.setDate(cur.getDate() + 1);
  }
  const dayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  // All-day row — apply filters
  let allDayHtml = `<div class="cal-week-time-label cal-allday-label">All day</div>`;
  days.forEach(iso => {
    const dayData = _calData[iso] || {};
    const rawItems = [
      ...(dayData.events || []).filter(e => e.all_day).map(e => ({ type: 'event', obj: e })),
      ...(dayData.tasks || []).map(t => ({ type: 'task', obj: t })),
      ...(dayData.milestones || []).map(m => ({ type: 'milestone', obj: m })),
      ...(dayData.metrics || []).map(m => ({ type: 'metric', obj: m })),
    ];
    const items = rawItems.filter(item => {
      if (item.type === 'event' && !_calFilters.events) return false;
      if (item.type === 'task') {
        if (!_calFilters.tasks) return false;
        if (_calFilters.hideRecurring && item.obj.is_recurring) return false;
        if (_calTripId) {
          const trip = _calTrips.find(t => t.id === _calTripId);
          if (trip?.tag_id) {
            const full = _calTasks.find(ct => ct.id === item.obj.id);
            if (!full?.tags?.some(tg => tg.id === trip.tag_id)) return false;
          }
        }
      }
      if (item.type === 'milestone' && !_calFilters.milestones) return false;
      if (item.type === 'metric' && !_calFilters.metrics) return false;
      return true;
    });
    const maxShow = 3;
    const overflow = items.length - maxShow;
    let pillsHtml = '';
    items.slice(0, maxShow).forEach(item => {
      const label = item.type === 'metric' ? (item.obj.label || 'Target') : (item.obj.title || 'Item');
      let pillClass = 'cal-item-pill';
      if (item.type === 'event') pillClass += ' pill-event';
      else if (item.type === 'task') {
        if (item.obj.status === 'completed') pillClass += ' pill-task-done';
        else pillClass += iso < today ? ' pill-task-high' : ' pill-task';
      }
      else if (item.type === 'milestone') pillClass += ' pill-milestone';
      else pillClass += ' pill-metric';
      pillsHtml += `<div class="${pillClass}" title="${esc(label)}">${esc(label)}</div>`;
    });
    if (overflow > 0) pillsHtml += `<div class="cal-overflow-chip cal-week-overflow" data-date="${iso}">+${overflow} more</div>`;
    const isToday = iso === today;
    const isSelected = iso === _selectedDate;
    allDayHtml += `<div class="cal-week-allday-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}" data-date="${iso}">${pillsHtml}</div>`;
  });

  // Check if any timed events exist this week
  const timedEvents = [];
  days.forEach((iso, colIdx) => {
    const dayData = _calData[iso] || {};
    (dayData.events || []).filter(e => !e.all_day && e.start_time).forEach(ev => {
      timedEvents.push({ ev, iso, colIdx });
    });
  });
  const hasTimedEvents = timedEvents.length > 0;

  // Hour rows + timed events overlay (only if there are timed events)
  let timeGridHtml = '';
  if (hasTimedEvents) {
    let hoursHtml = '';
    for (let h = CAL_HOUR_START; h < CAL_HOUR_END; h++) {
      const label = h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`;
      hoursHtml += `<div class="cal-week-time-label">${label}</div>`;
      days.forEach(iso => {
        const timeStr = `${String(h).padStart(2,'0')}:00`;
        hoursHtml += `<div class="cal-time-slot${iso === today ? ' today' : ''}" data-date="${iso}" data-time="${timeStr}"></div>`;
      });
    }
    let timedEventsHtml = '';
    timedEvents.forEach(({ ev, iso, colIdx }) => {
      const [sh, sm] = ev.start_time.split(':').map(Number);
      const [eh, em] = ev.end_time ? ev.end_time.split(':').map(Number) : [sh + 1, sm];
      const startOffset = (sh - CAL_HOUR_START) * CAL_HOUR_HEIGHT + (sm / 60 * CAL_HOUR_HEIGHT);
      const duration = Math.max(0.5, (eh - sh) + (em - sm) / 60);
      const height = duration * CAL_HOUR_HEIGHT;
      if (startOffset < 0 || sh < CAL_HOUR_START) return;
      timedEventsHtml += `<div class="cal-timed-event" data-event-id="${ev.id}" data-date="${iso}"
        style="top:${startOffset}px;height:${height - 2}px;left:calc(${(colIdx / 7) * 100}% + 2px);width:calc(${100 / 7}% - 4px)">
        <div style="font-weight:600;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ev.title)}</div>
        <div style="font-size:10px;opacity:.75">${calFmtTime(ev.start_time)}${ev.end_time ? ' – ' + calFmtTime(ev.end_time) : ''}</div>
      </div>`;
    });
    timeGridHtml = `
      <div class="cal-week-body-scroll">
        <div class="cal-week-body" style="position:relative">
          <div class="cal-week-time-grid">${hoursHtml}</div>
          <div class="cal-week-events-overlay" style="position:absolute;top:0;left:48px;right:0;bottom:0;pointer-events:none">
            <div style="position:relative;height:${(CAL_HOUR_END - CAL_HOUR_START) * CAL_HOUR_HEIGHT}px;pointer-events:auto">
              ${timedEventsHtml}
            </div>
          </div>
        </div>
      </div>`;
  } else {
    timeGridHtml = `<div class="cal-week-no-timed"><span>No timed events this week</span><button class="btn btn-secondary btn-sm" id="cal-week-add-timed">+ Add timed event</button></div>`;
  }

  container.innerHTML = `
    <div class="cal-week-grid">
      <div class="cal-week-header-row">
        <div class="cal-week-time-label"></div>
        ${days.map((iso, i) => {
          const d = calLocalDate(iso);
          const isToday = iso === today;
          const isSelected = iso === _selectedDate;
          return `<div class="cal-week-day-header${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}" data-date="${iso}">
            <div class="cal-week-day-name">${dayLabels[i]}</div>
            <div class="cal-week-day-num${isToday ? ' today-num' : ''}">${d.getDate()}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="cal-week-allday-row">${allDayHtml}</div>
      ${timeGridHtml}
    </div>`;

  if (hasTimedEvents) {
    container.querySelectorAll('.cal-time-slot').forEach(slot => {
      slot.addEventListener('click', () => openEventModal(slot.dataset.date, slot.dataset.time, null));
    });
    container.querySelectorAll('.cal-timed-event').forEach(el => {
      el.addEventListener('click', () => {
        const evId = parseInt(el.dataset.eventId);
        const iso = el.dataset.date;
        const ev = ((_calData[iso] || {}).events || []).find(e => e.id === evId);
        if (ev) openEventModal(iso, null, ev);
      });
    });
  } else {
    container.querySelector('#cal-week-add-timed')?.addEventListener('click', () => {
      openEventModal(_calWeekStart, null, null);
    });
  }

  // Overflow chip → open day panel
  container.querySelectorAll('.cal-week-overflow').forEach(chip => {
    chip.addEventListener('click', e => {
      e.stopPropagation();
      openDayPanel(chip.dataset.date);
    });
  });

  // All-day cell click → open day panel
  container.querySelectorAll('.cal-week-allday-cell').forEach(cell => {
    cell.addEventListener('click', e => {
      if (!e.target.closest('.cal-overflow-chip')) {
        openDayPanel(cell.dataset.date);
      }
    });
  });
}

// ── Event modal ───────────────────────────────────────────────────────────────
function openEventModal(date, time, existing) {
  const isEdit = !!existing;
  const title = isEdit ? 'Edit Event' : 'New Event';

  const noteOptions = _calNotes.map(n =>
    `<option value="${n.id}"${existing?.note_id === n.id ? ' selected' : ''}>${esc(n.title)}</option>`
  ).join('');
  const taskOptions = _calTasks.map(t =>
    `<option value="${t.id}"${existing?.task_id === t.id ? ' selected' : ''}>${esc(t.title)}</option>`
  ).join('');

  const allDay = existing ? existing.all_day : !time;
  const startTime = existing?.start_time || time || '';
  const endTime = existing?.end_time || (time ? calAddHour(time) : '');

  const bodyHTML = `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input class="form-input" id="ev-title" type="text" value="${esc(existing?.title || '')}" placeholder="Event title" />
    </div>
    <div class="form-group">
      <label class="form-label">Date</label>
      <input class="form-input" id="ev-date" type="date" value="${existing?.date || date || ''}" />
    </div>
    <div class="form-group">
      <label class="form-label">End date <span style="color:var(--text-muted);font-weight:400">(optional, for multi-day)</span></label>
      <input class="form-input" id="ev-end-date" type="date" value="${existing?.end_date || ''}" />
    </div>
    <div class="form-group" style="flex-direction:row;align-items:center;gap:8px">
      <input type="checkbox" id="ev-allday"${allDay ? ' checked' : ''} style="width:16px;height:16px;accent-color:var(--color-accent)">
      <label class="form-label" for="ev-allday" style="margin:0">All day</label>
    </div>
    <div id="ev-time-fields" style="${allDay ? 'display:none' : ''}">
      <div class="form-group">
        <label class="form-label">Start time</label>
        <input class="form-input" id="ev-start-time" type="time" value="${startTime}" />
      </div>
      <div class="form-group">
        <label class="form-label">End time</label>
        <input class="form-input" id="ev-end-time" type="time" value="${endTime}" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-input" id="ev-notes" rows="2" placeholder="Optional notes">${esc(existing?.notes || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Link to note</label>
      <select class="form-select" id="ev-note-id">
        <option value="">— none —</option>
        ${noteOptions}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Link to task</label>
      <select class="form-select" id="ev-task-id">
        <option value="">— none —</option>
        ${taskOptions}
      </select>
    </div>`;

  const modal = createModal(title, bodyHTML, async () => {
    const titleVal = document.getElementById('ev-title').value.trim();
    if (!titleVal) { alert('Title is required.'); return false; }
    const dateVal = getDateVal(document.getElementById('ev-date'));
    if (!dateVal) { alert('Date is required.'); return false; }
    const allDayVal = document.getElementById('ev-allday').checked;
    const endDateVal = getDateVal(document.getElementById('ev-end-date'));
    const startTimeVal = allDayVal ? null : (document.getElementById('ev-start-time').value || null);
    const endTimeVal = allDayVal ? null : (document.getElementById('ev-end-time').value || null);
    const notesVal = document.getElementById('ev-notes').value.trim() || null;
    const noteIdVal = document.getElementById('ev-note-id').value ? parseInt(document.getElementById('ev-note-id').value) : null;
    const taskIdVal = document.getElementById('ev-task-id').value ? parseInt(document.getElementById('ev-task-id').value) : null;

    try {
      let savedEvent;
      if (isEdit) {
        const body = {
          title: titleVal,
          date: dateVal,
          end_date: endDateVal,
          all_day: allDayVal,
          start_time: startTimeVal,
          end_time: endTimeVal,
          notes: notesVal,
          clear_note_id: noteIdVal === null,
          note_id: noteIdVal,
          clear_task_id: taskIdVal === null,
          task_id: taskIdVal,
        };
        savedEvent = await apiFetch('PUT', `/calendar/events/${existing.id}`, body);
        calRemoveEventFromData(existing.id);
      } else {
        savedEvent = await apiFetch('POST', `/calendar/events`, {
          title: titleVal, date: dateVal, end_date: endDateVal,
          all_day: allDayVal, start_time: startTimeVal, end_time: endTimeVal,
          notes: notesVal, note_id: noteIdVal, task_id: taskIdVal,
        });
      }
      calAddEventToData(savedEvent);
      if (_calView === 'month') {
        renderMonthGrid(null, null, true);
        if (_selectedDate) openDayPanel(_selectedDate);
      } else {
        await calLoadAndRender();
      }
    } catch(e) {
      alert('Failed to save event.');
      return false;
    }
  }, isEdit ? 'Save' : 'Create');

  modal.querySelector('#ev-allday').addEventListener('change', function() {
    document.getElementById('ev-time-fields').style.display = this.checked ? 'none' : '';
  });

  openModal(modal);
}

// ── Add-type menu + modals ────────────────────────────────────────────────────
function showCalAddMenu(anchor, dateStr) {
  document.querySelectorAll('.cal-add-menu').forEach(m => m.remove());
  const menu = document.createElement('div');
  menu.className = 'cal-add-menu';
  menu.innerHTML = `
    <button class="cal-add-menu-item" data-type="event"><span class="cal-add-menu-dot" style="background:var(--neon-blue)"></span>New Event</button>
    <button class="cal-add-menu-item" data-type="task"><span class="cal-add-menu-dot" style="background:#f59e0b"></span>New Task</button>
    <button class="cal-add-menu-item" data-type="milestone"><span class="cal-add-menu-dot" style="background:var(--neon-purple)"></span>New Milestone</button>`;
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.left}px`;
  document.body.appendChild(menu);
  menu.querySelector('[data-type="event"]').addEventListener('click', () => { menu.remove(); openEventModal(dateStr, null, null); });
  menu.querySelector('[data-type="task"]').addEventListener('click', () => { menu.remove(); openTaskModal(dateStr); });
  menu.querySelector('[data-type="milestone"]').addEventListener('click', () => { menu.remove(); openMilestoneModal(dateStr); });
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
}

function openTaskModal(dateStr) {
  const bodyHTML = `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input class="form-input" id="cal-task-title" type="text" placeholder="Task title" />
    </div>
    <div class="form-group">
      <label class="form-label">Priority</label>
      <select class="form-select" id="cal-task-priority">
        <option value="high">High</option>
        <option value="medium" selected>Medium</option>
        <option value="low">Low</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Due date</label>
      <input class="form-input" id="cal-task-due" type="date" value="${dateStr || ''}" />
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-input" id="cal-task-notes" rows="2" placeholder="Optional"></textarea>
    </div>`;
  const modal = createModal('New Task', bodyHTML, async () => {
    const title = document.getElementById('cal-task-title').value.trim();
    if (!title) { alert('Title is required.'); return false; }
    const priority = document.getElementById('cal-task-priority').value;
    const dueDate = getDateVal(document.getElementById('cal-task-due'));
    const notes = document.getElementById('cal-task-notes').value.trim() || null;
    try {
      const task = await apiFetch('POST', '/tasks', { title, priority, due_date: dueDate, notes, status: 'pending' });
      if (dueDate) {
        if (!_calData[dueDate]) _calData[dueDate] = { events: [], tasks: [], milestones: [], metrics: [] };
        const exists = _calData[dueDate].tasks.findIndex(t => t.id === task.id);
        if (exists === -1) _calData[dueDate].tasks.push(task);
      }
      calRerender();
      if (_selectedDate) openDayPanel(_selectedDate);
    } catch(e) { alert('Failed to create task.'); return false; }
  }, 'Create');
  openModal(modal);
}

function openMilestoneModal(dateStr) {
  if (!_calGoals.length) { alert('No goals found. Create a goal first on the Goals page.'); return; }
  const goalOptions = _calGoals.map(g => `<option value="${g.id}">${esc(g.title)}</option>`).join('');
  const bodyHTML = `
    <div class="form-group">
      <label class="form-label">Goal</label>
      <select class="form-select" id="cal-ms-goal">
        <option value="">— select goal —</option>
        ${goalOptions}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Milestone title</label>
      <input class="form-input" id="cal-ms-title" type="text" placeholder="Milestone title" />
    </div>
    <div class="form-group">
      <label class="form-label">Target date</label>
      <input class="form-input" id="cal-ms-date" type="date" value="${dateStr || ''}" />
    </div>`;
  const modal = createModal('New Milestone', bodyHTML, async () => {
    const goalId = parseInt(document.getElementById('cal-ms-goal').value);
    if (!goalId) { alert('Select a goal.'); return false; }
    const title = document.getElementById('cal-ms-title').value.trim();
    if (!title) { alert('Title is required.'); return false; }
    const targetDate = getDateVal(document.getElementById('cal-ms-date'));
    try {
      await apiFetch('POST', `/goals/${goalId}/milestones`, { title, target_date: targetDate });
      await calLoadAndRender();
      if (_selectedDate) openDayPanel(_selectedDate);
    } catch(e) { alert('Failed to create milestone.'); return false; }
  }, 'Create');
  openModal(modal);
}

// ── Data helpers ──────────────────────────────────────────────────────────────
function calAddEventToData(event) {
  const evStart = event.date;
  const evEnd = event.end_date || event.date;
  let cur = calLocalDate(evStart);
  const end = calLocalDate(evEnd);
  while (cur <= end) {
    const iso = calDateISO(cur);
    if (!_calData[iso]) _calData[iso] = { events: [], tasks: [], milestones: [], metrics: [] };
    const existing = _calData[iso].events.findIndex(e => e.id === event.id);
    if (existing === -1) _calData[iso].events.push(event);
    else _calData[iso].events[existing] = event;
    cur.setDate(cur.getDate() + 1);
  }
}

function calRemoveEventFromData(eventId) {
  Object.keys(_calData).forEach(iso => {
    if (_calData[iso].events) {
      _calData[iso].events = _calData[iso].events.filter(e => e.id !== eventId);
    }
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function calDateISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function calLocalDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function calGetMonday(iso) {
  const d = calLocalDate(iso);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return calDateISO(d);
}

function calFmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2,'0')} ${ampm}`;
}

function calAddHour(t) {
  const [h, m] = t.split(':').map(Number);
  const nh = (h + 1) % 24;
  return `${String(nh).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
