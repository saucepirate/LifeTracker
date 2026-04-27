// ── Snake ─────────────────────────────────────────────────────
function startSnake(container, onGameOver, updateScore) {
  const COLS = 20, ROWS = 20, CELL = 24;
  const W = COLS * CELL, H = ROWS * CELL;

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';
  canvas.style.background = '#111';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let snake, dir, nextDir, food, score, speed, frameCount, raf, alive;

  function init() {
    snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    speed = 8;
    frameCount = 0;
    alive = true;
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

  function draw() {
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

  function loop() {
    raf = requestAnimationFrame(loop);
    frameCount++;
    if (frameCount % Math.max(2, 10 - Math.floor(speed / 2)) !== 0) {
      draw();
      return;
    }

    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      cancelAnimationFrame(raf);
      draw();
      alive = false;
      onGameOver(score);
      return;
    }
    if (snake.some(s => s.x === head.x && s.y === head.y)) {
      cancelAnimationFrame(raf);
      draw();
      alive = false;
      onGameOver(score);
      return;
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      score += 10;
      updateScore(score);
      const eaten = Math.floor(score / 10);
      speed = 8 + Math.floor(eaten / 5) * 2;
      placeFood();
    } else {
      snake.pop();
    }

    draw();
  }

  init();
  loop();

  return function cleanup() {
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
  };
}
