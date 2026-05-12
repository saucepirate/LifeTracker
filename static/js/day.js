// ── Day Planner ───────────────────────────────────────────────────────────────

let _dayDate = '';
let _dayData = null;
let _dayContainer = null;
let _dayDoneOpen = true;
let _dayQASection = 'later';
let _dayNoteDebounce = {};
let _dayViewMode = 'split';   // 'split' | 'list'
let _daySugSearch = '';
let _daySugFilter = 'all';    // 'all' | 'due' | 'overdue'
let _dayHiddenEvents = new Set(); // calendar event IDs hidden this session
let _dayNoteOpen = false;
let _dayQATag = null; // selected tag id for quick-add
let _daySugTasksOpen = false;
let _daySugHabitsOpen = false;
let _daySugOpenGoals = new Set();
let _daySugOpenTrips = new Set();
let _daySugOpenProjects = new Set();
let _daySugFinanceOpen = false;
let _daySugFinanceCats = new Set();
let _dayRenderingCurrentSection = false;

const _DAY_HOUR_H = 40;
const _DAY_TL_START = 6;
const _DAY_TL_END = 24;
const _DAY_GOAL_COLORS = ['#00E5FF', '#C450FF', '#FFB800', '#00FF88', '#4D9FFF', '#FF6B9D', '#00D4AA'];

function _dayGoalColor(gid) {
  return _DAY_GOAL_COLORS[(gid || 0) % _DAY_GOAL_COLORS.length];
}

const _DAY_TRIP_COLOR_MAP = {
  teal: '#00D4AA', blue: '#4D9FFF', green: '#00FF88',
  amber: '#FFB800', purple: '#C450FF', coral: '#FF6B9D',
  pink: '#FF6B9D', gray: '#999', red: '#FF2D55',
};

function _dayTripColor(tripId, tripColor) {
  return _DAY_TRIP_COLOR_MAP[tripColor] || _DAY_GOAL_COLORS[(tripId || 0) % _DAY_GOAL_COLORS.length];
}

