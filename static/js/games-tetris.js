// ── Tetris ────────────────────────────────────────────────────
function startTetris(container, onGameOver, updateScore) {
  const COLS = 10, ROWS = 20, CELL = 30;
  const W = COLS * CELL, H = ROWS * CELL;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;gap:16px;justify-content:center;align-items:flex-start';
  container.appendChild(wrapper);

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.background = '#111';
  wrapper.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const sideDiv = document.createElement('div');
  sideDiv.style.cssText = 'color:#fff;font-family:monospace;min-width:100px;padding-top:8px';
  sideDiv.innerHTML = '<div style="margin-bottom:8px">NEXT</div><canvas id="tc-next" width="120" height="120" style="background:#111;display:block"></canvas><div id="tc-level" style="margin-top:16px">Level 1</div><div id="tc-lines" style="margin-top:4px">Lines 0</div>';
  wrapper.appendChild(sideDiv);

  const nextCanvas = sideDiv.querySelector('#tc-next');
  const nCtx = nextCanvas.getContext('2d');

  const PIECES = {
    I: { cells: [[0,1],[1,1],[2,1],[3,1]], color: '#22d3ee' },
    O: { cells: [[0,0],[1,0],[0,1],[1,1]], color: '#facc15' },
    T: { cells: [[1,0],[0,1],[1,1],[2,1]], color: '#a855f7' },
    S: { cells: [[1,0],[2,0],[0,1],[1,1]], color: '#4ade80' },
    Z: { cells: [[0,0],[1,0],[1,1],[2,1]], color: '#f87171' },
    J: { cells: [[0,0],[0,1],[1,1],[2,1]], color: '#3b82f6' },
    L: { cells: [[2,0],[0,1],[1,1],[2,1]], color: '#fb923c' },
  };
  const PIECE_KEYS = Object.keys(PIECES);

  let board, current, next, score, level, lines, dropTimer, raf, alive;
  let keys = {};

  function newPiece(type) {
    const p = PIECES[type];
    return { type, color: p.color, cells: p.cells.map(c => [...c]), x: Math.floor(COLS/2) - 2, y: 0 };
  }

  function randPiece() { return PIECE_KEYS[Math.floor(Math.random() * PIECE_KEYS.length)]; }

  function init() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    current = newPiece(randPiece());
    next = newPiece(randPiece());
    score = 0; level = 1; lines = 0; dropTimer = 0; alive = true;
  }

  function absPos(piece) { return piece.cells.map(([cx, cy]) => [cx + piece.x, cy + piece.y]); }

  function valid(cells) {
    return cells.every(([x, y]) => x >= 0 && x < COLS && y < ROWS && (y < 0 || !board[y][x]));
  }

  function rotate(piece) {
    const rotated = piece.cells.map(([cx, cy]) => [-cy, cx]);
    const minX = Math.min(...rotated.map(([x]) => x));
    const minY = Math.min(...rotated.map(([, y]) => y));
    const shifted = rotated.map(([x, y]) => [x - minX, y - minY]);
    const np = { ...piece, cells: shifted };
    if (valid(absPos(np))) return np;
    for (const dx of [1, -1, 2, -2]) {
      const kp = { ...np, x: np.x + dx };
      if (valid(absPos(kp))) return kp;
    }
    return piece;
  }

  function lock() {
    absPos(current).forEach(([x, y]) => { if (y >= 0) board[y][x] = current.color; });
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every(c => c)) {
        board.splice(r, 1);
        board.unshift(Array(COLS).fill(null));
        cleared++; r++;
      }
    }
    if (cleared) {
      const pts = [0, 100, 300, 500, 800][cleared] * level;
      score += pts; updateScore(score);
      lines += cleared;
      level = Math.floor(lines / 10) + 1;
      sideDiv.querySelector('#tc-level').textContent = `Level ${level}`;
      sideDiv.querySelector('#tc-lines').textContent = `Lines ${lines}`;
    }
    current = next;
    next = newPiece(randPiece());
    if (!valid(absPos(current))) { cancelAnimationFrame(raf); alive = false; onGameOver(score); }
  }

  function hardDrop() {
    while (valid(absPos({ ...current, y: current.y + 1 }))) current.y++;
    lock();
  }

  function onKey(e) {
    if (!alive) return;
    if (e.key === 'ArrowLeft')  { const np = { ...current, x: current.x - 1 }; if (valid(absPos(np))) current = np; e.preventDefault(); }
    else if (e.key === 'ArrowRight') { const np = { ...current, x: current.x + 1 }; if (valid(absPos(np))) current = np; e.preventDefault(); }
    else if (e.key === 'ArrowDown')  { const np = { ...current, y: current.y + 1 }; if (valid(absPos(np))) current = np; else lock(); e.preventDefault(); }
    else if (e.key === 'ArrowUp')    { current = rotate(current); e.preventDefault(); }
    else if (e.key === ' ')          { hardDrop(); e.preventDefault(); }
  }
  document.addEventListener('keydown', onKey);

  function drawCell(c, x, y, alpha) {
    if (!c) return;
    ctx.globalAlpha = alpha || 1;
    ctx.fillStyle = c;
    ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.strokeRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    ctx.globalAlpha = 1;
  }

  function ghostY() {
    let gy = current.y;
    while (valid(absPos({ ...current, y: gy + 1 }))) gy++;
    return gy;
  }

  function draw() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c*CELL,0); ctx.lineTo(c*CELL,H); ctx.stroke(); }
    for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0,r*CELL); ctx.lineTo(W,r*CELL); ctx.stroke(); }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) drawCell(board[r][c], c, r);
    const gy = ghostY();
    absPos({ ...current, y: gy }).forEach(([x, y]) => { if (y >= 0) drawCell(current.color, x, y, 0.25); });
    absPos(current).forEach(([x, y]) => { if (y >= 0) drawCell(current.color, x, y); });
    nCtx.fillStyle = '#111'; nCtx.fillRect(0, 0, 120, 120);
    next.cells.forEach(([cx, cy]) => {
      nCtx.fillStyle = next.color;
      nCtx.fillRect(cx*28+10, cy*28+10, 26, 26);
      nCtx.strokeStyle = 'rgba(255,255,255,0.2)';
      nCtx.strokeRect(cx*28+10, cy*28+10, 26, 26);
    });
  }

  let last = 0;
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    const dt = ts - last; last = ts;
    const interval = Math.max(100, 700 - (level - 1) * 60);
    dropTimer += dt;
    if (dropTimer >= interval) {
      dropTimer = 0;
      const np = { ...current, y: current.y + 1 };
      if (valid(absPos(np))) current = np; else lock();
    }
    draw();
  }

  init();
  requestAnimationFrame(loop);

  return function cleanup() {
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
    keys = {};
  };
}
