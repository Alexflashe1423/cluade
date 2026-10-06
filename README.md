# Neuro Grand Prix

A 2D racing game where neural-network drivers learn to lap a circuit through
neuroevolution (a genetic algorithm). Open `index.html` in a browser. There is
no build step and nothing to install.

## How it works

Each car has a small feed-forward neural network. Its inputs are distance
sensors (rays cast from the nose) plus its current speed; its two outputs are
steering and throttle/brake. A generation of cars drives at once. When they
have all crashed, stalled, finished or run out of time, each car gets a fitness
score (distance covered, boosted by speed, minus a crash penalty). The best
brains are bred into the next generation with selection, crossover and
mutation.

## What you can do

- **Train AI**: watch the population learn live, with a timing tower, a
  learning curve and a diagram of the leading car's brain firing in real time.
  Run at 1× to 25× speed or Max.
- **Race the AI**: drive yourself (arrow keys or WASD, touch buttons on phones)
  against the best brain trained on that circuit.
- **Leaderboard**: best race times per circuit for AI runs and human drivers,
  with gold, silver and bronze targets. Saved in the browser.

### Eight circuits

| Round | Circuit | Challenge |
| --- | --- | --- |
| 1 | Oakridge Oval | Wide and forgiving |
| 2 | Kessel Bends | Flowing esses |
| 3 | Mirage Canyon | Hairpins and a zig-zag, lower grip |
| 4 | Neon Docklands | Square street corners, obstacles |
| 5 | Glacier Ring | Ice (32% grip) and tyre stacks |
| 6 | Caldera Loop | Narrow, technical, obstacles |
| 7 | ??? | A mystery circuit. Its name, layout and medal times stay hidden until someone finishes it |
| 8 | Whispering Pines | A long forest serpentine with a hidden shortcut |

A circuit unlocks once any car (AI or you) finishes the previous one.

**The mystery circuit** is one long lap on a map 1.5× bigger than the others.
It mixes surfaces: boost pads, sheet ice, a sand trap, a figure-8 crossover, a
narrow section inside a fog bank that cuts sensor range to 35%, and a tyre
slalom. Turn on *Follow leader* to watch up close.

**Whispering Pines** hides a dirt path under the trees that skips about 40% of
the lap. Nothing tells the AI it exists, so it only finds it by accident. The
stats panel reports the generation it was first used and how many cars use it.
In testing, populations found it somewhere between generations 28 and 66, but
didn't always keep using it. The gold medal time is only reachable through the
woods.

### Surfaces

| Surface | Effect |
| --- | --- |
| Ice | Very little grip, weak acceleration |
| Sand | Speed capped at 50%, heavy drag |
| Boost | Faster acceleration, speed cap raised to 145% |
| Fog | Sensor rays reach only 35% as far |
| Dirt | Slightly slower, less grip |

Turn on **Surface sensor** (Sensors settings) to feed the network the grip of
the ground under it, then compare how quickly it learns the mystery circuit
with and without it.

### Settings to experiment with

- **Neural network**: hidden layer sizes, activation function (tanh, ReLU,
  Leaky ReLU, sigmoid), whether speed is an input.
- **Sensors**: ray count, field of view, ray length, optional surface sensor.
- **Evolution**: population size, parent selection (tournament, roulette, rank,
  truncation), tournament size, crossover (uniform, single point, blend, none),
  mutation rate and strength, elites, random immigrants.
- **Fitness**: speed reward, crash penalty.
- **Car physics**: top speed, acceleration, steering rate, tyre grip.
- **Session**: generation time limit, stall timeout, and transfer learning
  (keep the population when switching circuits).

Presets (Balanced, Fast learner, Big brain, Tiny brain, Chaos) give quick
starting points. You can copy the champion brain as JSON and load it back later
to seed a new population.

## Keyboard

`Space` pause · `N` next generation · `R` reset · `F` follow leader ·
`V` cycle sensor rays · `1`–`6` speed. In a race: arrows or WASD.

## Code layout

- `js/nn.js`: neural network with a flat genome
- `js/evolution.js`: selection, crossover, mutation, elitism
- `js/tracks.js`: circuit definitions and track geometry
- `js/sim.js`: car physics, sensors, training loop, human race
- `js/render.js`: track art, cars, network diagram, learning curve
- `js/app.js`: UI, game loop, leaderboard and storage

`nn.js`, `evolution.js`, `tracks.js` and `sim.js` have no DOM dependencies, so
the training can also run headless in Node.
