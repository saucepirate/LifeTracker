// ── 2048 ──────────────────────────────────────────────────────
function start2048(container, onGameOver, updateScore) {
  const SIZE = 4;

  const style = document.createElement('style');
  style.textContent = `
    .g2048-wrap { user-select:none; font-family:monospace; max-width:360px; margin:0 auto; }
    .g2048-grid { display:grid; grid-template-columns:repeat(4,80px); gap:8px; background:#bbada0; padding:8px; border-radius:8px; }
    .g2048-cell { width:80px; height:80px; border-radius:6px; display:flex; align-items:center; justify-content:center;
                  font-size:24px; font-weight:700; transition:all 0.08s; }
    .g2048-msg { text-align:center; margin-top:16px; font-size:1.2rem; font-weight:700; color:#f59e0b; min-height:28px; }
  `;
  container.appendChild(style);

  const wrap = document.createElement('div');
  wrap.className = 'g2048-wrap';
  container.appendChild(wrap);

  const gridEl = document.createElement('div');
  gridEl.className = 'g2048-grid';
  wrap.appendChild(gridEl);

  const msg = document.createElement('div');
  msg.className = 'g2048-msg';
  wrap.appendChild(msg);

  const COLORS = {
    0:'#cdc1b4', 2:'#eee4da', 4:'#ede0c8', 8:'#f2b179', 16:'#f59563',
    32:'#f67c5f', 64:'#f65e3b', 128:'#edcf72', 256:'#edcc61',
    512:'#edc850', 1024:'#edc53f', 2048:'#edc22e',
  };
  const TEXT_COLORS = { 0:'#cdc1b4', 2:'#776e65', 4:'#776e65' };

  let board, score, won, over;

  function newBoard() { return Array.from({ length: SIZE }, () => Array(SIZE).fill(0)); }

  function addRandom(b) {
    const empty = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!b[r][c]) empty.push([r,c]);
    if (!empty.length) return;
    const [r,c] = empty[Math.floor(Math.random()*empty.length)];
    b[r][c] = Math.random() < 0.9 ? 2 : 4;
  }

  function init() {
    board = newBoard(); score = 0; won = false; over = false;
    addRandom(board); addRandom(board);
    render();
  }

  function slide(row) {
    const r = row.filter(v => v);
    let gained = 0;
    for (let i = 0; i < r.length - 1; i++) {
      if (r[i] === r[i+1]) { r[i] *= 2; gained += r[i]; r.splice(i+1, 1); }
    }
    while (r.length < SIZE) r.push(0);
    return { row: r, gained };
  }

  function move(dir) {
    if (over) return;
    let changed = false, gained = 0;
    const b = board.map(r => [...r]);

    if (dir === 'left') {
      for (let r = 0; r < SIZE; r++) {
        const { row, gained: g } = slide(b[r]);
        if (row.some((v,i) => v !== board[r][i])) changed = true;
        b[r] = row; gained += g;
      }
    } else if (dir === 'right') {
      for (let r = 0; r < SIZE; r++) {
        const { row, gained: g } = slide([...b[r]].reverse());
        row.reverse();
        if (row.some((v,i) => v !== board[r][i])) changed = true;
        b[r] = row; gained += g;
      }
    } else if (dir === 'up') {
      for (let c = 0; c < SIZE; c++) {
        const col = b.map(r => r[c]);
        const { row, gained: g } = slide(col);
        if (row.some((v,i) => v !== board[i][c])) changed = true;
        row.forEach((v,i) => b[i][c] = v); gained += g;
      }
    } else if (dir === 'down') {
      for (let c = 0; c < SIZE; c++) {
        const col = b.map(r => r[c]).reverse();
        const { row, gained: g } = slide(col);
        row.reverse();
        if (row.some((v,i) => v !== board[i][c])) changed = true;
        row.forEach((v,i) => b[i][c] = v); gained += g;
      }
    }

    if (!changed) return;
    board = b;
    score += gained;
    updateScore(score);
    addRandom(board);

    if (!won && board.some(row => row.includes(2048))) {
      won = true; msg.textContent = 'You reached 2048! Keep going!';
    }

    const canMove = board.some(row => row.includes(0)) ||
      board.some((row,r) => row.some((v,c) =>
        (c < SIZE-1 && v === row[c+1]) || (r < SIZE-1 && v === board[r+1][c])
      ));
    if (!canMove) { over = true; msg.textContent = 'No moves left!'; onGameOver(score); }

    render();
  }

  function render() {
    gridEl.innerHTML = '';
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const v = board[r][c];
      const cell = document.createElement('div');
      cell.className = 'g2048-cell';
      cell.style.background = COLORS[v] || '#3d3a32';
      cell.style.color = TEXT_COLORS[v] || '#f9f6f2';
      cell.style.fontSize = v >= 1024 ? '18px' : '24px';
      cell.textContent = v || '';
      gridEl.appendChild(cell);
    }
  }

  function onKey(e) {
    const map = { ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down' };
    const d = map[e.key];
    if (d) { move(d); e.preventDefault(); }
  }

  let touchStartX, touchStartY;
  function onTouchStart(e) { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; }
  function onTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
    else move(dy > 0 ? 'down' : 'up');
  }

  document.addEventListener('keydown', onKey);
  container.addEventListener('touchstart', onTouchStart);
  container.addEventListener('touchend', onTouchEnd);

  init();

  return function cleanup() {
    document.removeEventListener('keydown', onKey);
    container.removeEventListener('touchstart', onTouchStart);
    container.removeEventListener('touchend', onTouchEnd);
  };
}