registerPage('day', function(container) {
  _dayContainer = container;
  _dayDate = window._dayOpenDate || todayISO();
  window._dayOpenDate = null;
  _dayHiddenEvents = new Set();
  _dayLoad();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function _dayFmt12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function _dayFmtMins(m) {
  if (!m) return '';
  const h = Math.floor(m / 60), r = m % 60;
  return h === 0 ? `${r}m` : r > 0 ? `${h}h ${r}m` : `${h}h`;
}

function _dayShiftDate(iso, delta) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _dayFmtLong(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US',
    { weekday:'long', month:'long', day:'numeric', year:'numeric' });
}

function _dayRelLabel(iso) {
  const t = todayISO();
  if (iso === t)                    return 'Today';
  if (iso === _dayShiftDate(t, 1))  return 'Tomorrow';
  if (iso === _dayShiftDate(t, -1)) return 'Yesterday';
  return _dayFmtLong(iso);
}

function _dayHourLabel(h) {
  if (h === 0)  return '12 AM';
  if (h < 12)   return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function _dayToMins(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function _dayLoad() {
  if (window.setFabContext) window.setFabContext({
    dayDate: _dayDate,
    _onAdded: () => _dayLoad(),
  });
  _dayContainer.innerHTML = '<div class="loading-state">Loading…</div>';
  try {
    _dayData = await apiFetch('GET', `/day?date=${_dayDate}`);
    _dayRender();
    _dayInitialScroll();
  } catch(e) {
    _dayContainer.innerHTML = `<div class="empty-state"><p class="empty-state-text">${escHtml(e.message)}</p></div>`;
  }
}

// ── Quick-add parser ──────────────────────────────────────────────────────────

// No AM/PM given: 1–9 → PM (default window 10 AM–9 PM), 10–12 → AM as-is
function _smartH(h, m) {
  if (h >= 1 && h <= 9) return h + 12;
  return h;
}

function _expandCompactTime(s) {
  if (s.includes(':')) return s;
  if (s.length === 3) return `${s[0]}:${s.slice(1)}`;
  if (s.length === 4) return `${s.slice(0, 2)}:${s.slice(2)}`;
  return s;
}

function _dayParseInput(str) {
  if (!str.trim()) return null;
  let title = str.trim();
  let start_time = null, end_time = null, duration_minutes = null;
  let priority = 'medium', plan_date = _dayDate;

  // Expand compact time notation: 830 → 8:30, 1230 → 12:30
  // Applied in time contexts only to avoid mangling unrelated numbers
  title = title.replace(/\b(at\s+)(\d{3,4})\b/gi, (_, pre, t) => pre + _expandCompactTime(t));
  title = title.replace(/\b(\d{3,4})(am|pm)\b/gi, (_, t, ap) => _expandCompactTime(t) + ap);
  title = title.replace(/\b(\d{3,4})\s*([-–]|to)\s*(\d{3,4})\b/gi,
    (_, a, sep, b) => `${_expandCompactTime(a)} ${sep} ${_expandCompactTime(b)}`);
  title = title.replace(/\b(\d{3,4})\s*([-–]|to)\s*(\d{1,2}(?::\d{2})?(?:am|pm)?)\b/gi,
    (_, a, sep, b) => `${_expandCompactTime(a)} ${sep} ${b}`);

  if (/\btonight\b/i.test(title) && !start_time) {
    start_time = '20:00'; title = title.replace(/\btonight\b/i, '').trim();
  }
  if (/\bthis morning\b/i.test(title) && !start_time) {
    start_time = '09:00'; title = title.replace(/\bthis morning\b/i, '').trim();
  }

  // Range: "6 to 7", "2-3pm", "2:30 to 3pm", etc. — trailing AM/PM optional
  const rm = title.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:[-–]|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (rm) {
    let sh = parseInt(rm[1]), sm = parseInt(rm[2]||'0');
    let eh = parseInt(rm[4]), em = parseInt(rm[5]||'0');
    const eap = (rm[6]||'').toLowerCase(), sap = (rm[3]||'').toLowerCase();
    if (eap==='pm' && eh!==12) eh += 12;
    if (eap==='am' && eh===12) eh = 0;
    if (sap==='pm' && sh!==12) sh += 12;
    else if (sap==='am' && sh===12) sh = 0;
    else if (!sap && eap==='pm') {
      if (sh + 12 <= eh) sh += 12; // "2 to 3pm" → 2pm–3pm
    } else if (!sap && !eap) {
      // Neither side has AM/PM — use smart hour for start, then align end
      sh = _smartH(sh, sm);
      if (eh <= sh) { if (eh + 12 > sh) eh += 12; } // "6 to 7" → both PM if needed
    }
    start_time = `${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}`;
    end_time   = `${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`;
    duration_minutes = (eh*60+em) - (sh*60+sm);
    title = title.replace(rm[0], '').trim();
  }

  if (!start_time) {
    // "at 6pm", "at 6:30", "at 6" — AM/PM optional; smart-hour when absent
    const am = title.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    if (am) {
      let h = parseInt(am[1]);
      const m = parseInt(am[2]||'0'), ap = (am[3]||'').toLowerCase();
      if (ap==='pm' && h!==12) h += 12;
      else if (ap==='am' && h===12) h = 0;
      else if (!ap) h = _smartH(h, m);
      start_time = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      title = title.replace(am[0], '').trim();
    }
  }

  const dm = title.match(/\b(\d+(?:\.\d+)?)\s*(m(?:in(?:s)?)?|h(?:r(?:s)?|ours?)?)\b/i);
  if (dm) {
    duration_minutes = dm[2][0].toLowerCase()==='h' ? Math.round(parseFloat(dm[1])*60) : Math.round(parseFloat(dm[1]));
    title = title.replace(dm[0], '').trim();
    if (start_time && !end_time) {
      const [sh, sm_] = start_time.split(':').map(Number);
      const tot = sh*60 + sm_ + duration_minutes;
      end_time = `${String(Math.floor(tot/60)%24).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}`;
    }
  }

  if (/\btomorrow\b/i.test(title)) {
    plan_date = _dayShiftDate(_dayDate, 1); title = title.replace(/\btomorrow\b/i,'').trim();
  }
  const tpM = title.match(/\bt\+(\d+)\b/i);
  if (tpM) { plan_date = _dayShiftDate(_dayDate, parseInt(tpM[1])); title = title.replace(tpM[0],'').trim(); }

  if (/\bhigh\b/i.test(title))      { priority='high'; title=title.replace(/\bhigh\b/i,'').trim(); }
  else if (/\blow\b/i.test(title))  { priority='low';  title=title.replace(/\blow\b/i,'').trim(); }

  title = title.replace(/\s+/g,' ').replace(/^[-,\s]+|[-,\s]+$/g,'').trim();
  if (!title) return null;
  return { title, plan_date, start_time, end_time, duration_minutes, priority, section: _dayQASection };
}

function _dayParsePreview(p) {
  if (!p) return '';
  const parts = [];
  if (p.plan_date !== _dayDate) parts.push(_dayRelLabel(p.plan_date));
  if (p.start_time) {
    let t = _dayFmt12(p.start_time);
    if (p.end_time) t += ' – ' + _dayFmt12(p.end_time);
    parts.push(t);
  }
  if (p.duration_minutes && !p.end_time) parts.push(_dayFmtMins(p.duration_minutes));
  if (p.priority !== 'medium') parts.push(p.priority);
  return parts.join(' · ');
}

// ── Overlap detection ─────────────────────────────────────────────────────────

function _dayAssignCols(cluster) {
  const colEnds = [];
  return cluster.map(item => {
    let col = colEnds.findIndex(end => end <= item._startM);
    if (col === -1) { col = colEnds.length; colEnds.push(0); }
    colEnds[col] = item._endM;
    return { ...item, _colIdx: col };
  });
}

function _dayComputeOverlapCols(items) {
  const sorted = [...items].sort((a, b) => _dayToMins(a.start_time) - _dayToMins(b.start_time));
  const result = [];
  let cluster = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const assigned = _dayAssignCols(cluster);
    const colCount = Math.max(...assigned.map(i => i._colIdx)) + 1;
    assigned.forEach(i => { i._colCount = colCount; });
    result.push(...assigned);
    cluster = [];
    clusterEnd = -1;
  };

  for (const item of sorted) {
    const startM = _dayToMins(item.start_time);
    const endM   = item.end_time ? _dayToMins(item.end_time) : startM + 60;
    if (startM >= clusterEnd) flush();
    cluster.push({ ...item, _startM: startM, _endM: endM });
    clusterEnd = Math.max(clusterEnd, endM);
  }
  flush();
  return result;
}

// ── Main render ───────────────────────────────────────────────────────────────

function _dayRender() {
  const d = _dayData;
  if (!d) return;

  const total   = d.stats.total;
  const done    = d.stats.completed;
  const pct     = total > 0 ? Math.round(done / total * 100) : 0;
  const isToday = _dayDate === todayISO();
  const nowNextHTML = isToday ? _dayNowNextHTML(d) : '';
  const _linkedCalIds = new Set(d.plan_items.map(i => i.cal_event_id).filter(Boolean));
  const visibleEvents = d.calendar_events.filter(e => !_dayHiddenEvents.has(e.id) && !_linkedCalIds.has(e.id));

  _dayContainer.innerHTML = `
    <div class="dp-page">

      <div class="dp-topbar">
        <div class="dp-header">
          <div class="dp-date-row">
            <div class="dp-date-title">
              ${_dayRelLabel(_dayDate)}
              ${!isToday ? `<span class="dp-date-subtitle">${_dayFmtLong(_dayDate)}</span>` : ''}
            </div>
            <div class="dp-date-nav">
              <div class="dp-view-toggle">
                <button class="dp-view-btn${_dayViewMode==='split'?' active':''}" data-view="split">⊞ Timeline</button>
                <button class="dp-view-btn${_dayViewMode==='list'?' active':''}" data-view="list">≡ List</button>
              </div>
              <button class="dp-nav-btn" id="dp-prev">← Prev</button>
              ${!isToday ? `<button class="dp-nav-btn dp-nav-btn--today" id="dp-today">Today</button>` : ''}
              <button class="dp-nav-btn" id="dp-next">Next →</button>
            </div>
          </div>
          <div class="dp-stats-row">
            <div class="dp-stats-bar"><div class="dp-stats-fill" style="width:${pct}%"></div></div>
            ${done > 0 || total > 0
              ? `<span><span class="dp-stat-num">${done}</span> / <span class="dp-stat-num">${total}</span> done${d.stats.scheduled_minutes > 0 ? ` · <span class="dp-stat-num">${_dayFmtMins(d.stats.scheduled_minutes)}</span> scheduled` : ''}</span>`
              : `<span style="color:var(--text-muted)">Nothing planned yet — use quick add or sidebar</span>`}
          </div>
        </div>

        <div class="dp-quick-add-row">
          <div class="dp-qa-wrap">
            <input class="dp-qa-input" id="dp-qa-input"
              placeholder="Quick add… 'Team meeting 2-3pm' · 'Walk 30m at 6pm high'" autocomplete="off" />
            <span class="dp-qa-preview" id="dp-qa-preview"></span>
          </div>
          <button class="dp-qa-add-btn" id="dp-qa-btn">Add</button>
          ${_dayRenderTagChips(d.tags || [])}
          <div class="dp-qa-section">
            <button class="dp-qa-sec-btn${_dayQASection==='must_do'?' active':''}" data-sec="must_do">★ Must Do</button>
            <button class="dp-qa-sec-btn${_dayQASection==='later'?' active':''}" data-sec="later">+ Later</button>
            <button class="dp-qa-sec-btn${_dayQASection==='like_to_do'?' active':''}" data-sec="like_to_do">♡ Like to Do</button>
          </div>
        </div>

        ${nowNextHTML}
      </div>

      <div class="dp-main-layout">

        <div class="dp-center-col">
          <div class="dp-body${_dayViewMode==='list' ? ' dp-body--list' : ''}">
            ${_dayViewMode !== 'list'
              ? `<div class="dp-tl-panel" id="dp-tl-panel">${_dayRenderTimeline(d, visibleEvents)}</div>`
              : ''}
            <div class="dp-list-panel">${_dayRenderList(d, visibleEvents)}</div>
          </div>
        </div>

        <div class="dp-sug-sidebar" id="dp-sug-sidebar">
          ${_dayRenderSugSidebar(d)}
        </div>

      </div>
    </div>`;

  _dayBindEvents();
}

function _dayInitialScroll() {
  const isToday = _dayDate === todayISO();
  if (isToday && _dayViewMode !== 'list') {
    requestAnimationFrame(() => {
      const tl = document.getElementById('dp-tl-panel');
      if (!tl) return;
      const now = new Date();
      const nowH = now.getHours() + now.getMinutes() / 60;
      if (nowH >= _DAY_TL_START && nowH <= _DAY_TL_END)
        tl.scrollTop = Math.max(0, (nowH - _DAY_TL_START - 1.5) * _DAY_HOUR_H);
    });
  }
}

async function _dayReloadAndRender() {
  const tlScroll   = document.getElementById('dp-tl-panel')?.scrollTop ?? 0;
  const listScroll = _dayContainer.querySelector('.dp-list-panel')?.scrollTop ?? 0;
  _dayData = await apiFetch('GET', `/day?date=${_dayDate}`);
  _dayRender();
  requestAnimationFrame(() => {
    const tl   = document.getElementById('dp-tl-panel');
    const list = _dayContainer.querySelector('.dp-list-panel');
    if (tl)   tl.scrollTop   = tlScroll;
    if (list) list.scrollTop = listScroll;
  });
}

// ── Now / Next card ───────────────────────────────────────────────────────────

function _dayNowNextHTML(d) {
  const nowH = new Date().getHours() + new Date().getMinutes() / 60;
  const allTimed = [
    ...d.calendar_events.filter(e => !e.all_day && e.start_time && !_dayHiddenEvents.has(e.id)).map(e => ({
      title: e.title, start_time: e.start_time, end_time: e.end_time, type: 'event',
    })),
    ...d.plan_items.filter(i => i.start_time && i.status !== 'done').map(i => ({
      title: i.title, start_time: i.start_time, end_time: i.end_time, type: i.source_type,
    })),
  ].sort((a, b) => a.start_time.localeCompare(b.start_time));

  if (!allTimed.length) return '';

  const toH = t => { const [h, m] = t.split(':').map(Number); return h + m/60; };
  let current = null, next = null;
  for (const item of allTimed) {
    const sh = toH(item.start_time);
    const eh = item.end_time ? toH(item.end_time) : sh + 1;
    if (sh <= nowH && nowH < eh)        { current = item; }
    else if (sh > nowH && next === null) { next = item; }
  }
  if (!current && !next) return '';

  const blockHTML = (item, label, labelClass) => `
    <div class="dp-now-block">
      <span class="dp-now-label${labelClass}">${label}</span>
      <span class="dp-now-time">${_dayFmt12(item.start_time)}${item.end_time ? ' – '+_dayFmt12(item.end_time):''}</span>
      <span class="dp-now-title">${escHtml(item.title)}</span>
    </div>`;

  return `<div class="dp-now-bar">
    ${current ? blockHTML(current, 'Now', ' dp-now-label--now') : ''}
    ${next    ? blockHTML(next,    'Next', '') : ''}
  </div>`;
}

// ── Timeline ──────────────────────────────────────────────────────────────────

function _dayRenderTimeline(d, visibleEvents) {
  const totalH = (_DAY_TL_END - _DAY_TL_START) * _DAY_HOUR_H;

  const hours = [];
  for (let h = _DAY_TL_START; h < _DAY_TL_END; h++) {
    hours.push(`<div class="dp-tl-hour">
      <span class="dp-tl-label">${_dayHourLabel(h)}</span>
      <div class="dp-tl-cell" data-hour="${h}"></div>
    </div>`);
  }

  let nowLine = '';
  if (_dayDate === todayISO()) {
    const now = new Date();
    const nowH = now.getHours() + now.getMinutes() / 60;
    if (nowH >= _DAY_TL_START && nowH <= _DAY_TL_END) {
      const top = (nowH - _DAY_TL_START) * _DAY_HOUR_H;
      nowLine = `<div class="dp-tl-now" style="top:${top}px"></div>`;
    }
  }

  // Collect timed items for overlap computation
  const timedItems = [];
  for (const ev of visibleEvents) {
    if (ev.all_day || !ev.start_time) continue;
    timedItems.push({ ...ev, _kind: 'event', _type: 'event', _isDone: false });
  }
  for (const item of d.plan_items) {
    if (!item.start_time) continue;
    timedItems.push({ ...item, _kind: 'plan', _type: item.source_type, _isDone: item.status === 'done' });
  }

  const positioned = _dayComputeOverlapCols(timedItems);
  const blocks = positioned.map(item => _dayMakeTlBlock(item)).join('');

  return `<div class="dp-tl-inner" style="height:${totalH}px">
    ${hours.join('')}
    <div class="dp-tl-blocks">
      ${nowLine}
      ${blocks}
    </div>
  </div>`;
}

function _dayMakeTlBlock(item) {
  const [sh, sm] = item.start_time.split(':').map(Number);
  const top = (sh + sm/60 - _DAY_TL_START) * _DAY_HOUR_H;
  const totalH = (_DAY_TL_END - _DAY_TL_START) * _DAY_HOUR_H;
  if (top < 0 || top >= totalH) return '';

  let height = _DAY_HOUR_H;
  if (item.end_time) {
    const [eh, em] = item.end_time.split(':').map(Number);
    height = Math.max(22, ((eh + em/60) - (sh + sm/60)) * _DAY_HOUR_H);
  } else if (item.duration_minutes) {
    height = Math.max(22, item.duration_minutes / 60 * _DAY_HOUR_H);
  }

  const colIdx   = item._colIdx   || 0;
  const colCount = item._colCount || 1;
  const colW     = 100 / colCount;
  const leftPct  = colIdx * colW;
  const rightPct = 100 - (colIdx + 1) * colW;
  const pad = colCount > 1 ? 1 : 2;

  const timeStr = item.end_time
    ? `${_dayFmt12(item.start_time)} – ${_dayFmt12(item.end_time)}`
    : _dayFmt12(item.start_time);

  const hideBtn = item._kind === 'event'
    ? `<button class="dp-item-check dp-tl-complete-btn" data-action="complete-event" data-event-id="${item.id}" title="Mark done" style="position:absolute;top:3px;right:3px;width:16px;height:16px;min-width:0"></button>`
    : '';

  const tagColorStyle = item.tag_color
    ? `background:var(--tag-${item.tag_color}-bg);border-color:var(--tag-${item.tag_color}-text);`
    : '';

  return `<div class="dp-tl-block dp-tl-block--${item._type}${item._isDone?' dp-tl-block--done':''}"
    style="top:${top}px;height:${height}px;left:calc(${leftPct}% + ${pad}px);right:calc(${rightPct}% + ${pad}px);${tagColorStyle}"
    title="${escHtml(item.title)}">
    ${hideBtn}
    <div class="dp-tl-block-title">${escHtml(item.title)}</div>
    ${height > 32 ? `<div class="dp-tl-block-time">${timeStr}</div>` : ''}
  </div>`;
}

// ── List panel ────────────────────────────────────────────────────────────────

function _dayRenderList(d, visibleEvents) {
  const items     = d.plan_items;
  const doneItems = items.filter(i => i.status==='done');
  const skipped   = items.filter(i => i.status==='skipped');

  const isToday = _dayDate === todayISO();
  const nowStr  = isToday
    ? `${String(new Date().getHours()).padStart(2,'0')}:${String(new Date().getMinutes()).padStart(2,'0')}`
    : '00:00';

  const _effectiveEnd = i => {
    if (i.end_time) return i.end_time;
    if (i.start_time && i.duration_minutes) {
      const [h, m] = i.start_time.split(':').map(Number);
      const tot = h * 60 + m + i.duration_minutes;
      return `${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}`;
    }
    return null;
  };

  // Plan items: split started items into current / past
  const started = isToday
    ? items.filter(i => i.status === 'planned' && i.start_time && i.start_time <= nowStr)
    : [];
  const current = started.filter(i => { const e = _effectiveEnd(i); return e && e > nowStr; });
  const past    = started.filter(i => { const e = _effectiveEnd(i); return !e || e <= nowStr; });
  const pastIds = new Set([...current, ...past].map(i => i.id));
  const mustDo   = items.filter(i => i.section==='must_do'    && i.status==='planned' && !pastIds.has(i.id));
  const later    = items.filter(i => i.section==='later'      && i.status==='planned' && !pastIds.has(i.id));
  const likeToDo = items.filter(i => i.section==='like_to_do' && i.status==='planned' && !pastIds.has(i.id));

  // Sort plan item buckets by start_time (nulls last)
  const byTime = (a, b) => (a.start_time || 'zz').localeCompare(b.start_time || 'zz');
  current.sort(byTime); past.sort(byTime); later.sort(byTime);

  // Merge calendar events into Later as pseudo-items
  for (const ev of visibleEvents) {
    later.push({
      _isCalEvent: true,
      id: ev.id, title: ev.title,
      start_time: ev.start_time, end_time: ev.end_time, all_day: ev.all_day,
      tag_name: ev.tag_name, tag_color: ev.tag_color,
      status: 'planned', section: 'later', source_type: 'manual',
      duration_minutes: null, goal_id: null, goal_title: null,
      task_id: null, habit_id: null, priority: 'medium',
    });
  }
  later.sort(byTime);

  return `
    ${_dayRenderNoteFields(d)}
    <div class="dp-list-tworow">
      <div>
        ${past.length    ? _dayRenderSection('Past',    past,    'past',    '') : ''}
        ${current.length ? _dayRenderSection('Current', current, 'current', '') : ''}
        ${_dayRenderSection('Later', later, 'later', 'Nothing queued yet')}
      </div>
      <div>
        ${_dayRenderSection('Must Do', mustDo, 'must_do', 'Nothing marked as must-do yet')}
        ${likeToDo.length > 0 ? _dayRenderSection('Like to Do', likeToDo, 'like_to_do', '') : ''}
      </div>
    </div>
    ${_dayRenderDoneSection([...doneItems, ...skipped])}`;
}

function _dayRenderNoteFields(d) {
  return `<div class="dp-list-note">
    <div class="dp-list-note-fields">
      <div class="dp-list-note-field">
        <label>Morning Plan</label>
        <textarea id="dp-note-morning" class="dp-list-note-ta" placeholder="What will you accomplish today?">${escHtml(d.note.morning_plan)}</textarea>
      </div>
      <div class="dp-list-note-field">
        <label>Evening Reflection</label>
        <textarea id="dp-note-evening" class="dp-list-note-ta" placeholder="How did today go?">${escHtml(d.note.evening_reflection)}</textarea>
      </div>
    </div>
    <span class="dp-note-saved" id="dp-note-saved">Saved</span>
  </div>`;
}

function _dayRenderTagChips(tags) {
  if (!tags || !tags.length) return '';
  const chips = tags.map(t => {
    const active = _dayQATag === t.id;
    return `<button class="dp-qa-tag${active ? ' active' : ''}" data-tag-id="${t.id}" data-tag-color="${t.color}"
      style="background:var(--tag-${t.color}-bg);color:var(--tag-${t.color}-text);border-color:${active ? `var(--tag-${t.color}-text)` : 'transparent'}"
      title="Tag: ${escHtml(t.name)}">${escHtml(t.name)}</button>`;
  }).join('');
  return `<div class="dp-qa-tags">${chips}</div>`;
}

function _dayRenderSection(name, items, key, emptyMsg) {
  const nameClass = key === 'must_do'    ? ' dp-section-name--mustdo'
                  : key === 'current'   ? ' dp-section-name--current'
                  : key === 'past'      ? ' dp-section-name--past'
                  : key === 'later'     ? ' dp-section-name--later'
                  : key === 'like_to_do'? ' dp-section-name--liketodo'
                  : '';
  if (key === 'current') _dayRenderingCurrentSection = true;
  const content = items.length
    ? items.map(_dayItemHTML).join('')
    : `<div class="dp-empty-section">${emptyMsg}</div>`;
  _dayRenderingCurrentSection = false;
  return `<div class="dp-section">
    <div class="dp-section-hdr">
      <span class="dp-section-name${nameClass}">${name}</span>
      ${items.length > 0 ? `<span class="dp-section-count">${items.length}</span>` : ''}
    </div>
    ${content}
  </div>`;
}

function _dayRenderDoneSection(items) {
  if (!items.length) return '';
  return `<div class="dp-section">
    <div class="dp-section-hdr">
      <span class="dp-section-name dp-section-name--done">Completed</span>
      <span class="dp-section-count">${items.length}</span>
      <button class="dp-item-act" id="dp-done-toggle" style="margin-left:auto;opacity:1;font-size:11px">${_dayDoneOpen?'▲ hide':'▼ show'}</button>
    </div>
    <div id="dp-done-items">${_dayDoneOpen ? items.map(_dayItemHTML).join('') : ''}</div>
  </div>`;
}

function _dayItemHTML(item) {
  const isDone    = item.status === 'done';
  const isSkipped = item.status === 'skipped';

  const check = isDone
    ? `<button class="dp-item-check dp-item-check--done" data-action="uncomplete" data-id="${item.id}" title="Mark undone">✓</button>`
    : item._isCalEvent
      ? `<button class="dp-item-check" data-action="complete-event" data-event-id="${item.id}" title="Mark done"></button>`
      : `<button class="dp-item-check" data-action="complete" data-id="${item.id}" title="Mark done"></button>`;

  let timePart = '';
  if (item.start_time) {
    let t = _dayFmt12(item.start_time);
    if (item.end_time) t += ' – ' + _dayFmt12(item.end_time);
    timePart = `<span class="dp-item-time">${t}</span>`;
  } else if (item.duration_minutes) {
    timePart = `<span class="dp-item-dur">${_dayFmtMins(item.duration_minutes)}</span>`;
  }

  const _badgeLabel = {
    task: 'task', habit: 'habit', event: 'event',
    finance_action: 'finance', project_task: 'project', project_milestone: 'milestone',
  };
  const badge = item.source_type !== 'manual'
    ? `<span class="dp-source-badge dp-source-badge--${item.source_type}">${_badgeLabel[item.source_type] || item.source_type}</span>`
    : '';

  // Context badges: goal, trip, tag
  const contextBadges = [];
  if (item.goal_title) {
    const c = _dayGoalColor(item.goal_id);
    contextBadges.push(`<span class="dp-sug-assoc" style="background:${c}22;color:${c};border-color:${c}66">${escHtml(item.goal_title)}</span>`);
  }
  if (item.task_id && _dayData) {
    const taskInfo = (_dayData.all_tasks || []).find(t => t.id === item.task_id);
    if (taskInfo && taskInfo.trip_name) {
      const tripData = (_dayData.trips_sidebar || []).find(tr => tr.id === taskInfo.trip_id);
      const c = tripData ? _dayTripColor(tripData.id, tripData.color) : '#4D9FFF';
      contextBadges.push(`<span class="dp-sug-assoc" style="background:${c}22;color:${c};border-color:${c}66">${escHtml(taskInfo.trip_name)}</span>`);
    }
  }
  if (item.project_title) {
    const c = (typeof PROJ_COLOR_HEX !== 'undefined' && PROJ_COLOR_HEX[item.project_color]) || '#C450FF';
    contextBadges.push(`<span class="dp-sug-assoc" style="background:${c}22;color:${c};border-color:${c}66">${escHtml(item.project_title)}</span>`);
  }
  if (item.tag_name) {
    contextBadges.push(`<span class="tag-badge tag-${item.tag_color || 'gray'}">${escHtml(item.tag_name)}</span>`);
  }
  const goalBadge = contextBadges.join('');

  const actions = item._isCalEvent ? `
    <div class="dp-item-actions">
      <button class="dp-item-act dp-item-act--del" data-action="delete-cal-event" data-event-id="${item.id}" title="Remove">✕</button>
    </div>` : isDone || isSkipped ? `
    <div class="dp-item-actions">
      <button class="dp-item-act dp-item-act--del" data-action="delete" data-id="${item.id}" title="Remove">✕</button>
    </div>` : `
    <div class="dp-item-actions">
      ${item.section === 'must_do' ? `
        <button class="dp-item-act dp-item-act--move" data-action="to-liketodo" data-id="${item.id}" title="Move to Like to Do">♡ Like</button>
        <button class="dp-item-act dp-item-act--move" data-action="to-later"    data-id="${item.id}" title="Move to Later">↓ Later</button>`
      : item.section === 'like_to_do' ? `
        <button class="dp-item-act dp-item-act--move" data-action="to-mustdo" data-id="${item.id}" title="Move to Must Do">★ Must Do</button>
        <button class="dp-item-act dp-item-act--move" data-action="to-later"  data-id="${item.id}" title="Move to Later">↓ Later</button>`
      : `<button class="dp-item-act dp-item-act--move" data-action="to-mustdo" data-id="${item.id}" title="Move to Must Do">↑ Must Do</button>`}
      <button class="dp-item-act dp-item-act--move" data-action="tomorrow" data-id="${item.id}" title="Move to tomorrow">→ tmrw</button>
      <button class="dp-item-act dp-item-act--del" data-action="delete" data-id="${item.id}" title="Remove">✕</button>
    </div>`;

  return `<div class="dp-item${isDone?' dp-item--done':''}${isSkipped?' dp-item--skipped':''}${_dayRenderingCurrentSection?' dp-item--current':''}" data-id="${item.id}">
    ${check}
    <div class="dp-item-body">
      <div class="dp-item-title">${escHtml(item.title)}</div>
      <div class="dp-item-meta">
        ${timePart}${badge}${goalBadge}
        ${item.priority !== 'medium' ? `<span class="dp-prio-dot dp-prio-dot--${item.priority}" title="${item.priority} priority"></span>` : ''}
      </div>
    </div>
    ${actions}
  </div>`;
}

// ── Suggestions sidebar ───────────────────────────────────────────────────────

function _dayRenderSugSidebar(d) {
  const allTasks = d.all_tasks || [];
  const plannedTaskIds  = new Set(d.plan_items.filter(i => i.task_id).map(i => i.task_id));
  const plannedHabitIds = new Set(d.plan_items.filter(i => i.habit_id).map(i => i.habit_id));

  // Filter tasks — exclude trip-tagged tasks (shown in Trips section)
  const tripTaskIds = new Set(allTasks.filter(t => t.trip_id).map(t => t.id));
  let tasks = allTasks.filter(t => !plannedTaskIds.has(t.id) && !tripTaskIds.has(t.id));
  if (_daySugFilter === 'due')     tasks = tasks.filter(t => t.due_date === _dayDate);
  else if (_daySugFilter === 'overdue') tasks = tasks.filter(t => t.due_date && t.due_date < _dayDate);
  if (_daySugSearch.trim()) {
    const q = _daySugSearch.trim().toLowerCase();
    tasks = tasks.filter(t => t.title.toLowerCase().includes(q));
  }

  const totalCount = tasks.length;
  const displayTasks = tasks.slice(0, 40);

  // Habits — hidden when a date filter is active (habits have no due dates)
  const habits = _daySugFilter !== 'all' ? [] : [...(d.suggestions.habits || [])]
    .filter(h => !plannedHabitIds.has(h.habit_id))
    .sort((a, b) => {
      if (a.logged_today !== b.logged_today) return a.logged_today ? 1 : -1;
      return (b.weekly_target_minutes || 0) - (a.weekly_target_minutes || 0);
    });

  const taskRows = displayTasks.map(t => {
    const isOverdue = t.due_date && t.due_date < _dayDate;
    const isDue     = t.due_date === _dayDate;
    const dueMeta   = isOverdue
      ? `<span class="dp-sug-meta-overdue">⚠ ${formatDateShort(t.due_date)}</span>`
      : isDue
      ? `<span class="dp-sug-meta-due">Due today</span>`
      : t.due_date
      ? `<span class="dp-sug-meta-date">${formatDateShort(t.due_date)}</span>`
      : '';
    const assocBadges = [
      t.goal_title ? `<span class="dp-sug-assoc dp-sug-assoc--goal">${escHtml(t.goal_title)}</span>` : '',
      t.trip_name  ? `<span class="dp-sug-assoc dp-sug-assoc--trip">${escHtml(t.trip_name)}</span>`  : '',
      t.note_title ? `<span class="dp-sug-assoc dp-sug-assoc--note">${escHtml(t.note_title)}</span>` : '',
    ].join('');
    return `<div class="dp-sug-row">
      <div class="dp-sug-row-body">
        <div class="dp-sug-row-title">${escHtml(t.title)}</div>
        <div class="dp-sug-row-meta">${dueMeta}<span class="dp-prio-dot dp-prio-dot--${t.priority}"></span>${assocBadges}</div>
      </div>
      <div class="dp-sug-row-acts">
        <button class="dp-sug-act dp-sug-act--star" data-sug-type="task"
          data-task-id="${t.id}" data-title="${escHtml(t.title)}" data-priority="${t.priority}"
          data-section="must_do" title="Add to Must Do">★</button>
        <button class="dp-sug-act dp-sug-act--like" data-sug-type="task"
          data-task-id="${t.id}" data-title="${escHtml(t.title)}" data-priority="${t.priority}"
          data-section="like_to_do" title="Add to Like to Do">♡</button>
        <button class="dp-sug-act" data-sug-type="task"
          data-task-id="${t.id}" data-title="${escHtml(t.title)}" data-priority="${t.priority}"
          data-section="later" title="Add to Later">+</button>
      </div>
    </div>`;
  }).join('');

  // Group habits by goal
  const habitGoalOrder = [];
  const habitsByGoal = {};
  for (const h of habits) {
    if (!habitsByGoal[h.goal_id]) {
      habitsByGoal[h.goal_id] = { goal_title: h.goal_title, habits: [] };
      habitGoalOrder.push(h.goal_id);
    }
    habitsByGoal[h.goal_id].habits.push(h);
  }

  const habitRows = habitGoalOrder.map((gid) => {
    const group = habitsByGoal[gid];
    const goalColor = _dayGoalColor(gid);
    const isOpen = _daySugOpenGoals.has(gid);
    const rows = group.habits.map(h => {
      const dur = h.weekly_target_minutes
        ? Math.round(h.weekly_target_minutes / Math.max(h.min_days_per_week || 5, 1))
        : 30;
      const logged = h.logged_today;
      return `<div class="dp-sug-row${logged?' dp-sug-row--logged':''}">
        <div class="dp-sug-row-body">
          <div class="dp-sug-row-title" style="${logged?'color:var(--text-muted);text-decoration:line-through':''}">${escHtml(h.label)}</div>
          ${dur ? `<div class="dp-sug-row-meta"><span class="dp-sug-meta-date">~${_dayFmtMins(dur)}</span>${logged?` <span style="color:var(--neon-green);font-size:10px">✓ logged</span>`:''}</div>` : ''}
        </div>
        ${!logged ? `<div class="dp-sug-row-acts">
          <button class="dp-sug-act dp-sug-act--star" data-sug-type="habit"
            data-habit-id="${h.habit_id}" data-goal-id="${h.goal_id}"
            data-title="${escHtml(h.label)}" data-dur="${dur}" data-section="must_do" title="Add to Must Do">★</button>
          <button class="dp-sug-act dp-sug-act--like" data-sug-type="habit"
            data-habit-id="${h.habit_id}" data-goal-id="${h.goal_id}"
            data-title="${escHtml(h.label)}" data-dur="${dur}" data-section="like_to_do" title="Add to Like to Do">♡</button>
          <button class="dp-sug-act" data-sug-type="habit"
            data-habit-id="${h.habit_id}" data-goal-id="${h.goal_id}"
            data-title="${escHtml(h.label)}" data-dur="${dur}" data-section="later" title="Add to Later">+</button>
        </div>` : `<span class="dp-sug-logged-chk">✓</span>`}
      </div>`;
    }).join('');
    return `<div class="dp-sug-goal-group" style="border-left:3px solid ${goalColor}90;padding-left:7px;margin-bottom:4px;">
      <div class="dp-sug-goal-label dp-sug-goal-hdr" data-goal-id="${gid}" style="cursor:pointer;display:flex;align-items:center;gap:5px;">
        <span class="dp-sug-goal-pill" style="background:${goalColor}22;color:${goalColor};border-color:${goalColor}66">${escHtml(group.goal_title)}</span>
        <span class="dp-sug-count-badge">${group.habits.length}</span>
        <span class="dp-sug-toggle" style="color:${goalColor}">${isOpen ? '▾' : '▸'}</span>
      </div>
      ${isOpen ? rows : ''}
    </div>`;
  }).join('');

  return `
    <div class="dp-sug-sb-hdr">Add to Plan</div>

    <div class="dp-sug-sb-search-row">
      <input class="dp-sug-search-input" id="dp-sug-search"
        placeholder="Search tasks…" value="${escHtml(_daySugSearch)}" autocomplete="off" />
    </div>

    <div class="dp-sug-sb-filters">
      <button class="dp-sug-filt${_daySugFilter==='all'?' active':''}" data-filt="all">All</button>
      <button class="dp-sug-filt${_daySugFilter==='due'?' active':''}" data-filt="due">Due Today</button>
      <button class="dp-sug-filt${_daySugFilter==='overdue'?' active':''}" data-filt="overdue">Overdue</button>
    </div>

    <div class="dp-sug-sb-section">
      <div class="dp-sug-sb-label dp-sug-sect-hdr" data-sect="tasks" style="cursor:pointer;color:var(--neon-amber);font-size:13px;text-transform:none;letter-spacing:0">
        Tasks
        ${totalCount > 0 ? `<span class="dp-sug-count-badge">${totalCount}</span>` : ''}
        <span class="dp-sug-toggle">${_daySugTasksOpen ? '▾' : '▸'}</span>
      </div>
      ${_daySugTasksOpen ? `
        ${displayTasks.length === 0
          ? `<div class="dp-sug-empty">${
              _daySugSearch ? 'No tasks match your search'
              : _daySugFilter !== 'all' ? 'No tasks match this filter'
              : 'All tasks are planned or have no due date set — try "All" filter'
            }</div>`
          : taskRows}
        ${totalCount > 40 ? `<div class="dp-sug-more">Showing 40 of ${totalCount} — search to narrow down</div>` : ''}
      ` : ''}
    </div>

    ${habits.length > 0 ? `
    <div class="dp-sug-sb-section dp-sug-sb-section--habits">
      <div class="dp-sug-sb-label dp-sug-sect-hdr" data-sect="habits" style="cursor:pointer;color:var(--neon-green);font-size:13px;text-transform:none;letter-spacing:0">
        Habits <span class="dp-sug-count-badge">${habits.length}</span>
        <span class="dp-sug-toggle">${_daySugHabitsOpen ? '▾' : '▸'}</span>
      </div>
      ${_daySugHabitsOpen ? habitRows : ''}
    </div>` : ''}

    ${_dayRenderSugTrips(d)}
    ${_dayRenderSugProjects(d)}
    ${_dayRenderSugFinance(d)}`;
}

function _dayRenderSugTrips(d) {
  const trips = d.trips_sidebar || [];
  if (!trips.length) return '';
  const plannedTaskIds = new Set(d.plan_items.filter(i => i.task_id).map(i => i.task_id));

  const tripGroups = trips.map(tr => {
    const c = _dayTripColor(tr.id, tr.color);
    const isOpen = _daySugOpenTrips.has(tr.id);
    let unplanned = tr.tasks.filter(t => !plannedTaskIds.has(t.id));
    if (_daySugFilter === 'due')     unplanned = unplanned.filter(t => t.due_date === _dayDate);
    else if (_daySugFilter === 'overdue') unplanned = unplanned.filter(t => t.due_date && t.due_date < _dayDate);
    if (!unplanned.length) return '';
    const rows = unplanned.map(t => {
      const isOverdue = t.due_date && t.due_date < _dayDate;
      const isDue     = t.due_date === _dayDate;
      const dueMeta   = isOverdue
        ? `<span class="dp-sug-meta-overdue">⚠ ${formatDateShort(t.due_date)}</span>`
        : isDue ? `<span class="dp-sug-meta-due">Due today</span>`
        : t.due_date ? `<span class="dp-sug-meta-date">${formatDateShort(t.due_date)}</span>` : '';
      return `<div class="dp-sug-row">
        <div class="dp-sug-row-body">
          <div class="dp-sug-row-title">${escHtml(t.title)}</div>
          <div class="dp-sug-row-meta">${dueMeta}<span class="dp-prio-dot dp-prio-dot--${t.priority}"></span></div>
        </div>
        <div class="dp-sug-row-acts">
          <button class="dp-sug-act dp-sug-act--star" data-sug-type="task"
            data-task-id="${t.id}" data-title="${escHtml(t.title)}" data-priority="${t.priority}"
            data-section="must_do" title="Add to Must Do">★</button>
          <button class="dp-sug-act dp-sug-act--like" data-sug-type="task"
            data-task-id="${t.id}" data-title="${escHtml(t.title)}" data-priority="${t.priority}"
            data-section="like_to_do" title="Add to Like to Do">♡</button>
          <button class="dp-sug-act" data-sug-type="task"
            data-task-id="${t.id}" data-title="${escHtml(t.title)}" data-priority="${t.priority}"
            data-section="later" title="Add to Later">+</button>
        </div>
      </div>`;
    }).join('');
    return `<div class="dp-sug-goal-group" style="border-left:3px solid ${c}90;padding-left:7px;margin-bottom:4px;">
      <div class="dp-sug-goal-label dp-sug-trip-hdr" data-trip-id="${tr.id}" style="cursor:pointer;display:flex;align-items:center;gap:5px;">
        <span class="dp-sug-goal-pill" style="background:${c}22;color:${c};border-color:${c}66">${escHtml(tr.name)}</span>
        <span class="dp-sug-count-badge">${unplanned.length}</span>
        <span class="dp-sug-toggle" style="color:${c}">${isOpen ? '▾' : '▸'}</span>
      </div>
      ${isOpen ? rows : ''}
    </div>`;
  }).join('');

  if (!tripGroups.trim()) return '';
  const totalTrip = trips.reduce((s, tr) => s + tr.tasks.filter(t => !plannedTaskIds.has(t.id)).length, 0);
  const tripsExpanded = _daySugOpenTrips.size > 0;
  return `
    <div class="dp-sug-sb-section" style="border-top:1px solid var(--border-subtle);padding-top:10px;">
      <div class="dp-sug-sb-label dp-sug-sect-hdr" data-sect="trips" style="cursor:pointer;color:#4D9FFF;font-size:13px;text-transform:none;letter-spacing:0">
        Trips <span class="dp-sug-count-badge">${totalTrip}</span>
        <span class="dp-sug-toggle" style="color:#4D9FFF">${tripsExpanded ? '▾' : '▸'}</span>
      </div>
      ${tripsExpanded ? tripGroups : ''}
    </div>`;
}

function _dayRenderSugProjects(d) {
  const projects = d.projects_sidebar || [];
  if (!projects.length) return '';

  const plannedPtIds = new Set(
    (d.plan_items || []).filter(i => i.source_type === 'project_task').map(i => i.source_id)
  );
  const plannedPmIds = new Set(
    (d.plan_items || []).filter(i => i.source_type === 'project_milestone').map(i => i.source_id)
  );

  let totalCount = 0;

  const projGroups = projects.map(p => {
    const color = (typeof PROJ_COLOR_HEX !== 'undefined' && PROJ_COLOR_HEX[p.color]) || '#C450FF';
    const isOpen = _daySugOpenProjects.has(p.id);

    let tasks = (p.tasks || []).filter(t => !plannedPtIds.has(t.id));
    let milestones = (p.milestones || []).filter(m => !plannedPmIds.has(m.id));
    if (_daySugFilter === 'due') {
      tasks = tasks.filter(t => t.due_date === _dayDate);
      milestones = milestones.filter(m => m.due_date === _dayDate);
    } else if (_daySugFilter === 'overdue') {
      tasks = tasks.filter(t => t.due_date && t.due_date < _dayDate);
      milestones = milestones.filter(m => m.due_date && m.due_date < _dayDate);
    }
    const count = tasks.length + milestones.length;
    if (!count) return '';
    totalCount += count;

    const atRiskBadge = p.is_at_risk
      ? `<span style="color:#FF2D55;font-size:10px;font-weight:600;margin-left:2px">⚠ at risk</span>`
      : '';

    const taskRows = tasks.map(t => {
      const isOverdue = t.due_date && t.due_date < _dayDate;
      const isDue = t.due_date === _dayDate;
      const dueMeta = isOverdue
        ? `<span class="dp-sug-meta-overdue">⚠ ${formatDateShort(t.due_date)}</span>`
        : isDue ? `<span class="dp-sug-meta-due">Due today</span>`
        : t.due_date ? `<span class="dp-sug-meta-date">${formatDateShort(t.due_date)}</span>` : '';
      return `<div class="dp-sug-row">
        <div class="dp-sug-row-body">
          <div class="dp-sug-row-title">${escHtml(t.title)}</div>
          <div class="dp-sug-row-meta">${dueMeta}<span class="dp-prio-dot dp-prio-dot--${t.priority}"></span></div>
        </div>
        <div class="dp-sug-row-acts">
          <button class="dp-sug-act dp-sug-act--star" data-sug-type="project_task"
            data-source-id="${t.id}" data-title="${escHtml(t.title)}" data-priority="${t.priority}"
            data-section="must_do" title="Add to Must Do">★</button>
          <button class="dp-sug-act dp-sug-act--like" data-sug-type="project_task"
            data-source-id="${t.id}" data-title="${escHtml(t.title)}" data-priority="${t.priority}"
            data-section="like_to_do" title="Add to Like to Do">♡</button>
          <button class="dp-sug-act" data-sug-type="project_task"
            data-source-id="${t.id}" data-title="${escHtml(t.title)}" data-priority="${t.priority}"
            data-section="later" title="Add to Later">+</button>
        </div>
      </div>`;
    }).join('');

    const milestoneRows = milestones.map(m => {
      const isOverdue = m.due_date && m.due_date < _dayDate;
      const isDue = m.due_date === _dayDate;
      const dueMeta = isOverdue
        ? `<span class="dp-sug-meta-overdue">⚠ ${formatDateShort(m.due_date)}</span>`
        : isDue ? `<span class="dp-sug-meta-due">Due today</span>`
        : m.due_date ? `<span class="dp-sug-meta-date">${formatDateShort(m.due_date)}</span>` : '';
      return `<div class="dp-sug-row">
        <div class="dp-sug-row-body">
          <div class="dp-sug-row-title">
            <span style="color:${color};margin-right:4px;font-size:10px">◆</span>${escHtml(m.title)}
          </div>
          <div class="dp-sug-row-meta">${dueMeta}<span style="font-size:10px;color:var(--text-muted)">milestone</span></div>
        </div>
        <div class="dp-sug-row-acts">
          <button class="dp-sug-act dp-sug-act--star" data-sug-type="project_milestone"
            data-source-id="${m.id}" data-title="${escHtml(m.title)}"
            data-section="must_do" title="Add to Must Do">★</button>
          <button class="dp-sug-act dp-sug-act--like" data-sug-type="project_milestone"
            data-source-id="${m.id}" data-title="${escHtml(m.title)}"
            data-section="like_to_do" title="Add to Like to Do">♡</button>
          <button class="dp-sug-act" data-sug-type="project_milestone"
            data-source-id="${m.id}" data-title="${escHtml(m.title)}"
            data-section="later" title="Add to Later">+</button>
        </div>
      </div>`;
    }).join('');

    return `<div class="dp-sug-goal-group" style="border-left:3px solid ${color}90;padding-left:7px;margin-bottom:4px;">
      <div class="dp-sug-goal-label dp-sug-proj-hdr" data-proj-id="${p.id}" style="cursor:pointer;display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
        <span class="dp-sug-goal-pill" style="background:${color}22;color:${color};border-color:${color}66">${escHtml(p.title)}</span>
        ${atRiskBadge}
        <span class="dp-sug-count-badge">${count}</span>
        <span class="dp-sug-toggle" style="color:${color}">${isOpen ? '▾' : '▸'}</span>
      </div>
      ${isOpen ? taskRows + milestoneRows : ''}
    </div>`;
  }).join('');

  if (!totalCount) return '';
  const projsExpanded = _daySugOpenProjects.size > 0;

  return `
    <div class="dp-sug-sb-section" style="border-top:1px solid var(--border-subtle);padding-top:10px;">
      <div class="dp-sug-sb-label dp-sug-sect-hdr" data-sect="projects" style="cursor:pointer;color:#C450FF;font-size:13px;text-transform:none;letter-spacing:0">
        Projects <span class="dp-sug-count-badge">${totalCount}</span>
        <span class="dp-sug-toggle" style="color:#C450FF">${projsExpanded ? '▾' : '▸'}</span>
      </div>
      ${projsExpanded ? projGroups : ''}
    </div>`;
}

const _DAY_FIN_CATS = [
  { key: 'action',  label: 'Investment Actions', color: '#FFB800' },
  { key: 'insight', label: 'Insights',           color: '#00E5FF' },
  { key: 'finance', label: 'Finance',            color: '#00FF88' },
];

function _dayRenderSugFinance(d) {
  const fin = d.finance_sidebar || {};
  const tagId = fin.tag_id;

  // Filter out suggestions already actively in the plan
  const plannedTitles = new Set(
    (d.plan_items || []).filter(i => i.status === 'planned').map(i => i.title)
  );
  let suggestions = (fin.suggestions || []).filter(s => !plannedTitles.has(s.title));
  // Apply date filter — items without a due_date are hidden when a date filter is active
  if (_daySugFilter === 'due')          suggestions = suggestions.filter(s => s.due_date === _dayDate);
  else if (_daySugFilter === 'overdue') suggestions = suggestions.filter(s => s.due_date && s.due_date < _dayDate);
  if (!suggestions.length) return '';

  const byCategory = {};
  for (const s of suggestions) {
    const cat = s.category || 'finance';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(s);
  }

  const catGroups = _DAY_FIN_CATS.map(({ key, label, color }) => {
    const items = byCategory[key];
    if (!items || !items.length) return '';
    const isOpen = _daySugFinanceCats.has(key);
    const rows = items.map(s => {
      const icon = s.type === 'warning'
        ? `<span style="color:#FFB800;margin-right:4px;flex-shrink:0">⚠</span>`
        : `<span style="color:${color};margin-right:4px;flex-shrink:0">ℹ</span>`;
      return `<div class="dp-sug-row">
        <div class="dp-sug-row-body">
          <div class="dp-sug-row-title" style="display:flex;align-items:baseline">${icon}${escHtml(s.title)}</div>
          ${s.detail ? `<div class="dp-sug-row-meta"><span class="dp-sug-meta-date">${escHtml(s.detail)}</span></div>` : ''}
        </div>
        <div class="dp-sug-row-acts">
          <button class="dp-sug-act dp-sug-act--star" data-sug-type="finance"
            data-title="${escHtml(s.title)}" data-tag-id="${tagId || ''}"
            data-inv-action-id="${s.inv_action_id || ''}"
            data-section="must_do" title="Add as task → Must Do">★</button>
          <button class="dp-sug-act dp-sug-act--like" data-sug-type="finance"
            data-title="${escHtml(s.title)}" data-tag-id="${tagId || ''}"
            data-inv-action-id="${s.inv_action_id || ''}"
            data-section="like_to_do" title="Add as task → Like to Do">♡</button>
          <button class="dp-sug-act" data-sug-type="finance"
            data-title="${escHtml(s.title)}" data-tag-id="${tagId || ''}"
            data-inv-action-id="${s.inv_action_id || ''}"
            data-section="later" title="Add as task → Later">+</button>
        </div>
      </div>`;
    }).join('');
    return `<div class="dp-sug-goal-group" style="border-left:3px solid ${color}90;padding-left:7px;margin-bottom:4px;">
      <div class="dp-sug-goal-label dp-sug-fin-cat-hdr" data-fin-cat="${key}" style="cursor:pointer;display:flex;align-items:center;gap:5px;">
        <span class="dp-sug-goal-pill" style="background:${color}22;color:${color};border-color:${color}66">${label}</span>
        <span class="dp-sug-count-badge">${items.length}</span>
        <span class="dp-sug-toggle" style="color:${color}">${isOpen ? '▾' : '▸'}</span>
      </div>
      ${isOpen ? rows : ''}
    </div>`;
  }).filter(Boolean).join('');

  return `
    <div class="dp-sug-sb-section" style="border-top:1px solid var(--border-subtle);padding-top:10px;">
      <div class="dp-sug-sb-label dp-sug-sect-hdr" data-sect="finance" style="cursor:pointer;color:#FF2D55;font-size:13px;text-transform:none;letter-spacing:0">
        Finance <span class="dp-sug-count-badge">${suggestions.length}</span>
        <span class="dp-sug-toggle" style="color:#FF2D55">${_daySugFinanceOpen ? '▾' : '▸'}</span>
      </div>
      ${_daySugFinanceOpen ? catGroups : ''}
    </div>`;
}

// ── Event binding ─────────────────────────────────────────────────────────────

function _dayBindEvents() {
  const c = _dayContainer;

  // Date navigation
  c.querySelector('#dp-prev')?.addEventListener('click',  () => { _dayDate = _dayShiftDate(_dayDate, -1); _dayHiddenEvents = new Set(); _dayLoad(); });
  c.querySelector('#dp-next')?.addEventListener('click',  () => { _dayDate = _dayShiftDate(_dayDate,  1); _dayHiddenEvents = new Set(); _dayLoad(); });
  c.querySelector('#dp-today')?.addEventListener('click', () => { _dayDate = todayISO(); _dayHiddenEvents = new Set(); _dayLoad(); });

  // View mode toggle
  c.querySelectorAll('.dp-view-btn').forEach(btn => {
    btn.addEventListener('click', () => { _dayViewMode = btn.dataset.view; _dayRender(); });
  });

  // Section toggle buttons (quick-add)
  c.querySelectorAll('.dp-qa-sec-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _dayQASection = btn.dataset.sec;
      c.querySelectorAll('.dp-qa-sec-btn').forEach(b => b.classList.toggle('active', b.dataset.sec === _dayQASection));
    });
  });

  // Quick-add input
  const qaInput   = c.querySelector('#dp-qa-input');
  const qaPreview = c.querySelector('#dp-qa-preview');
  if (qaInput) {
    qaInput.addEventListener('input', () => {
      if (qaPreview) qaPreview.textContent = _dayParsePreview(_dayParseInput(qaInput.value)) || '';
    });
    qaInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); _dayQASubmit(); } });
  }
  c.querySelector('#dp-qa-btn')?.addEventListener('click', _dayQASubmit);

  // Tag chip selection (toggle on click; Enter selects + submits)
  const _updateTagChips = () => {
    c.querySelectorAll('.dp-qa-tag').forEach(b => {
      const active = parseInt(b.dataset.tagId) === _dayQATag;
      b.classList.toggle('active', active);
      b.style.borderColor = active ? `var(--tag-${b.dataset.tagColor}-text)` : 'transparent';
    });
  };
  c.querySelectorAll('.dp-qa-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.tagId);
      _dayQATag = _dayQATag === id ? null : id;
      _updateTagChips();
    });
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        _dayQATag = parseInt(btn.dataset.tagId);
        _updateTagChips();
        _dayQASubmit();
      }
    });
  });

  // Timeline cell click → pre-fill time
  c.querySelectorAll('.dp-tl-cell').forEach(cell => {
    cell.addEventListener('click', e => {
      const h = parseInt(cell.dataset.hour);
      const rect = cell.getBoundingClientRect();
      const mins = Math.round((e.clientY - rect.top) / rect.height * 60 / 15) * 15;
      const tot  = h * 60 + mins;
      const hh   = Math.floor(tot / 60) % 24, mm = tot % 60;
      const ampm = hh < 12 ? 'am' : 'pm';
      const h12  = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
      const ts   = mm === 0 ? `${h12}${ampm}` : `${h12}:${String(mm).padStart(2,'0')}${ampm}`;
      if (qaInput) {
        qaInput.value = `at ${ts} `;
        qaInput.focus();
        if (qaPreview) qaPreview.textContent = _dayParsePreview(_dayParseInput(qaInput.value)) || '';
      }
    });
  });

  // Timeline complete-event buttons
  c.querySelector('#dp-tl-panel')?.addEventListener('click', async e => {
    const btn = e.target.closest('.dp-tl-complete-btn');
    if (!btn) return;
    e.stopPropagation();
    const evId = parseInt(btn.dataset.eventId);
    const ev = (_dayData?.calendar_events || []).find(ev => ev.id === evId);
    if (!ev) return;
    btn.disabled = true;
    try {
      const created = await apiFetch('POST', '/day/items', {
        plan_date: _dayDate, title: ev.title, source_type: 'event', section: 'later',
        start_time: ev.start_time || null, end_time: ev.end_time || null,
        tag_id: ev.tag_id || null, cal_event_id: ev.id,
      });
      await apiFetch('POST', `/day/items/${created.id}/complete`);
      await _dayReloadAndRender();
    } catch(err) { alert(err.message); }
  });

  // List panel: plan item + cal event actions
  c.querySelector('.dp-list-panel')?.addEventListener('click', async e => {
    // Plan item actions
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = parseInt(btn.dataset.id);
    if (btn.dataset.action === 'complete-event') {
      const evId = parseInt(btn.dataset.eventId);
      const ev = (_dayData?.calendar_events || []).find(e => e.id === evId);
      if (!ev) return;
      btn.disabled = true;
      try {
        const created = await apiFetch('POST', '/day/items', {
          plan_date: _dayDate,
          title: ev.title,
          source_type: 'event',
          section: 'later',
          start_time: ev.start_time || null,
          end_time: ev.end_time || null,
          tag_id: ev.tag_id || null,
          cal_event_id: ev.id,
        });
        await apiFetch('POST', `/day/items/${created.id}/complete`);
        await _dayReloadAndRender();
      } catch(err) { alert(err.message); }
      return;
    }
    if (btn.dataset.action === 'delete-cal-event') {
      const evId = parseInt(btn.dataset.eventId);
      const ev = (_dayData?.calendar_events || []).find(e => e.id === evId);
      if (!ev) return;
      const isRecurring = ev.recurrence_cadence || ev._is_recurrence;
      const path = isRecurring
        ? `/calendar/events/${ev.id}?scope=this&occurrence_date=${_dayDate}`
        : `/calendar/events/${ev.id}`;
      try {
        await apiFetch('DELETE', path);
        await _dayReloadAndRender();
      } catch(err) { alert(err.message); }
      return;
    }
    switch (btn.dataset.action) {
      case 'complete':   await _dayDoComplete(id); break;
      case 'uncomplete': await _dayDoUncomplete(id); break;
      case 'delete':     await _dayDoDelete(id); break;
      case 'tomorrow':   await _dayDoMove(id, _dayShiftDate(_dayDate, 1)); break;
      case 'to-mustdo':   await _dayDoSection(id, 'must_do'); break;
      case 'to-later':    await _dayDoSection(id, 'later'); break;
      case 'to-liketodo': await _dayDoSection(id, 'like_to_do'); break;
    }
  });

  // Done section toggle
  c.querySelector('#dp-done-toggle')?.addEventListener('click', () => {
    _dayDoneOpen = !_dayDoneOpen; _dayRender();
  });

  // Suggestions sidebar — event delegation
  const sidebar = c.querySelector('#dp-sug-sidebar');
  if (sidebar) {
    sidebar.addEventListener('input', e => {
      const el = e.target.closest('#dp-sug-search');
      if (el) {
        _daySugSearch = el.value;
        sidebar.innerHTML = _dayRenderSugSidebar(_dayData);
      }
    });
    sidebar.addEventListener('click', async e => {
      // Section collapse toggle (Tasks / Habits / Trips / Finance)
      const sectHdr = e.target.closest('.dp-sug-sect-hdr');
      if (sectHdr) {
        const s = sectHdr.dataset.sect;
        if (s === 'tasks')        _daySugTasksOpen  = !_daySugTasksOpen;
        else if (s === 'habits')  _daySugHabitsOpen = !_daySugHabitsOpen;
        else if (s === 'finance') _daySugFinanceOpen = !_daySugFinanceOpen;
        else if (s === 'trips') {
          // Toggle all trips: if any open, close all; else expand all
          const tripsData = _dayData.trips_sidebar || [];
          if (_daySugOpenTrips.size > 0) _daySugOpenTrips = new Set();
          else tripsData.forEach(tr => _daySugOpenTrips.add(tr.id));
        }
        else if (s === 'projects') {
          const projsData = _dayData.projects_sidebar || [];
          if (_daySugOpenProjects.size > 0) _daySugOpenProjects = new Set();
          else projsData.forEach(p => _daySugOpenProjects.add(p.id));
        }
        sidebar.innerHTML = _dayRenderSugSidebar(_dayData);
        return;
      }
      // Goal group collapse toggle
      const goalHdr = e.target.closest('.dp-sug-goal-hdr');
      if (goalHdr) {
        const gid = parseInt(goalHdr.dataset.goalId);
        if (_daySugOpenGoals.has(gid)) _daySugOpenGoals.delete(gid);
        else _daySugOpenGoals.add(gid);
        sidebar.innerHTML = _dayRenderSugSidebar(_dayData);
        return;
      }
      // Trip group collapse toggle
      const tripHdr = e.target.closest('.dp-sug-trip-hdr');
      if (tripHdr) {
        const tid = parseInt(tripHdr.dataset.tripId);
        if (_daySugOpenTrips.has(tid)) _daySugOpenTrips.delete(tid);
        else _daySugOpenTrips.add(tid);
        sidebar.innerHTML = _dayRenderSugSidebar(_dayData);
        return;
      }
      // Project group collapse toggle
      const projHdr = e.target.closest('.dp-sug-proj-hdr');
      if (projHdr) {
        const pid = parseInt(projHdr.dataset.projId);
        if (_daySugOpenProjects.has(pid)) _daySugOpenProjects.delete(pid);
        else _daySugOpenProjects.add(pid);
        sidebar.innerHTML = _dayRenderSugSidebar(_dayData);
        return;
      }
      // Finance category collapse toggle
      const finCatHdr = e.target.closest('.dp-sug-fin-cat-hdr');
      if (finCatHdr) {
        const cat = finCatHdr.dataset.finCat;
        if (_daySugFinanceCats.has(cat)) _daySugFinanceCats.delete(cat);
        else _daySugFinanceCats.add(cat);
        sidebar.innerHTML = _dayRenderSugSidebar(_dayData);
        return;
      }
      // Filter chip
      const filtBtn = e.target.closest('.dp-sug-filt');
      if (filtBtn) {
        _daySugFilter = filtBtn.dataset.filt;
        sidebar.innerHTML = _dayRenderSugSidebar(_dayData);
        return;
      }
      // Add button
      const addBtn = e.target.closest('.dp-sug-act');
      if (!addBtn) return;
      const type    = addBtn.dataset.sugType;
      const section = addBtn.dataset.section;
      if (type === 'task') {
        await _dayDoAdd({
          title: addBtn.dataset.title, source_type: 'task',
          source_id: parseInt(addBtn.dataset.taskId), task_id: parseInt(addBtn.dataset.taskId),
          priority: addBtn.dataset.priority || 'medium', section,
        });
      } else if (type === 'habit') {
        await _dayDoAdd({
          title: addBtn.dataset.title, source_type: 'habit',
          source_id: parseInt(addBtn.dataset.habitId), goal_id: parseInt(addBtn.dataset.goalId),
          habit_id: parseInt(addBtn.dataset.habitId),
          duration_minutes: parseInt(addBtn.dataset.dur) || 30,
          section, priority: 'medium',
        });
      } else if (type === 'project_task') {
        await _dayDoAdd({
          title: addBtn.dataset.title,
          source_type: 'project_task',
          source_id: parseInt(addBtn.dataset.sourceId),
          priority: addBtn.dataset.priority || 'medium',
          section,
        });
      } else if (type === 'project_milestone') {
        await _dayDoAdd({
          title: addBtn.dataset.title,
          source_type: 'project_milestone',
          source_id: parseInt(addBtn.dataset.sourceId),
          section,
          priority: 'medium',
        });
      } else if (type === 'finance') {
        const invActionId = addBtn.dataset.invActionId ? parseInt(addBtn.dataset.invActionId) : null;
        await _dayDoAddFinanceInsight(addBtn.dataset.title, section, addBtn.dataset.tagId, invActionId);
      }
    });
  }

  // Note autosave
  ['morning', 'evening'].forEach(f => {
    const el = c.querySelector(`#dp-note-${f}`);
    if (!el) return;
    el.addEventListener('input', () => {
      clearTimeout(_dayNoteDebounce[f]);
      _dayNoteDebounce[f] = setTimeout(_dayNoteAutosave, 1000);
    });
    el.addEventListener('blur', _dayNoteAutosave);
  });
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function _dayQASubmit() {
  const input = _dayContainer.querySelector('#dp-qa-input');
  if (!input?.value.trim()) return;
  const parsed = _dayParseInput(input.value);
  if (!parsed) return;
  if (_dayQATag) parsed.tag_id = _dayQATag;
  try {
    const newItem = await apiFetch('POST', '/day/items', parsed);
    input.value = '';
    const prev = _dayContainer.querySelector('#dp-qa-preview');
    if (prev) prev.textContent = '';
    await _dayReloadAndRender();
    requestAnimationFrame(() => {
      const el = _dayContainer.querySelector(`[data-id="${newItem.id}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      _dayContainer.querySelector('#dp-qa-input')?.focus();
    });
  } catch(e) { alert(e.message); }
}

async function _dayDoAddFinanceInsight(title, section, tagIdStr, invActionId) {
  try {
    const tagIds = tagIdStr ? [parseInt(tagIdStr)] : [];
    const task = await apiFetch('POST', '/tasks', { title, priority: 'medium', tag_ids: tagIds });
    await apiFetch('POST', '/day/items', {
      plan_date: _dayDate, title,
      source_type: invActionId ? 'finance_action' : 'task',
      source_id: invActionId ? invActionId : null,
      task_id: task.id, section, priority: 'medium',
      tag_id: tagIds[0] || null,
    });
    await _dayReloadAndRender();
  } catch(e) { alert(e.message); }
}

async function _dayDoAdd(data) {
  try {
    await apiFetch('POST', '/day/items', { plan_date: _dayDate, ...data });
    await _dayReloadAndRender();
  } catch(e) { alert(e.message); }
}

async function _dayDoComplete(id) {
  try {
    await apiFetch('POST', `/day/items/${id}/complete`);
    await _dayReloadAndRender();
  } catch(e) { alert(e.message); }
}

async function _dayDoUncomplete(id) {
  try {
    await apiFetch('POST', `/day/items/${id}/uncomplete`);
    await _dayReloadAndRender();
  } catch(e) { alert(e.message); }
}

async function _dayDoDelete(id) {
  try {
    const item = (_dayData?.plan_items || []).find(i => i.id === id);
    const calEventId = item?.cal_event_id;
    await apiFetch('DELETE', `/day/items/${id}`);
    if (calEventId) {
      try { await apiFetch('DELETE', `/calendar/events/${calEventId}`); } catch(_) {}
    }
    await _dayReloadAndRender();
  } catch(e) { alert(e.message); }
}

async function _dayDoMove(id, targetDate) {
  try {
    await apiFetch('POST', `/day/items/${id}/move`, { target_date: targetDate });
    await _dayReloadAndRender();
  } catch(e) { alert(e.message); }
}

async function _dayDoSection(id, section) {
  try {
    await apiFetch('PATCH', `/day/items/${id}`, { section });
    await _dayReloadAndRender();
  } catch(e) { alert(e.message); }
}

async function _dayNoteAutosave() {
  const c = _dayContainer;
  const morning = c.querySelector('#dp-note-morning')?.value ?? null;
  const evening = c.querySelector('#dp-note-evening')?.value ?? null;
  if (morning === null && evening === null) return;
  try {
    await apiFetch('PATCH', '/day/note', {
      plan_date: _dayDate, morning_plan: morning, evening_reflection: evening,
    });
    if (_dayData) _dayData.note = { morning_plan: morning||'', evening_reflection: evening||'' };
    const saved = c.querySelector('#dp-note-saved');
    if (saved) { saved.classList.add('show'); setTimeout(() => saved.classList.remove('show'), 1500); }
  } catch(_) { /* silent */ }
}
