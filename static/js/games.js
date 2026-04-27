// ── games.js — LifeTracker Games Module ──────────────────────

let _gameCleanup = null;
let _scores = {};

// ── Game catalogue ────────────────────────────────────────────
const GAME_LIST = [
  { id: 'snake',        title: 'Snake',          desc: 'Eat food, grow longer — avoid walls and yourself.' },
  { id: 'runner',       title: 'Runner',          desc: 'Endless dino-style runner. Jump over obstacles.' },
  { id: 'pacman',       title: 'Pac-Man',         desc: 'Eat all dots, avoid ghosts. Power pellets help.' },
  { id: 'pong',         title: 'Pong',            desc: 'Classic paddle ball. First to 7 wins.' },
  { id: 'spaceinvaders',title: 'Space Invaders',  desc: 'Shoot the alien fleet before they reach you.' },
  { id: 'tetris',       title: 'Tetris',          desc: 'Stack falling blocks and clear lines.' },
  { id: 'game2048',     title: '2048',            desc: 'Slide tiles to reach 2048.' },
  { id: 'flappybird',   title: 'Flappy Bird',     desc: 'Tap to flap through the pipes.' },
  { id: 'simon',        title: 'Simon',           desc: 'Repeat the colour sequence — for as long as you can.' },
  { id: 'numberrecall', title: 'Number Recall',   desc: 'Memorise the growing digit string.' },
  { id: 'circledodger', title: 'Circle Dodger',   desc: 'Move to dodge the incoming circles.' },
  { id: 'walljumper',   title: 'Wall Jumper',     desc: 'Bounce between walls while avoiding the bars.' },
];

// ── Page entry point ──────────────────────────────────────────
registerPage('games', async function (content) {
  if (_gameCleanup) { _gameCleanup(); _gameCleanup = null; }

  try {
    _scores = await apiFetch('GET', '/games/scores') || {};
  } catch (e) {
    _scores = {};
  }

  renderGamesGrid(content);
});

function renderGamesGrid(content) {
  document.getElementById('content')?.classList.remove('g-full-view-active');
  const cards = GAME_LIST.map(g => {
    const hi = _scores[g.id];
    const scoreStr = hi != null ? `High score: <strong>${hi}</strong>` : 'No score yet';
    return `
      <div class="game-card" data-game="${escHtml(g.id)}">
        <div class="game-card-title">${escHtml(g.title)}</div>
        <div class="game-card-desc">${escHtml(g.desc)}</div>
        <div class="game-card-score">${scoreStr}</div>
        <button class="btn btn-primary btn-sm game-card-play" data-game="${escHtml(g.id)}">Play</button>
      </div>`;
  }).join('');

  content.innerHTML = `
    <div class="games-shell">
      <div class="page-header">
        <h1 class="page-title">Games</h1>
      </div>
      <div class="games-grid">${cards}</div>
    </div>`;

  content.querySelectorAll('.game-card-play').forEach(btn => {
    btn.addEventListener('click', () => openGame(btn.dataset.game, content));
  });
}

// ── Open a game ───────────────────────────────────────────────
async function openGame(gameId, content) {
  if (_gameCleanup) { _gameCleanup(); _gameCleanup = null; }
  document.getElementById('content')?.classList.add('g-full-view-active');

  const meta = GAME_LIST.find(g => g.id === gameId);
  if (!meta) return;

  const hi = _scores[gameId] != null ? _scores[gameId] : 0;

  content.innerHTML = `
    <div class="games-view">
      <div class="games-view-header">
        <button id="gv-back" class="btn btn-secondary btn-sm">← Games</button>
        <h2 id="gv-title">${escHtml(meta.title)}</h2>
        <div class="games-score-display">
          <span>Score: <strong id="gv-score">0</strong></span>
          <span>Best: <strong id="gv-best">${hi}</strong></span>
        </div>
      </div>
      <div id="gv-game-area" class="games-area"></div>
    </div>`;

  const area = content.querySelector('#gv-game-area');
  const scoreEl = content.querySelector('#gv-score');
  const bestEl = content.querySelector('#gv-best');

  content.querySelector('#gv-back').addEventListener('click', () => {
    if (_gameCleanup) { _gameCleanup(); _gameCleanup = null; }
    renderGamesGrid(content);
  });

  function updateScore(s) {
    scoreEl.textContent = s;
  }

  async function onGameOver(score) {
    if (score > 0) {
      try {
        const res = await apiFetch('POST', '/games/scores', { game: gameId, score });
        if (res && res.high_score != null) {
          _scores[gameId] = res.high_score;
          bestEl.textContent = res.high_score;
        }
      } catch (e) { /* ignore */ }
    }

    const isNew = score > 0 && score >= (_scores[gameId] || 0);
    const overlay = document.createElement('div');
    overlay.className = 'games-overlay';
    overlay.innerHTML = `
      <div style="text-align:center;padding:24px">
        <div style="font-size:2rem;font-weight:700;margin-bottom:8px">Game Over</div>
        <div style="font-size:1.2rem;margin-bottom:4px">Score: <strong>${score}</strong></div>
        ${isNew ? '<div style="color:#f59e0b;font-weight:600;margin-bottom:12px">New High Score!</div>' : '<div style="margin-bottom:12px"></div>'}
        <div style="display:flex;gap:12px;justify-content:center">
          <button id="go-again" class="btn btn-primary">Play Again</button>
          <button id="go-back"  class="btn btn-secondary">← Games</button>
        </div>
      </div>`;
    area.style.position = 'relative';
    area.appendChild(overlay);

    overlay.querySelector('#go-again').addEventListener('click', () => {
      if (_gameCleanup) { _gameCleanup(); _gameCleanup = null; }
      overlay.remove();
      launchGame();
    });
    overlay.querySelector('#go-back').addEventListener('click', () => {
      if (_gameCleanup) { _gameCleanup(); _gameCleanup = null; }
      renderGamesGrid(content);
    });
  }

  function launchGame() {
    area.innerHTML = '';
    scoreEl.textContent = '0';
    const hi2 = _scores[gameId] != null ? _scores[gameId] : 0;
    bestEl.textContent = hi2;

    const starters = {
      snake:         startSnake,
      runner:        startRunner,
      pacman:        startPacman,
      pong:          startPong,
      spaceinvaders: startSpaceInvaders,
      tetris:        startTetris,
      game2048:      start2048,
      flappybird:    startFlappyBird,
      simon:         startSimon,
      numberrecall:  startNumberRecall,
      circledodger:  startCircleDodger,
      walljumper:    startWallJumper,
    };

    const fn = starters[gameId];
    if (fn) {
      _gameCleanup = fn(area, onGameOver, updateScore);
    }
    // Scale canvas to fill the area, preserving aspect ratio
    requestAnimationFrame(() => {
      const cv = area.querySelector('canvas');
      if (!cv) return;
      const aw = area.clientWidth  - 2;
      const ah = area.clientHeight - 2;
      if (aw <= 0 || ah <= 0) return;
      const scale = Math.min(aw / cv.width, ah / cv.height);
      cv.style.width  = Math.floor(cv.width  * scale) + 'px';
      cv.style.height = Math.floor(cv.height * scale) + 'px';
    });
  }

  launchGame();
}
