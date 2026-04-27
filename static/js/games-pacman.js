// ── Pac-Man ───────────────────────────────────────────────────
function startPacman(container, onGameOver, updateScore) {
  const CELL = 22, COLS = 21, ROWS = 23;
  const W = COLS * CELL, H = ROWS * CELL;
  const HALF = CELL / 2;
  const SPD_PLAYER = 1.8;
  const SPD_GHOST  = 1.2;
  const SPD_FRIGHT  = 0.7;

  // Each row exactly 21 chars: # wall, . dot, o power pellet, space empty, - ghost door
  const MAZE_ROWS = [
    '#####################',
    '#........#..........#',  // row 1  – note asymmetric dot fill is fine
    '#.##.###.#.###.##.#.#',  // row 2
    '#o##.###.#.###.##.#o#',  // row 3  power pellets
    '#...................#',   // row 4  – only 19 dots, pad with spaces at edit time
    '#.##.#.#####.#.##.##',   // row 5
    '#....#...#...#.....#',   // row 6
    '####.###.#.###.#####',   // row 7
    '   #.#.......#.#   ',    // row 8  tunnel connector (spaces outside)
    '####.#.##-##.#.#####',   // row 9  ghost door row
    '       #-----#       ',  // row 10 ghost house interior
    '####.#.#####.#.#####',   // row 11
    '   #.#.......#.#   ',    // row 12
    '####.#.#####.#.#####',   // row 13
    '#..........#........#',  // row 14
    '#.##.###.#.#.###.##.#',  // row 15
    '#o..#.....P.....#..o#',  // row 16 player start (P)
    '###.#.#####.#.######',   // row 17
    '#....#...#...#......#',  // row 18
    '#.##.#.#####.#.##.##.',  // row 19
    '#...................#',   // row 20
    '#.##.###.#.#.###.##.#',  // row 21
    '#####################',  // row 22
  ];

  // Normalise every row to exactly COLS chars
  const maze = MAZE_ROWS.map(r => {
    const s = r.length < COLS ? r + ' '.repeat(COLS - r.length) : r.slice(0, COLS);
    return s.split('');
  });

  // Build a reference copy for dot resets
  const mazeRef = maze.map(r => [...r]);

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';
  canvas.style.background = '#000';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Find player start cell
  let startCol = 10, startRow = 16;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (maze[r][c] === 'P') { startRow = r; startCol = c; maze[r][c] = ' '; mazeRef[r][c] = ' '; }
    if (maze[r][c] === '-') { maze[r][c] = ' '; mazeRef[r][c] = ' '; }
  }

  let totalDots = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (maze[r][c] === '.' || maze[r][c] === 'o') totalDots++;
  }

  function isWallCell(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true;
    return maze[r][c] === '#';
  }

  // Can a pixel-positioned entity move in direction (dx,dy)?
  // Uses the center + leading-edge of the 10px hitbox
  function canMove(px, py, dx, dy) {
    const margin = 9;
    const nx = px + dx * SPD_PLAYER;
    const ny = py + dy * SPD_PLAYER;
    if (dx !== 0) {
      const ex = dx > 0 ? nx + margin : nx - margin;
      const r1 = Math.floor((ny - margin + 2) / CELL);
      const r2 = Math.floor((ny + margin - 2) / CELL);
      const c  = Math.floor(ex / CELL);
      return !isWallCell(r1, c) && !isWallCell(r2, c);
    } else {
      const ey = dy > 0 ? ny + margin : ny - margin;
      const c1 = Math.floor((nx - margin + 2) / CELL);
      const c2 = Math.floor((nx + margin - 2) / CELL);
      const r  = Math.floor(ey / CELL);
      return !isWallCell(r, c1) && !isWallCell(r, c2);
    }
  }

  // Ghost wall check — slightly looser (ghosts use center tile)
  function ghostCanMove(px, py, dx, dy) {
    const spd = SPD_GHOST;
    const margin = 8;
    const nx = px + dx * spd;
    const ny = py + dy * spd;
    if (dx !== 0) {
      const ex = dx > 0 ? nx + margin : nx - margin;
      const r1 = Math.floor((ny - 4) / CELL);
      const r2 = Math.floor((ny + 4) / CELL);
      const c  = Math.floor(ex / CELL);
      return !isWallCell(r1, c) && !isWallCell(r2, c);
    } else {
      const ey = dy > 0 ? ny + margin : ny - margin;
      const c1 = Math.floor((nx - 4) / CELL);
      const c2 = Math.floor((nx + 4) / CELL);
      const r  = Math.floor(ey / CELL);
      return !isWallCell(r, c1) && !isWallCell(r, c2);
    }
  }

  const GHOST_COLORS = ['#f87171', '#f9a8d4', '#67e8f9', '#fb923c'];
  // Ghost starts: clustered in ghost house area
  const GHOST_STARTS = [
    { x: 9 * CELL + HALF, y: 10 * CELL + HALF },
    { x: 10 * CELL + HALF, y: 10 * CELL + HALF },
    { x: 11 * CELL + HALF, y: 10 * CELL + HALF },
    { x: 10 * CELL + HALF, y: 9 * CELL + HALF },
  ];

  let player, ghosts, score, lives, frightenTimer, raf, alive, dotsLeft, frameCount;
  let nextDx = 0, nextDy = 0;

  function makeGhosts() {
    return GHOST_COLORS.map((col, i) => {
      const s = GHOST_STARTS[i];
      // Pick a random initial direction that isn't into a wall
      const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
      const valid = dirs.filter(d => ghostCanMove(s.x, s.y, d.x, d.y));
      const init = valid[Math.floor(Math.random() * valid.length)] || {x:1,y:0};
      return {
        x: s.x, y: s.y,
        dx: init.x, dy: init.y,
        color: col,
        frightened: false,
        // Time until ghost reconsiders direction (at intersections)
        turnCooldown: 0,
      };
    });
  }

  function resetLevel() {
    // Restore dots
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      maze[r][c] = mazeRef[r][c];
    }
    dotsLeft = totalDots;
    player = {
      x: startCol * CELL + HALF,
      y: startRow * CELL + HALF,
      dx: 0, dy: 0,
      mouthAngle: 0.25, mouthDir: 1,
    };
    ghosts = makeGhosts();
    frightenTimer = 0;
  }

  function init() {
    score = 0; lives = 3; alive = true; frameCount = 0;
    resetLevel();
  }

  function onKey(e) {
    const map = {
      ArrowUp:    { x: 0,  y: -1 },
      ArrowDown:  { x: 0,  y:  1 },
      ArrowLeft:  { x: -1, y:  0 },
      ArrowRight: { x:  1, y:  0 },
    };
    const d = map[e.key];
    if (d) { nextDx = d.x; nextDy = d.y; e.preventDefault(); }
  }
  document.addEventListener('keydown', onKey);

  // ── Ghost AI ──────────────────────────────────────────────────
  function moveGhost(g) {
    const spd = g.frightened ? SPD_FRIGHT : SPD_GHOST;

    // Check if near a cell center (within threshold) — decision point
    const cx = Math.round(g.x / CELL) * CELL + HALF;
    const cy = Math.round(g.y / CELL) * CELL + HALF;
    const atCenter = Math.abs(g.x - cx) < spd + 1 && Math.abs(g.y - cy) < spd + 1;

    if (atCenter && g.turnCooldown <= 0) {
      // Snap to center
      g.x = cx; g.y = cy;

      // Find valid turns (no reversing)
      const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
      const valid = dirs.filter(d =>
        !(d.x === -g.dx && d.y === -g.dy) &&
        ghostCanMove(g.x, g.y, d.x, d.y)
      );

      let chosen;
      if (valid.length === 0) {
        // Dead end — reverse
        chosen = { x: -g.dx, y: -g.dy };
      } else if (valid.length === 1) {
        chosen = valid[0];
      } else {
        // At intersection: chase player when not frightened, flee when frightened
        if (g.frightened) {
          chosen = valid[Math.floor(Math.random() * valid.length)];
        } else {
          // Pick direction that reduces Manhattan distance to player
          chosen = valid.reduce((best, d) => {
            const nx = g.x + d.x * CELL;
            const ny = g.y + d.y * CELL;
            const dist = Math.abs(nx - player.x) + Math.abs(ny - player.y);
            const bdx = g.x + best.x * CELL;
            const bdy = g.y + best.y * CELL;
            const bestDist = Math.abs(bdx - player.x) + Math.abs(bdy - player.y);
            return dist < bestDist ? d : best;
          });
          // 30% random detour to avoid perfect predictability
          if (Math.random() < 0.3) chosen = valid[Math.floor(Math.random() * valid.length)];
        }
      }

      g.dx = chosen.x; g.dy = chosen.y;
      g.turnCooldown = Math.floor(CELL / spd) - 1;
    }

    if (g.turnCooldown > 0) g.turnCooldown--;

    g.x += g.dx * spd;
    g.y += g.dy * spd;

    // Tunnel wrap
    if (g.x < 0)   g.x = W - 1;
    if (g.x >= W)  g.x = 0;
  }

  // ── Drawing ───────────────────────────────────────────────────
  function drawMaze() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = maze[r][c];
        const px = c * CELL, py = r * CELL;
        if (ch === '#') {
          ctx.fillStyle = '#1e3a8a';
          ctx.fillRect(px, py, CELL, CELL);
          // Inner highlight
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3);
        } else if (ch === '.') {
          ctx.fillStyle = '#fde68a';
          ctx.beginPath();
          ctx.arc(px + HALF, py + HALF, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (ch === 'o') {
          const pulse = 0.7 + 0.3 * Math.sin(frameCount * 0.15);
          ctx.fillStyle = `rgba(253,230,138,${pulse})`;
          ctx.beginPath();
          ctx.arc(px + HALF, py + HALF, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawPlayer() {
    const angle = player.mouthAngle * Math.PI;
    let rot = 0;
    if (player.dx === -1) rot = Math.PI;
    else if (player.dy === -1) rot = -Math.PI / 2;
    else if (player.dy === 1)  rot = Math.PI / 2;
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.arc(player.x, player.y, HALF - 2, rot + angle, rot + Math.PI * 2 - angle);
    ctx.closePath();
    ctx.fill();
  }

  function drawGhost(g) {
    const px = g.x, py = g.y;
    const r = HALF - 2;
    const flashing = g.frightened && frightenTimer < 120 && Math.floor(frightenTimer / 15) % 2 === 0;
    ctx.fillStyle = g.frightened ? (flashing ? '#fff' : '#3730a3') : g.color;
    ctx.beginPath();
    ctx.arc(px, py - 2, r, Math.PI, 0, false);
    ctx.lineTo(px + r, py + r);
    for (let i = 0; i < 3; i++) {
      const bx = px + r - (r * 2 / 3) * i;
      ctx.quadraticCurveTo(bx - r / 3, py + r + 4, bx - r * 2 / 3, py + r);
    }
    ctx.lineTo(px - r, py - 2);
    ctx.fill();
    if (!g.frightened) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(px - 4, py - 4, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(px + 4, py - 4, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1e3a8a';
      ctx.beginPath(); ctx.arc(px - 3 + g.dx, py - 3 + g.dy, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(px + 5 + g.dx, py - 3 + g.dy, 1.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    drawMaze();
    ghosts.forEach(drawGhost);
    drawPlayer();
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText('♥'.repeat(lives), 4, H - 5);
    ctx.textAlign = 'right';
    ctx.fillText(score, W - 4, H - 5);
    ctx.textAlign = 'left';
  }

  // ── Main loop ─────────────────────────────────────────────────
  function loop() {
    raf = requestAnimationFrame(loop);
    frameCount++;

    // Try queued direction; fall back to current
    if (nextDx !== 0 || nextDy !== 0) {
      if (canMove(player.x, player.y, nextDx, nextDy)) {
        player.dx = nextDx; player.dy = nextDy;
        nextDx = 0; nextDy = 0;
      }
    }
    if ((player.dx !== 0 || player.dy !== 0) && canMove(player.x, player.y, player.dx, player.dy)) {
      player.x += player.dx * SPD_PLAYER;
      player.y += player.dy * SPD_PLAYER;
    }

    // Tunnel wrap
    if (player.x < 0)  player.x = W - 1;
    if (player.x >= W) player.x = 0;

    // Eat dot at current cell
    const pr = Math.floor(player.y / CELL);
    const pc = Math.floor(player.x / CELL);
    if (pr >= 0 && pr < ROWS && pc >= 0 && pc < COLS) {
      if (maze[pr][pc] === '.') {
        maze[pr][pc] = ' '; score += 10; updateScore(score); dotsLeft--;
      } else if (maze[pr][pc] === 'o') {
        maze[pr][pc] = ' '; score += 50; updateScore(score); dotsLeft--;
        frightenTimer = 420;
        ghosts.forEach(g => { g.frightened = true; });
      }
    }

    if (frightenTimer > 0) {
      frightenTimer--;
      if (frightenTimer === 0) ghosts.forEach(g => g.frightened = false);
    }

    ghosts.forEach(moveGhost);

    // Ghost collision
    for (const g of ghosts) {
      const dx = g.x - player.x, dy = g.y - player.y;
      if (Math.sqrt(dx * dx + dy * dy) < HALF + 4) {
        if (g.frightened) {
          score += 200; updateScore(score);
          const s = GHOST_STARTS[ghosts.indexOf(g)];
          g.x = s.x; g.y = s.y; g.frightened = false; g.turnCooldown = 0;
          const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
          const valid = dirs.filter(d => ghostCanMove(g.x, g.y, d.x, d.y));
          const pick = valid[Math.floor(Math.random() * valid.length)] || {x:1,y:0};
          g.dx = pick.x; g.dy = pick.y;
        } else {
          lives--;
          if (lives <= 0) {
            cancelAnimationFrame(raf);
            alive = false;
            draw();
            onGameOver(score);
            return;
          }
          // Reset positions but keep score/dots
          player.x = startCol * CELL + HALF;
          player.y = startRow * CELL + HALF;
          player.dx = 0; player.dy = 0;
          nextDx = 0; nextDy = 0;
          ghosts = makeGhosts();
          frightenTimer = 0;
        }
        break;
      }
    }

    if (dotsLeft <= 0) {
      cancelAnimationFrame(raf);
      alive = false;
      onGameOver(score);
      return;
    }

    // Mouth animation
    player.mouthAngle += 0.05 * player.mouthDir;
    if (player.mouthAngle >= 0.25) player.mouthDir = -1;
    if (player.mouthAngle <= 0.01) player.mouthDir = 1;

    draw();
  }

  init();
  loop();

  return function cleanup() {
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
  };
}
