// Genetic algorithm: selection, crossover, mutation, elitism and random immigrants.
(function (root) {
  const NGP = (root.NGP = root.NGP || {});

  function pick(ranked, cfg) {
    const n = ranked.length;
    switch (cfg.selection) {
      case 'roulette': {
        const min = ranked[n - 1].fitness;
        let total = 0;
        for (const r of ranked) total += r.fitness - min + 1e-6;
        let x = Math.random() * total;
        for (const r of ranked) {
          x -= r.fitness - min + 1e-6;
          if (x <= 0) return r;
        }
        return ranked[0];
      }
      case 'rank': {
        let x = Math.random() * ((n * (n + 1)) / 2);
        for (let i = 0; i < n; i++) {
          x -= n - i;
          if (x <= 0) return ranked[i];
        }
        return ranked[0];
      }
      case 'truncation': {
        const top = Math.min(n, Math.max(2, Math.round(n * 0.2)));
        return ranked[(Math.random() * top) | 0];
      }
      default: {
        let best = null;
        for (let k = 0; k < cfg.tournamentK; k++) {
          const c = ranked[(Math.random() * n) | 0];
          if (!best || c.fitness > best.fitness) best = c;
        }
        return best;
      }
    }
  }

  function cross(a, b, mode) {
    const child = a.clone();
    const g = child.genome, gb = b.genome, L = g.length;
    if (mode === 'uniform') {
      for (let i = 0; i < L; i++) if (Math.random() < 0.5) g[i] = gb[i];
    } else if (mode === 'single') {
      const cut = (Math.random() * L) | 0;
      for (let i = cut; i < L; i++) g[i] = gb[i];
    } else if (mode === 'blend') {
      const t = Math.random();
      for (let i = 0; i < L; i++) g[i] = g[i] * t + gb[i] * (1 - t);
    }
    return child;
  }

  const wrapHue = (h) => ((h % 360) + 360) % 360;

  // ranked: [{brain, fitness}] sorted best first.
  function evolve(ranked, cfg, sizes, activation) {
    const n = cfg.population;
    const out = [];
    const elites = Math.min(cfg.elites, ranked.length, n);
    for (let i = 0; i < elites; i++) {
      const b = ranked[i].brain.clone();
      b.elite = true;
      out.push(b);
    }
    const immigrants = Math.round(n * cfg.immigrants);
    while (out.length < n - immigrants) {
      const p1 = pick(ranked, cfg);
      const p2 = pick(ranked, cfg);
      const c = cross(p1.brain, p2.brain, cfg.crossover);
      c.mutate(cfg.mutationRate, cfg.mutationStrength);
      c.hue = wrapHue(p1.brain.hue + NGP.gauss() * 8);
      out.push(c);
    }
    while (out.length < n) out.push(new NGP.Brain(sizes, activation));
    return out;
  }

  NGP.evolve = evolve;
})(typeof window !== 'undefined' ? window : globalThis);
