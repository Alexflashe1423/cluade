// Drawing: per-biome track art (painted once per level), cars, sensor rays,
// the live neural-network diagram and the learning curve.
(function (root) {
  const NGP = (root.NGP = root.NGP || {});

  const BIOMES = {
    grass: {
      ground: '#2c5a2f', stripe: '#31633a', specks: ['#264f29', '#3a7140', '#2f5f33'],
      runoff: 10, runoffColor: '#6d7a53', asphalt: '#3a3f44', asphaltSpeck: ['#43494f', '#33383c'],
      kerb: ['#d8263d', '#f3f1ec'], edge: 'rgba(255,255,255,0.85)', glow: null,
      tyre: '#d8263d',
    },
    desert: {
      ground: '#c99358', stripe: null, specks: ['#b98349', '#d6a46a', '#a8763f'],
      runoff: 22, runoffColor: '#ddb57c', asphalt: '#4a4340', asphaltSpeck: ['#544c48', '#403a37'],
      kerb: ['#cf2e2e', '#f4ead8'], edge: 'rgba(255,245,225,0.8)', glow: null,
      tyre: '#f4ead8',
    },
    city: {
      ground: '#0c1020', stripe: null, specks: ['#11162a', '#0a0d1a'],
      runoff: 16, runoffColor: '#262b44', asphalt: '#1d2033', asphaltSpeck: ['#24283e', '#181b2b'],
      kerb: ['#ff2bd6', '#e6e8ff'], edge: '#3fe3ff', glow: '#3fe3ff',
      tyre: '#ff2bd6',
    },
    snow: {
      ground: '#dfe8ef', stripe: null, specks: ['#cfdbe4', '#eef4f8', '#c4d2dd'],
      runoff: 18, runoffColor: '#f6fafc', asphalt: '#9db6c8', asphaltSpeck: ['#b3c9d8', '#8ca7ba', '#c7dae6'],
      kerb: ['#2563d9', '#ffffff'], edge: 'rgba(255,255,255,0.95)', glow: null,
      tyre: '#2563d9',
    },
    lava: {
      ground: '#221614', stripe: null, specks: ['#2c1d1a', '#1a1110', '#33221e'],
      runoff: 14, runoffColor: '#3a2925', asphalt: '#2d2a2b', asphaltSpeck: ['#363233', '#252223'],
      kerb: ['#ff7a1a', '#1b1514'], edge: '#ffb347', glow: '#ff6a00',
      tyre: '#ff7a1a',
    },
    void: {
      ground: '#07060f', stripe: null, specks: ['#0d0b1c', '#04030a'],
      runoff: 12, runoffColor: '#15122a', asphalt: '#1b1730', asphaltSpeck: ['#221d3b', '#161227'],
      kerb: ['#9b5cff', '#e9e4ff'], edge: '#b98cff', glow: '#8a4dff',
      tyre: '#9b5cff',
    },
    forest: {
      ground: '#1f4024', stripe: null, specks: ['#1a3a1f', '#264c2b', '#2c3a1d'],
      runoff: 8, runoffColor: '#4b5a37', asphalt: '#383c3f', asphaltSpeck: ['#41464a', '#303437'],
      kerb: ['#e9e4d6', '#2f6b39'], edge: 'rgba(240,236,220,0.8)', glow: null,
      tyre: '#e9e4d6',
    },
  };

  // How each surface looks painted on the road.
  const SURFACE_PAINT = {
    ice: { base: '#b9dcf2', specks: ['#e6f4fc', '#9cc8e6', '#ffffff'] },
    sand: { base: '#c79a5a', specks: ['#d8ae70', '#b28448', '#e2c08a'] },
    dirt: { base: '#6b5233', specks: ['#5a4329', '#7d6140', '#4c3a24'] },
  };

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function onMask(track, x, y) {
    if (x < 0 || y < 0 || x >= track.W || y >= track.H) return false;
    return track.mask[(y | 0) * track.W + (x | 0)] === 1;
  }

  // True when no drivable pixel lies within roughly r of (x, y).
  function clearOf(track, x, y, r) {
    if (onMask(track, x, y)) return false;
    for (const rr of [r * 0.5, r]) {
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        if (onMask(track, x + Math.cos(ang) * rr, y + Math.sin(ang) * rr)) return false;
      }
    }
    return true;
  }

  function strokeLoop(g, track, widthFn, color) {
    const { xs, ys, ws, N } = track;
    g.strokeStyle = color;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      g.lineWidth = widthFn(ws[i]);
      g.beginPath();
      g.moveTo(xs[i], ys[i]);
      g.lineTo(xs[j], ys[j]);
      g.stroke();
    }
  }

  // An edge is "open" where more road continues beyond it: the crossover,
  // or the mouth of a side path. No kerbs or lines get painted there.
  function edgeOpen(track, i, side) {
    const off = side * (track.ws[i] / 2 + 9);
    return onMask(track, track.xs[i] + track.nx[i] * off, track.ys[i] + track.ny[i] * off);
  }

  function edgePath(g, track, side, inset) {
    const { xs, ys, ws, nx, ny, N } = track;
    g.beginPath();
    let pen = false;
    for (let i = 0; i <= N; i++) {
      const k = i % N, off = side * (ws[k] / 2 - inset);
      const x = xs[k] + nx[k] * off, y = ys[k] + ny[k] * off;
      if (edgeOpen(track, k, side)) { pen = false; continue; }
      if (!pen) { g.moveTo(x, y); pen = true; } else g.lineTo(x, y);
    }
  }

  function strokePath(g, pxs, pys, width, color) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i < pxs.length; i++) (i ? g.lineTo(pxs[i], pys[i]) : g.moveTo(pxs[i], pys[i]));
    g.stroke();
  }

  function speckleAlong(g, pxs, pys, width, colors, count, r) {
    for (let n = 0; n < count; n++) {
      const i = (r() * pxs.length) | 0;
      const a = r() * Math.PI * 2, d = r() * width * 0.45;
      g.fillStyle = colors[(r() * colors.length) | 0];
      g.fillRect(pxs[i] + Math.cos(a) * d, pys[i] + Math.sin(a) * d, 2, 2);
    }
  }

  // Contiguous [from, to] sample runs of each non-asphalt surface.
  function surfaceRuns(track) {
    const runs = [], { surf, N } = track;
    let i = 0;
    while (i < N) {
      if (!surf[i]) { i++; continue; }
      const type = surf[i], from = i;
      while (i < N && surf[i] === type) i++;
      runs.push({ type: NGP.SURFACES[type].id, from, to: i - 1 });
    }
    return runs;
  }

  function paintSurfaces(g, track, r) {
    const { xs, ys, ws, nx, ny } = track;
    for (const run of surfaceRuns(track)) {
      const idx = [];
      for (let i = run.from; i <= run.to; i++) idx.push(i);
      const pxs = idx.map((i) => xs[i]), pys = idx.map((i) => ys[i]);
      const w = Math.min(...idx.map((i) => ws[i])) - 6;
      const paint = SURFACE_PAINT[run.type];
      if (paint) {
        g.save();
        g.globalAlpha = 0.92;
        strokePath(g, pxs, pys, w, paint.base);
        g.restore();
        speckleAlong(g, pxs, pys, w, paint.specks, idx.length * 14, r);
        if (run.type === 'ice') {
          g.strokeStyle = 'rgba(255,255,255,0.55)';
          g.lineWidth = 1;
          for (let n = 0; n < idx.length / 2; n++) {
            const i = idx[(r() * idx.length) | 0], o = (r() - 0.5) * w * 0.8, a = r() * Math.PI;
            const cx = xs[i] + nx[i] * o, cy = ys[i] + ny[i] * o;
            g.beginPath(); g.moveTo(cx - Math.cos(a) * 8, cy - Math.sin(a) * 8); g.lineTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8); g.stroke();
          }
        }
      } else if (run.type === 'boost') {
        g.save();
        g.shadowColor = '#3fe3ff';
        g.shadowBlur = 10;
        for (let k = 0; k < idx.length; k += 5) {
          const i = idx[k], tx = ny[i], ty = -nx[i];
          const half = ws[i] / 2 - 14;
          g.fillStyle = (k / 5) % 2 ? '#3fe3ff' : '#ffcc1a';
          g.beginPath();
          g.moveTo(xs[i] + nx[i] * half, ys[i] + ny[i] * half);
          g.lineTo(xs[i] + tx * 12, ys[i] + ty * 12);
          g.lineTo(xs[i] - nx[i] * half, ys[i] - ny[i] * half);
          g.lineTo(xs[i] - nx[i] * half + tx * 7, ys[i] - ny[i] * half + ty * 7);
          g.lineTo(xs[i] + tx * 19, ys[i] + ty * 19);
          g.lineTo(xs[i] + nx[i] * half + tx * 7, ys[i] + ny[i] * half + ty * 7);
          g.closePath();
          g.fill();
        }
        g.restore();
      }
    }
  }

  function paintGroundDecor(g, track, theme, biome, r) {
    const { W, H } = track;
    if (theme.stripe) {
      g.save();
      g.fillStyle = theme.stripe;
      g.translate(W / 2, H / 2);
      g.rotate(-0.5);
      for (let x = -W; x < W; x += 90) g.fillRect(x, -H * 1.2, 45, H * 2.4);
      g.restore();
    }
    for (let i = 0; i < 14000; i++) {
      g.fillStyle = theme.specks[(r() * theme.specks.length) | 0];
      const s = r() < 0.9 ? 2 : 4;
      g.fillRect(r() * W, r() * H, s, s);
    }
    if (biome === 'desert') {
      for (let i = 0; i < 26; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(232,192,138,0.35)' : 'rgba(160,110,60,0.18)';
        g.beginPath();
        g.ellipse(r() * W, r() * H, 60 + r() * 140, 18 + r() * 30, -0.3 + r() * 0.2, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (biome === 'city') {
      for (let gx = 0; gx < W; gx += 84) {
        for (let gy = 0; gy < H; gy += 84) {
          const inset = 6 + r() * 8, w = 84 - inset * 2, h = 84 - inset * 2;
          const x = gx + inset, y = gy + inset;
          g.fillStyle = r() < 0.5 ? '#141a31' : '#181f3a';
          g.fillRect(x, y, w, h);
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(x + w - 4, y + 4, 4, h - 4);
          for (let wx = x + 6; wx < x + w - 6; wx += 8) {
            for (let wy = y + 6; wy < y + h - 6; wy += 8) {
              const p = r();
              if (p < 0.22) {
                g.fillStyle = p < 0.12 ? 'rgba(255,206,107,0.75)' : 'rgba(94,225,255,0.6)';
                g.fillRect(wx, wy, 3, 3);
              }
            }
          }
        }
      }
    }
    if (biome === 'void') {
      const { W, H } = track;
      for (let i = 0; i < 9; i++) {
        const x = r() * W, y = r() * H, rad = 220 + r() * 380;
        const grad = g.createRadialGradient(x, y, 0, x, y, rad);
        const hue = [265, 285, 190, 320][(r() * 4) | 0];
        grad.addColorStop(0, `hsla(${hue}, 80%, 45%, 0.22)`);
        grad.addColorStop(0.5, `hsla(${hue}, 80%, 30%, 0.09)`);
        grad.addColorStop(1, `hsla(${hue}, 80%, 20%, 0)`);
        g.fillStyle = grad;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      for (let i = 0; i < 1600; i++) {
        const s = r() < 0.92 ? 1.2 : 2.4;
        g.fillStyle = r() < 0.15 ? '#b9a6ff' : r() < 0.2 ? '#9fe7ff' : '#ffffff';
        g.globalAlpha = 0.35 + r() * 0.65;
        g.fillRect(r() * W, r() * H, s, s);
      }
      g.globalAlpha = 1;
    }
    if (biome === 'lava') {
      g.save();
      g.lineCap = 'round';
      g.shadowColor = '#ff5a00';
      g.shadowBlur = 10;
      for (let i = 0; i < 40; i++) {
        let x = r() * W, y = r() * H, a = r() * Math.PI * 2;
        g.strokeStyle = r() < 0.5 ? '#ff5a1a' : '#ff8c2a';
        g.lineWidth = 1 + r() * 2.5;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 10; k++) {
          a += (r() - 0.5) * 1.2;
          x += Math.cos(a) * 18; y += Math.sin(a) * 18;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      g.restore();
      for (let i = 0; i < 60; i++) {
        const x = r() * W, y = r() * H, rad = 24 + r() * 46;
        if (!clearOf(track, x, y, rad + 30)) continue;
        const grad = g.createRadialGradient(x, y, 2, x, y, rad);
        grad.addColorStop(0, '#ffd27a');
        grad.addColorStop(0.35, '#ff7a1a');
        grad.addColorStop(0.7, 'rgba(200,40,0,0.55)');
        grad.addColorStop(1, 'rgba(120,20,0,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  function paintProps(g, track, biome, r) {
    const { W, H } = track;
    const count = { grass: 170, desert: 90, snow: 150, city: 0, lava: 50, forest: 900, void: 70 }[biome];
    for (let i = 0; i < count; i++) {
      const x = r() * W, y = r() * H;
      const s = 8 + r() * 10;
      if (!clearOf(track, x, y, s + 26)) continue;
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.beginPath();
      g.ellipse(x + 5, y + 6, s, s * 0.8, 0, 0, Math.PI * 2);
      g.fill();
      if (biome === 'forest') {
        const dark = r() < 0.5;
        for (let k = 3; k >= 1; k--) {
          const rr = s * (0.5 + k * 0.25);
          g.fillStyle = dark ? '#173a20' : '#1d4626';
          g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
          g.fillStyle = dark ? '#21502b' : '#2a5f33';
          g.beginPath(); g.arc(x - rr * 0.25, y - rr * 0.25, rr * 0.5, 0, Math.PI * 2); g.fill();
        }
      } else if (biome === 'void') {
        g.save();
        g.translate(x, y);
        g.rotate(r() * Math.PI);
        g.shadowColor = '#9b5cff';
        g.shadowBlur = 14;
        g.fillStyle = r() < 0.5 ? '#6f45d9' : '#3fb6d9';
        g.beginPath();
        g.moveTo(0, -s); g.lineTo(s * 0.45, 0); g.lineTo(0, s * 0.7); g.lineTo(-s * 0.45, 0);
        g.closePath();
        g.fill();
        g.restore();
      } else if (biome === 'grass') {
        g.fillStyle = '#1d4521';
        g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#2b6230';
        g.beginPath(); g.arc(x - s * 0.25, y - s * 0.25, s * 0.65, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#3b7a3c';
        g.beginPath(); g.arc(x - s * 0.4, y - s * 0.4, s * 0.3, 0, Math.PI * 2); g.fill();
      } else if (biome === 'desert') {
        if (r() < 0.6) {
          g.fillStyle = '#9a6a3c';
          g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#c08a52';
          g.beginPath(); g.ellipse(x - 2, y - 2, s * 0.55, s * 0.4, 0, 0, Math.PI * 2); g.fill();
        } else {
          g.fillStyle = '#4c7a3a';
          g.beginPath(); g.arc(x, y, s * 0.55, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.arc(x + s * 0.6, y - s * 0.2, s * 0.32, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.arc(x - s * 0.6, y + s * 0.1, s * 0.3, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#6a9a4c';
          g.beginPath(); g.arc(x - 1.5, y - 1.5, s * 0.22, 0, Math.PI * 2); g.fill();
        }
      } else if (biome === 'snow') {
        for (let k = 3; k >= 1; k--) {
          const rr = s * (0.45 + k * 0.22);
          g.fillStyle = '#2b4a3d';
          g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.75)';
          g.beginPath(); g.arc(x - rr * 0.25, y - rr * 0.25, rr * 0.45, 0, Math.PI * 2); g.fill();
        }
      } else if (biome === 'lava') {
        g.fillStyle = '#3a2a26';
        g.beginPath(); g.ellipse(x, y, s, s * 0.75, r() * 3, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#4c3833';
        g.beginPath(); g.ellipse(x - 2, y - 2, s * 0.5, s * 0.35, 0, 0, Math.PI * 2); g.fill();
      }
    }
  }

  function paintTrack(track) {
    const level = track.level, biome = level.biome, theme = BIOMES[biome];
    const c = document.createElement('canvas');
    c.width = track.W; c.height = track.H;
    const g = c.getContext('2d');
    const r = rng(level.id.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));

    g.fillStyle = theme.ground;
    g.fillRect(0, 0, track.W, track.H);
    paintGroundDecor(g, track, theme, biome, r);

    strokeLoop(g, track, (w) => w + theme.runoff * 2 + 12, theme.runoffColor);
    for (const B of track.branches) {
      const paint = SURFACE_PAINT[NGP.SURFACES[B.surface].id] || SURFACE_PAINT.dirt;
      strokePath(g, B.xs, B.ys, B.width + 4, paint.specks[2]);
      strokePath(g, B.xs, B.ys, B.width, paint.base);
      speckleAlong(g, Array.from(B.xs), Array.from(B.ys), B.width, paint.specks, B.n * 30, r);
      // Wheel ruts.
      for (const o of [-0.22, 0.22]) {
        const ox = [], oy = [];
        for (let i = 0; i < B.n; i++) {
          const j = Math.min(B.n - 1, i + 1), k = Math.max(0, i - 1);
          let dx = B.xs[j] - B.xs[k], dy = B.ys[j] - B.ys[k];
          const l = Math.hypot(dx, dy) || 1;
          ox.push(B.xs[i] - (dy / l) * o * B.width); oy.push(B.ys[i] + (dx / l) * o * B.width);
        }
        strokePath(g, ox, oy, 3, 'rgba(40,28,15,0.45)');
      }
    }
    strokeLoop(g, track, (w) => w, theme.asphalt);
    for (let i = 0; i < 60000; i++) {
      const x = r() * track.W, y = r() * track.H;
      if (!onMask(track, x, y)) continue;
      g.fillStyle = theme.asphaltSpeck[(r() * theme.asphaltSpeck.length) | 0];
      g.fillRect(x, y, 2, 2);
    }
    paintSurfaces(g, track, r);

    // Kerbs on the corners, both sides, in alternating blocks.
    const { xs, ys, ws, nx, ny, curv, N } = track;
    for (let i = 0; i < N; i++) {
      if (Math.abs(curv[i]) < 0.13) continue;
      const j = (i + 1) % N;
      for (const side of [-1, 1]) {
        if (edgeOpen(track, i, side)) continue;
        const r1 = ws[i] / 2 - 7, r2 = ws[i] / 2 + 2, r1b = ws[j] / 2 - 7, r2b = ws[j] / 2 + 2;
        g.fillStyle = theme.kerb[(i >> 1) & 1];
        g.beginPath();
        g.moveTo(xs[i] + nx[i] * side * r1, ys[i] + ny[i] * side * r1);
        g.lineTo(xs[j] + nx[j] * side * r1b, ys[j] + ny[j] * side * r1b);
        g.lineTo(xs[j] + nx[j] * side * r2b, ys[j] + ny[j] * side * r2b);
        g.lineTo(xs[i] + nx[i] * side * r2, ys[i] + ny[i] * side * r2);
        g.closePath();
        g.fill();
      }
    }

    g.save();
    if (theme.glow) { g.shadowColor = theme.glow; g.shadowBlur = 12; }
    g.strokeStyle = theme.edge;
    g.lineWidth = theme.glow ? 2.5 : 2;
    for (const side of [-1, 1]) {
      edgePath(g, track, side, 10);
      g.stroke();
    }
    g.restore();

    // Chequered start/finish line.
    const angle = Math.atan2(ys[1] - ys[0], xs[1] - xs[0]);
    g.save();
    g.translate(xs[0], ys[0]);
    g.rotate(angle);
    const half = ws[0] / 2, sq = 7;
    for (let row = 0; row < 2; row++) {
      for (let k = 0, y = -half; y < half; y += sq, k++) {
        g.fillStyle = (k + row) % 2 ? '#111' : '#f5f5f5';
        g.fillRect(-sq + row * sq, y, sq, Math.min(sq, half - y));
      }
    }
    g.restore();

    for (const o of track.obstacles) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.arc(o.x + 3, o.y + 4, o.r, 0, Math.PI * 2); g.fill();
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.4, d = o.r * 0.45, rr = o.r * 0.55;
        const cx = o.x + Math.cos(a) * d, cy = o.y + Math.sin(a) * d;
        g.fillStyle = '#161616';
        g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.fill();
        g.strokeStyle = theme.tyre;
        g.lineWidth = 2.5;
        g.beginPath(); g.arc(cx, cy, rr - 2, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#2a2a2a';
        g.beginPath(); g.arc(cx, cy, rr * 0.4, 0, Math.PI * 2); g.fill();
      }
    }

    paintProps(g, track, biome, r);
    return c;
  }

  function paintThumb(canvas, level, hidden) {
    const g = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    g.clearRect(0, 0, w, h);
    if (hidden) {
      g.fillStyle = canvas.dataset.color || '#888';
      g.font = '800 italic 44px "Saira Condensed", "Arial Narrow", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('?', w / 2, h / 2 + 2);
      return;
    }
    const track = NGP.thumbCache && NGP.thumbCache[level.id];
    const TW = track ? track.W : 1600, TH = track ? track.H : 1000;
    const s = Math.min(w / TW, h / TH) * 0.92;
    g.save();
    g.translate((w - TW * s) / 2, (h - TH * s) / 2);
    g.scale(s, s);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    if (track) {
      for (let i = 0; i <= track.N; i++) {
        const k = i % track.N;
        if (i === 0) g.moveTo(track.xs[k], track.ys[k]); else g.lineTo(track.xs[k], track.ys[k]);
      }
    } else {
      level.points.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.closePath();
    }
    g.strokeStyle = canvas.dataset.color || '#888';
    g.lineWidth = level.width * 0.9 * (TW / 1600);
    g.stroke();
    g.restore();
  }

  // Layer drawn above the cars: fog banks and the forest canopy over secret
  // paths, so cars visibly vanish into them. Returns null if there is none.
  function paintOverlay(track) {
    const fogRuns = surfaceRuns(track).filter((run) => run.type === 'fog');
    if (!fogRuns.length && !track.branches.length) return null;
    const c = document.createElement('canvas');
    c.width = track.W; c.height = track.H;
    const g = c.getContext('2d');
    const r = rng(99 + track.N);
    for (const run of fogRuns) {
      for (let i = run.from; i <= run.to; i += 2) {
        for (let k = 0; k < 2; k++) {
          const x = track.xs[i] + (r() - 0.5) * 120, y = track.ys[i] + (r() - 0.5) * 120;
          const rad = 50 + r() * 70;
          const grad = g.createRadialGradient(x, y, 0, x, y, rad);
          grad.addColorStop(0, 'rgba(196, 186, 230, 0.16)');
          grad.addColorStop(1, 'rgba(196, 186, 230, 0)');
          g.fillStyle = grad;
          g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
      }
    }
    for (const B of track.branches) {
      // Leave the mouths open so the entrance reads as a gap in the trees.
      for (let i = 5; i < B.n - 5; i++) {
        for (let k = 0; k < 3; k++) {
          const x = B.xs[i] + (r() - 0.5) * B.width * 1.6, y = B.ys[i] + (r() - 0.5) * B.width * 1.6;
          const s = 14 + r() * 12;
          g.fillStyle = 'rgba(0,0,0,0.22)';
          g.beginPath(); g.arc(x + 4, y + 5, s, 0, Math.PI * 2); g.fill();
          g.fillStyle = r() < 0.5 ? 'rgba(23,58,32,0.93)' : 'rgba(29,70,38,0.93)';
          g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(42,95,51,0.9)';
          g.beginPath(); g.arc(x - s * 0.3, y - s * 0.3, s * 0.45, 0, Math.PI * 2); g.fill();
        }
      }
    }
    return c;
  }

  function drawCar(g, car, fill, alpha, mark) {
    g.save();
    g.translate(car.x, car.y);
    g.rotate(car.angle);
    g.globalAlpha = alpha;
    if (mark) {
      g.fillStyle = mark;
      g.globalAlpha = alpha * 0.28;
      g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.fill();
      g.globalAlpha = alpha;
    }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(-10, -4, 23, 11);
    g.fillStyle = '#0d0d0d';
    g.fillRect(-9, -7, 6, 3); g.fillRect(-9, 4, 6, 3);
    g.fillRect(5, -6.5, 5, 2.5); g.fillRect(5, 4, 5, 2.5);
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(-11, -5); g.lineTo(6, -4.5); g.lineTo(12, -1.5); g.lineTo(12, 1.5); g.lineTo(6, 4.5); g.lineTo(-11, 5);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(10,14,18,0.9)';
    g.fillRect(-3, -2.5, 6, 5);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(9, -0.8, 3, 1.6);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(-12.5, -6, 2.5, 12);
    g.restore();
  }

  function drawRays(g, car, color) {
    if (!car.sensors || !car.brain) return;
    const len = car.brain.meta.rayLength;
    g.save();
    g.lineWidth = 1.2;
    for (let i = 0; i < car.angles.length; i++) {
      const a = car.angle + car.angles[i], d = car.sensors[i] * len;
      const ex = car.x + Math.cos(a) * d, ey = car.y + Math.sin(a) * d;
      g.strokeStyle = color;
      g.globalAlpha = 0.55;
      g.beginPath(); g.moveTo(car.x, car.y); g.lineTo(ex, ey); g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = car.sensors[i] < 0.35 ? '#ff4d4f' : color;
      g.beginPath(); g.arc(ex, ey, 2.6, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  function drawTrail(g, trail, color) {
    if (trail.length < 2) return;
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let i = 1; i < trail.length; i++) {
      // At high sim speeds consecutive frames are far apart; don't bridge them.
      if (Math.abs(trail[i][0] - trail[i - 1][0]) + Math.abs(trail[i][1] - trail[i - 1][1]) > 40) continue;
      g.globalAlpha = (i / trail.length) * 0.7;
      g.strokeStyle = color;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(trail[i - 1][0], trail[i - 1][1]);
      g.lineTo(trail[i][0], trail[i][1]);
      g.stroke();
    }
    g.restore();
  }

  function fitCanvas(canvas) {
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { w, h, dpr, cssW: rect.width, cssH: rect.height };
  }

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // Network diagram: blue = negative weight, gold = positive, thickness = |w|;
  // node brightness = current activation.
  function drawNetwork(canvas, brain, inputLabels) {
    const { w, h, dpr } = fitCanvas(canvas);
    const g = canvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    if (!brain) return;
    g.scale(dpr, dpr);
    const cw = w / dpr, ch = h / dpr;
    const sizes = brain.sizes, L = sizes.length;
    const padL = 44, padR = 50, padY = 12;
    const colX = (l) => padL + ((cw - padL - padR) * l) / (L - 1);
    const rowY = (l, i) => {
      const n = sizes[l];
      const span = Math.min(ch - padY * 2, n * 22);
      return ch / 2 - span / 2 + (n === 1 ? span / 2 : (span * i) / (n - 1));
    };
    const pos = css('--accent'), neg = css('--cyan'), fg = css('--fg'), muted = css('--muted'), panel = css('--panel-2');
    for (let l = 1; l < L; l++) {
      for (let j = 0; j < sizes[l]; j++) {
        for (let i = 0; i < sizes[l - 1]; i++) {
          const wgt = brain.weight(l, i, j);
          const act = Math.abs(brain.acts[l - 1][i]);
          g.strokeStyle = wgt >= 0 ? pos : neg;
          g.globalAlpha = Math.min(0.85, 0.06 + Math.abs(wgt) * 0.18 * (0.35 + act));
          g.lineWidth = Math.min(2.6, 0.4 + Math.abs(wgt) * 0.5);
          g.beginPath();
          g.moveTo(colX(l - 1), rowY(l - 1, i));
          g.lineTo(colX(l), rowY(l, j));
          g.stroke();
        }
      }
    }
    g.globalAlpha = 1;
    g.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
    g.textBaseline = 'middle';
    for (let l = 0; l < L; l++) {
      for (let i = 0; i < sizes[l]; i++) {
        const a = brain.acts[l][i];
        const x = colX(l), y = rowY(l, i), rad = l === L - 1 ? 6.5 : 5;
        g.fillStyle = panel;
        g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
        g.fillStyle = a >= 0 ? pos : neg;
        g.globalAlpha = Math.min(1, 0.15 + Math.abs(a));
        g.beginPath(); g.arc(x, y, rad - 1.4, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
        if (l === 0 && inputLabels[i]) {
          g.fillStyle = muted;
          g.textAlign = 'right';
          g.fillText(inputLabels[i], x - 9, y);
        }
        if (l === L - 1) {
          g.fillStyle = fg;
          g.textAlign = 'left';
          g.fillText(i === 0 ? 'STEER' : 'GAS', x + 10, y);
        }
      }
    }
  }

  // Learning curve: best and average share of the race distance per generation.
  function drawChart(canvas, history) {
    const { w, h, dpr } = fitCanvas(canvas);
    const g = canvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.scale(dpr, dpr);
    const cw = w / dpr, ch = h / dpr;
    const padL = 34, padR = 10, padT = 10, padB = 20;
    const pw = cw - padL - padR, ph = ch - padT - padB;
    const line = css('--line'), muted = css('--muted'), accent = css('--accent'), fg = css('--fg');
    g.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
    g.textBaseline = 'middle';
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      const y = padT + ph * (1 - v);
      g.strokeStyle = line;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(padL, y); g.lineTo(padL + pw, y); g.stroke();
      g.fillStyle = muted;
      g.textAlign = 'right';
      g.fillText(Math.round(v * 100) + '%', padL - 6, y);
    }
    const n = history.length;
    const g0 = n ? history[0].gen : 1, g1 = n ? Math.max(history[n - 1].gen, g0 + 9) : 10;
    const X = (gen) => padL + (pw * (gen - g0)) / (g1 - g0);
    const Y = (v) => padT + ph * (1 - v);
    g.fillStyle = muted;
    g.textAlign = 'left';
    g.fillText('gen ' + g0, padL, ch - 8);
    g.textAlign = 'right';
    g.fillText('gen ' + g1, padL + pw, ch - 8);
    if (!n) {
      g.textAlign = 'center';
      g.fillText('Learning curve appears after generation 1', padL + pw / 2, padT + ph / 2);
      return;
    }
    const path = (key) => {
      g.beginPath();
      history.forEach((s, i) => (i ? g.lineTo(X(s.gen), Y(s[key])) : g.moveTo(X(s.gen), Y(s[key]))));
    };
    path('bestProg');
    g.lineTo(X(history[n - 1].gen), Y(0));
    g.lineTo(X(g0), Y(0));
    g.closePath();
    const grad = g.createLinearGradient(0, padT, 0, padT + ph);
    grad.addColorStop(0, accent + '55');
    grad.addColorStop(1, accent + '00');
    g.fillStyle = grad;
    g.fill();
    g.lineJoin = 'round';
    path('avgProg');
    g.strokeStyle = muted; g.lineWidth = 1.5; g.stroke();
    path('bestProg');
    g.strokeStyle = accent; g.lineWidth = 2; g.stroke();
    const last = history[n - 1];
    for (const s of history) {
      if (s.cleared) {
        g.strokeStyle = fg;
        g.setLineDash([2, 3]);
        g.beginPath(); g.moveTo(X(s.gen), padT); g.lineTo(X(s.gen), padT + ph); g.stroke();
        g.setLineDash([]);
      }
    }
    g.fillStyle = accent;
    g.beginPath(); g.arc(X(last.gen), Y(last.bestProg), 3.5, 0, Math.PI * 2); g.fill();
  }

  NGP.BIOMES = BIOMES;
  NGP.paintTrack = paintTrack;
  NGP.paintThumb = paintThumb;
  NGP.paintOverlay = paintOverlay;
  NGP.drawCar = drawCar;
  NGP.drawRays = drawRays;
  NGP.drawTrail = drawTrail;
  NGP.drawNetwork = drawNetwork;
  NGP.drawChart = drawChart;
  NGP.fitCanvas = fitCanvas;
})(typeof window !== 'undefined' ? window : globalThis);
