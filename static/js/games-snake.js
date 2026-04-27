// ── Snake ─────────────────────────────────────────────────────
function startSnake(container, onGameOver, updateScore) {
  const COLS = 30, ROWS = 20, CELL = 24;
  const SPEED = 7;          // frames between snake moves (fixed)
  const COUNTDOWN = 3000;   // ms before snake starts moving
  const W = COLS * CELL, H = ROWS * CELL;

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';
  canvas.style.background = '#111';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let snake, dir, nextDir, food, score, frameCount, raf, alive, startTime;

  function init() {
    snake = [{ x: 15, y: 10 }, { x: 14, y: 10 }, { x: 13, y: 10 }];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    frameCount = 0;
    alive = true;
    startTime = null;
    placeFood();
  }

  function placeFood() {
    let pos;
    do {
      pos = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    } while (snake.some(s => s.x === pos.x && s.y === pos.y));
    food = pos;
  }

  function onKey(e) {
    const map = {
      ArrowUp:    { x: 0, y: -1 },
      ArrowDown:  { x: 0, y:  1 },
      ArrowLeft:  { x: -1, y: 0 },
      ArrowRight: { x:  1, y: 0 },
    };
    const d = map[e.key];
    if (d && !(d.x === -dir.x && d.y === -dir.y)) {
      nextDir = d;
      e.preventDefault();
    }
  }

  document.addEventListener('keydown', onKey);

  function drawBoard() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= W; x += CELL) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += CELL) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    ctx.fillStyle = '#f87171';
    ctx.beginPath();
    ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2);
    ctx.fill();

    snake.forEach((seg, i) => {
      const t = i / snake.length;
      ctx.fillStyle = i === 0 ? '#4ade80' : `hsl(${140 - t * 30},70%,${45 - t * 10}%)`;
      ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
    });
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);

    if (startTime === null) startTime = ts;
    const elapsed = ts - startTime;

    // Countdown phase
    if (elapsed < COUNTDOWN) {
      const remaining = Math.ceil((COUNTDOWN - elapsed) / 1000);
      drawBoard();
      ctx.fillStyle = 'rgba(0,0,0,0.52)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${CELL * 3}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(remaining, W / 2, H / 2);
      return;
    }

    // Game phase
    frameCount++;
    if (frameCount % SPEED !== 0) {
      drawBoard();
      return;
    }

    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS ||
        snake.some(s => s.x === head.x && s.y === head.y)) {
      cancelAnimationFrame(raf);
      drawBoard();
      alive = false;
      onGameOver(score);
      return;
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      score += 10;
      updateScore(score);
      placeFood();
    } else {
      snake.pop();
    }

    drawBoard();
  }

  init();
  raf = requestAnimationFrame(loop);

  return function cleanup() {
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
  };
}
