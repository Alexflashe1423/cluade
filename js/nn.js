// Feed-forward neural network whose weights live in one flat genome,
// so the genetic algorithm can mutate and cross it over directly.
(function (root) {
  const NGP = (root.NGP = root.NGP || {});

  const ACTIVATIONS = {
    tanh: Math.tanh,
    relu: (x) => (x > 0 ? x : 0),
    leaky: (x) => (x > 0 ? x : 0.1 * x),
    sigmoid: (x) => 1 / (1 + Math.exp(-x)),
  };

  function gauss() {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function genomeSize(sizes) {
    let n = 0;
    for (let i = 1; i < sizes.length; i++) n += sizes[i - 1] * sizes[i] + sizes[i];
    return n;
  }

  class Brain {
    constructor(sizes, activation = 'tanh', genome = null) {
      this.sizes = sizes.slice();
      this.activation = activation;
      const n = genomeSize(sizes);
      if (genome) {
        this.genome = Float32Array.from(genome);
      } else {
        this.genome = new Float32Array(n);
        for (let i = 0; i < n; i++) this.genome[i] = Math.random() * 2 - 1;
      }
      this.acts = sizes.map((s) => new Float32Array(s));
      this.hue = Math.random() * 360;
      this.meta = null;
    }

    // Weight layout: for each neuron j of layer l, nIn weights followed by one bias.
    forward(input) {
      const g = this.genome, s = this.sizes;
      const f = ACTIVATIONS[this.activation] || Math.tanh;
      const a0 = this.acts[0];
      for (let i = 0; i < s[0]; i++) a0[i] = input[i];
      let p = 0;
      for (let l = 1; l < s.length; l++) {
        const prev = this.acts[l - 1], out = this.acts[l], nIn = s[l - 1];
        const last = l === s.length - 1;
        for (let j = 0; j < s[l]; j++) {
          let sum = 0;
          for (let i = 0; i < nIn; i++) sum += prev[i] * g[p++];
          sum += g[p++];
          out[j] = last ? Math.tanh(sum) : f(sum);
        }
      }
      return this.acts[s.length - 1];
    }

    weight(l, i, j) {
      let p = 0;
      for (let k = 1; k < l; k++) p += this.sizes[k - 1] * this.sizes[k] + this.sizes[k];
      return this.genome[p + j * (this.sizes[l - 1] + 1) + i];
    }

    mutate(rate, strength) {
      const g = this.genome;
      for (let i = 0; i < g.length; i++) {
        if (Math.random() < rate) {
          g[i] += gauss() * strength;
          if (g[i] > 6) g[i] = 6; else if (g[i] < -6) g[i] = -6;
        }
      }
    }

    clone() {
      const b = new Brain(this.sizes, this.activation, this.genome);
      b.hue = this.hue;
      b.meta = this.meta;
      return b;
    }

    toJSON() {
      return {
        sizes: this.sizes,
        activation: this.activation,
        meta: this.meta,
        genome: Array.from(this.genome, (v) => Math.round(v * 1e4) / 1e4),
      };
    }

    static fromJSON(o) {
      if (!o || !Array.isArray(o.sizes) || !o.genome) throw new Error('Not a brain file');
      if (o.genome.length !== genomeSize(o.sizes)) throw new Error('Genome length does not match layer sizes');
      const b = new Brain(o.sizes, o.activation || 'tanh', o.genome);
      b.meta = o.meta || null;
      return b;
    }
  }

  NGP.Brain = Brain;
  NGP.gauss = gauss;
  NGP.ACTIVATIONS = Object.keys(ACTIVATIONS);
})(typeof window !== 'undefined' ? window : globalThis);
