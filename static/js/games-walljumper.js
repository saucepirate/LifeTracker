// ── Wall Jumper ───────────────────────────────────────────────
// Stick to a wall, then press Space/Click to launch across.
// Navigate through the gaps in the bars scrolling down toward you.
function startWallJumper(container, onGameOver, updateScore) {
  const W = 320, H = 540;
  const WALL_W  = 16;
  const CHAR_W  = 16, CHAR_H = 20;
  const GRAVITY = 0.26;
  const JUMP_VY = -6.2;
  const MOVE_VX = 7.2;
  const BAR_GAP = 86; // vertical spacing between bars

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.display = 'block';
  canvas.style.margin  = '0 auto';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // state: 'left' | 'right' | 'air'
  let state, char, velX, velY, bars, score, lives, frameCount, scrollSpeed, alive, raf;

  function barGap() { return Math.max(68, 115 - Math.floor(score / 25) * 2); }

  function addBar(y) {
    const g = barGap();
    const inner = W - 2 * WALL_W;
    const gapX  = WALL_W + 4 + Math.floor(Math.random() * (inner - g - 8));
    bars.push({ y, gapX, gap: g, h: 12 });
  }

  function init() {
    char        = { x: WALL_W, y: H * 0.50 };
    velX        = 0; velY = 0;
    bars        = []; score = 0; lives = 3;
    alive       = true; frameCount = 0; scrollSpeed = 2.4;
    state       = 'left';
    for (let i = 1; i <= 8; i++) addBar(char.y - i * BAR_GAP);
  }

  function jump() {
    if (!alive || state === 'air') return;
    velX  = (state === 'left') ? MOVE_VX : -MOVE_VX;
    velY  = JUMP_VY;
    state = 'air';
  }

  function onKey(e) {
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); }
  }
  document.addEventListener('keydown', onKey);
  canvas.addEventListener('click', jump);

  // ── Drawing ──────────────────────────────────────────────────
  function draw() {
    // background
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, W, H);

    // walls
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, WALL_W, H);
    ctx.fillRect(W - WALL_W, 0, WALL_W, H);
    ctx.fillStyle = '#3a3a3a';
    for (let y = 4; y < H; y += 14) {
      ctx.fillRect(3, y, WALL_W - 6, 2);
      ctx.fillRect(W - WALL_W + 3, y, WALL_W - 6, 2);
    }

    // bars
    bars.forEach(b => {
      // left segment
      const lw = b.gapX - WALL_W;
      const rx = b.gapX + b.gap;
      const rw = W - WALL_W - rx;
      if (lw > 0) {
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(WALL_W, b.y, lw, b.h);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(WALL_W, b.y, lw, 3);
        ctx.fillStyle = '#922b21';
        ctx.fillRect(WALL_W, b.y + b.h - 2, lw, 2);
      }
      // right segment
      if (rw > 0) {
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(rx, b.y, rw, b.h);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(rx, b.y, rw, 3);
        ctx.fillStyle = '#922b21';
        ctx.fillRect(rx, b.y + b.h - 2, rw, 2);
      }
      // gap arrow hint
      const mid = b.gapX + b.gap / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.beginPath();
      ctx.moveTo(mid,     b.y + 2);
      ctx.lineTo(mid - 7, b.y + b.h - 2);
      ctx.lineTo(mid + 7, b.y + b.h - 2);
      ctx.closePath();
      ctx.fill();
    });

    // character
    const cx = char.x, cy = char.y;
    // body
    ctx.fillStyle = '#222';
    ctx.fillRect(cx, cy, CHAR_W, CHAR_H);
    // eye direction
    const lookRight = velX >= 0;
    ctx.fillStyle = '#fff';
    ctx.fillRect(lookRight ? cx + CHAR_W - 7 : cx + 1, cy + 4, 5, 5);
    ctx.fillStyle = '#111';
    ctx.fillRect(lookRight ? cx + CHAR_W - 5 : cx + 2, cy + 5, 2, 3);
    // legs
    const lp = Math.floor(frameCount / 6) % 2;
    ctx.fillStyle = '#444';
    if (state !== 'air') {
      ctx.fillRect(cx + 1,          cy + CHAR_H, 5, 5);
      ctx.fillRect(cx + CHAR_W - 6, cy + CHAR_H, 5, 5);
    } else if (lp === 0) {
      ctx.fillRect(cx + 1,          cy + CHAR_H,     5, 5);
      ctx.fillRect(cx + CHAR_W - 6, cy + CHAR_H - 3, 5, 5);
    } else {
      ctx.fillRect(cx + 1,          cy + CHAR_H - 3, 5, 5);
      ctx.fillRect(cx + CHAR_W - 6, cy + CHAR_H,     5, 5);
    }

    // wall grip indicator
    if (state !== 'air') {
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      const gx = (state === 'left') ? WALL_W : W - WALL_W - 3;
      ctx.fillRect(gx, cy - 3, 3, CHAR_H + 6);
    }

    // HUD
    ctx.fillStyle = '#444';
    ctx.font = 'bold 13px "Courier New", monospace';
    const hi = String(_scores['walljumper'] || 0).padStart(5, '0');
    const sc = String(score).padStart(5, '0');
    ctx.fillText(`HI ${hi}  ${sc}`, W / 2 - 68, 22);
    // lives
    for (let i = 0; i < lives; i++) {
      ctx.fillStyle = '#222';
      ctx.fillRect(W - WALL_W - 10 - i * 13, 8, 8, 10);
    }
  }

  // ── Game loop ────────────────────────────────────────────────
  function loop() {
    raf = requestAnimationFrame(loop);
    frameCount++;

    if (frameCount % 320 === 0) scrollSpeed = Math.min(scrollSpeed + 0.3, 7.5);

    // scroll bars down
    bars.forEach(b => b.y += scrollSpeed);
    bars = bars.filter(b => b.y < H + 20);

    // spawn bars from top to keep the column full
    const topY = bars.length ? bars.reduce((m, b) => b.y < m ? b.y : m, H) : H;
    if (topY > BAR_GAP) addBar(topY - BAR_GAP);

    // physics (character is STATIC on wall — bars will reach it)
    if (state === 'air') {
      velY    += GRAVITY;
      char.x  += velX;
      char.y  += velY;

      // wall landing
      if (char.x <= WALL_W) {
        char.x = WALL_W;
        velX = 0; velY = 0;
        state = 'left';
      } else if (char.x + CHAR_W >= W - WALL_W) {
        char.x = W - WALL_W - CHAR_W;
        velX = 0; velY = 0;
        state = 'right';
      }

      // ceiling bounce
      if (char.y < 28) { char.y = 28; velY = Math.abs(velY) * 0.4; }
    }
    // (if on wall: char position doesn't change — bars scroll down to it)

    // bar collision check
    let hit = false;
    for (const b of bars) {
      const cT = char.y, cB = char.y + CHAR_H;
      if (cB <= b.y || cT >= b.y + b.h) continue; // no y overlap
      // use character centre for gap check
      const cMid = char.x + CHAR_W / 2;
      if (cMid < b.gapX || cMid > b.gapX + b.gap) { hit = true; break; }
    }

    // fell off bottom
    if (char.y > H + 10) hit = true;

    if (hit) {
      lives--;
      if (lives <= 0) {
        cancelAnimationFrame(raf);
        alive = false;
        draw();
        onGameOver(score);
        return;
      }
      // respawn on the wall the character was last touching
      const w = (state === 'right') ? 'right' : 'left';
      char.x = (w === 'right') ? W - WALL_W - CHAR_W : WALL_W;
      char.y = H * 0.50;
      velX = 0; velY = 0;
      state = w;
    }

    score = Math.floor(frameCount * scrollSpeed / 40);
    updateScore(score);
    draw();
  }

  init();
  loop();

  return function cleanup() {
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
    canvas.removeEventListener('click', jump);
  };
}
