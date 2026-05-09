/* ── API fetch wrapper ───────────────────────────────────── */
async function apiFetch(method, path, body) {
  const opts = {
    method,
    headers: {},
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch('/api' + path, opts);
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
}

/* ── Page router ─────────────────────────────────────────── */
const PAGE_LOADERS = {};

function registerPage(name, fn) {
  PAGE_LOADERS[name] = fn;
}

function loadPage(page, pushState = true) {
  const content = document.getElementById('content');

  // Update body class for accent color
  document.body.className = 'page-' + page;

  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Push history
  if (pushState) {
    history.pushState({ page }, '', '/' + (page === 'dashboard' ? '' : page));
  }

  // Show loading
  content.innerHTML = '<div class="loading-state">Loading…</div>';

  // Call the registered loader
  const loader = PAGE_LOADERS[page];
  if (loader) {
    loader(content);
  } else {
    content.innerHTML = `<div class="empty-state"><div class="empty-state-title">${capitalize(page)}</div><p class="empty-state-text">Coming soon.</p></div>`;
  }
}

/* ── Sidebar click handlers ──────────────────────────────── */
document.querySelectorAll('.nav-item[data-page]').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    loadPage(el.dataset.page);
  });
});

/* ── Browser back/forward ────────────────────────────────── */
window.addEventListener('popstate', e => {
  const page = e.state?.page || pageFromPath();
  loadPage(page, false);
});

function pageFromPath() {
  const p = location.pathname.replace(/^\//, '') || 'dashboard';
  return p;
}

/* ── Shared utilities ────────────────────────────────────── */
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(iso) {
  if (!iso) return '';
  // Strip any time component so values like "2026-05-01T00:00:00" still parse
  const datePart = String(iso).slice(0, 10);
  const d = new Date(datePart + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function isOverdue(dueDateISO) {
  if (!dueDateISO) return false;
  return dueDateISO < todayISO();
}

function isToday(dueDateISO) {
  return dueDateISO === todayISO();
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function tagBadgeHTML(tag) {
  return `<span class="tag-badge tag-${tag.color}">${tag.name}</span>`;
}

function tagsHTML(tags) {
  if (!tags || !tags.length) return '';
  return tags.map(tagBadgeHTML).join(' ');
}

function priorityDotHTML(priority) {
  return `<span class="priority-dot ${priority}" title="${priority} priority"></span>`;
}

function progressBarHTML(pct, accentVar) {
  const color = accentVar || 'var(--color-accent)';
  return `
    <div class="progress-bar">
      <div class="progress-fill" style="background:${color}" data-pct="${pct}"></div>
    </div>`;
}

function animateProgressBars(container) {
  const fills = (container || document).querySelectorAll('.progress-fill[data-pct]');
  setTimeout(() => {
    fills.forEach(el => {
      el.style.width = Math.min(100, parseFloat(el.dataset.pct)) + '%';
    });
  }, 30);
}

function streakDotsHTML(loggedDates) {
  const today = new Date();
  let html = '<div class="streak-dots">';
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const filled = loggedDates && loggedDates.includes(iso);
    html += `<span class="streak-dot${filled ? ' filled' : ''}"></span>`;
  }
  html += '</div>';
  return html;
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

/* ── Smart date inputs ───────────────────────────────────── */
function parseSmartDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  function _now() { const d = new Date(); d.setHours(0,0,0,0); return d; }
  function _iso(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // t / t+N / t-N  (days from today)
  const tm = s.match(/^t([+-]\d+)?$/i);
  if (tm) { const d=_now(); if(tm[1]) d.setDate(d.getDate()+parseInt(tm[1])); return _iso(d); }
  // w / w+N / w-N  (weeks)
  const wm = s.match(/^w([+-]\d+)?$/i);
  if (wm) { const d=_now(); d.setDate(d.getDate()+(wm[1]?parseInt(wm[1]):1)*7); return _iso(d); }
  // m / m+N / m-N  (months)
  const mm = s.match(/^m([+-]\d+)?$/i);
  if (mm) { const d=_now(); d.setMonth(d.getMonth()+(mm[1]?parseInt(mm[1]):1)); return _iso(d); }
  // y / y+N / y-N  (years, case-insensitive)
  const ym = s.match(/^y([+-]\d+)?$/i);
  if (ym) { const d=_now(); d.setFullYear(d.getFullYear()+(ym[1]?parseInt(ym[1]):1)); return _iso(d); }
  // mm/dd/yy or mm/dd/yyyy
  const sl = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (sl) { let y=parseInt(sl[3]); if(y<100)y+=2000; const d=new Date(y,parseInt(sl[1])-1,parseInt(sl[2])); if(!isNaN(d.getTime())&&d.getMonth()===parseInt(sl[1])-1) return _iso(d); }
  // mm-dd-yy or mm-dd-yyyy  (not YYYY-MM-DD which is handled above)
  const ds = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (ds) { let y=parseInt(ds[3]); if(y<100)y+=2000; const d=new Date(y,parseInt(ds[1])-1,parseInt(ds[2])); if(!isNaN(d.getTime())&&d.getMonth()===parseInt(ds[1])-1) return _iso(d); }
  // mm/dd or m/d — assume current year
  const nd = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (nd) { const d=new Date(_now().getFullYear(),parseInt(nd[1])-1,parseInt(nd[2])); if(!isNaN(d.getTime())&&d.getMonth()===parseInt(nd[1])-1) return _iso(d); }
  // mm-dd or m-d — assume current year
  const ndd = s.match(/^(\d{1,2})-(\d{1,2})$/);
  if (ndd) { const d=new Date(_now().getFullYear(),parseInt(ndd[1])-1,parseInt(ndd[2])); if(!isNaN(d.getTime())&&d.getMonth()===parseInt(ndd[1])-1) return _iso(d); }
  return null;
}

function getDateVal(el) {
  if (!el) return null;
  const v = el.value ? String(el.value).trim() : '';
  if (!v) return null;
  if (el.dataset.isoDate) return el.dataset.isoDate;
  return parseSmartDate(v);
}

function _smartDateBlur() {
  const raw = this.value.trim();
  if (!raw) { delete this.dataset.isoDate; this.style.borderColor=''; return; }
  const iso = parseSmartDate(raw);
  if (iso) {
    this.dataset.isoDate = iso;
    const [y,m,d] = iso.split('-');
    this.value = `${m}/${d}/${y}`;
    this.style.borderColor = '';
  } else {
    this.style.borderColor = 'var(--neon-red,#f43f5e)';
  }
}

function initSmartDates(root) {
  (root || document).querySelectorAll('input[type="date"]').forEach(inp => {
    if (inp._sdInit) return;
    inp._sdInit = true;
    inp.type = 'text';
    if (inp.value && /^\d{4}-\d{2}-\d{2}$/.test(inp.value)) {
      inp.dataset.isoDate = inp.value;
      const [y,m,d] = inp.value.split('-');
      inp.value = `${m}/${d}/${y}`;
    }
    if (!inp.placeholder) inp.placeholder = 'mm/dd · mm/dd/yy · t · t+7 · w+1 · m+1';
    inp.addEventListener('blur', _smartDateBlur);
    inp.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();inp.blur();} });
    inp.addEventListener('focus',  () => { inp.style.borderColor=''; });
  });
}

// Auto-enhance any date inputs added to the DOM (modals, detail panes, inline forms)
new MutationObserver(mutations => {
  for (const mut of mutations) {
    for (const node of mut.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches('input[type="date"]')) initSmartDates(node.parentElement);
      else initSmartDates(node);
    }
  }
}).observe(document.body, { childList: true, subtree: true });

