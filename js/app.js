// UI, game loop, race mode, leaderboard and persistence.
(function () {
  const NGP = window.NGP;
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = 'neuro-gp.v1';
  const WORLD = NGP.WORLD;

  // ---------- persistence ----------
  let store = {};
  try { store = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { store = {}; }
  store.board = Array.isArray(store.board) ? store.board : [];
  store.champions = store.champions || {};
  store.unlocked = Number.isInteger(store.unlocked) ? store.unlocked : 0;
  store.runCounter = store.runCounter || 0;
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* storage unavailable */ }
  }

  const cfg = Object.assign({}, NGP.DEFAULTS);
  if (store.cfg) for (const k of Object.keys(cfg)) if (k in store.cfg && typeof store.cfg[k] === typeof cfg[k]) cfg[k] = store.cfg[k];

  // ---------- settings model ----------
  const pct = (v) => Math.round(v * 100) + '%';
  const SETTINGS = [
    {
      group: 'Neural network', restart: true, items: [
        { key: 'hidden', label: 'Hidden layers', type: 'select', options: [['4', '4'], ['6', '6'], ['8', '8'], ['12', '12'], ['6,4', '6 → 4'], ['8,6', '8 → 6'], ['12,8', '12 → 8'], ['16,12,8', '16 → 12 → 8']], hint: 'Neurons per hidden layer. Bigger brains can learn subtler driving but take longer to evolve.' },
        { key: 'activation', label: 'Activation', type: 'select', options: [['tanh', 'tanh'], ['relu', 'ReLU'], ['leaky', 'Leaky ReLU'], ['sigmoid', 'Sigmoid']], hint: 'How each hidden neuron squashes its input.' },
        { key: 'speedInput', label: 'Feed speed to the network', type: 'toggle', hint: 'Without it the car cannot tell whether it is going too fast for a corner.' },
      ],
    },
    {
      group: 'Sensors', items: [
        { key: 'rays', label: 'Ray count', type: 'range', min: 1, max: 15, step: 1, restart: true, hint: 'Distance sensors pointing out from the nose. Changing this restarts training.' },
        { key: 'raySpread', label: 'Field of view', type: 'range', min: 30, max: 300, step: 10, fmt: (v) => v + '°' },
        { key: 'rayLength', label: 'Ray length', type: 'range', min: 60, max: 400, step: 10, fmt: (v) => v + ' px', hint: 'How far ahead the car can see.' },
      ],
    },
    {
      group: 'Evolution', items: [
        { key: 'population', label: 'Population', type: 'range', min: 10, max: 300, step: 10, hint: 'Cars per generation. Applies from the next generation.' },
        { key: 'selection', label: 'Parent selection', type: 'select', options: [['tournament', 'Tournament'], ['roulette', 'Roulette wheel'], ['rank', 'Rank-based'], ['truncation', 'Top 20% only']], hint: 'How parents are picked for breeding.' },
        { key: 'tournamentK', label: 'Tournament size', type: 'range', min: 2, max: 10, step: 1, hint: 'Larger = stronger pressure toward the best cars.' },
        { key: 'crossover', label: 'Crossover', type: 'select', options: [['uniform', 'Uniform'], ['single', 'Single point'], ['blend', 'Blend'], ['none', 'None (clone)']] },
        { key: 'mutationRate', label: 'Mutation rate', type: 'range', min: 0, max: 0.5, step: 0.01, fmt: pct, hint: 'Chance that each weight in a child gets nudged.' },
        { key: 'mutationStrength', label: 'Mutation strength', type: 'range', min: 0.05, max: 2, step: 0.05, fmt: (v) => '±' + v.toFixed(2), hint: 'Size of each nudge (standard deviation).' },
        { key: 'elites', label: 'Elites kept', type: 'range', min: 0, max: 20, step: 1, hint: 'Best cars copied unchanged, so progress is never lost.' },
        { key: 'immigrants', label: 'Random immigrants', type: 'range', min: 0, max: 0.5, step: 0.05, fmt: pct, hint: 'Fresh random brains each generation to keep diversity.' },
      ],
    },
    {
      group: 'Fitness', items: [
        { key: 'speedWeight', label: 'Speed reward', type: 'range', min: 0, max: 3, step: 0.1, fmt: (v) => '×' + v.toFixed(1), hint: 'Extra credit for average speed and quick finishes.' },
        { key: 'crashPenalty', label: 'Crash penalty', type: 'range', min: 0, max: 0.9, step: 0.05, fmt: pct, hint: 'Fitness lost when a car hits the wall.' },
      ],
    },
    {
      group: 'Car physics', items: [
        { key: 'maxSpeed', label: 'Top speed', type: 'range', min: 150, max: 500, step: 10, fmt: (v) => v + ' px/s' },
        { key: 'accel', label: 'Acceleration', type: 'range', min: 100, max: 800, step: 20 },
        { key: 'turnRate', label: 'Steering rate', type: 'range', min: 1, max: 6, step: 0.1, fmt: (v) => v.toFixed(1) + ' rad/s' },
        { key: 'grip', label: 'Tyre grip', type: 'range', min: 0.2, max: 2, step: 0.1, fmt: (v) => '×' + v.toFixed(1), hint: 'Multiplies the circuit’s surface grip. Low grip = drifting.' },
      ],
    },
    {
      group: 'Session', items: [
        { key: 'genTime', label: 'Generation time limit', type: 'range', min: 15, max: 120, step: 5, fmt: (v) => v + ' s' },
        { key: 'patience', label: 'Stall timeout', type: 'range', min: 1, max: 8, step: 0.5, fmt: (v) => v + ' s', hint: 'Cars that stop making progress are removed after this long.' },
      ],
    },
  ];
  const RESTART_KEYS = new Set(['hidden', 'activation', 'speedInput', 'rays']);

  const PRESETS = [
    { name: 'Balanced', desc: 'The defaults', values: Object.assign({}, NGP.DEFAULTS) },
    { name: 'Fast learner', desc: 'High pressure, small brain', values: { hidden: '8', population: 120, selection: 'tournament', tournamentK: 5, mutationRate: 0.15, mutationStrength: 0.6, elites: 6, immigrants: 0.05 } },
    { name: 'Big brain', desc: '3 hidden layers, 11 rays', values: { hidden: '16,12,8', rays: 11, raySpread: 200, population: 150, mutationRate: 0.06, mutationStrength: 0.35, elites: 6 } },
    { name: 'Tiny brain', desc: '3 rays, 4 neurons', values: { hidden: '4', rays: 3, raySpread: 90, population: 80 } },
    { name: 'Chaos', desc: 'Huge mutations, no elites', values: { mutationRate: 0.4, mutationStrength: 1.5, elites: 0, selection: 'roulette', crossover: 'blend' } },
  ];

  const SPEEDS = [[1, '1×'], [2, '2×'], [5, '5×'], [10, '10×'], [25, '25×'], [Infinity, 'Max']];
  const MEDAL_NAMES = ['gold', 'silver', 'bronze'];

  // ---------- state ----------
  const tracks = NGP.LEVELS.map((l) => NGP.buildTrack(l));
  NGP.thumbCache = Object.fromEntries(tracks.map((t) => [t.level.id, t]));
  const backgrounds = {};
  const state = {
    level: Math.min(store.unlocked, Math.max(0, store.level | 0)),
    mode: 'train', running: true, speed: 1,
    follow: false, rays: 'best', showDead: true,
    boardLevel: 0, runId: 0, cam: null, trail: [], trailLeader: null,
    confirmClear: false,
  };
  let trainer = null, race = null;
  const input = { up: false, down: false, left: false, right: false };

  const level = () => NGP.LEVELS[state.level];
  const track = () => tracks[state.level];
  const bg = () => backgrounds[state.level] || (backgrounds[state.level] = NGP.paintTrack(track()));

  function fmt(t) {
    if (!isFinite(t)) return '—';
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
  }
  function medalFor(lvl, t) {
    if (!isFinite(t)) return null;
    for (let i = 0; i < 3; i++) if (t <= lvl.medals[i]) return MEDAL_NAMES[i];
    return null;
  }
  function setupString() {
    return `pop ${cfg.population} · ${cfg.hidden.replace(/,/g, '-')} ${cfg.activation} · ${cfg.rays} rays · ${cfg.selection} · mut ${pct(cfg.mutationRate)} ±${cfg.mutationStrength}`;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- toast ----------
  let toastTimer = null;
  function toast(msg, kind) {
    const el = $('toast');
    el.textContent = msg;
    el.dataset.kind = kind || '';
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3600);
  }

  // ---------- training ----------
  function newRun(brains) {
    store.runCounter++;
    state.runId = store.runCounter;
    save();
    trainer = new NGP.Trainer(track(), cfg, brains);
    state.trail = [];
    NGP.drawChart($('chart'), trainer.history);
    updateNetShape();
  }

  function onGeneration(stats) {
    const lvl = level();
    NGP.drawChart($('chart'), trainer.history);
    if (stats.cleared) {
      const next = state.level + 1;
      if (next < NGP.LEVELS.length && store.unlocked < next) {
        store.unlocked = next;
        toast(`Circuit cleared in generation ${stats.gen}. ${NGP.LEVELS[next].name} unlocked.`, 'good');
        renderLevels();
      } else {
        toast(`Circuit cleared in generation ${stats.gen}.`, 'good');
      }
    }
    if (stats.newRecord) {
      const ch = trainer.champion;
      const entryId = `run${state.runId}-${lvl.id}`;
      const existing = store.board.find((e) => e.id === entryId);
      const entry = { id: entryId, level: lvl.id, kind: 'AI', name: `AI run ${state.runId}`, race: ch.raceTime, lap: ch.bestLap, gen: ch.gen, setup: setupString(), at: Date.now() };
      if (existing) Object.assign(existing, entry); else store.board.push(entry);
      const saved = store.champions[lvl.id];
      if (!saved || ch.raceTime < saved.raceTime) {
        store.champions[lvl.id] = { raceTime: ch.raceTime, lap: ch.bestLap, gen: ch.gen, brain: ch.brain.toJSON() };
      }
      if (!stats.cleared) toast(`New best race: ${fmt(ch.raceTime)} in generation ${ch.gen}.`, 'record');
      renderLevels();
      if (state.mode === 'board') renderBoard();
    }
    save();
  }

  function restartTraining(msg) {
    newRun();
    if (msg) toast(msg);
  }

  function switchLevel(i) {
    if (i > store.unlocked) return;
    const keep = trainer && trainer.cars.map((c) => c.brain);
    state.level = i;
    store.level = i;
    save();
    state.cam = null;
    if (state.mode === 'race') exitRace();
    newRun(keep && $('keep-brains').checked ? keep : null);
    renderLevels();
    renderStageHead();
    if (state.mode === 'race') showRaceIntro();
  }

  // ---------- race ----------
  function raceOpponents() {
    const lvl = level(), ops = [];
    const want = NGP.layerSizes(cfg)[0];
    const saved = store.champions[lvl.id];
    if (saved) {
      try {
        const b = NGP.Brain.fromJSON(saved.brain);
        if (b.meta && b.sizes[0] === b.meta.rays + (b.meta.speedInput ? 1 : 0)) ops.push({ brain: b, label: 'Champion', note: fmt(saved.raceTime) });
      } catch (e) { /* ignore corrupt brain */ }
    }
    const ch = trainer && trainer.champion;
    if (ch && isFinite(ch.raceTime) && (!saved || ch.raceTime > saved.raceTime + 1e-3)) ops.push({ brain: ch.brain, label: 'This run', note: 'gen ' + ch.gen });
    if (!ops.length && trainer) {
      const b = (ch && ch.brain) || trainer.leader().brain;
      if (b.sizes[0] === want) ops.push({ brain: b, label: 'Rookie AI', note: 'still learning' });
    }
    return ops;
  }

  function showRaceIntro(result) {
    const ops = raceOpponents();
    $('race-ops').innerHTML = ops.length
      ? ops.map((o) => `<li><span class="chip" style="--h:${Math.round(o.brain.hue)}"></span><span>${esc(o.label)}</span><span class="mono muted">${esc(o.note)}</span></li>`).join('')
      : '<li class="muted">No trained AI yet. You will drive solo.</li>';
    $('race-title').textContent = `Beat the AI at ${level().name}`;
    $('race-result').hidden = !result;
    if (result) $('race-result').innerHTML = result;
    $('btn-start-race').textContent = result ? 'Race again' : 'Start race';
    $('race-overlay').hidden = false;
    $('countdown').hidden = true;
  }

  function startRace() {
    race = new NGP.Race(track(), cfg, raceOpponents());
    $('race-overlay').hidden = true;
    state.cam = null;
  }

  function exitRace() {
    race = null;
    $('race-overlay').hidden = true;
    $('countdown').hidden = true;
  }

  function finishRace() {
    const p = race.player, lvl = level();
    const pos = race.position();
    const name = ($('driver-name').value || 'Player').trim().slice(0, 24) || 'Player';
    const medal = medalFor(lvl, p.finishTime);
    store.board.push({ id: 'h' + Date.now(), level: lvl.id, kind: 'Human', name, race: p.finishTime, lap: p.bestLap, gen: null, setup: `${p.bumps || 0} wall hits`, at: Date.now() });
    if (store.unlocked < state.level + 1 && state.level + 1 < NGP.LEVELS.length) {
      store.unlocked = state.level + 1;
      renderLevels();
    }
    save();
    const medalTxt = medal ? `<span class="medal-dot" data-medal="${medal}"></span>${medal[0].toUpperCase() + medal.slice(1)}` : 'No medal';
    showRaceIntro(`<strong>P${pos}</strong> · ${fmt(p.finishTime)} · best lap ${fmt(p.bestLap)} · ${medalTxt}`);
    renderLevels();
  }

  // ---------- rendering ----------
  const canvas = $('track');
  const ctx = canvas.getContext('2d');

  function render() {
    const { w, h } = NGP.fitCanvas(canvas);
    const g = ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = getComputedStyle(document.body).backgroundColor;
    g.fillRect(0, 0, w, h);
    const fit = Math.min(w / WORLD.W, h / WORLD.H);
    let scale = fit, ox = (w - WORLD.W * fit) / 2, oy = (h - WORLD.H * fit) / 2;

    const racing = state.mode === 'race' && race;
    const leader = racing ? race.player : trainer && trainer.leader();
    if ((state.follow || racing) && leader) {
      scale = Math.max(fit * 2.4, Math.min(w, h) / 420);
      const tx = leader.x, ty = leader.y;
      if (!state.cam) state.cam = { x: tx, y: ty };
      state.cam.x += (tx - state.cam.x) * 0.12;
      state.cam.y += (ty - state.cam.y) * 0.12;
      ox = w / 2 - state.cam.x * scale;
      oy = h / 2 - state.cam.y * scale;
      ox = WORLD.W * scale > w ? Math.min(0, Math.max(w - WORLD.W * scale, ox)) : (w - WORLD.W * scale) / 2;
      oy = WORLD.H * scale > h ? Math.min(0, Math.max(h - WORLD.H * scale, oy)) : (h - WORLD.H * scale) / 2;
    } else {
      state.cam = null;
    }
    g.setTransform(scale, 0, 0, scale, ox, oy);
    g.drawImage(bg(), 0, 0);

    const accent = cssVar('--accent');
    if (racing) {
      for (const c of race.ai) NGP.drawCar(g, c, `hsl(${c.hue} 80% 60%)`, c.alive || c.finished ? 1 : 0.35, null);
      NGP.drawCar(g, race.player, '#f4f6f5', 1, accent);
      return;
    }
    if (!trainer) return;
    const showAllRays = state.rays === 'all';
    for (const c of trainer.cars) {
      if (c === leader) continue;
      if (!c.alive && !c.finished) {
        if (state.showDead) NGP.drawCar(g, c, `hsl(${c.hue} 40% 50%)`, 0.16, null);
        continue;
      }
      if (showAllRays && c.alive) NGP.drawRays(g, c, 'rgba(255,255,255,0.6)');
      NGP.drawCar(g, c, `hsl(${c.hue} 80% 60%)`, c.finished ? 0.5 : 0.9, null);
    }
    if (leader) {
      if (state.trailLeader !== leader) { state.trail = []; state.trailLeader = leader; }
      if (leader.alive) {
        state.trail.push([leader.x, leader.y]);
        if (state.trail.length > 90) state.trail.shift();
      }
      NGP.drawTrail(g, state.trail, accent);
      if (state.rays !== 'off' && leader.alive) NGP.drawRays(g, leader, accent);
      NGP.drawCar(g, leader, accent, 1, accent);
    }
  }

  const varCache = {};
  function cssVar(n) {
    return varCache[n] || (varCache[n] = getComputedStyle(document.documentElement).getPropertyValue(n).trim());
  }

  function inputLabels(brain) {
    if (!brain || !brain.meta) return [];
    const labels = NGP.sensorAngles(brain.meta).map((a) => {
      const d = Math.round((a * 180) / Math.PI);
      return (d > 0 ? '+' : '') + d + '°';
    });
    if (brain.meta.speedInput) labels.push('SPD');
    return labels;
  }

  function updateNetShape() {
    $('net-shape').textContent = NGP.layerSizes(cfg).join(' · ');
  }

  function statCell(label, value, cls) {
    return `<div class="stat ${cls || ''}"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
  }

  function towerRow(pos, car, val, flags) {
    return `<li class="tw ${flags}"><span class="tw-pos">${pos}</span><span class="chip" style="--h:${Math.round(car.hue)}"></span><span class="tw-name">${esc(car.label || '#' + car.id)}${car.brain && car.brain.elite ? '<small>elite</small>' : ''}</span><span class="tw-val">${val}</span></li>`;
  }

  function updateHud() {
    const lvl = level();
    if (state.mode === 'race' && race) {
      const p = race.player;
      const lapNow = p.finished ? p.lapTimes[p.lapTimes.length - 1] : race.countdown > 0 ? 0 : p.t - p.lapStart;
      $('stats').innerHTML =
        statCell('Position', `P${race.position()}<small>/${race.cars.length}</small>`) +
        statCell('Lap', `${Math.min(p.laps + 1, lvl.laps)}<small>/${lvl.laps}</small>`) +
        statCell('Lap time', fmt(lapNow), 'mono') +
        statCell('Best lap', fmt(p.bestLap), 'mono purple');
      const order = race.cars.slice().sort((a, b) => rank(b) - rank(a));
      $('tower').innerHTML = order.map((c, i) => towerRow(i + 1, c.isPlayer ? { hue: 0, label: 'You', id: 0 } : c, carStatus(c, lvl), (c.isPlayer ? 'you ' : '') + statusClass(c))).join('');
      if (race.countdown > 0) {
        $('countdown').hidden = false;
        $('countdown').textContent = Math.ceil(race.countdown);
      } else if (!$('countdown').hidden) {
        $('countdown').textContent = 'GO';
        if (race.time > 0.8) $('countdown').hidden = true;
      }
      $('hud-tl').textContent = `RACE · ${fmt(race.time)} · ${p.bumps || 0} wall hits`;
      return;
    }
    if (!trainer) return;
    const ch = trainer.champion;
    const medal = ch ? medalFor(lvl, ch.raceTime) : null;
    $('stats').innerHTML =
      statCell('Generation', trainer.gen) +
      statCell('Running', `${trainer.alive}<small>/${trainer.cars.length}</small>`) +
      statCell('Best race', (medal ? `<span class="medal-dot" data-medal="${medal}"></span>` : '') + fmt(ch ? ch.raceTime : Infinity), 'mono') +
      statCell('Fastest lap', fmt(trainer.fastestLap), 'mono purple');
    const st = trainer.standings().slice(0, 10);
    $('tower').innerHTML = st.map((c, i) => towerRow(i + 1, c, carStatus(c, lvl), (i === 0 ? 'lead ' : '') + statusClass(c))).join('');
    const sp = SPEEDS[state.speed][1];
    $('hud-tl').textContent = `GEN ${trainer.gen} · ${fmt(trainer.time)} / ${cfg.genTime}s · ${state.running ? sp : 'PAUSED'}`;
  }

  function rank(c) {
    if (c.finished) return 1e9 - c.finishTime;
    return c.maxProgress + (c.alive ? 0.5 : 0);
  }
  function statusClass(c) {
    return c.finished ? 'fin' : c.alive ? '' : 'out';
  }
  function carStatus(c, lvl) {
    if (c.finished) return fmt(c.finishTime);
    if (!c.alive) return c.crashed ? 'OUT' : 'STALL';
    const total = track().N;
    const lapFrac = Math.max(0, (c.maxProgress % total) / total);
    return `L${Math.min(c.laps + 1, lvl.laps)} ${String(Math.floor(lapFrac * 100)).padStart(2, '0')}%`;
  }

  // ---------- level list ----------
  function bestEntry(levelId) {
    return store.board.filter((e) => e.level === levelId).sort((a, b) => a.race - b.race)[0];
  }

  function renderLevels() {
    const ul = $('levels');
    ul.innerHTML = NGP.LEVELS.map((l, i) => {
      const locked = i > store.unlocked;
      const best = bestEntry(l.id);
      const medal = best ? medalFor(l, best.race) : null;
      return `<li><button class="level${i === state.level ? ' active' : ''}" data-i="${i}" ${locked ? 'disabled aria-disabled="true"' : ''} aria-pressed="${i === state.level}">
        <canvas class="thumb" width="112" height="70" data-color="${NGP.BIOMES[l.biome].kerb[0]}"></canvas>
        <span class="level-text"><span class="level-name">${esc(l.name)}</span><span class="level-meta">R${i + 1} · ${esc(l.region)} · ${best ? fmt(best.race) : locked ? 'Locked' : 'No finish yet'}</span></span>
        ${locked ? '<svg class="lock" viewBox="0 0 16 16" aria-label="Locked"><path d="M4 7V5a4 4 0 1 1 8 0v2h1v8H3V7h1zm2 0h4V5a2 2 0 1 0-4 0v2z"/></svg>' : medal ? `<span class="medal-dot lg" data-medal="${medal}" title="${medal} medal"></span>` : ''}
      </button></li>`;
    }).join('');
    ul.querySelectorAll('canvas.thumb').forEach((c, i) => NGP.paintThumb(c, NGP.LEVELS[i]));
    $('btn-unlock').hidden = store.unlocked >= NGP.LEVELS.length - 1;
  }

  function renderStageHead() {
    const l = level();
    $('lvl-region').textContent = `Round ${state.level + 1} · ${l.region} · ${l.laps} laps · grip ${Math.round(l.grip * 100)}%`;
    $('lvl-name').textContent = l.name;
    $('lvl-blurb').textContent = l.blurb;
    $('targets').innerHTML = l.medals.map((t, i) => `<span class="target"><span class="medal-dot" data-medal="${MEDAL_NAMES[i]}"></span><span class="mono">${fmt(t)}</span></span>`).join('');
  }

  // ---------- leaderboard ----------
  function renderBoard() {
    const lvl = NGP.LEVELS[state.boardLevel];
    $('board-tabs').innerHTML = NGP.LEVELS.map((l, i) => `<button role="tab" class="board-tab" data-i="${i}" aria-selected="${i === state.boardLevel}">${esc(l.name)}</button>`).join('');
    const rows = store.board.filter((e) => e.level === lvl.id).sort((a, b) => a.race - b.race).slice(0, 15);
    const fastestLap = Math.min(...rows.map((r) => r.lap));
    $('board-targets').innerHTML = `<span class="muted">Medal targets for ${l2(lvl)}:</span> ` + lvl.medals.map((t, i) => `<span class="target"><span class="medal-dot" data-medal="${MEDAL_NAMES[i]}"></span><span class="mono">${fmt(t)}</span></span>`).join('');
    if (!rows.length) {
      $('board-body').innerHTML = `<tr><td colspan="7" class="empty">No finishes on ${esc(lvl.name)} yet. Train an AI until one car completes ${lvl.laps} laps, or race it yourself.</td></tr>`;
    } else {
      $('board-body').innerHTML = rows.map((r, i) => {
        const medal = medalFor(lvl, r.race);
        return `<tr class="row">
          <td class="pos">${i + 1}</td>
          <td><span class="who">${esc(r.name)}</span> <span class="kind kind-${r.kind === 'AI' ? 'ai' : 'human'}">${r.kind === 'AI' ? 'AI' : 'Human'}</span></td>
          <td class="mono">${medal ? `<span class="medal-dot" data-medal="${medal}"></span>` : ''}${fmt(r.race)}</td>
          <td class="mono${r.lap === fastestLap ? ' purple' : ''}">${fmt(r.lap)}</td>
          <td class="mono">${r.gen ? 'gen ' + r.gen : '—'}</td>
          <td class="setup">${esc(r.setup || '')}</td>
          <td class="mono muted">${new Date(r.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
        </tr>`;
      }).join('');
    }
    $('btn-clear-board').textContent = state.confirmClear ? `Confirm: delete all ${lvl.name} times` : 'Clear this circuit';
    $('btn-clear-board').classList.toggle('danger', state.confirmClear);
  }
  const l2 = (lvl) => esc(lvl.name);

  // ---------- settings UI ----------
  function fmtValue(item, v) {
    if (item.fmt) return item.fmt(v);
    return String(v);
  }

  function renderSettings() {
    const host = $('settings');
    host.innerHTML = SETTINGS.map((grp, gi) => `
      <details class="group" ${gi < 3 ? 'open' : ''}>
        <summary><span>${grp.group}</span>${grp.restart ? '<span class="tag">restarts training</span>' : ''}</summary>
        <div class="fields">
          ${grp.items.map((it) => fieldHtml(it)).join('')}
          ${grp.group === 'Session' ? `<div class="field"><label class="switch"><input type="checkbox" id="keep-brains" checked><span class="switch-ui"></span><span>Keep brains when changing circuit</span></label><p class="hint">Transfer learning: carry the current population to the next track instead of starting from scratch.</p></div>` : ''}
        </div>
      </details>`).join('');
    host.querySelectorAll('[data-key]').forEach((el) => {
      const key = el.dataset.key;
      const item = findItem(key);
      el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
        let v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? parseFloat(el.value) : el.value;
        setSetting(key, v, item);
      });
    });
    $('presets').innerHTML = PRESETS.map((p, i) => `<button class="preset" data-i="${i}" title="${esc(p.desc)}"><span>${esc(p.name)}</span><small>${esc(p.desc)}</small></button>`).join('');
  }

  function fieldHtml(it) {
    const id = 's-' + it.key, v = cfg[it.key];
    let control;
    if (it.type === 'range') {
      control = `<input type="range" id="${id}" data-key="${it.key}" min="${it.min}" max="${it.max}" step="${it.step}" value="${v}">`;
    } else if (it.type === 'select') {
      control = `<select id="${id}" data-key="${it.key}">${it.options.map(([val, lab]) => `<option value="${val}" ${String(v) === val ? 'selected' : ''}>${lab}</option>`).join('')}</select>`;
    } else {
      return `<div class="field"><label class="switch"><input type="checkbox" id="${id}" data-key="${it.key}" ${v ? 'checked' : ''}><span class="switch-ui"></span><span>${it.label}</span></label>${it.hint ? `<p class="hint">${it.hint}</p>` : ''}</div>`;
    }
    return `<div class="field">
      <div class="field-top"><label for="${id}">${it.label}</label>${it.type === 'range' ? `<output id="o-${it.key}" for="${id}">${fmtValue(it, v)}</output>` : ''}</div>
      ${control}
      ${it.hint ? `<p class="hint">${it.hint}</p>` : ''}
    </div>`;
  }

  function findItem(key) {
    for (const g of SETTINGS) for (const it of g.items) if (it.key === key) return Object.assign({ restartGroup: g.restart }, it);
    return null;
  }

  function syncControls() {
    for (const g of SETTINGS) for (const it of g.items) {
      const el = $('s-' + it.key);
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = !!cfg[it.key]; else el.value = cfg[it.key];
      const o = $('o-' + it.key);
      if (o) o.textContent = fmtValue(it, cfg[it.key]);
    }
  }

  function setSetting(key, v, item) {
    cfg[key] = v;
    store.cfg = cfg;
    save();
    const o = $('o-' + key);
    if (o && item) o.textContent = fmtValue(item, v);
    if (RESTART_KEYS.has(key)) {
      updateNetShape();
      restartTraining('Network shape changed, so training restarted with fresh brains.');
    }
  }

  function applyPreset(p) {
    const restart = Object.keys(p.values).some((k) => RESTART_KEYS.has(k) && p.values[k] !== cfg[k]);
    Object.assign(cfg, p.values);
    store.cfg = cfg;
    save();
    syncControls();
    updateNetShape();
    if (restart) restartTraining(`${p.name} preset applied. Training restarted with the new network.`);
    else toast(`${p.name} preset applied. Changes take effect from the next generation.`);
  }

  // ---------- modes & transport ----------
  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('.modes [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    document.body.dataset.mode = mode;
    $('monitor').hidden = mode === 'board';
    $('board').hidden = mode !== 'board';
    $('touch').hidden = !(mode === 'race' && matchMedia('(pointer: coarse)').matches);
    $('tower-title').textContent = mode === 'race' ? 'Race order' : 'Timing tower';
    if (mode === 'race') showRaceIntro();
    else exitRace();
    if (mode === 'board') {
      state.boardLevel = state.level;
      state.confirmClear = false;
      renderBoard();
    }
    updateHud();
  }

  function setRunning(r) {
    state.running = r;
    $('btn-play').textContent = r ? 'Pause' : 'Resume';
    $('btn-play').setAttribute('aria-pressed', String(!r));
  }

  function setSpeed(i) {
    state.speed = i;
    document.querySelectorAll('.speed button').forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
  }

  function setRays(mode) {
    state.rays = mode;
    document.querySelectorAll('#ray-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === mode)));
  }

  // ---------- events ----------
  $('levels').addEventListener('click', (e) => {
    const b = e.target.closest('.level');
    if (b && !b.disabled) switchLevel(+b.dataset.i);
  });
  $('btn-unlock').addEventListener('click', () => {
    store.unlocked = NGP.LEVELS.length - 1;
    save();
    renderLevels();
    toast('All circuits unlocked.');
  });
  $('presets').addEventListener('click', (e) => {
    const b = e.target.closest('.preset');
    if (b) applyPreset(PRESETS[+b.dataset.i]);
  });
  document.querySelector('.modes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b) setMode(b.dataset.mode);
  });
  $('btn-play').addEventListener('click', () => setRunning(!state.running));
  $('btn-skip').addEventListener('click', () => { if (trainer) onGeneration(trainer.skip()); });
  $('btn-reset').addEventListener('click', () => restartTraining('Training restarted from random brains.'));
  document.querySelector('.speed').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setSpeed(+b.dataset.i);
  });
  $('ray-mode').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setRays(b.dataset.v);
  });
  $('tog-follow').addEventListener('change', (e) => { state.follow = e.target.checked; });
  $('tog-dead').addEventListener('change', (e) => { state.showDead = e.target.checked; });
  $('btn-start-race').addEventListener('click', startRace);
  $('board-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.board-tab');
    if (b) { state.boardLevel = +b.dataset.i; state.confirmClear = false; renderBoard(); }
  });
  $('btn-clear-board').addEventListener('click', () => {
    if (!state.confirmClear) { state.confirmClear = true; renderBoard(); return; }
    const id = NGP.LEVELS[state.boardLevel].id;
    store.board = store.board.filter((e) => e.level !== id);
    delete store.champions[id];
    state.confirmClear = false;
    save();
    renderBoard();
    renderLevels();
  });

  $('btn-copy').addEventListener('click', () => {
    const ch = trainer && trainer.champion;
    const saved = store.champions[level().id];
    const json = ch ? JSON.stringify(ch.brain.toJSON()) : saved ? JSON.stringify(saved.brain) : null;
    if (!json) { toast('No champion yet. Let a generation finish first.'); return; }
    const box = $('import-box');
    const fallback = () => {
      box.hidden = false;
      $('import-text').value = json;
      $('import-text').select();
      $('import-msg').textContent = 'Copy the selected text to save this brain.';
    };
    try {
      navigator.clipboard.writeText(json).then(() => toast('Champion brain copied to the clipboard as JSON.'), fallback);
    } catch (e) { fallback(); }
  });
  $('btn-import').addEventListener('click', () => {
    const box = $('import-box');
    box.hidden = !box.hidden;
    $('import-msg').textContent = '';
  });
  $('btn-load').addEventListener('click', () => {
    try {
      const b = NGP.Brain.fromJSON(JSON.parse($('import-text').value));
      if (!b.meta) throw new Error('This brain has no sensor settings');
      const hidden = b.sizes.slice(1, -1).join(',');
      Object.assign(cfg, { hidden, activation: b.activation, rays: b.meta.rays, raySpread: b.meta.raySpread, rayLength: b.meta.rayLength, speedInput: b.meta.speedInput });
      if (!findItem('hidden').options.some(([v]) => v === hidden)) findItem('hidden').options.push([hidden, hidden.replace(/,/g, ' → ')]);
      store.cfg = cfg;
      save();
      renderSettings();
      updateNetShape();
      const brains = [b];
      for (let i = 1; i < cfg.population; i++) {
        const c = b.clone();
        if (i > cfg.elites) c.mutate(cfg.mutationRate, cfg.mutationStrength);
        brains.push(c);
      }
      newRun(brains);
      $('import-box').hidden = true;
      toast('Brain loaded. The population is seeded from it.');
    } catch (e) {
      $('import-msg').textContent = 'Could not load that brain: ' + e.message + '. Paste the JSON from "Copy champion".';
    }
  });

  const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  window.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' && e.target.type === 'text' || tag === 'textarea' || tag === 'select') return;
    if (state.mode === 'race' && KEYMAP[e.code]) {
      input[KEYMAP[e.code]] = true;
      e.preventDefault();
      return;
    }
    if (state.mode === 'race' && e.code === 'Enter' && !race) { startRace(); return; }
    if (state.mode !== 'train') return;
    if (e.code === 'Space') { e.preventDefault(); setRunning(!state.running); }
    else if (e.code === 'KeyN') $('btn-skip').click();
    else if (e.code === 'KeyR') $('btn-reset').click();
    else if (e.code === 'KeyF') { $('tog-follow').checked = !$('tog-follow').checked; state.follow = $('tog-follow').checked; }
    else if (e.code === 'KeyV') setRays({ best: 'all', all: 'off', off: 'best' }[state.rays]);
    else if (/^Digit[1-6]$/.test(e.code)) setSpeed(+e.code.slice(5) - 1);
  });
  window.addEventListener('keyup', (e) => {
    if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false;
  });
  window.addEventListener('blur', () => { for (const k in input) input[k] = false; });
  document.querySelectorAll('#touch [data-k]').forEach((b) => {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); input[k] = true; b.classList.add('down'); };
    const off = () => { input[k] = false; b.classList.remove('down'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
  });
  window.addEventListener('resize', () => { if (trainer) NGP.drawChart($('chart'), trainer.history); });

  // ---------- main loop ----------
  let last = performance.now(), acc = 0, lastHud = 0;
  const DT = 1 / 60;
  function frame(now) {
    const real = Math.min(0.1, (now - last) / 1000);
    last = now;
    const t0 = performance.now();
    if (state.mode === 'race' && race) {
      acc += real / DT;
      while (acc >= 1) {
        const ev = race.step(DT, input);
        acc -= 1;
        if (ev === 'finish') { finishRace(); break; }
        if (ev === 'lap') toast(`Lap ${race.player.laps}: ${fmt(race.player.lapTimes[race.player.laps - 1])}`);
        if (race.done && ev !== 'finish') {
          if (!race.player.finished) showRaceIntro('Race timed out. Try again.');
          break;
        }
      }
    } else if (state.running && trainer && state.mode !== 'race') {
      const mult = SPEEDS[state.speed][0];
      acc += mult === Infinity ? 1e9 : (real / DT) * mult;
      while (acc >= 1 && performance.now() - t0 < 14) {
        const s = trainer.step(DT);
        if (s) onGeneration(s);
        acc -= 1;
      }
      if (acc > mult * 2) acc = 0;
    } else {
      acc = 0;
    }
    if (state.mode !== 'board') {
      render();
      const brain = state.mode === 'race' && race ? (race.ai[0] && race.ai[0].brain) : trainer && trainer.leader().brain;
      NGP.drawNetwork($('net'), brain, inputLabels(brain));
    }
    if (now - lastHud > 120) { updateHud(); lastHud = now; }
    requestAnimationFrame(frame);
  }

  // ---------- boot ----------
  renderSettings();
  renderLevels();
  renderStageHead();
  $('speed').innerHTML = SPEEDS.map(([, l], i) => `<button data-i="${i}" aria-pressed="false">${l}</button>`).join('');
  setSpeed(state.speed);
  setRays('best');
  newRun();
  setMode('train');
  requestAnimationFrame(frame);
})();
