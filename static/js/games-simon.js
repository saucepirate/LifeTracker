// ── Simon ─────────────────────────────────────────────────────
function startSimon(container, onGameOver, updateScore) {
  const style = document.createElement('style');
  style.textContent = `
    .simon-wrap { user-select:none; max-width:320px; margin:0 auto; text-align:center; }
    .simon-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:16px auto; max-width:280px; }
    .simon-btn { width:130px; height:130px; border-radius:50%; border:4px solid rgba(0,0,0,0.3);
                 cursor:pointer; transition:filter 0.1s; filter:brightness(0.5); }
    .simon-btn.active { filter:brightness(1.4); }
    .simon-btn[data-c="red"]    { background:#ef4444; }
    .simon-btn[data-c="blue"]   { background:#3b82f6; }
    .simon-btn[data-c="green"]  { background:#22c55e; }
    .simon-btn[data-c="yellow"] { background:#eab308; }
    .simon-status { font-family:monospace; font-size:1rem; margin-top:8px; min-height:24px; }
    .simon-level  { font-family:monospace; font-size:1.3rem; font-weight:700; margin-top:4px; }
  `;
  container.appendChild(style);

  const wrap = document.createElement('div');
  wrap.className = 'simon-wrap';
  wrap.innerHTML = `
    <div class="simon-level">Level: <span id="si-level">0</span></div>
    <div class="simon-grid">
      <div class="simon-btn" data-c="red"    id="si-red"></div>
      <div class="simon-btn" data-c="blue"   id="si-blue"></div>
      <div class="simon-btn" data-c="green"  id="si-green"></div>
      <div class="simon-btn" data-c="yellow" id="si-yellow"></div>
    </div>
    <div class="simon-status" id="si-status">Watch the sequence…</div>`;
  container.appendChild(wrap);

  const COLORS = ['red', 'blue', 'green', 'yellow'];
  const TONES  = { red: 261, blue: 329, green: 392, yellow: 523 };

  let sequence, playerIdx, level, playing, alive;
  let audioCtx = null;

  function getAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function playTone(color, dur) {
    try {
      const ac = getAudio();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.frequency.value = TONES[color];
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      osc.start(); osc.stop(ac.currentTime + dur);
    } catch(e) {}
  }

  function flash(color, dur) {
    const el = wrap.querySelector(`#si-${color}`);
    el.classList.add('active');
    playTone(color, dur / 1000);
    return new Promise(res => setTimeout(() => { el.classList.remove('active'); res(); }, dur));
  }

  async function showSequence() {
    playing = true;
    wrap.querySelector('#si-status').textContent = 'Watch…';
    const speed = Math.max(200, 600 - (level * 30));
    for (const col of sequence) {
      await flash(col, speed);
      await new Promise(res => setTimeout(res, 200));
    }
    playing = false;
    playerIdx = 0;
    wrap.querySelector('#si-status').textContent = 'Your turn!';
  }

  function init() {
    sequence = []; level = 0; playerIdx = 0; playing = false; alive = true;
    addStep();
  }

  function addStep() {
    sequence.push(COLORS[Math.floor(Math.random() * 4)]);
    level = sequence.length;
    wrap.querySelector('#si-level').textContent = level;
    updateScore(level - 1);
    setTimeout(showSequence, 500);
  }

  async function onBtnClick(color) {
    if (playing || !alive) return;
    await flash(color, 300);
    if (color === sequence[playerIdx]) {
      playerIdx++;
      if (playerIdx === sequence.length) {
        wrap.querySelector('#si-status').textContent = 'Correct! Next round…';
        setTimeout(addStep, 800);
      }
    } else {
      alive = false;
      wrap.querySelector('#si-status').textContent = `Wrong! Game over at level ${level}.`;
      playTone('red', 0.8);
      onGameOver(level - 1);
    }
  }

  COLORS.forEach(c => {
    wrap.querySelector(`#si-${c}`).addEventListener('click', () => onBtnClick(c));
  });

  init();

  return function cleanup() {
    if (audioCtx) { try { audioCtx.close(); } catch(e){} audioCtx = null; }
  };
}
