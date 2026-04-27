// ── Flappy Bird ───────────────────────────────────────────────
function startFlappyBird(container, onGameOver, updateScore) {
  const W = 360, H = 540, PIPE_W = 60, GAP = 140, GROUND = H - 60;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';
  canvas.style.background = '#87ceeb';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let bird, pipes, score, frameCount, raf, alive, started;

  function init() {
    bird = { x: 80, y: H/2, vy: 0, r: 14 };
    pipes = []; score = 0; frameCount = 0; alive = true; started = false;
  }

  function flap() {
    if (!started) started = true;
    bird.vy = -9;
  }

  function onKey(e) { if (e.code === 'Space') { e.preventDefault(); flap(); } }
  function onClick() { flap(); }

  document.addEventListener('keydown', onKey);
  canvas.addEventListener('click', onClick);

  function addPipe() {
    const topH = 80 + Math.random() * (GROUND - GAP - 100);
    pipes.push({ x: W + PIPE_W, topH });
  }

  function draw() {
    ctx.fillStyle = '#87ceeb';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    [[60,60],[180,40],[290,70]].forEach(([cx,cy]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI*2);
      ctx.arc(cx+18, cy-8, 16, 0, Math.PI*2);
      ctx.arc(cx+36, cy, 20, 0, Math.PI*2);
      ctx.fill();
    });

    pipes.forEach(p => {
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(p.x, 0, PIPE_W, p.topH);
      ctx.fillStyle = '#15803d';
      ctx.fillRect(p.x - 4, p.topH - 20, PIPE_W + 8, 20);
      const botY = p.topH + GAP;
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(p.x, botY, PIPE_W, GROUND - botY);
      ctx.fillStyle = '#15803d';
      ctx.fillRect(p.x - 4, botY, PIPE_W + 8, 20);
    });

    ctx.fillStyle = '#92400e';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(0, GROUND, W, 8);
    ctx.fillStyle = '#65a30d';
    ctx.fillRect(0, GROUND, W, 4);

    const angle = Math.min(Math.max(bird.vy * 3, -40), 60) * Math.PI / 180;
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(angle);
    ctx.fillStyle = '#facc15';
    ctx.beginPath(); ctx.arc(0, 0, bird.r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#f97316';
    ctx.beginPath(); ctx.arc(bird.r - 4, -3, 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.ellipse(-4, 4, 8, 5, -0.3, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(4, -5, 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(5, -5, 2, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.strokeText(score, W/2, 50);
    ctx.fillText(score, W/2, 50);
    ctx.textAlign = 'left';

    if (!started) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Click or Space to Start', W/2, H/2);
      ctx.textAlign = 'left';
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    frameCount++;

    if (!started) { draw(); return; }

    bird.vy += 0.45;
    bird.y += bird.vy;

    if (frameCount % 90 === 0) addPipe();

    const pSpeed = Math.min(3 + Math.floor(score / 5) * 0.3, 6);
    pipes.forEach(p => p.x -= pSpeed);
    pipes = pipes.filter(p => p.x + PIPE_W > 0);

    pipes.forEach(p => {
      if (!p.scored && p.x + PIPE_W < bird.x) { p.scored = true; score++; updateScore(score); }
    });

    if (bird.y + bird.r >= GROUND || bird.y - bird.r <= 0) {
      cancelAnimationFrame(raf); alive = false; draw(); onGameOver(score); return;
    }

    for (const p of pipes) {
      if (bird.x + bird.r > p.x && bird.x - bird.r < p.x + PIPE_W) {
        if (bird.y - bird.r < p.topH || bird.y + bird.r > p.topH + GAP) {
          cancelAnimationFrame(raf); alive = false; draw(); onGameOver(score); return;
        }
      }
    }

    draw();
  }

  init();
  loop();

  return function cleanup() {
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
    canvas.removeEventListener('click', onClick);
  };
}
