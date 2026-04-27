// ── Wall Jumper ───────────────────────────────────────────────
function startWallJumper(container, onGameOver, updateScore) {
  const W = 320, H = 540;
  const WALL_W = 14, CHAR_W = 20, CHAR_H = 24;

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let char, bars, score, lives, raf, alive, frameCount, scrollSpeed;
  let onWall = 'left';
  let velX, velY;

  function currentGap() {
    return Math.max(52, 80 - Math.floor(score / 15) * 2);
  }

  function init() {
    char = { x: WALL_W, y: H / 2, w: CHAR_W, h: CHAR_H };
    bars = []; score = 0; lives = 3; alive = true; frameCount = 0; scrollSpeed = 2.8;
    velX = 4; velY = -1.5; onWall = 'left';
    for (let i = 1; i <= 10; i++) addBar(H / 2 - i * 52);
  }

  function addBar(y) {
    const gap = currentGap();
    const innerW = W - 2 * WALL_W;
    const gapX = WALL_W + Math.floor(Math.random() * (innerW - gap - 4)) + 2;
    const barH = 10 + Math.floor(Math.random() * 5);
    bars.push({ y, gapX, gap, h: barH });
  }

  function jump() {
    if (!alive) return;
    if (onWall === 'left')       { velX =  5.5; onWall = null; }
    else if (onWall === 'right') { velX = -5.5; onWall = null; }
    velY = -4;
  }

  function onKey(e) {
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); }
  }
  function onClick() { jump(); }
  document.addEventListener('keydown', onKey);
  canvas.addEventListener('click', onClick);

  function drawChar() {
    const c = char;
    ctx.fillStyle = '#222';
    ctx.fillRect(c.x, c.y, c.w, c.h);
    const legPhase = Math.floor(frameCount / 6) % 2;
    ctx.fillStyle = '#444';
    if (legPhase === 0) {
      ctx.fillRect(c.x + 2,  c.y + c.h, 5, 5);
      ctx.fillRect(c.x + 13, c.y + c.h - 3, 5, 5);
    } else {
      ctx.fillRect(c.x + 2,  c.y + c.h - 3, 5, 5);
      ctx.fillRect(c.x + 13, c.y + c.h, 5, 5);
    }
    ctx.fillStyle = '#fff';
    const eyeXBase = velX >= 0 ? c.x + c.w - 7 : c.x + 2;
    ctx.fillRect(eyeXBase, c.y + 5, 5, 5);
    ctx.fillStyle = '#111';
    const pupilX = velX >= 0 ? eyeXBase + 2 : eyeXBase + 1;
    ctx.fillRect(pupilX, c.y + 6, 2, 3);
  }

  function draw() {
    ctx.fillStyle = '#f7f7f7';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, WALL_W, H);
    ctx.fillRect(W - WALL_W, 0, WALL_W, H);
    ctx.fillStyle = '#444';
    for (let y = 0; y < H; y += 16) {
      ctx.fillRect(2, y, WALL_W - 4, 1);
      ctx.fillRect(W - WALL_W + 2, y, WALL_W - 4, 1);
    }

    bars.forEach(b => {
      ctx.fillStyle = '#ccc';
      ctx.fillRect(WALL_W + 2, b.y + 3, b.gapX - WALL_W, b.h);
      ctx.fillRect(b.gapX + b.gap + 2, b.y + 3, W - WALL_W - b.gapX - b.gap, b.h);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(WALL_W, b.y, b.gapX - WALL_W, b.h);
      ctx.fillRect(b.gapX + b.gap, b.y, W - WALL_W - b.gapX - b.gap, b.h);
      ctx.fillStyle = '#555';
      ctx.fillRect(WALL_W, b.y, b.gapX - WALL_W, 2);
      ctx.fillRect(b.gapX + b.gap, b.y, W - WALL_W - b.gapX - b.gap, 2);
    });

    drawChar();

    ctx.fillStyle = '#555';
    ctx.font = 'bold 13px "Courier New", monospace';
    const hiText = `HI ${String(_scores['walljumper'] || 0).padStart(5, '0')}`;
    const scText = String(score).padStart(5, '0');
    ctx.fillText(hiText + '  ' + scText, W / 2 - 72, 22);

    for (let i = 0; i < lives; i++) {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(W - WALL_W - 10 - i * 13, 8, 8, 10);
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    frameCount++;

    if (frameCount % 400 === 0) scrollSpeed = Math.min(scrollSpeed + 0.4, 8);

    bars.forEach(b => b.y += scrollSpeed);
    bars = bars.filter(b => b.y < H + 20);

    const topBar = bars.length ? bars.reduce((m, b) => b.y < m ? b.y : m, H) : H;
    if (topBar > 52) addBar(topBar - 52);

    velY += 0.22;
    char.y += velY;
    char.x += velX;

    if (char.x <= WALL_W) {
      char.x = WALL_W;
      velX = Math.abs(velX) * 0.45;
      onWall = 'left';
      velY = Math.max(velY, -0.5);
    }
    if (char.x + char.w >= W - WALL_W) {
      char.x = W - WALL_W - char.w;
      velX = -Math.abs(velX) * 0.45;
      onWall = 'right';
      velY = Math.max(velY, -0.5);
    }

    for (const b of bars) {
      const inGap = char.x + char.w > b.gapX + 3 && char.x < b.gapX + b.gap - 3;
      if (inGap) continue;
      const prevY = char.y - velY;
      if (prevY + char.h <= b.y + 1 && char.y + char.h >= b.y) {
        char.y = b.y - char.h;
        velY = 0;
        onWall = null;
      }
      if (prevY >= b.y + b.h - 1 && char.y <= b.y + b.h) {
        char.y = b.y + b.h;
        velY = Math.abs(velY) * 0.5;
      }
    }

    if (char.y > H + 10) {
      lives--;
      if (lives <= 0) {
        cancelAnimationFrame(raf);
        alive = false;
        draw();
        onGameOver(score);
        return;
      }
      char.y = H / 2;
      char.x = onWall === 'right' ? W - WALL_W - char.w : WALL_W;
      velY = -2.5;
      velX = onWall === 'right' ? -4 : 4;
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
    canvas.removeEventListener('click', onClick);
  };
}
