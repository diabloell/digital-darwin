import { cycle, PLANET_MAX_CAPACITY } from './core/planet.ts';
import { gameWorld } from './core/game.ts';
import type { Game } from './core/game.ts';
import { capture, decode, encode, restore } from './snapshot.ts';
import { PopulationHistory } from './core/history.ts';
import { Engine } from './core/engine.ts';
import { geneBin, geneMeans } from './core/evolution.ts';
import { GENES, phenotype } from './core/genetics.ts';
import type { Command, Event, Frame, Sample } from './protocol.ts';
// Deliberately tiny worker port avoids mixing DOM and WebWorker global libraries.
declare const self: { postMessage(message: Event, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent<Command>) => void) | null };
let engine = new Engine(), running = false, speed = 1, selectedId: number | null = null, epoch = 0;
let credit = 0, last = performance.now(), lastFrame = 0, measured = 0, measuredAt = last, tps = 0, inFlight = false;
let game:Game|null=null;
let genealogy = new PopulationHistory(engine);
function observation(previous?: Sample): Sample {
  const metrics = engine.metrics(), counts = genealogy.counts;
  let energy = 0, generations = 0;
  const variants = new Set<string>();
  for (const agent of engine.organisms) {
    energy += agent.energy;
    generations += agent.generation;
    variants.add(GENES.map(g => agent.genome[g]).join(','));
  }
  return { ...metrics, genes: geneMeans(engine.organisms), variants: variants.size,
    interval: metrics.tick - (previous?.tick ?? metrics.tick),
    intervalBirths: metrics.births - (previous?.births ?? metrics.births),
    intervalDeaths: metrics.deaths - (previous?.deaths ?? metrics.deaths),
    totalEnergy: energy / 1000, meanGeneration: metrics.population ? generations / metrics.population : null,
    livingLines: counts.living, extinctLines: counts.extinct };
}
let history = [observation()];
function advance() {
  if(game) {
    game.step(engine,genealogy);
    if(!game.ready) { running=false; tps=0; sample(); emit(true); }
  } else { engine.step(); genealogy.observe(engine); }
}
function emit(force = false): void {
  if (inFlight && !force) return;
  const positions = new Float32Array(engine.organisms.length * 4), ids = new Uint32Array(engine.organisms.length);
  const traitBins = new Uint8Array(engine.organisms.length * GENES.length);
  const generations = new Uint32Array(engine.organisms.length), founders = new Uint32Array(engine.organisms.length);
  const histograms = GENES.map(() => Array<number>(8).fill(0));
  engine.organisms.forEach((a, i) => {
    ids[i] = a.id;
    generations[i] = a.generation;
    founders[i] = genealogy.founder(a.id);
    positions.set([a.x, a.y, a.energy / 80000, a.genome.speed], i * 4);
    for (const [j, gene] of GENES.entries()) {
      const bin = geneBin(gene, a.genome[gene]);
      traitBins[i * GENES.length + j] = bin;
      histograms[j][bin]++;
    }
  });
  const selected = engine.organisms.find(a => a.id === selectedId) ?? null;
  const foodScale = engine.planet ? PLANET_MAX_CAPACITY / 255 : 28;
  const food = Uint8Array.from(engine.food, f => Math.min(255, Math.floor(f / foodScale)));
  const frame: Frame = { kind: 'frame', recentEvents: genealogy.latestEvents(), ...(engine.planet ? { planet: { ...engine.planet, cycle: cycle(engine.tick) } } : {}), ...(game?{game:game.view(genealogy)}:{}), epoch, seed: engine.config.seed, width: engine.config.width, height: engine.config.height, metrics: engine.metrics(), positions, ids, generations, founders, food, selected, selectedId, running, speed, tps, history, traitBins, histograms, speedHistogram: histograms[0], selectedPhenotype: selected ? phenotype(selected.genome, engine.config.rule) : null };
  self.postMessage(frame, [positions.buffer, ids.buffer, food.buffer, traitBins.buffer, generations.buffer, founders.buffer]); inFlight = true; lastFrame = performance.now();
}
self.onmessage = e => {
  try {
    const c = e.data;
    switch (c.kind) {
      case 'ready': if (c.epoch === undefined || c.epoch === epoch) inFlight = false; break;
      case 'snapshot': case 'restore': void persist(c); break;
      case 'new-game': {
        try {
          const candidate=gameWorld(c.seed,c.habitat,c.planet === true);
          engine=candidate.engine;genealogy=candidate.genealogy;game=candidate.game;
        } catch(error) { self.postMessage({kind:'error',recoverable:true,message:String(error)});break; }
        epoch++;running=false;speed=1;credit=0;selectedId=null;tps=0;measured=0;
        measuredAt=last=performance.now();inFlight=false;history=[observation()];
        emit(true);break;
      }
      case 'game-action':
        if(game&&c.epoch===epoch) { game.command(c.action,engine,genealogy);emit(true); }
        break;
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
        game=null;
        genealogy = new PopulationHistory(engine);
        history = [observation()];
        emit(true);
        break;
      }
      case 'play': if (typeof c.value !== 'boolean') throw Error('Invalid play'); running = c.value && (!game || game.ready); credit = 0; last = performance.now(); if (!running) { sample(); tps = 0; measured = 0; } measuredAt = last; emit(true); break;
      case 'speed': if (![1, 4, 16, 32].includes(c.value)) throw Error('Invalid speed'); speed = c.value; credit = 0; emit(true); break;
      case 'step': if (!running && (!game || game.ready)) { advance(); sample(); emit(true); } break;
      case 'inspect': if (c.id !== null && (!Number.isSafeInteger(c.id) || c.id < 1)) throw Error('Invalid entity ID'); selectedId = c.id; emit(true); break;
      case 'history': {
        const view = genealogy.view(c.entity, c.founder, c.depth);
        self.postMessage({ kind: 'history', request: c.request, epoch, view });
        break;
      }
      default: throw Error('Unknown command');
    }
  } catch (error) { running = false; self.postMessage({ kind: 'error', message: String(error) }); }
};
let restoreRequest = 0;
async function persist(c: Extract<Command, { kind: 'snapshot' | 'restore' }>) {
  try {
    if (c.epoch !== epoch) throw Error('Мир уже изменился');
    if (c.kind === 'snapshot') {
      const samples = history.at(-1)?.tick === engine.tick ? history : [...history, observation(history.at(-1))].slice(-300);
      const state=capture(engine,genealogy,samples);
      if(game) state.game=game.snapshot();
      const file = await encode(state, c.name, c.createdAt);
      self.postMessage({ kind: 'snapshot-ready', request: c.request, epoch: c.epoch, file });
      return;
    }
    const token = c.preview ? undefined : ++restoreRequest;
    const { state, manifest } = await decode(c.text);
    const candidate = restore(state);
    if (c.epoch !== epoch || (token !== undefined && token !== restoreRequest)) throw Error('Мир уже изменился');
    if (!c.preview) {
      engine = candidate.engine; genealogy = candidate.genealogy; game=candidate.game;
      history = candidate.samples.length ? candidate.samples : [observation()];
      sample();
      epoch++;
      running = false; selectedId = null; credit = 0; speed = 1; tps = 0; measured = 0;
      measuredAt = last = performance.now(); inFlight = false;
      emit(true);
    }
    self.postMessage({ kind: 'restore-result', request: c.request, epoch, manifest, preview: c.preview });
  } catch (error) {
    self.postMessage({ kind: 'persistence-error', request: c.request, epoch: c.epoch, message: error instanceof Error ? error.message : String(error) });
  }
}

function sample(): void {
  if (history.at(-1)?.tick !== engine.tick) { history.push(observation(history.at(-1))); if (history.length > 300) history.shift(); }
}
setInterval(() => {
  try {
    const now = performance.now();
    if (running) {
      // Wall-clock chooses how many fixed ticks to execute, never their dt/rules.
      credit += Math.min(now - last, 1000) * (game?5:20) * speed / 1000;
      const until = now + 10;
      while (running && credit >= 1 && performance.now() < until) { advance(); credit--; measured++; }
      credit = Math.min(credit, 20 * speed); // Drop scheduling debt, never simulated ticks.
    }
    last = now;
    if (now - measuredAt >= 1000) { tps = measured * 1000 / (now - measuredAt); measured = 0; measuredAt = now; }
    if (running && now - lastFrame >= 100 && !inFlight) { sample(); emit(); }
  } catch (error) { running = false; self.postMessage({ kind: 'error', message: String(error) }); }
}, 8);
emit();
