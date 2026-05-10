// trips-budget.js — Budget tab

const BUDGET_CATS = {
  'Flights':       { icon: '✈',  color: '#4A90D9' },
  'Accommodation': { icon: '🏨', color: '#8B5CF6' },
  'Food & Drink':  { icon: '🍽', color: '#E8A624' },
  'Activities':    { icon: '🎯', color: '#2BAE8E' },
  'Transport':     { icon: '🚗', color: '#4CAF50' },
  'Shopping':      { icon: '🛍', color: '#E879A4' },
  'Other':         { icon: '📌', color: '#8A8A8A' },
};

const BUDGET_PHASES = {
  pre_trip:  'Pre-trip',
  in_trip:   'During trip',
  post_trip: 'Post-trip',
};

let _budgTrip        = null;
let _budgData        = null;
let _budgPhaseFilter = 'all';
let _budgCatFilter   = null;

let _budgProjData = null;

async function renderBudgetTab(container, trip) {
  _budgTrip        = trip;
  _budgPhaseFilter = 'all';
  _budgCatFilter   = null;
  _budgProjData    = null;
  container.innerHTML = '<div class="loading-state">Loading budget…</div>';
  try {
    const fetches = [apiFetch('GET', `/trips/${trip.id}/budget`)];
    if (trip.project_id) fetches.push(apiFetch('GET', `/projects/${trip.project_id}`));
    const [budgData, projData] = await Promise.all(fetches);
    _budgData    = budgData;
    _budgProjData = projData || null;
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p class="empty-state-text">${escHtml(e.message)}</p></div>`;
    return;
  }
  _renderBudget(container);
}

function _renderBudget(container) {
  const d    = _budgData;
  const trip = _budgTrip;
  const cur  = d.budget_currency || 'USD';
  const fmt  = v => _fmtMoney(v, cur);

  const budgetSet  = d.budget_total != null;
  const pct        = budgetSet && d.budget_total > 0
    ? Math.min(100, Math.round(d.total_out / d.budget_total * 100)) : 0;
  const overBudget = budgetSet && d.total_out > d.budget_total;

  // Category breakdown — only cats with expenses, sorted by amount desc
  const catEntries = Object.entries(d.by_category).sort((a, b) => b[1] - a[1]);
  const maxCat     = catEntries.length ? catEntries[0][1] : 0;

  // Filter + group expenses by phase and/or category
  const filtered = d.expenses.filter(e =>
    (_budgPhaseFilter === 'all' || e.phase === _budgPhaseFilter) &&
    (_budgCatFilter === null    || e.category === _budgCatFilter)
  );

  const grouped = { pre_trip: [], in_trip: [], post_trip: [] };
  filtered.forEach(e => { if (grouped[e.phase]) grouped[e.phase].push(e); });

  container.innerHTML = `
    <div class="budg-wrap">

      <!-- Header: total budget + progress bar -->
      <div class="budg-header">
        <div class="budg-total-row">
          <span class="budg-total-label">Total Budget</span>
          <span class="budg-total-amt budg-editable" contenteditable="true"
                id="budg-total-el"
                data-raw="${budgetSet ? d.budget_total : ''}"
          >${budgetSet ? fmt(d.budget_total) : 'Set budget…'}</span>
          <span class="budg-currency">${cur}</span>
        </div>
        <div class="budg-bar-row">
          <div class="budg-bar ${overBudget ? 'budg-bar-over' : ''}">
            <div class="budg-bar-fill" style="width:${pct}%"></div>
          </div>
          <span class="budg-bar-label ${overBudget ? 'budg-over-text' : ''}">
            ${budgetSet
              ? (overBudget ? `${fmt(d.total_out - d.budget_total)} over budget` : `${pct}% used · ${fmt(d.remaining)} left`)
              : `${fmt(d.total_out)} total out`}
          </span>
        </div>
      </div>

      <!-- Summary tiles -->
      <div class="budg-tiles">
        <div class="budg-tile">
          <div class="budg-tile-val">${fmt(d.committed)}</div>
          <div class="budg-tile-lbl">Committed</div>
        </div>
        <div class="budg-tile">
          <div class="budg-tile-val">${fmt(d.spent)}</div>
          <div class="budg-tile-lbl">Spent</div>
        </div>
        <div class="budg-tile">
          <div class="budg-tile-val">${fmt(d.post_trip)}</div>
          <div class="budg-tile-lbl">Post-trip</div>
        </div>
        <div class="budg-tile ${overBudget ? 'budg-tile-danger' : (budgetSet && d.remaining >= 0 ? 'budg-tile-good' : '')}">
          <div class="budg-tile-val">${budgetSet ? fmt(Math.abs(d.remaining)) : fmt(d.total_out)}</div>
          <div class="budg-tile-lbl">${budgetSet ? (overBudget ? 'Over budget' : 'Remaining') : 'Total out'}</div>
          ${budgetSet ? `<div class="budg-tile-sub">of ${fmt(d.budget_total)}</div>` : ''}
        </div>
      </div>

      <!-- Category breakdown -->
      ${catEntries.length ? `
        <div class="budg-section-hdr">By Category</div>
        <div class="budg-cats">
          ${catEntries.map(([cat, amt]) => {
            const info      = BUDGET_CATS[cat] || BUDGET_CATS['Other'];
            const barPct    = maxCat > 0 ? Math.round(amt / maxCat * 100) : 0;
            const ofTotal   = d.total_out > 0 ? Math.round(amt / d.total_out * 100) : 0;
            const isActive = _budgCatFilter === cat;
            return `
              <div class="budg-cat-row${isActive ? ' budg-cat-row-active' : ''}" data-cat="${escHtml(cat)}" title="${isActive ? 'Click to clear filter' : `Click to filter by ${cat}`}">
                <span class="budg-cat-icon">${info.icon}</span>
                <span class="budg-cat-name">${escHtml(cat)}</span>
                <div class="budg-cat-bar-track">
                  <div class="budg-cat-bar-fill" style="width:${barPct}%;background:${info.color}"></div>
                </div>
                <span class="budg-cat-pct">${ofTotal}%</span>
                <span class="budg-cat-amt">${fmt(amt)}</span>
                <span class="budg-cat-filter-icon">${isActive ? '✕' : '⊙'}</span>
              </div>`;
          }).join('')}
        </div>
      ` : ''}

      <!-- Project planning estimates -->
      ${_budgProjData ? (() => {
        const proj = _budgProjData;
        const estimated = proj.tasks.reduce((s, t) => s + (t.estimated_cost || 0), 0);
        const actual    = proj.tasks.reduce((s, t) => s + (t.actual_cost    || 0), 0);
        if (estimated === 0 && actual === 0) return '';
        const projFmt   = v => _fmtMoney(v, cur);
        const budgTasks = proj.tasks.filter(t => t.estimated_cost != null || t.actual_cost != null);
        return `
          <div class="budg-section-hdr" style="margin-top:16px">
            Planning Estimates
            <a class="budg-proj-link" data-proj-id="${proj.id}" href="#" style="margin-left:8px;font-size:12px;color:var(--neon-cyan)">View project ↗</a>
          </div>
          <div class="budg-tiles" style="margin-bottom:8px">
            <div class="budg-tile">
              <div class="budg-tile-val">${projFmt(estimated)}</div>
              <div class="budg-tile-lbl">Estimated</div>
            </div>
            <div class="budg-tile">
              <div class="budg-tile-val">${projFmt(actual)}</div>
              <div class="budg-tile-lbl">Actual</div>
            </div>
            <div class="budg-tile">
              <div class="budg-tile-val" style="color:var(--text-muted)">${proj.task_done}/${proj.task_total}</div>
              <div class="budg-tile-lbl">Tasks done</div>
            </div>
            ${d.budget_total ? `<div class="budg-tile">
              <div class="budg-tile-val">${Math.round(estimated / d.budget_total * 100)}%</div>
              <div class="budg-tile-lbl">of trip budget</div>
            </div>` : ''}
          </div>
          ${budgTasks.length ? `<div class="budg-proj-tasks">
            ${budgTasks.slice(0, 8).map(t => `
              <div class="budg-proj-task-row${t.status === 'done' ? ' done' : ''}">
                <span class="budg-proj-task-name">${escHtml(t.title)}</span>
                ${t.estimated_cost != null ? `<span class="budg-proj-task-est">${projFmt(t.estimated_cost)}</span>` : '<span></span>'}
                ${t.actual_cost != null ? `<span class="budg-proj-task-act">${projFmt(t.actual_cost)}</span>` : '<span style="opacity:.4">—</span>'}
              </div>`).join('')}
            ${budgTasks.length > 8 ? `<div style="font-size:12px;color:var(--text-muted);padding:4px 8px">+${budgTasks.length - 8} more tasks — view in project</div>` : ''}
          </div>` : ''}`;
      })() : ''}

      <!-- Toolbar -->
      <div class="budg-toolbar">
        <button class="btn btn-primary btn-sm" id="budg-add-btn">+ Add Expense</button>
        <div class="budg-phase-tabs">
          ${['all', 'pre_trip', 'in_trip', 'post_trip'].map(p => `
            <button class="budg-phase-tab${_budgPhaseFilter === p ? ' active' : ''}" data-phase="${p}">
              ${p === 'all' ? 'All' : BUDGET_PHASES[p]}
            </button>`).join('')}
        </div>
      </div>

      <!-- Expense list -->
      ${filtered.length === 0 ? `
        <div class="empty-state" style="padding:32px 0">
          <p class="empty-state-text">${
            d.expenses.length === 0
              ? 'No expenses yet — add your first one above.'
              : 'No expenses match the current filters.'
          }</p>
        </div>
      ` : Object.entries(BUDGET_PHASES).map(([phase, label]) => {
          const exps = grouped[phase];
          if (!exps.length) return '';
          const phaseTotal = exps.reduce((s, e) => s + e.amount, 0);
          return `
            <div class="budg-phase-group">
              <div class="budg-phase-hdr">
                <span>${label}</span>
                <span class="budg-phase-total">${fmt(phaseTotal)}</span>
              </div>
              ${exps.map(e => _expenseHTML(e, cur)).join('')}
            </div>`;
        }).join('')}

    </div>
  `;

  _bindBudgetEvents(container, trip);
}

function _expenseHTML(e, cur) {
  const info   = BUDGET_CATS[e.category] || BUDGET_CATS['Other'];
  const paidBy = e.paid_by && e.paid_by !== 'shared' ? e.paid_by : null;
  return `
    <div class="budg-expense" data-exp-id="${e.id}">
      <span class="budg-exp-icon" style="color:${info.color}">${info.icon}</span>
      <div class="budg-exp-body">
        <span class="budg-exp-desc">${e.description ? escHtml(e.description) : escHtml(e.category)}</span>
        <span class="budg-exp-meta">
          <span class="budg-exp-cat-badge" style="--cat-color:${info.color}">${escHtml(e.category)}</span>
          ${e.expense_date ? `<span class="budg-exp-date">${formatDateShort(e.expense_date)}</span>` : ''}
          ${paidBy ? `<span class="budg-exp-who">Paid by ${escHtml(paidBy)}</span>` : ''}
        </span>
      </div>
      <span class="budg-exp-amt">${_fmtMoney(e.amount, cur)}</span>
      <div class="budg-exp-acts">
        <button class="btn-icon budg-exp-edit" data-exp-id="${e.id}" title="Edit">✎</button>
        <button class="btn-icon-danger budg-exp-del" data-exp-id="${e.id}" title="Delete">✕</button>
      </div>
    </div>
  `;
}

// ── Event binding ──────────────────────────────────────────────

function _bindBudgetEvents(container, trip) {
  const get = sel => container.querySelector(sel);

  // Budget total inline edit
  const totalEl = get('#budg-total-el');
  if (totalEl) {
    totalEl.addEventListener('focus', () => {
      // Replace formatted value with raw number for editing
      const raw = totalEl.dataset.raw;
      totalEl.textContent = raw || '';
      // select all
      const range = document.createRange();
      range.selectNodeContents(totalEl);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    });
    totalEl.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); totalEl.blur(); }
      if (e.key === 'Escape') {
        totalEl.dataset.raw
          ? (totalEl.textContent = _fmtMoney(parseFloat(totalEl.dataset.raw), _budgData.budget_currency))
          : (totalEl.textContent = 'Set budget…');
        totalEl.blur();
      }
    });
    totalEl.addEventListener('blur', async () => {
      const raw = parseFloat(totalEl.textContent.replace(/[^0-9.]/g, ''));
      if (isNaN(raw) || raw < 0) {
        totalEl.dataset.raw
          ? (totalEl.textContent = _fmtMoney(parseFloat(totalEl.dataset.raw), _budgData.budget_currency))
          : (totalEl.textContent = 'Set budget…');
        return;
      }
      if (raw.toString() === totalEl.dataset.raw) {
        totalEl.textContent = _fmtMoney(raw, _budgData.budget_currency);
        return;
      }
      try {
        await apiFetch('PUT', `/trips/${trip.id}`, { budget_total: raw });
        _budgData.budget_total = raw;
        _budgData.remaining    = round2(raw - _budgData.total_out);
        totalEl.dataset.raw    = raw.toString();
        _renderBudget(container);
      } catch (e) { alert(e.message); }
    });
  }

  // Project link → navigate to project
  container.querySelector('.budg-proj-link')?.addEventListener('click', e => {
    e.preventDefault();
    window._openProjectId = parseInt(e.target.dataset.projId);
    loadPage('projects');
  });

  // Phase filter tabs
  container.querySelectorAll('.budg-phase-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _budgPhaseFilter = btn.dataset.phase;
      _renderBudget(container);
    });
  });

  // Category filter — click row to filter, click active row to clear
  container.querySelectorAll('.budg-cat-row').forEach(row => {
    row.addEventListener('click', () => {
      _budgCatFilter = _budgCatFilter === row.dataset.cat ? null : row.dataset.cat;
      _renderBudget(container);
    });
  });

  // Category bar click → filter to that phase (or filter by cat in future)
  // (left as a no-op for now — bars are informational)

  // Add expense — pre-fill phase when a filter is active
  get('#budg-add-btn').addEventListener('click', () => {
    const defaultPhase = _budgPhaseFilter !== 'all' ? _budgPhaseFilter : null;
    _openExpenseModal(container, trip, null, defaultPhase);
  });

  // Edit expense
  container.querySelectorAll('.budg-exp-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const exp = _budgData.expenses.find(e => e.id === parseInt(btn.dataset.expId));
      _openExpenseModal(container, trip, exp);
    });
  });

  // Delete expense
  container.querySelectorAll('.budg-exp-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this expense?')) return;
      const expId = parseInt(btn.dataset.expId);
      try {
        await apiFetch('DELETE', `/trips/${trip.id}/budget/expenses/${expId}`);
        _budgData = await apiFetch('GET', `/trips/${trip.id}/budget`);
        _renderBudget(container);
      } catch (e) { alert(e.message); }
    });
  });
}

// ── Expense modal ──────────────────────────────────────────────

function _openExpenseModal(container, trip, exp, defaultPhase = null) {
  const isEdit    = !!exp;
  const attendees = _budgTrip.attendees || [];
  const cur       = _budgData.budget_currency || 'USD';
  const selCat    = exp?.category || 'Other';
  const selPhase  = exp?.phase || defaultPhase || 'in_trip';

  const catPicker = Object.keys(BUDGET_CATS).map(c => {
    const info = BUDGET_CATS[c];
    return `<button type="button" class="budg-cat-opt${selCat === c ? ' selected' : ''}"
                    data-value="${c}" tabindex="${selCat === c ? '0' : '-1'}">
              <span style="color:${info.color}">${info.icon}</span>
              <span>${c}</span>
            </button>`;
  }).join('');

  const phaseOpts = Object.entries(BUDGET_PHASES).map(([val, label]) =>
    `<option value="${val}"${selPhase === val ? ' selected' : ''}>${label}</option>`
  ).join('');

  const paidByOpts = [
    `<option value="shared"${(!exp?.paid_by || exp.paid_by === 'shared') ? ' selected' : ''}>Shared / everyone</option>`,
    ...attendees.map(a =>
      `<option value="${escHtml(a.name)}"${exp?.paid_by === a.name ? ' selected' : ''}>${escHtml(a.name)}</option>`
    ),
  ].join('');

  const bodyHTML = `
    <div class="form-group">
      <label class="form-label">Description</label>
      <input class="form-input" id="exp-desc" type="text"
             value="${escHtml(exp?.description || '')}" placeholder="e.g. Flight to Paris">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group">
        <label class="form-label">Amount (${cur})</label>
        <input class="form-input" id="exp-amt" type="number" min="0" step="0.01"
               value="${exp?.amount ?? ''}" placeholder="0.00">
      </div>
      <div class="form-group">
        <label class="form-label">Date</label>
        <input class="form-input" id="exp-date" type="date" value="${exp?.expense_date || ''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Category</label>
      <input type="hidden" id="exp-cat" value="${selCat}">
      <div class="budg-cat-picker" id="exp-cat-picker">${catPicker}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group">
        <label class="form-label">Phase</label>
        <select class="form-input" id="exp-phase">${phaseOpts}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Paid by</label>
        <select class="form-input" id="exp-who">${paidByOpts}</select>
      </div>
    </div>
  `;

  const overlay = createModal(
    isEdit ? 'Edit Expense' : 'Add Expense',
    bodyHTML,
    async ov => {
      const amount = parseFloat(ov.querySelector('#exp-amt').value);
      if (isNaN(amount) || amount <= 0) { alert('Enter a valid amount greater than 0.'); return; }

      const desc  = ov.querySelector('#exp-desc').value.trim() || null;
      const date  = ov.querySelector('#exp-date').value || null;
      const body  = {
        amount,
        category:     ov.querySelector('#exp-cat').value,
        description:  desc,
        expense_date: date,
        paid_by:      ov.querySelector('#exp-who').value,
        phase:        ov.querySelector('#exp-phase').value,
      };

      try {
        if (isEdit) {
          _budgData = await apiFetch('PUT', `/trips/${trip.id}/budget/expenses/${exp.id}`, {
            ...body,
            clear_description: !desc  && !!exp.description,
            clear_date:        !date  && !!exp.expense_date,
          });
        } else {
          _budgData = await apiFetch('POST', `/trips/${trip.id}/budget/expenses`, body);
        }
        closeModal(ov); ov.remove();
        _renderBudget(container);
      } catch (e) { alert(e.message); }
    },
    isEdit ? 'Save' : 'Add Expense'
  );

  // Wire up category picker keyboard + click navigation
  const hiddenCat = overlay.querySelector('#exp-cat');
  const opts      = Array.from(overlay.querySelectorAll('.budg-cat-opt'));

  function _selectCatOpt(opt) {
    opts.forEach(o => { o.classList.remove('selected'); o.tabIndex = -1; });
    opt.classList.add('selected');
    opt.tabIndex = 0;
    hiddenCat.value = opt.dataset.value;
    opt.focus();
  }

  opts.forEach(opt => opt.addEventListener('click', () => _selectCatOpt(opt)));

  opts.forEach(opt => opt.addEventListener('keydown', e => {
    const idx = opts.indexOf(opt);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      _selectCatOpt(opts[(idx + 1) % opts.length]);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      _selectCatOpt(opts[(idx - 1 + opts.length) % opts.length]);
    }
  }));

  openModal(overlay);
}

function round2(n) { return Math.round(n * 100) / 100; }
