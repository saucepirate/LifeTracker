// ── Number Recall ─────────────────────────────────────────────
function startNumberRecall(container, onGameOver, updateScore) {
  const style = document.createElement('style');
  style.textContent = `
    .nr-wrap { max-width:360px; margin:0 auto; text-align:center; font-family:monospace; color:#fff; padding:20px; }
    .nr-display { font-size:2.4rem; font-weight:700; letter-spacing:6px; min-height:60px; margin:24px 0;
                  color:#facc15; transition:opacity 0.3s; }
    .nr-input { font-size:1.6rem; padding:10px 16px; border-radius:8px; border:2px solid #4b5563;
                background:#1e293b; color:#fff; width:100%; box-sizing:border-box; text-align:center;
                letter-spacing:4px; }
    .nr-status { min-height:28px; font-size:1rem; margin-top:12px; }
    .nr-level  { font-size:1.3rem; font-weight:700; margin-bottom:8px; }
  `;
  container.appendChild(style);

  const wrap = document.createElement('div');
  wrap.className = 'nr-wrap';
  wrap.innerHTML = `
    <div class="nr-level">Digits: <span id="nr-len">4</span></div>
    <div id="nr-display" class="nr-display"></div>
    <input id="nr-input" class="nr-input" type="text" inputmode="numeric" placeholder="Type digits…" disabled>
    <div id="nr-status" class="nr-status">Get ready…</div>`;
  container.appendChild(wrap);

  let n = 4, current = '', alive = true;
  let showTimer = null, hideTimer = null;

  const displayEl = wrap.querySelector('#nr-display');
  const inputEl   = wrap.querySelector('#nr-input');
  const statusEl  = wrap.querySelector('#nr-status');
  const lenEl     = wrap.querySelector('#nr-len');

  function genDigits(len) {
    let s = '';
    for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
    return s;
  }

  function nextRound() {
    lenEl.textContent = n;
    current = genDigits(n);
    inputEl.value = '';
    inputEl.disabled = true;
    statusEl.textContent = 'Memorise!';
    displayEl.style.opacity = '1';
    displayEl.textContent = current;

    const showDur = Math.max(1500, 3000 - (n - 4) * 100);
    hideTimer = setTimeout(() => {
      displayEl.style.opacity = '0';
      displayEl.textContent = '';
      statusEl.textContent = 'Type what you saw…';
      inputEl.disabled = false;
      inputEl.focus();
    }, showDur);
  }

  function onInput() {
    if (!alive) return;
    const val = inputEl.value.replace(/\D/g, '');
    inputEl.value = val;
    if (val.length === current.length) {
      inputEl.disabled = true;
      if (val === current) {
        statusEl.textContent = `Correct! +1 digit`;
        updateScore(n);
        n++;
        setTimeout(nextRound, 700);
      } else {
        statusEl.textContent = `Wrong! It was ${current}. Game over!`;
        alive = false;
        onGameOver(n - 1);
      }
    }
  }

  inputEl.addEventListener('input', onInput);

  setTimeout(nextRound, 600);

  return function cleanup() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    inputEl.removeEventListener('input', onInput);
  };
}
