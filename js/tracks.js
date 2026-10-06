// Level definitions and track geometry. Pure data + math (no DOM), so the
// simulation can also run headless in Node for testing.
(function (root) {
  const NGP = (root.NGP = root.NGP || {});
  const W = 1600, H = 1000, SPACING = 8;

  // Surfaces change how a car handles. `sight` shortens the sensor rays (fog).
  // `traction` is what the optional surface sensor reports to the network.
  const SURFACES = [
    { id: 'asphalt', grip: 1, cap: 1, accel: 1, drag: 0, sight: 1, traction: 1 },
    { id: 'ice', grip: 0.22, cap: 1, accel: 0.55, drag: 0, sight: 1, traction: 0.2 },
    { id: 'sand', grip: 0.9, cap: 0.5, accel: 0.6, drag: 1.1, sight: 1, traction: 0.45 },
    { id: 'boost', grip: 1, cap: 1.45, accel: 2.4, drag: 0, sight: 1, traction: 1.4 },
    { id: 'fog', grip: 1, cap: 1, accel: 1, drag: 0, sight: 0.35, traction: 1 },
    { id: 'dirt', grip: 0.75, cap: 0.82, accel: 0.85, drag: 0.3, sight: 1, traction: 0.7 },
  ];
  const SURFACE_INDEX = Object.fromEntries(SURFACES.map((s, i) => [s.id, i]));

  // Optional level fields:
  //   world: [W, H]         map size (default 1600 x 1000)
  //   zones: [{ from, to, type }]   surface stretches, as fractions of the lap
  //   secrets: [{ from: [x,y], via: [[x,y]...], to: [x,y], width, surface }]
  //       side paths that rejoin the main road further on. Progress along a
  //       secret counts as the main-road distance it skips.
  //   mystery: { name, region, blurb }   real identity, revealed once cleared
  // Obstacles: { at: fraction of the lap, side: -1..1 of half-width, r: radius }
  // Medals: race-time targets in seconds [gold, silver, bronze], calibrated from
  // headless training runs with default settings.
  const LEVELS = [
    {
      id: 'oakridge', name: 'Oakridge Oval', region: 'Grassland', biome: 'grass',
      width: 112, grip: 1, laps: 2, medals: [19.7, 20.6, 23],
      blurb: 'Wide and forgiving. A first lesson in holding a line.',
      points: [[300, 250], [800, 205], [1300, 250], [1430, 500], [1300, 750], [800, 795], [300, 750], [170, 500]],
    },
    {
      id: 'kessel', name: 'Kessel Bends', region: 'Grassland', biome: 'grass',
      width: 96, grip: 1, laps: 2, medals: [24.2, 26, 30],
      blurb: 'Flowing esses that punish late steering.',
      points: [[250, 200], [700, 160], [1000, 300], [1350, 180], [1480, 400], [1300, 560], [1420, 800], [1000, 860], [750, 680], [500, 840], [220, 760], [300, 480]],
    },
    {
      id: 'mirage', name: 'Mirage Canyon', region: 'Desert', biome: 'desert',
      width: 84, grip: 0.9, laps: 2, medals: [32.5, 35, 40],
      blurb: 'Two hairpins and a zig-zag through loose sand.',
      points: [[200, 180], [560, 150], [700, 420], [860, 160], [1250, 160], [1450, 320], [1150, 460], [1450, 640], [1350, 850], [900, 850], [880, 600], [600, 620], [500, 860], [200, 820], [150, 500]],
    },
    {
      id: 'docklands', name: 'Neon Docklands', region: 'Night city', biome: 'city',
      width: 80, grip: 1, laps: 2, medals: [34.5, 37, 42],
      blurb: 'Square street corners under the lights. Brake or bin it.',
      points: [[200, 150], [700, 150], [700, 400], [950, 400], [950, 150], [1400, 150], [1450, 450], [1200, 550], [1450, 700], [1400, 880], [900, 880], [850, 650], [600, 650], [550, 880], [200, 880], [150, 500]],
      obstacles: [{ at: 0.03, side: -0.5, r: 13 }, { at: 0.62, side: 0.45, r: 13 }],
    },
    {
      id: 'glacier', name: 'Glacier Ring', region: 'Tundra', biome: 'snow',
      width: 108, grip: 0.32, laps: 2, medals: [23.4, 25, 29],
      blurb: 'Sheet ice and tyre stacks. Grip is a rumour here.',
      points: [[250, 220], [800, 140], [1350, 220], [1470, 520], [1250, 820], [950, 700], [650, 850], [230, 780], [140, 480]],
      obstacles: [{ at: 0.12, side: 0.45, r: 16 }, { at: 0.2, side: -0.45, r: 16 }, { at: 0.48, side: 0.4, r: 16 }, { at: 0.8, side: -0.4, r: 16 }],
    },
    {
      id: 'caldera', name: 'Caldera Loop', region: 'Volcano', biome: 'lava',
      width: 74, grip: 0.85, laps: 2, medals: [38.5, 42, 50],
      blurb: 'Narrow, technical and ringed by lava. The final exam.',
      points: [[180, 160], [520, 140], [640, 360], [780, 140], [1100, 140], [1250, 300], [1480, 220], [1480, 560], [1200, 520], [1080, 700], [1400, 860], [800, 880], [700, 640], [480, 720], [380, 880], [150, 800], [220, 500]],
      obstacles: [{ at: 0.3, side: 0.42, r: 12 }, { at: 0.55, side: -0.42, r: 12 }, { at: 0.86, side: 0.4, r: 12 }],
    },
    {
      id: 'mystery', name: '???', region: 'Uncharted', biome: 'void',
      world: [2400, 1500], width: 92, grip: 1, laps: 1, minGenTime: 90, medals: [26, 28.5, 33],
      blurb: 'Nobody has charted this circuit. Finish it once to find out what it is.',
      mystery: { name: 'Event Horizon', region: 'Deep space', blurb: 'One long lap through everything at once: boost pads, sheet ice, a sand trap, a fog bank that blinds the sensors, a crossover and a slalom.' },
      points: [[1700, 1250], [2100, 1330], [2320, 1150], [2330, 930], [2150, 800], [2260, 600], [2330, 380], [2150, 170], [1850, 140], [1650, 290], [1550, 510], [1400, 630], [1200, 750], [1000, 870], [850, 1050], [650, 1290], [350, 1320], [150, 1110], [200, 860], [360, 720], [190, 520], [240, 260], [540, 140], [820, 240], [960, 480], [1060, 630], [1200, 750], [1340, 870], [1480, 1050]],
      widths: [96, 96, 96, 92, 88, 88, 92, 96, 96, 92, 92, 96, 100, 96, 88, 88, 88, 80, 72, 64, 64, 72, 80, 88, 92, 96, 100, 96, 96],
      zones: [
        { from: 0.012, to: 0.05, type: 'boost' },
        { from: 0.08, to: 0.19, type: 'ice' },
        { from: 0.212, to: 0.248, type: 'sand' },
        { from: 0.355, to: 0.385, type: 'boost' },
        { from: 0.6, to: 0.705, type: 'fog' },
        { from: 0.925, to: 0.965, type: 'ice' },
      ],
      obstacles: [{ at: 0.772, side: 0.45, r: 14 }, { at: 0.795, side: -0.45, r: 14 }, { at: 0.818, side: 0.45, r: 14 }, { at: 0.841, side: -0.4, r: 14 }],
    },
    {
      id: 'pines', name: 'Whispering Pines', region: 'Old forest', biome: 'forest',
      width: 82, grip: 1, laps: 2, medals: [26, 34.6, 38],
      blurb: 'A long serpentine through the woods. Locals swear there is a quicker way through.',
      points: [[200, 850], [700, 880], [1150, 860], [1450, 800], [1480, 560], [1250, 500], [1000, 560], [800, 700], [560, 640], [500, 450], [700, 320], [1000, 380], [1250, 300], [1450, 180], [1100, 110], [600, 120], [250, 180], [130, 450], [140, 700]],
      secrets: [{ from: [1476, 610], via: [[1505, 500], [1515, 400], [1500, 290]], to: [1452, 192], width: 38, surface: 'dirt' }],
    },
  ];

  // Centripetal Catmull-Rom through a closed loop of control points.
  function catmullRom(points, widths, segs) {
    const n = points.length, out = [];
    const tj = (ti, a, b) => ti + Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5);
    for (let i = 0; i < n; i++) {
      const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
      const w1 = widths[i], w2 = widths[(i + 1) % n];
      const t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
      for (let k = 0; k < segs; k++) {
        const t = t1 + ((t2 - t1) * k) / segs;
        const pt = [0, 0];
        for (let d = 0; d < 2; d++) {
          const A1 = (p0[d] * (t1 - t)) / (t1 - t0) + (p1[d] * (t - t0)) / (t1 - t0);
          const A2 = (p1[d] * (t2 - t)) / (t2 - t1) + (p2[d] * (t - t1)) / (t2 - t1);
          const A3 = (p2[d] * (t3 - t)) / (t3 - t2) + (p3[d] * (t - t2)) / (t3 - t2);
          const B1 = (A1 * (t2 - t)) / (t2 - t0) + (A2 * (t - t0)) / (t2 - t0);
          const B2 = (A2 * (t3 - t)) / (t3 - t1) + (A3 * (t - t1)) / (t3 - t1);
          pt[d] = (B1 * (t2 - t)) / (t2 - t1) + (B2 * (t - t1)) / (t2 - t1);
        }
        out.push({ x: pt[0], y: pt[1], w: w1 + ((w2 - w1) * k) / segs });
      }
    }
    return out;
  }

  // Walk the dense loop and emit points every SPACING pixels.
  function resample(dense, spacing, open) {
    const out = [dense[0]];
    let carry = 0;
    const n = dense.length;
    for (let i = 0; i < (open ? n - 1 : n); i++) {
      const a = dense[i], b = dense[(i + 1) % n];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      let d = spacing - carry;
      while (d <= seg) {
        const t = d / seg;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t });
        d += spacing;
      }
      carry = seg - (d - spacing);
    }
    const last = out[out.length - 1];
    if (open) {
      const end = dense[n - 1];
      if (Math.hypot(last.x - end.x, last.y - end.y) > spacing * 0.3) out.push(end);
    } else if (Math.hypot(last.x - out[0].x, last.y - out[0].y) < spacing * 0.5) {
      out.pop();
    }
    return out;
  }

  function stampDisk(mask, w, h, cx, cy, r, value) {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy, row = y * w;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        if (dx * dx + dy * dy <= r2) mask[row + x] = value;
      }
    }
  }

  // Open spline through the given points, with mirrored phantom ends.
  function openSpline(points, width, segs) {
    const n = points.length;
    const pre = [2 * points[0][0] - points[1][0], 2 * points[0][1] - points[1][1]];
    const post = [2 * points[n - 1][0] - points[n - 2][0], 2 * points[n - 1][1] - points[n - 2][1]];
    const all = [pre, ...points, post];
    const dense = catmullRom(all, all.map(() => width), segs);
    // catmullRom treats the list as a loop; keep only the real segments.
    return dense.slice(segs, segs * n + 1);
  }

  function nearestSample(xs, ys, x, y) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < xs.length; i++) {
      const d = (xs[i] - x) ** 2 + (ys[i] - y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function buildTrack(level) {
    const TW = level.world ? level.world[0] : W, TH = level.world ? level.world[1] : H;
    const widths = level.points.map((_, i) => (level.widths ? level.widths[i] : level.width));
    const pts = resample(catmullRom(level.points, widths, 24), SPACING);
    const N = pts.length;
    const xs = new Float32Array(N), ys = new Float32Array(N), ws = new Float32Array(N);
    const nx = new Float32Array(N), ny = new Float32Array(N), curv = new Float32Array(N);
    pts.forEach((p, i) => { xs[i] = p.x; ys[i] = p.y; ws[i] = p.w; });
    let length = 0;
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      let dx = xs[b] - xs[a], dy = ys[b] - ys[a];
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      nx[i] = -dy; ny[i] = dx;
      length += Math.hypot(xs[b] - xs[i], ys[b] - ys[i]);
    }
    for (let i = 0; i < N; i++) {
      const a = (i - 3 + N) % N, b = (i + 3) % N;
      const h1 = Math.atan2(ys[i] - ys[a], xs[i] - xs[a]);
      const h2 = Math.atan2(ys[b] - ys[i], xs[b] - xs[i]);
      let d = h2 - h1;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      curv[i] = d;
    }

    const surf = new Uint8Array(N);
    for (const z of level.zones || []) {
      const from = Math.floor(z.from * N), to = Math.floor(z.to * N);
      for (let i = from; i <= to; i++) surf[i % N] = SURFACE_INDEX[z.type];
    }

    const mask = new Uint8Array(TW * TH);
    for (let i = 0; i < N; i++) stampDisk(mask, TW, TH, xs[i], ys[i], ws[i] / 2, 1);

    const branches = (level.secrets || []).map((sec) => {
      const a = nearestSample(xs, ys, sec.from[0], sec.from[1]);
      const b = nearestSample(xs, ys, sec.to[0], sec.to[1]);
      const ctrl = [[xs[a], ys[a]], ...sec.via, [xs[b], ys[b]]];
      const bp = resample(openSpline(ctrl, sec.width, 24), SPACING, true);
      const n = bp.length;
      const br = {
        a, b, n, width: sec.width, surface: SURFACE_INDEX[sec.surface || 'dirt'],
        xs: Float32Array.from(bp, (p) => p.x), ys: Float32Array.from(bp, (p) => p.y),
        span: (b - a + N) % N,
      };
      let len = 0;
      for (let i = 1; i < n; i++) len += Math.hypot(br.xs[i] - br.xs[i - 1], br.ys[i] - br.ys[i - 1]);
      br.length = len;
      br.skipped = br.span * SPACING;
      for (let i = 0; i < n; i++) stampDisk(mask, TW, TH, br.xs[i], br.ys[i], sec.width / 2, 1);
      return br;
    });

    const obstacles = (level.obstacles || []).map((o) => {
      const i = Math.floor(o.at * N) % N;
      const x = xs[i] + nx[i] * o.side * ws[i] * 0.5;
      const y = ys[i] + ny[i] * o.side * ws[i] * 0.5;
      stampDisk(mask, TW, TH, x, y, o.r, 0);
      return { x, y, r: o.r };
    });

    return {
      level, W: TW, H: TH, N, xs, ys, ws, nx, ny, curv, surf, mask, obstacles, branches,
      length, grip: level.grip, laps: level.laps,
      start: { x: xs[0], y: ys[0], angle: Math.atan2(ys[1] - ys[0], xs[1] - xs[0]) },
    };
  }

  NGP.LEVELS = LEVELS;
  NGP.SURFACES = SURFACES;
  NGP.WORLD = { W, H, SPACING };
  NGP.buildTrack = buildTrack;
})(typeof window !== 'undefined' ? window : globalThis);
