// ── Space Invaders ────────────────────────────────────────────
function startSpaceInvaders(container, onGameOver, updateScore) {
  const W = 480, H = 540;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';
  canvas.style.background = '#000';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const ALIEN_W = 26, ALIEN_H = 20, ALIEN_PAD = 8;
  let aliens, player, bullets, eBullets, barriers, score, lives, alienDir, raf, alive,
      shootTimer, frameCount, invTimer, wave, waveMsg, ufo, baseSpeed, waveTotal;

  const WAVE_DIMS = [
    { cols: 8,  rows: 3 },
    { cols: 9,  rows: 4 },
    { cols: 10, rows: 4 },
    { cols: 11, rows: 4 },
    { cols: 11, rows: 5 },
  ];

  function makeAliens() {
    const { cols, rows } = WAVE_DIMS[Math.min(wave - 1, 4)];
    const gridW = cols * (ALIEN_W + ALIEN_PAD) - ALIEN_PAD;
    const startX = Math.round((W - gridW) / 2);
    const a = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const pts = r === 0 ? 30 : r < 3 ? 20 : 10;
      a.push({
        x: startX + c*(ALIEN_W+ALIEN_PAD),
        y: 52 + r*(ALIEN_H+ALIEN_PAD) + (wave - 1) * 8,
        alive: true, pts, row: r, col: c, anim: 0
      });
    }
    return a;
  }

  function makeBarriers() {
    const layouts = [
      { n: 4, rows: 5, cols: 8 },
      { n: 4, rows: 4, cols: 7 },
      { n: 3, rows: 4, cols: 7 },
      { n: 2, rows: 3, cols: 6 },
    ];
    const cfg = layouts[wave - 1];
    if (!cfg) return [];
    const barW = cfg.cols * 8;
    const gap = 20;
    const totalW = cfg.n * barW + (cfg.n - 1) * gap;
    const startX = Math.round((W - totalW) / 2);
    const by = H - 110;
    const bars = [];
    for (let i = 0; i < cfg.n; i++) {
      const cells = [];
      const bx = startX + i * (barW + gap);
      for (let r = 0; r < cfg.rows; r++) for (let c = 0; c < cfg.cols; c++) {
        cells.push({ x: bx + c*8, y: by + r*8, hp: 3 });
      }
      bars.push(cells);
    }
    return bars;
  }

  function startWave() {
    aliens = makeAliens();
    waveTotal = aliens.length;
    barriers = makeBarriers();
    eBullets = [];
    alienDir = 1;
    baseSpeed = [0.40, 0.55, 0.72, 0.92, 1.18][Math.min(wave - 1, 4)];
    shootTimer = 0;
    ufo = null;
    waveMsg = wave > 1 ? 110 : 0;
  }

  function init() {
    player = { x: W/2 - 13, y: H - 50, w: 26, h: 18 };
    bullets = [];
    score = 0; lives = 3;
    alive = true; frameCount = 0; invTimer = 0; wave = 1;
    startWave();
  }

  let keys = {};
  function onKey(e) {
    keys[e.key] = (e.type === 'keydown');
    if (e.key === ' ') e.preventDefault();
  }
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKey);

  function drawAlien(a) {
    const x = a.x, y = a.y;
    ctx.fillStyle = a.row === 0 ? '#a78bfa' : a.row < 3 ? '#34d399' : '#60a5fa';
    ctx.fillRect(x+6, y+4, 14, 9);
    ctx.fillRect(x+3, y+7, 20, 7);
    ctx.fillRect(x+4, y, 3, 5);
    ctx.fillRect(x+19, y, 3, 5);
    if (a.anim === 0) {
      ctx.fillRect(x+3, y+14, 4, 4); ctx.fillRect(x+19, y+14, 4, 4);
    } else {
      ctx.fillRect(x+5, y+12, 4, 6); ctx.fillRect(x+17, y+12, 4, 6);
    }
    ctx.fillStyle = '#000';
    ctx.fillRect(x+8, y+6, 3, 3); ctx.fillRect(x+15, y+6, 3, 3);
  }

  function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#ffffff22';
    for (let i = 0; i < 50; i++) {
      ctx.fillRect((i*137+23)%W, (i*97+17)%(H-60), 1, 1);
    }

    barriers.forEach(bar => bar.forEach(cell => {
      if (cell.hp > 0) {
        ctx.fillStyle = cell.hp === 3 ? '#4ade80' : cell.hp === 2 ? '#86efac' : '#bbf7d0';
        ctx.fillRect(cell.x, cell.y, 8, 8);
      }
    }));

    if (ufo) {
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath(); ctx.ellipse(ufo.x+14, ufo.y+2, 14, 6, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fda4af';
      ctx.beginPath(); ctx.ellipse(ufo.x+14, ufo.y-3, 7, 5, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fbbf24';
      for (let i = 0; i < 4; i++) ctx.fillRect(ufo.x + 4 + i*6, ufo.y, 3, 3);
    }

    aliens.forEach(a => { if (a.alive) drawAlien(a); });

    if (invTimer === 0 || Math.floor(invTimer / 5) % 2 === 0) {
      ctx.fillStyle = '#60a5fa';
      ctx.fillRect(player.x + 10, player.y - 7, 6, 7);
      ctx.fillRect(player.x, player.y, player.w, player.h);
    }

    ctx.fillStyle = '#fff';
    bullets.forEach(b => ctx.fillRect(b.x - 1, b.y - 6, 3, 10));
    ctx.fillStyle = '#f87171';
    eBullets.forEach(b => ctx.fillRect(b.x - 1, b.y, 3, 10));

    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText(`${'♥'.repeat(lives)}`, 8, H - 8);
    ctx.textAlign = 'center';
    ctx.fillText(`Wave ${wave}`, W/2, H - 8);
    ctx.textAlign = 'right';
    ctx.fillText(`${score}`, W - 8, H - 8);
    ctx.textAlign = 'left';

    if (waveMsg > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(0, H/2 - 46, W, 92);
      ctx.textAlign = 'center';
      if (wave === 6) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 30px monospace';
        ctx.fillText('★  YOU WIN!  ★', W/2, H/2 + 2);
        ctx.fillStyle = '#fff';
        ctx.font = '15px monospace';
        ctx.fillText(`Final score: ${score}`, W/2, H/2 + 28);
      } else {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 28px monospace';
        ctx.fillText(`— WAVE ${wave} —`, W/2, H/2 + 8);
        ctx.font = '14px monospace';
        ctx.fillText('Get ready!', W/2, H/2 + 32);
      }
      ctx.textAlign = 'left';
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    frameCount++;

    if (waveMsg > 0) {
      waveMsg--;
      if (waveMsg === 0 && wave === 6) { cancelAnimationFrame(raf); alive = false; onGameOver(score); return; }
      draw(); return;
    }

    if (keys['ArrowLeft'])  player.x -= 5;
    if (keys['ArrowRight']) player.x += 5;
    player.x = Math.max(0, Math.min(W - player.w, player.x));

    if (keys[' '] && bullets.length === 0) {
      bullets.push({ x: player.x + player.w/2, y: player.y, vy: -11 });
    }

    bullets  = bullets.filter(b => { b.y += b.vy; return b.y > 0; });
    eBullets = eBullets.filter(b => { b.y += b.vy; return b.y < H; });

    const liveAliens = aliens.filter(a => a.alive);
    if (!liveAliens.length) {
      if (wave >= 5) { wave = 6; waveMsg = 200; draw(); return; }
      wave++;
      startWave();
      draw(); return;
    }

    const total = waveTotal;
    const remaining = liveAliens.length;
    const alienSpeed = Math.min(baseSpeed * (total / remaining), 5.5);

    let minX = Math.min(...liveAliens.map(a => a.x));
    let maxX = Math.max(...liveAliens.map(a => a.x + ALIEN_W));
    aliens.forEach(a => {
      if (a.alive) { a.x += alienDir * alienSpeed; a.anim = Math.floor(frameCount / 16) % 2; }
    });
    if ((alienDir ===  1 && maxX + alienSpeed >= W - 8) ||
        (alienDir === -1 && minX - alienSpeed <= 8)) {
      alienDir *= -1;
      aliens.forEach(a => { if (a.alive) a.y += 14; });
    }

    if (liveAliens.some(a => a.y + ALIEN_H >= player.y)) {
      cancelAnimationFrame(raf); alive=false; draw(); onGameOver(score); return;
    }

    if (!ufo && frameCount > 120 && Math.random() < 0.0015) {
      ufo = { x: -30, y: 22, speed: 2.2, pts: [50,100,150,300][Math.floor(Math.random()*4)] };
    }
    if (ufo) {
      ufo.x += ufo.speed;
      for (let bi = bullets.length - 1; bi >= 0; bi--) {
        const b = bullets[bi];
        if (b.x > ufo.x && b.x < ufo.x+28 && b.y > ufo.y-10 && b.y < ufo.y+10) {
          score += ufo.pts; updateScore(score);
          bullets.splice(bi, 1); ufo = null; break;
        }
      }
      if (ufo && ufo.x > W + 30) ufo = null;
    }

    shootTimer++;
    const baseInterval = [170, 130, 100, 78, 58][Math.min(wave - 1, 4)];
    const shootInterval = Math.max(38, Math.round(baseInterval * remaining / total));
    const maxEBullets   = [2, 2, 3, 4, 5][Math.min(wave - 1, 4)];
    const bulletSpeed   = [2.6, 3.2, 3.8, 4.4, 5.0][Math.min(wave - 1, 4)];
    if (frameCount > 60 && shootTimer >= shootInterval && eBullets.length < maxEBullets) {
      shootTimer = 0;
      const colMap = {};
      liveAliens.forEach(a => {
        if (!colMap[a.col] || a.y > colMap[a.col].y) colMap[a.col] = a;
      });
      const pool = Object.values(colMap);
      const pick = remaining > 30 ? 1 : (Math.random() < 0.4 ? 2 : 1);
      for (let i = 0; i < Math.min(pick, pool.length); i++) {
        const idx = Math.floor(Math.random() * pool.length);
        const s = pool.splice(idx, 1)[0];
        eBullets.push({ x: s.x + ALIEN_W/2, y: s.y + ALIEN_H, vy: bulletSpeed });
      }
    }

    outer: for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      for (const a of aliens) {
        if (!a.alive) continue;
        if (b.x > a.x && b.x < a.x+ALIEN_W && b.y > a.y && b.y < a.y+ALIEN_H) {
          a.alive = false; score += a.pts; updateScore(score);
          bullets.splice(bi, 1); continue outer;
        }
      }
    }

    bullets.forEach(b => {
      barriers.forEach(bar => bar.forEach(cell => {
        if (cell.hp > 0 && b.x >= cell.x && b.x < cell.x+8 && b.y >= cell.y && b.y < cell.y+8) {
          cell.hp--; b.y = -9999;
        }
      }));
    });
    eBullets.forEach(b => {
      barriers.forEach(bar => bar.forEach(cell => {
        if (cell.hp > 0 && b.x >= cell.x && b.x < cell.x+8 && b.y >= cell.y && b.y < cell.y+8) {
          cell.hp--; b.y = H + 1;
        }
      }));
    });
    bullets  = bullets.filter(b => b.y > 0);
    eBullets = eBullets.filter(b => b.y < H);

    if (invTimer > 0) invTimer--;
    for (let bi = eBullets.length - 1; bi >= 0; bi--) {
      if (invTimer > 0) break;
      const b = eBullets[bi];
      if (b.x > player.x && b.x < player.x+player.w && b.y > player.y && b.y < player.y+player.h) {
        eBullets.splice(bi, 1);
        lives--;
        invTimer = 90;
        if (lives <= 0) { cancelAnimationFrame(raf); alive=false; draw(); onGameOver(score); return; }
        player.x = W/2 - 13;
      }
    }

    draw();
  }

  init();
  loop();

  return function cleanup() {
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keyup', onKey);
    keys = {};
  };
}
