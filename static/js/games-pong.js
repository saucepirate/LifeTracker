// ── Pong ──────────────────────────────────────────────────────
function startPong(container, onGameOver, updateScore) {
  const W = 600, H = 400, PAD_W = 12, PAD_H = 70, BALL_R = 8, WIN_SCORE = 7;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';
  canvas.style.background = '#000';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let ball, pLeft, pRight, scores, speed, raf, alive;
  let keys = {};

  function resetBall(dir) {
    ball = { x: W/2, y: H/2, vx: (dir || 1) * 4, vy: (Math.random() * 4 - 2) };
    speed = 4;
  }

  function init() {
    pLeft  = { x: 10,          y: H/2 - PAD_H/2, score: 0, vy: 0 };
    pRight = { x: W - 10 - PAD_W, y: H/2 - PAD_H/2, score: 0, vy: 0 };
    scores = [0, 0];
    resetBall(1);
    alive = true;
  }

  function onKey(e) {
    keys[e.key] = (e.type === 'keydown');
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
  }
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKey);

  function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(scores[0], W/2 - 60, 50);
    ctx.fillText(scores[1], W/2 + 60, 50);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(pLeft.x, pLeft.y, PAD_W, PAD_H);
    ctx.fillStyle = '#f87171';
    ctx.fillRect(pRight.x, pRight.y, PAD_W, PAD_H);

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI*2);
    ctx.fill();
  }

  function loop() {
    raf = requestAnimationFrame(loop);

    if (keys['ArrowUp'])   pRight.y -= 6;
    if (keys['ArrowDown']) pRight.y += 6;
    pRight.y = Math.max(0, Math.min(H - PAD_H, pRight.y));

    const cpuCenter = pLeft.y + PAD_H/2;
    const lag = 3.5;
    if (cpuCenter < ball.y - 5)      pLeft.y += lag;
    else if (cpuCenter > ball.y + 5) pLeft.y -= lag;
    pLeft.y = Math.max(0, Math.min(H - PAD_H, pLeft.y));

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.y - BALL_R < 0)  { ball.y = BALL_R;      ball.vy *= -1; }
    if (ball.y + BALL_R > H)  { ball.y = H - BALL_R;  ball.vy *= -1; }

    function hitPaddle(pad, side) {
      if (ball.x - BALL_R < pad.x + PAD_W &&
          ball.x + BALL_R > pad.x &&
          ball.y > pad.y && ball.y < pad.y + PAD_H) {
        ball.vx = side * Math.abs(ball.vx) * 1.05;
        const rel = (ball.y - (pad.y + PAD_H/2)) / (PAD_H/2);
        ball.vy = rel * 6;
        ball.vx = Math.min(12, Math.max(-12, ball.vx));
      }
    }
    hitPaddle(pLeft, 1);
    hitPaddle(pRight, -1);

    if (ball.x < 0) {
      scores[1]++; updateScore(Math.max(scores[0], scores[1]));
      if (scores[1] >= WIN_SCORE) { cancelAnimationFrame(raf); alive=false; draw(); onGameOver(scores[1]*100); return; }
      resetBall(1);
    }
    if (ball.x > W) {
      scores[0]++; updateScore(Math.max(scores[0], scores[1]));
      if (scores[0] >= WIN_SCORE) { cancelAnimationFrame(raf); alive=false; draw(); onGameOver(scores[0]*100); return; }
      resetBall(-1);
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
