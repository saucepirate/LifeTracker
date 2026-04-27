// ── Runner ────────────────────────────────────────────────────
function startRunner(container, onGameOver, updateScore) {
  const W = 400, H = 192, GROUND = 155;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let player, obstacles, score, speed, raf, frameCount, alive;

  function init() {
    player = { x: 70, y: GROUND - 32, w: 26, h: 32, vy: 0, jumping: false };
    obstacles = [];
    score = 0; speed = 4.5; frameCount = 0; alive = true;
  }

  function jump() {
    if (!player.jumping && alive) { player.vy = -13; player.jumping = true; }
  }

  function onKey(e) {
    if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); jump(); }
  }
  function onClick() { jump(); }

  document.addEventListener('keydown', onKey);
  canvas.addEventListener('click', onClick);

  function spawnObs() {
    const h = 22 + Math.random() * 28;
    const w = h > 38 ? 13 : 19;
    obstacles.push({ x: W + 10, y: GROUND - h, w, h });
  }

  function drawGoose(px, py, frame) {
    const legPhase = Math.floor(frame / 6) % 2;
    ctx.save();

    ctx.fillStyle = '#efefef';
    ctx.beginPath();
    ctx.ellipse(px + 13, py + 19, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(px + 2, py + 18, 5, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#e2e2e2';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px + 21, py + 13);
    ctx.quadraticCurveTo(px + 27, py + 5, px + 21, py - 1);
    ctx.stroke();

    ctx.fillStyle = '#e2e2e2';
    ctx.beginPath();
    ctx.ellipse(px + 20, py - 3, 6, 5, 0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#484848';
    ctx.beginPath();
    ctx.moveTo(px + 25, py - 5);
    ctx.lineTo(px + 33, py - 3);
    ctx.lineTo(px + 25, py - 1);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(px + 22, py - 4, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px + 22.5, py - 4.5, 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const l1bx = px + 10 + (legPhase ? 3 : -2);
    const l2bx = px + 17 + (legPhase ? -3 : 2);
    ctx.beginPath(); ctx.moveTo(px + 10, py + 25); ctx.lineTo(l1bx, py + 32); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + 17, py + 25); ctx.lineTo(l2bx, py + 32); ctx.stroke();

    [[l1bx, py + 32], [l2bx, py + 32]].forEach(([lx, ly]) => {
      ctx.fillStyle = '#888';
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + 7, ly + 1);
      ctx.lineTo(lx + 5, ly + 3);
      ctx.lineTo(lx + 2, ly + 2);
      ctx.lineTo(lx - 1, ly + 3);
      ctx.closePath();
      ctx.fill();
    });

    ctx.restore();
  }

  function draw() {
    ctx.fillStyle = '#c4c4c4';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#b0b0b0';
    ctx.fillRect(0, GROUND - 22, W, 10);

    ctx.fillStyle = '#888';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(0, GROUND, W, 5);

    ctx.fillStyle = '#6e6e6e';
    for (let i = 0; i < 12; i++) {
      const px = ((i * 83 - frameCount * speed * 0.5) % (W + 20) + W + 20) % (W + 20) - 10;
      ctx.beginPath();
      ctx.ellipse(px, GROUND + 10, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    obstacles.forEach(o => {
      ctx.fillStyle = '#2a2a2a';
      const r = 3;
      ctx.beginPath();
      ctx.moveTo(o.x + r, o.y);
      ctx.lineTo(o.x + o.w - r, o.y);
      ctx.arcTo(o.x + o.w, o.y, o.x + o.w, o.y + r, r);
      ctx.lineTo(o.x + o.w, o.y + o.h);
      ctx.lineTo(o.x, o.y + o.h);
      ctx.arcTo(o.x, o.y, o.x + r, o.y, r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#444';
      ctx.fillRect(o.x + 3, o.y + 3, Math.max(2, o.w - 8), 2);
    });

    drawGoose(player.x, player.y, frameCount);

    ctx.fillStyle = '#222';
    ctx.font = '13px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(String(score).padStart(5, '0'), W - 10, 18);
    ctx.textAlign = 'left';
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    frameCount++;

    if (frameCount % 300 === 0) speed = Math.min(speed + 0.5, 14);

    const interval = Math.max(42, 82 - Math.floor(speed) * 3);
    if (frameCount % interval === 0) spawnObs();

    player.vy += 0.7;
    player.y += player.vy;
    if (player.y >= GROUND - player.h) {
      player.y = GROUND - player.h;
      player.vy = 0;
      player.jumping = false;
    }

    obstacles.forEach(o => o.x -= speed);
    obstacles = obstacles.filter(o => o.x + o.w > 0);

    for (const o of obstacles) {
      if (player.x + 22 > o.x &&
          player.x + 2  < o.x + o.w &&
          player.y + 28 > o.y &&
          player.y + 10 < o.y + o.h) {
        cancelAnimationFrame(raf);
        alive = false;
        draw();
        onGameOver(score);
        return;
      }
    }

    score = Math.floor(frameCount / 6);
    updateScore(score);
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
