const TAG_COLORS = ['teal', 'amber', 'purple', 'blue', 'green', 'coral', 'pink', 'gray'];

registerPage('settings', async function(content) {
  content.innerHTML = `
    <div class="settings-page">
      <div class="page-header">
        <h1 class="page-title">Settings</h1>
      </div>

      <div class="settings-sections">

        <div class="settings-card">
          <div class="settings-card-title">Appearance</div>
          <div class="settings-row">
            <label class="settings-label">Theme</label>
            <div class="theme-toggle" id="s-theme-toggle">
              <button class="theme-btn" data-theme="light">Light</button>
              <button class="theme-btn" data-theme="dark">Dark</button>
            </div>
          </div>
        </div>

        <div class="settings-card">
          <div class="settings-card-title">Profile</div>
          <div class="settings-row">
            <label class="settings-label">Display name</label>
            <div style="display:flex;gap:8px;align-items:center">
              <input class="form-input" id="s-name" placeholder="Your name" style="max-width:280px">
              <button class="btn btn-primary btn-sm" id="s-name-save">Save</button>
            </div>
            <div class="settings-hint">Shown in the dashboard greeting.</div>
          </div>
        </div>

        <div class="settings-card">
          <div class="settings-card-title">Financial Profile</div>
          <div class="settings-hint" style="margin-bottom:12px;color:var(--text-muted)">Used by the Finance → Planning tab for projections and retirement modeling.</div>
          <div class="settings-row">
            <label class="settings-label">Birthday <span id="s-birthday-status" style="font-size:11px;font-weight:400;color:var(--neon-amber)"></span></label>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="date" class="form-input" id="s-birthday" style="max-width:200px">
            </div>
            <div class="settings-hint">Age-based glide path and retirement countdown require this.</div>
          </div>
          <div class="settings-row">
            <label class="settings-label">Target retirement age</label>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="number" class="form-input" id="s-retire-age" min="40" max="100" placeholder="65" style="max-width:120px">
            </div>
            <div class="settings-hint">Sets the retire line on your projection chart.</div>
          </div>
          <div class="settings-row">
            <label class="settings-label">Min cash on hand <span id="s-mincash-status" style="font-size:11px;font-weight:400;color:var(--neon-amber)"></span></label>
            <div style="display:flex;gap:8px;align-items:center">
              <span style="color:var(--text-secondary);font-size:14px">$</span>
              <input type="number" class="form-input" id="s-min-cash" min="0" step="500" placeholder="0" style="max-width:160px">
            </div>
            <div class="settings-hint">Cash you keep as a buffer — excluded when computing Invested %. Set to your emergency fund amount.</div>
          </div>
          <div class="settings-row">
            <button class="btn btn-primary btn-sm" id="s-fin-save">Save financial profile</button>
            <span id="s-fin-saved" style="font-size:12px;color:var(--neon-green);margin-left:10px;opacity:0;transition:opacity 0.4s"></span>
          </div>
        </div>

        <div class="settings-card">
          <div class="settings-card-title">Tags</div>
          <div id="s-tags-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px"></div>
          <div id="s-tag-add-form" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input class="form-input" id="s-tag-name" placeholder="New tag name" style="max-width:200px">
            <div id="s-tag-color-picker" style="display:flex;gap:4px;flex-wrap:wrap">
              ${TAG_COLORS.map(c => `
                <span class="s-color-swatch tag-${c}${c === 'teal' ? ' selected' : ''}" data-color="${c}" title="${c}"></span>
              `).join('')}
            </div>
            <button class="btn btn-primary btn-sm" id="s-tag-add">+ Add tag</button>
          </div>
          <div class="settings-hint" style="margin-top:8px">Up to 15 tags. Default tags cannot be deleted.</div>
        </div>

      </div>
    </div>`;

  let _settings = {};
  let _tags = [];
  let _selectedColor = 'teal';

  try {
    [_settings, { items: _tags }] = await Promise.all([
      apiFetch('GET', '/settings'),
      apiFetch('GET', '/tags'),
    ]);
  } catch(e) {
    content.innerHTML = `<div class="empty-state"><div class="empty-state-title">Couldn't load settings</div></div>`;
    return;
  }

  // Apply current theme to toggle buttons
  const currentTheme = _settings.theme || localStorage.getItem('theme') || 'light';
  _applyTheme(currentTheme, false);
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === currentTheme);
    btn.addEventListener('click', async () => {
      const t = btn.dataset.theme;
      _applyTheme(t, true);
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b === btn));
      try { await apiFetch('PATCH', '/settings', { values: { theme: t } }); } catch(e) {}
    });
  });

  // Populate name + financial profile
  document.getElementById('s-name').value       = _settings.user_name || '';
  document.getElementById('s-birthday').value   = _settings.birthday  || '';
  document.getElementById('s-retire-age').value = _settings.target_retirement_age || '';
  document.getElementById('s-min-cash').value   = _settings.min_cash_balance || '';

  // Show missing-field indicators
  const bdStatus = document.getElementById('s-birthday-status');
  const mcStatus = document.getElementById('s-mincash-status');
  if (!_settings.birthday)       bdStatus.textContent = '(not set — needed for planning)';
  if (!(_settings.min_cash_balance > 0)) mcStatus.textContent = '(not set)';

  document.getElementById('s-birthday').addEventListener('input', () => {
    bdStatus.textContent = '';
  });
  document.getElementById('s-min-cash').addEventListener('input', () => {
    const v = parseFloat(document.getElementById('s-min-cash').value);
    mcStatus.textContent = (!v || v <= 0) ? '(not set)' : '';
  });

  document.getElementById('s-fin-save').addEventListener('click', async () => {
    const bd  = document.getElementById('s-birthday').value;
    const ra  = document.getElementById('s-retire-age').value;
    const mc  = parseFloat(document.getElementById('s-min-cash').value) || 0;
    try {
      await apiFetch('PATCH', '/settings', {
        values: { birthday: bd || '', target_retirement_age: ra || '', min_cash_balance: String(mc) },
      });
      const saved = document.getElementById('s-fin-saved');
      saved.textContent = 'Saved';
      saved.style.opacity = '1';
      setTimeout(() => { saved.style.opacity = '0'; }, 2000);
    } catch(e) { alert('Error: ' + e.message); }
  });

  // Color picker selection
  content.querySelectorAll('.s-color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      content.querySelectorAll('.s-color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      _selectedColor = swatch.dataset.color;
    });
  });

  // Save name
  document.getElementById('s-name-save').addEventListener('click', async () => {
    const name = document.getElementById('s-name').value.trim();
    if (!name) { alert('Name cannot be empty.'); return; }
    try {
      await apiFetch('PATCH', '/settings', { values: { user_name: name } });
      _showToast('Name saved.');
    } catch(e) { alert('Error: ' + e.message); }
  });

  // Add tag
  document.getElementById('s-tag-add').addEventListener('click', async () => {
    const name = document.getElementById('s-tag-name').value.trim();
    if (!name) { alert('Enter a tag name.'); return; }
    try {
      const tag = await apiFetch('POST', '/tags', { name, color: _selectedColor });
      _tags.push(tag);
      document.getElementById('s-tag-name').value = '';
      _renderTags();
    } catch(e) { alert('Error: ' + e.message); }
  });

  document.getElementById('s-tag-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('s-tag-add').click();
  });

  _renderTags();

  function _renderTags() {
    const list = document.getElementById('s-tags-list');
    if (!list) return;
    if (!_tags.length) {
      list.innerHTML = `<div style="font-size:13px;color:var(--text-muted)">No tags yet.</div>`;
      return;
    }
    list.innerHTML = _tags.map(t => `
      <div class="s-tag-row" data-tid="${t.id}">
        <span class="tag-badge tag-${t.color} s-tag-badge">${escHtml(t.name)}</span>
        <div class="s-tag-edit-area" data-tid="${t.id}" style="display:none;display:flex;gap:6px;align-items:center;flex:1">
          <input class="form-input s-te-name" value="${escHtml(t.name)}" style="max-width:160px;font-size:13px">
          <div style="display:flex;gap:3px">
            ${TAG_COLORS.map(c => `<span class="s-color-swatch tag-${c}${t.color === c ? ' selected' : ''}" data-color="${c}" title="${c}" style="width:14px;height:14px"></span>`).join('')}
          </div>
          <button class="btn btn-primary btn-sm s-te-save" data-tid="${t.id}">Save</button>
          <button class="btn btn-secondary btn-sm s-te-cancel" data-tid="${t.id}">Cancel</button>
        </div>
        <div class="s-tag-actions" style="display:flex;gap:4px;margin-left:auto">
          ${!t.is_default ? `<button class="btn btn-secondary btn-sm s-tag-edit" data-tid="${t.id}">Edit</button>` : ''}
          ${!t.is_default ? `<button class="goal-metric-del s-tag-del" data-tid="${t.id}" title="Delete">×</button>` : ''}
          ${t.is_default ? `<span style="font-size:12px;color:var(--text-muted);padding:0 4px">Default</span>` : ''}
        </div>
      </div>`).join('');

    // Wire edit toggles
    list.querySelectorAll('.s-tag-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const tid = btn.dataset.tid;
        const row = list.querySelector(`.s-tag-row[data-tid="${tid}"]`);
        const badge = row.querySelector('.s-tag-badge');
        const editArea = row.querySelector('.s-tag-edit-area');
        const actions = row.querySelector('.s-tag-actions');
        badge.style.display = 'none';
        editArea.style.display = 'flex';
        actions.style.display = 'none';
        editArea.querySelectorAll('.s-color-swatch').forEach(s => {
          s.addEventListener('click', () => {
            editArea.querySelectorAll('.s-color-swatch').forEach(x => x.classList.remove('selected'));
            s.classList.add('selected');
          });
        });
      });
    });

    // Wire cancel
    list.querySelectorAll('.s-te-cancel').forEach(btn => {
      btn.addEventListener('click', () => _renderTags());
    });

    // Wire save edit
    list.querySelectorAll('.s-te-save').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tid = parseInt(btn.dataset.tid);
        const row = list.querySelector(`.s-tag-row[data-tid="${tid}"]`);
        const name = row.querySelector('.s-te-name').value.trim();
        const color = row.querySelector('.s-color-swatch.selected')?.dataset.color || 'teal';
        if (!name) { alert('Name cannot be empty.'); return; }
        try {
          const updated = await apiFetch('PUT', `/tags/${tid}`, { name, color });
          const idx = _tags.findIndex(t => t.id === tid);
          if (idx >= 0) _tags[idx] = updated;
          _renderTags();
        } catch(e) { alert('Error: ' + e.message); }
      });
    });

    // Wire delete
    list.querySelectorAll('.s-tag-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tid = parseInt(btn.dataset.tid);
        const tag = _tags.find(t => t.id === tid);
        if (!confirm(`Delete tag "${tag?.name}"?`)) return;
        try {
          await apiFetch('DELETE', `/tags/${tid}`);
          _tags = _tags.filter(t => t.id !== tid);
          _renderTags();
        } catch(e) { alert('Error: ' + e.message); }
      });
    });
  }
});

function _applyTheme(theme, persist) {
  if (theme === 'dark') {
    document.documentElement.dataset.theme = 'dark';
  } else {
    delete document.documentElement.dataset.theme;
  }
  if (persist) localStorage.setItem('theme', theme);
}

function _showToast(msg) {
  let toast = document.getElementById('settings-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'settings-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--bg-card);border:var(--border-subtle);padding:10px 20px;border-radius:var(--radius-el);font-size:14px;color:var(--text-primary);box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:9999;transition:opacity 0.3s';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}
