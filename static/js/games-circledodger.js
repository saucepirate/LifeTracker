// ── Circle Dodger ─────────────────────────────────────────────
function startCircleDodger(container, onGameOver, updateScore) {
  const W = 480, H = 480;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';
  canvas.style.background = '#0f172a';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let player, obstacles, score, raf, alive, frameCount, spawnTimer;
  let mouseX = W/2, mouseY = H/2;
  let keys = {};

  function init() {
    player = { x: W/2, y: H/2, r: 12 };
    obstacles = []; score = 0; alive = true; frameCount = 0; spawnTimer = 0;
  }

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouseY = (e.clientY - rect.top)  * (canvas.height / rect.height);
  }
  function onKey(e) { keys[e.key] = (e.type === 'keydown'); }

  canvas.addEventListener('mousemove', onMouseMove);
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKey);

  function spawnObs() {
    const edge = Math.floor(Math.random() * 4);
    let x, y;
    if (edge === 0)      { x = Math.random() * W; y = -20; }
    else if (edge === 1) { x = W + 20; y = Math.random() * H; }
    else if (edge === 2) { x = Math.random() * W; y = H + 20; }
    else                 { x = -20; y = Math.random() * H; }
    const speed = 1.5 + Math.random() * (1 + score * 0.02);
    obstacles.push({ x, y, r: 15, speed, color: `hsl(${Math.random()*360},90%,60%)` });
  }

  function draw() {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    obstacles.forEach(o => {
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI*2); ctx.stroke();
      ctx.fillStyle = o.color + '44';
      ctx.fill();
    });

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = '#38bdf844';
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath(); ctx.arc(player.x, player.y, 4, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px monospace';
    ctx.fillText(`${score}s`, 8, 22);
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    frameCount++;

    const spd = 4;
    if (keys['w'] || keys['W']) player.y -= spd;
    if (keys['s'] || keys['S']) player.y += spd;
    if (keys['a'] || keys['A']) player.x -= spd;
    if (keys['d'] || keys['D']) player.x += spd;

    if (!keys['w'] && !keys['s'] && !keys['a'] && !keys['d'] &&
        !keys['W'] && !keys['S'] && !keys['A'] && !keys['D']) {
      const dx = mouseX - player.x, dy = mouseY - player.y;
      const dist = Math.sqrt(dx*dx+dy*dy);
      if (dist > 2) { player.x += dx/dist * Math.min(dist, 5); player.y += dy/dist * Math.min(dist, 5); }
    }

    player.x = Math.max(player.r, Math.min(W - player.r, player.x));
    player.y = Math.max(player.r, Math.min(H - player.r, player.y));

    spawnTimer++;
    const interval = Math.max(30, 90 - Math.floor(score * 2));
    if (spawnTimer >= interval) { spawnObs(); spawnTimer = 0; }

    obstacles.forEach(o => {
      const dx = player.x - o.x, dy = player.y - o.y;
      const d = Math.sqrt(dx*dx+dy*dy) || 1;
      o.x += dx/d * o.speed;
      o.y += dy/d * o.speed;
    });

    obstacles = obstacles.filter(o => o.x > -50 && o.x < W+50 && o.y > -50 && o.y < H+50);

    for (const o of obstacles) {
      const dx = o.x - player.x, dy = o.y - player.y;
      if (Math.sqrt(dx*dx+dy*dy) < o.r + player.r - 2) {
        cancelAnimationFrame(raf); alive = false; draw(); onGameOver(score); return;
      }
    }

    if (frameCount % 60 === 0) { score++; updateScore(score); }

    draw();
  }

  init();
  loop();

  return function cleanup() {
    cancelAnimationFrame(raf);
    canvas.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keyup', onKey);
    keys = {};
  };
}