/* ── Modal helpers ───────────────────────────────────────── */
function openModal(overlayEl) {
  overlayEl.classList.add('open');
  const first = overlayEl.querySelector('input,textarea,select');
  if (first) setTimeout(() => first.focus(), 50);
}

function closeModal(overlayEl) {
  overlayEl.classList.remove('open');
}

function createModal(title, bodyHTML, onSubmit, submitLabel = 'Save') {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">${title}</span>
        <button class="modal-close" aria-label="Close">×</button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-cancel-btn">Cancel</button>
        <button class="btn btn-primary modal-submit-btn">${submitLabel}</button>
      </div>
    </div>`;

  const _dismiss = () => { closeModal(overlay); overlay.remove(); };
  overlay.querySelector('.modal-close').addEventListener('click', _dismiss);
  overlay.querySelector('.modal-cancel-btn').addEventListener('click', _dismiss);
  overlay.addEventListener('click', e => { if (e.target === overlay) _dismiss(); });
  overlay.querySelector('.modal-submit-btn').addEventListener('click', async () => {
    const result = await onSubmit(overlay);
    if (result !== false) _dismiss();
  });

  document.body.appendChild(overlay);
  return overlay;
}

/* ── Theme bootstrap ─────────────────────────────────────── */
async function _bootstrapTheme() {
  try {
    const s = await apiFetch('GET', '/settings');
    const t = s.theme || 'light';
    if (t === 'dark') {
      document.documentElement.dataset.theme = 'dark';
    } else {
      delete document.documentElement.dataset.theme;
    }
    localStorage.setItem('theme', t);
  } catch(e) {}
}

/* ── Init ────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  _bootstrapTheme();
  const page = pageFromPath();
  loadPage(page, false);
});
