// Car physics, ray sensors, the training loop (one generation at a time)
// and the human-vs-AI race. No DOM here either.
(function (root) {
  const NGP = (root.NGP = root.NGP || {});

  const DEFAULTS = {
    hidden: '8,6', activation: 'tanh', speedInput: true, surfaceInput: false,
    rays: 7, raySpread: 180, rayLength: 220,
    population: 80, selection: 'tournament', tournamentK: 3, crossover: 'uniform',
    mutationRate: 0.1, mutationStrength: 0.5, elites: 4, immigrants: 0.05,
    speedWeight: 0.6, crashPenalty: 0.2,
    maxSpeed: 300, accel: 360, turnRate: 3.2, grip: 1,
    genTime: 60, patience: 2.5,
  };

  const CAR_HALF_L = 11, CAR_HALF_W = 5.5;

  function sensorMeta(cfg) {
    return { rays: cfg.rays, raySpread: cfg.raySpread, rayLength: cfg.rayLength, speedInput: cfg.speedInput, surfaceInput: !!cfg.surfaceInput };
  }

  function sensorAngles(meta) {
    const n = meta.rays, spread = (meta.raySpread * Math.PI) / 180;
    if (n === 1) return [0];
    const out = [];
    for (let i = 0; i < n; i++) out.push(-spread / 2 + (spread * i) / (n - 1));
    return out;
  }

  function layerSizes(cfg) {
    const hidden = String(cfg.hidden).split(',').map((s) => parseInt(s, 10)).filter((n) => n > 0);
    return [cfg.rays + (cfg.speedInput ? 1 : 0) + (cfg.surfaceInput ? 1 : 0), ...hidden, 2];
  }

  function onTrack(track, x, y) {
    if (x < 0 || y < 0 || x >= track.W || y >= track.H) return false;
    return track.mask[(y | 0) * track.W + (x | 0)] === 1;
  }

  function castRay(track, x, y, ang, maxLen) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (let d = 4; d <= maxLen; d += 4) {
      if (!onTrack(track, x + dx * d, y + dy * d)) return d - 2;
    }
    return maxLen;
  }

  function offTrack(car, track) {
    const ca = Math.cos(car.angle), sa = Math.sin(car.angle);
    const fx = ca * CAR_HALF_L, fy = sa * CAR_HALF_L, sx = -sa * CAR_HALF_W, sy = ca * CAR_HALF_W;
    return (
      !onTrack(track, car.x + fx + sx, car.y + fy + sy) ||
      !onTrack(track, car.x + fx - sx, car.y + fy - sy) ||
      !onTrack(track, car.x - fx + sx, car.y - fy + sy) ||
      !onTrack(track, car.x - fx - sx, car.y - fy - sy)
    );
  }

  class Car {
    constructor(brain, id) {
      this.brain = brain;
      this.id = id;
      this.hue = brain ? brain.hue : 0;
      this.trail = [];
    }

    reset(track) {
      this.x = track.start.x; this.y = track.start.y; this.angle = track.start.angle;
      this.vx = 0; this.vy = 0; this.fwd = 0; this.speed = 0;
      this.alive = true; this.crashed = false; this.finished = false;
      this.idx = 0; this.pos = 0; this.branch = -1; this.bIdx = 0; this.surf = track.surf[0];
      this.onSecret = false; this.usedSecret = false; this.secretUses = 0;
      this.progress = 0; this.maxProgress = 0; this.laps = 0;
      this.t = 0; this.lapStart = 0; this.lapTimes = []; this.bestLap = Infinity; this.finishTime = Infinity;
      this.stall = 0; this.speedSum = 0; this.steps = 0;
      this.steer = 0; this.throttle = 0; this.fitness = 0;
      this.trail.length = 0;
      if (this.brain) {
        const meta = this.brain.meta;
        this.angles = sensorAngles(meta);
        this.sensors = new Float32Array(meta.rays);
        this.input = new Float32Array(this.brain.sizes[0]);
      }
    }
  }

  // Arcade physics with a grip model: lateral velocity bleeds off at a rate set
  // by grip, so on ice the car keeps sliding in its old direction.
  function drive(car, steer, throttle, track, cfg, dt, allowReverse) {
    const turn = steer * cfg.turnRate * Math.min(1, Math.abs(car.fwd) / 90) * (car.fwd < 0 ? -1 : 1);
    car.angle += turn * dt;
    const ca = Math.cos(car.angle), sa = Math.sin(car.angle);
    let fwd = car.vx * ca + car.vy * sa;
    let lx = car.vx - ca * fwd, ly = car.vy - sa * fwd;
    const sf = NGP.SURFACES[car.surf || 0];
    if (throttle >= 0) fwd += throttle * cfg.accel * sf.accel * dt;
    else fwd += throttle * cfg.accel * 1.8 * dt;
    fwd -= fwd * (0.35 + sf.drag) * dt;
    const minFwd = allowReverse ? -cfg.maxSpeed * 0.3 : 0;
    if (fwd < minFwd) fwd = minFwd;
    const cap = cfg.maxSpeed * sf.cap;
    // Over the surface's limit (e.g. hitting sand) the car bleeds speed quickly
    // rather than stopping dead.
    if (fwd > cap) fwd = Math.max(cap, fwd - (fwd - cap) * 4 * dt - 40 * dt);
    const k = Math.exp(-track.grip * sf.grip * cfg.grip * 10 * dt);
    lx *= k; ly *= k;
    car.vx = ca * fwd + lx; car.vy = sa * fwd + ly;
    car.x += car.vx * dt; car.y += car.vy * dt;
    car.fwd = fwd;
    car.speed = Math.hypot(car.vx, car.vy);
    car.steer = steer; car.throttle = throttle;
  }

  function think(car, track, cfg) {
    const meta = car.brain.meta;
    const sf = NGP.SURFACES[car.surf || 0];
    const reach = meta.rayLength * sf.sight;
    for (let i = 0; i < car.angles.length; i++) {
      car.sensors[i] = castRay(track, car.x, car.y, car.angle + car.angles[i], reach) / meta.rayLength;
    }
    car.input.set(car.sensors);
    let k = meta.rays;
    if (meta.speedInput) car.input[k++] = car.fwd / cfg.maxSpeed;
    if (meta.surfaceInput) car.input[k++] = sf.traction;
    const out = car.brain.forward(car.input);
    const throttle = Math.max(-1, Math.min(1, out[1] + 0.25));
    return [out[0], throttle];
  }

  // Track progress by locking onto the nearest centreline sample ahead.
  // Secret paths: a car that drifts closer to a side path than to the main
  // road follows that path instead, and its progress is interpolated across
  // the stretch of main road the path skips.
  function locate(car, track) {
    const N = track.N, xs = track.xs, ys = track.ys;
    const d2 = (x, y) => (x - car.x) * (x - car.x) + (y - car.y) * (y - car.y);
    if (car.branch < 0) {
      let best = car.idx, bestD = Infinity;
      for (let k = -4; k <= 12; k++) {
        const j = (car.idx + k + N) % N;
        const d = d2(xs[j], ys[j]);
        if (d < bestD) { bestD = d; best = j; }
      }
      let br = -1, bk = 0;
      const halfW = track.ws[best] / 2 - 2;
      const offRoad = bestD > halfW * halfW;
      for (let bi = 0; offRoad && bi < track.branches.length; bi++) {
        const B = track.branches[bi];
        let off = (car.idx - B.a + N) % N;
        if (off > N / 2) off -= N;
        if (off < -12 || off > 10) continue;
        for (let k = 2; k < Math.min(16, B.n); k++) {
          const d = d2(B.xs[k], B.ys[k]);
          if (d < bestD) { bestD = d; br = bi; bk = k; }
        }
      }
      if (br >= 0) {
        car.branch = br; car.bIdx = bk; car.onSecret = true;
        const B = track.branches[br];
        car.surf = B.surface;
        return B.a + (bk / (B.n - 1)) * B.span;
      }
      car.idx = best;
      car.surf = track.surf[best];
      return best;
    }
    const B = track.branches[car.branch];
    let best = car.bIdx, bestD = Infinity;
    for (let k = Math.max(0, car.bIdx - 4); k <= Math.min(B.n - 1, car.bIdx + 12); k++) {
      const d = d2(B.xs[k], B.ys[k]);
      if (d < bestD) { bestD = d; best = k; }
    }
    // Rejoin the main road at the far end, or back out near the entrance.
    const ends = [];
    if (best >= B.n - 16) ends.push([B.b, -4, 12, true]);
    if (best <= 12) ends.push([B.a, -6, 6, false]);
    for (const [base, lo, hi, finished] of ends) {
      let mj = -1, md = bestD;
      for (let k = lo; k <= hi; k++) {
        const j = (base + k + N) % N;
        const d = d2(xs[j], ys[j]);
        if (d < md) { md = d; mj = j; }
      }
      if (mj >= 0) {
        car.branch = -1; car.onSecret = false; car.idx = mj; car.surf = track.surf[mj];
        if (finished) { car.usedSecret = true; car.secretUses++; }
        return mj;
      }
    }
    car.bIdx = best;
    return B.a + (best / (B.n - 1)) * B.span;
  }

  // Returns 'lap', 'finish', 'wrongway' or null.
  function advance(car, track, dt) {
    const N = track.N;
    const pos = locate(car, track);
    let delta = pos - car.pos;
    if (delta > N / 2) delta -= N;
    if (delta < -N / 2) delta += N;
    car.pos = pos;
    car.progress += delta;
    car.t += dt;
    if (car.progress > car.maxProgress) {
      car.maxProgress = car.progress;
      car.stall = 0;
    } else {
      car.stall += dt;
    }
    if (car.progress < car.maxProgress - 30) return 'wrongway';
    const laps = Math.floor(car.maxProgress / N);
    if (laps > car.laps) {
      car.laps = laps;
      const lap = car.t - car.lapStart;
      car.lapTimes.push(lap);
      car.lapStart = car.t;
      if (lap < car.bestLap) car.bestLap = lap;
      if (car.laps >= track.laps) {
        car.finishTime = car.t;
        return 'finish';
      }
      return 'lap';
    }
    return null;
  }

  function fitness(car, track, cfg) {
    const dist = car.maxProgress / track.N;
    const avg = car.steps ? car.speedSum / car.steps / cfg.maxSpeed : 0;
    let f = Math.max(0, dist) * (1 + cfg.speedWeight * avg);
    if (car.finished) f += 1 + (cfg.speedWeight * 20) / car.finishTime;
    if (car.crashed) f *= 1 - cfg.crashPenalty;
    return f;
  }

  class Trainer {
    constructor(track, cfg, brains) {
      this.track = track;
      this.cfg = cfg;
      this.gen = 1;
      this.history = [];
      this.champion = null; // { brain, raceTime, bestLap, fitness, gen }
      this.fastestLap = Infinity;
      this.firstClearGen = null;
      this.secretFoundGen = null;
      this.populate(brains);
    }

    populate(brains) {
      const cfg = this.cfg, sizes = layerSizes(cfg), meta = sensorMeta(cfg);
      const n = cfg.population;
      const list = [];
      for (let i = 0; i < n; i++) {
        let b = brains && brains[i];
        if (!b || b.sizes.join() !== sizes.join()) b = new NGP.Brain(sizes, cfg.activation);
        b.activation = cfg.activation;
        b.meta = meta;
        list.push(b);
      }
      this.cars = list.map((b, i) => new Car(b, i + 1));
      for (const c of this.cars) c.reset(this.track);
      this.time = 0;
      this.alive = this.cars.length;
    }

    step(dt) {
      const track = this.track, cfg = this.cfg;
      let alive = 0;
      for (const car of this.cars) {
        if (!car.alive) continue;
        const [steer, throttle] = think(car, track, cfg);
        drive(car, steer, throttle, track, cfg, dt, false);
        car.steps++;
        car.speedSum += car.fwd;
        if (offTrack(car, track)) { car.alive = false; car.crashed = true; continue; }
        const ev = advance(car, track, dt);
        if (ev === 'wrongway' || car.stall > cfg.patience) { car.alive = false; car.crashed = ev === 'wrongway'; continue; }
        if (ev === 'finish') { car.alive = false; car.finished = true; continue; }
        alive++;
      }
      this.alive = alive;
      this.time += dt;
      if (alive === 0 || this.time >= this.timeLimit()) return this.endGeneration();
      return null;
    }

    timeLimit() {
      return Math.max(this.cfg.genTime, this.track.level.minGenTime || 0);
    }

    leader() {
      let best = null;
      for (const c of this.cars) {
        if (!best || rankKey(c) > rankKey(best)) best = c;
      }
      return best;
    }

    standings() {
      return this.cars.slice().sort((a, b) => rankKey(b) - rankKey(a));
    }

    endGeneration() {
      const track = this.track, cfg = this.cfg, total = track.N * track.laps;
      let sum = 0, sumProg = 0, bestProg = 0, finishers = 0, genRace = Infinity, genLap = Infinity, secretUsers = 0;
      const ranked = this.cars.map((c) => {
        c.fitness = fitness(c, track, cfg);
        sum += c.fitness;
        const prog = Math.min(1, Math.max(0, c.maxProgress / total));
        sumProg += prog;
        if (prog > bestProg) bestProg = prog;
        if (c.finished) { finishers++; genRace = Math.min(genRace, c.finishTime); }
        genLap = Math.min(genLap, c.bestLap);
        if (c.usedSecret) secretUsers++;
        return { brain: c.brain, fitness: c.fitness, car: c };
      });
      ranked.sort((a, b) => b.fitness - a.fitness);

      const top = ranked[0];
      const fastest = ranked.filter((r) => r.car.finished).sort((a, b) => a.car.finishTime - b.car.finishTime)[0];
      const prev = this.champion;
      let newRecord = false;
      if (fastest && (!prev || !isFinite(prev.raceTime) || fastest.car.finishTime < prev.raceTime)) {
        this.champion = { brain: fastest.brain.clone(), raceTime: fastest.car.finishTime, bestLap: fastest.car.bestLap, fitness: fastest.fitness, gen: this.gen, usedSecret: fastest.car.usedSecret };
        newRecord = true;
      } else if (!fastest && (!prev || (!isFinite(prev.raceTime) && top.fitness > prev.fitness))) {
        this.champion = { brain: top.brain.clone(), raceTime: Infinity, bestLap: top.car.bestLap, fitness: top.fitness, gen: this.gen };
      }
      if (genLap < this.fastestLap) this.fastestLap = genLap;
      const cleared = finishers > 0 && this.firstClearGen === null;
      const secretFound = secretUsers > 0 && this.secretFoundGen === null;
      if (secretFound) this.secretFoundGen = this.gen;
      if (cleared) this.firstClearGen = this.gen;

      const stats = {
        gen: this.gen,
        best: top.fitness,
        avg: sum / ranked.length,
        bestProg, avgProg: sumProg / ranked.length,
        finishers, raceTime: genRace, bestLap: genLap,
        newRecord, cleared, secretUsers, secretFound,
        championUsedSecret: newRecord && fastest.car.usedSecret,
      };
      this.history.push(stats);
      if (this.history.length > 400) this.history.shift();

      const next = NGP.evolve(ranked, cfg, layerSizes(cfg), cfg.activation);
      this.gen++;
      this.populate(next);
      return stats;
    }

    // Kill the current generation early and breed from what it achieved.
    skip() {
      return this.endGeneration();
    }
  }

  function rankKey(c) {
    if (c.finished) return 1e9 - c.finishTime;
    return c.maxProgress + (c.alive ? 0.5 : 0);
  }

  // Human vs AI. The player bounces off walls instead of being eliminated.
  class Race {
    constructor(track, cfg, opponents) {
      this.track = track;
      this.cfg = cfg;
      this.player = new Car(null, 0);
      this.player.isPlayer = true;
      this.player.reset(track);
      this.player.label = 'You';
      this.ai = opponents.map((o, i) => {
        const c = new Car(o.brain.clone(), i + 1);
        c.label = o.label;
        c.reset(track);
        return c;
      });
      this.countdown = 3;
      this.time = 0;
      this.done = false;
    }

    get cars() {
      return [...this.ai, this.player];
    }

    step(dt, input) {
      if (this.done) return null;
      if (this.countdown > 0) {
        this.countdown -= dt;
        return null;
      }
      this.time += dt;
      const track = this.track, cfg = this.cfg;
      for (const car of this.ai) {
        if (!car.alive) continue;
        const [steer, throttle] = think(car, track, cfg);
        drive(car, steer, throttle, track, cfg, dt, false);
        if (offTrack(car, track)) { car.alive = false; car.crashed = true; continue; }
        const ev = advance(car, track, dt);
        if (ev === 'wrongway') { car.alive = false; car.crashed = true; }
        else if (ev === 'finish') { car.alive = false; car.finished = true; }
      }
      const p = this.player;
      let event = null;
      if (p.alive) {
        const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        const throttle = input.up ? 1 : input.down ? -1 : 0;
        const ox = p.x, oy = p.y;
        drive(p, steer, throttle, track, cfg, dt, true);
        if (offTrack(p, track)) {
          p.x = ox; p.y = oy;
          p.vx *= -0.25; p.vy *= -0.25; p.fwd *= -0.25;
          p.bumps = (p.bumps || 0) + 1;
        }
        const ev = advance(p, track, dt);
        if (ev === 'wrongway') {
          // Humans may turn around; just don't count backwards progress.
          p.progress = Math.max(p.progress, p.maxProgress - 30);
        } else if (ev === 'finish') {
          p.alive = false; p.finished = true; event = 'finish';
        } else if (ev === 'lap') {
          event = 'lap';
        }
      }
      const aiRunning = this.ai.some((c) => c.alive);
      if (!p.alive && !aiRunning) this.done = true;
      if (this.time > 300) { this.done = true; event = event || 'timeout'; }
      return event;
    }

    position() {
      const order = this.cars.slice().sort((a, b) => rankKey(b) - rankKey(a));
      return order.indexOf(this.player) + 1;
    }
  }

  NGP.DEFAULTS = DEFAULTS;
  NGP.Car = Car;
  NGP.Trainer = Trainer;
  NGP.Race = Race;
  NGP.advance = advance;
  NGP.layerSizes = layerSizes;
  NGP.sensorMeta = sensorMeta;
  NGP.sensorAngles = sensorAngles;
  NGP.castRay = castRay;
})(typeof window !== 'undefined' ? window : globalThis);
