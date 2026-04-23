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
  const d = new Date(iso + 'T00:00:00');
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

  overlay.querySelector('.modal-close').addEventListener('click', () => closeModal(overlay));
  overlay.querySelector('.modal-cancel-btn').addEventListener('click', () => closeModal(overlay));
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay); });
  overlay.querySelector('.modal-submit-btn').addEventListener('click', () => onSubmit(overlay));

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
