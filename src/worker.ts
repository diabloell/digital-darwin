import { Engine } from './core/engine.ts';
import { geneBin, geneMeans } from './core/evolution.ts';
import { GENES, phenotype } from './core/genetics.ts';
import type { Command, Frame } from './protocol.ts';
// Deliberately tiny worker port avoids mixing DOM and WebWorker global libraries.
declare const self: { postMessage(message: unknown, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent<Command>) => void) | null };
let engine = new Engine(), running = false, speed = 1, selectedId: number | null = null, epoch = 0;
let credit = 0, last = performance.now(), lastFrame = 0, measured = 0, measuredAt = last, tps = 0, inFlight = false;
const observation = () => ({
  ...engine.metrics(),
  genes: geneMeans(engine.organisms),
  variants: new Set(engine.organisms.map(({ genome }) => GENES.map(g => genome[g]).join(','))).size
});
let history = [observation()];
function emit(force = false): void {
  if (inFlight && !force) return;
  const positions = new Float32Array(engine.organisms.length * 4), ids = new Uint32Array(engine.organisms.length);
  const traitBins = new Uint8Array(engine.organisms.length * GENES.length);
  const generations = new Uint32Array(engine.organisms.length);
  const histograms = GENES.map(() => Array<number>(8).fill(0));
  engine.organisms.forEach((a, i) => {
    ids[i] = a.id;
    generations[i] = a.generation;
    positions.set([a.x, a.y, a.energy / 80000, a.genome.speed], i * 4);
    for (const [j, gene] of GENES.entries()) {
      const bin = geneBin(gene, a.genome[gene]);
      traitBins[i * GENES.length + j] = bin;
      histograms[j][bin]++;
    }
  });
  const selected = engine.organisms.find(a => a.id === selectedId) ?? null;
  const food = Uint8Array.from(engine.food, f => Math.min(255, Math.floor(f / 28)));
  const frame: Frame = { kind: 'frame', epoch, seed: engine.config.seed, width: engine.config.width, height: engine.config.height, metrics: engine.metrics(), positions, ids, generations, food, selected, selectedId, running, speed, tps, history, traitBins, histograms, speedHistogram: histograms[0], selectedPhenotype: selected ? phenotype(selected.genome, engine.config.rule) : null };
  self.postMessage(frame, [positions.buffer, ids.buffer, food.buffer, traitBins.buffer, generations.buffer]); inFlight = true; lastFrame = performance.now();
}
self.onmessage = e => {
  try {
    const c = e.data;
    switch (c.kind) {
      case 'ready': inFlight = false; break;
      case 'create': {
        const settings = c.settings;
        try {
          engine = new Engine(settings ? {
            seed: c.seed, width: settings.width, height: settings.height, population: settings.population,
            mutationRate: settings.mutationRate, mutationStrength: settings.mutationStrength,
            regrowth: settings.regrowth, rule: settings.rule
          } : { seed: c.seed });
        } catch (error) {
          self.postMessage({ kind: 'error', recoverable: true, message: String(error) });
          break;
        }
        epoch++;
        running = false; credit = 0; selectedId = null; measured = 0; tps = 0; measuredAt = performance.now();
        history = [observation()];
        emit(true);
        break;
      }
      case 'play': if (typeof c.value !== 'boolean') throw Error('Invalid play'); running = c.value; credit = 0; last = performance.now(); if (!running) { sample(); tps = 0; measured = 0; } measuredAt = last; emit(true); break;
      case 'speed': if (![1, 4, 16, 32].includes(c.value)) throw Error('Invalid speed'); speed = c.value; credit = 0; emit(true); break;
      case 'step': if (!running) { engine.step(); sample(); emit(true); } break;
      case 'inspect': if (c.id !== null && (!Number.isSafeInteger(c.id) || c.id < 1)) throw Error('Invalid entity ID'); selectedId = c.id; emit(true); break;
      default: throw Error('Unknown command');
    }
  } catch (error) { running = false; self.postMessage({ kind: 'error', message: String(error) }); }
};
function sample(): void {
  if (history.at(-1)?.tick !== engine.tick) { history.push(observation()); if (history.length > 300) history.shift(); }
}
setInterval(() => {
  try {
    const now = performance.now();
    if (running) {
      // Wall-clock chooses how many fixed ticks to execute, never their dt/rules.
      credit += Math.min(now - last, 1000) * 20 * speed / 1000;
      const until = now + 10;
      while (credit >= 1 && performance.now() < until) { engine.step(); credit--; measured++;  }
      credit = Math.min(credit, 20 * speed); // Drop scheduling debt, never simulated ticks.
    }
    last = now;
    if (now - measuredAt >= 1000) { tps = measured * 1000 / (now - measuredAt); measured = 0; measuredAt = now; }
    if (running && now - lastFrame >= 100 && !inFlight) { sample(); emit(); }
  } catch (error) { running = false; self.postMessage({ kind: 'error', message: String(error) }); }
}, 8);
emit();
