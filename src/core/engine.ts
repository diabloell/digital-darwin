import { Rng } from './rng.ts';

export const ENGINE_VERSION = '0.2.0';
export const GENE_BOUNDS = { speed: [0.25, 1.8], sensor: [1, 8], efficiency: [0.65, 1], threshold: [32, 64] } as const;
export type Genome = { speed: number; sensor: number; efficiency: number; threshold: number };
export type Organism = { id: number; parent: number | null; generation: number; x: number; y: number; heading: number; velocity: number; energy: number; age: number; born: number; lastActionTick: number; genome: Genome };
export type Config = { seed: string; width: number; height: number; population: number; mutationRate: number; regrowth: boolean; reproduction?: boolean };
export type Metrics = { tick: number; population: number; food: number; births: number; deaths: number; meanEnergy: number; maxGeneration: number };
export type Audit = { grown: number; consumed: number; assimilated: number; dissipated: number; reproductionCost: number; digestiveLoss: number; transferred: number; actions: number };
export const TICK_PHASES = ['environment', 'observations', 'intents', 'movement', 'competition', 'metabolism', 'death', 'reproduction', 'audit'] as const;
export type TickPhase = typeof TICK_PHASES[number];
type Observation = { agent: Organism; localFood: number; dx: number; dy: number };
type Intent = { agent: Organism; heading: number; speed: number; portion: number };

function newAudit(): Audit {
  return { grown: 0, consumed: 0, assimilated: 0, dissipated: 0, reproductionCost: 0, digestiveLoss: 0, transferred: 0, actions: 0 };
}

const KEYS = Object.keys(GENE_BOUNDS) as (keyof Genome)[];
const DX = [1, 0.7071067811865476, 0, -0.7071067811865476, -1, -0.7071067811865476, 0, 0.7071067811865476];
const DY = [0, 0.7071067811865476, 1, 0.7071067811865476, 0, -0.7071067811865476, -1, -0.7071067811865476];
export function mutate(parent: Genome, rng: Rng, rate: number): Genome {
  const child = { ...parent };
  for (const key of KEYS) {
    const [min, max] = GENE_BOUNDS[key];
    if (rng.next() < rate) child[key] = Math.min(max, Math.max(min, child[key] + (rng.next() * 2 - 1) * (max - min) * 0.08));
  }
  return child;
}
export function validateConfig(c: Config): void {
  if (typeof c.seed !== 'string' || c.seed.length === 0 || c.seed.length > 128) throw Error('Seed: от 1 до 128 символов');
  for (const k of ['width', 'height'] as const) if (!Number.isInteger(c[k]) || c[k] < 8 || c[k] > 512) throw Error('Размер мира: 8..512');
  if (!Number.isInteger(c.population) || c.population < 0 || c.population > 20000) throw Error('Популяция: 0..20000');
  if (!Number.isFinite(c.mutationRate) || c.mutationRate < 0 || c.mutationRate > 1) throw Error('Мутация: 0..1');
  if (c.reproduction !== undefined && typeof c.reproduction !== 'boolean') throw Error('Invalid reproduction flag');
  if (typeof c.regrowth !== 'boolean') throw Error('Некорректный рост ресурсов');
}
export class Engine {
  config: Config;
  rng: Rng;
  food: Int32Array;
  capacity: Int32Array;
  growth: Int32Array;
  organisms: Organism[] = [];
  tick = 0;
  nextId = 1;
  births = 0;
  deaths = 0;
  audit: Audit = newAudit();
  private expectedFood: number | undefined;
  constructor(options: Partial<Config> = {}) {
    this.config = { seed: 'coral-42', width: 256, height: 256, population: 1000, mutationRate: 0.12, regrowth: true, ...options, reproduction: options.reproduction === undefined ? true : options.reproduction };
    validateConfig(this.config);
    this.rng = new Rng(this.config.seed);
    const { width: w, height: h } = this.config;
    this.food = new Int32Array(w * h); this.capacity = new Int32Array(w * h); this.growth = new Int32Array(w * h);
    const patches = Array.from({ length: 18 }, () => ({ x: this.rng.next() * w, y: this.rng.next() * h, r: 10 + this.rng.next() * Math.min(w, h) * 0.18 }));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let fertility = 0.08;
      for (const p of patches) {
        const dx = Math.min(Math.abs(x - p.x), w - Math.abs(x - p.x));
        const dy = Math.min(Math.abs(y - p.y), h - Math.abs(y - p.y));
        fertility += Math.max(0, 1 - (dx * dx + dy * dy) / (p.r * p.r)) * 0.6;
      }
      const i = y * w + x;
      this.capacity[i] = Math.floor(500 + Math.min(1, fertility) * 6500);
      this.food[i] = Math.floor(this.capacity[i] * (0.3 + this.rng.next() * 0.7));
      this.growth[i] = Math.max(2, Math.floor(fertility * 28));
    }
    for (let i = 0; i < this.config.population; i++) this.organisms.push(this.spawn());
  }
  private spawn(): Organism {
    return { id: this.nextId++, parent: null, generation: 0, x: this.rng.next() * this.config.width, y: this.rng.next() * this.config.height, heading: this.rng.next() * Math.PI * 2, velocity: 0, energy: 18000 + Math.floor(this.rng.next() * 10000), age: 0, born: 0, lastActionTick: -1, genome: { speed: 0.5 + this.rng.next() * 0.6, sensor: 2 + this.rng.next() * 3, efficiency: 0.75 + this.rng.next() * 0.2, threshold: 38 + this.rng.next() * 12 } };
  }
  cell(x: number, y: number): number {
    const { width: w, height: h } = this.config;
    return Math.floor(((y % h) + h) % h) * w + Math.floor(((x % w) + w) % w);
  }
  step(count = 1, phaseCompleted?: (phase: TickPhase) => void): void {
    if (!Number.isInteger(count) || count < 1 || count > 100000) throw Error('Tick count: 1..100000');
    for (let t = 0; t < count; t++) this.advance(phaseCompleted);
  }

  private advance(phaseCompleted?: (phase: TickPhase) => void): void {
    this.tick++;
    const audit = newAudit();
    const startingPopulation = this.organisms.length;
    // Canonical order assigns RNG draws and child IDs, never priority for food.
    this.organisms.sort((a, b) => a.id - b.id);
    const startingFood = this.updateEnvironment(audit);
    phaseCompleted?.('environment');

    const observations: Observation[] = [];
    let startingEnergy = 0, previousId = 0;
    for (const agent of this.organisms) {
      if (agent.id <= previousId) throw Error('Duplicate or invalid ID');
      previousId = agent.id;
      if (agent.energy === 0) continue;
      if (!Number.isInteger(agent.energy) || agent.energy < 0 || agent.energy > 80000) throw Error('Invalid starting energy');
      startingEnergy += agent.energy;
      observations.push(this.observe(agent));
    }
    phaseCompleted?.('observations');

    const intents = observations.map(observation => this.decide(observation));
    phaseCompleted?.('intents');
    const claims = this.move(intents);
    phaseCompleted?.('movement');
    this.resolveClaims(claims, audit);
    phaseCompleted?.('competition');
    this.feedAndMetabolize(intents, audit);
    phaseCompleted?.('metabolism');

    const survivors = this.organisms.filter(agent => agent.energy > 0);
    const dead = startingPopulation - survivors.length;
    phaseCompleted?.('death');

    const newborns = this.reproduce(survivors, audit);
    phaseCompleted?.('reproduction');

    this.organisms = survivors.concat(newborns);
    this.births += newborns.length;
    this.deaths += dead;
    const endingEnergy = this.organisms.reduce((sum, agent) => sum + agent.energy, 0);
    if (audit.actions !== observations.length || audit.assimilated + audit.digestiveLoss !== audit.consumed
      || endingEnergy !== startingEnergy + audit.assimilated - audit.dissipated - audit.reproductionCost) {
      throw Error('Tick energy or action ledger mismatch');
    }
    this.expectedFood = startingFood + audit.grown - audit.consumed;
    this.audit = audit;
    phaseCompleted?.('audit');
  }

  private updateEnvironment(audit: Audit): number {
    let startingFood = 0;
    for (let i = 0; i < this.food.length; i++) {
      const before = this.food[i];
      const capacity = this.capacity[i];
      const growth = this.growth[i];
      if (before < 0 || before > capacity || growth < 0) throw Error(`Invalid resource cell ${i}`);
      startingFood += before;
      if (this.config.regrowth) {
        const added = Math.min(growth, capacity - before);
        this.food[i] = before + added;
        audit.grown += added;
      }
    }
    return startingFood;
  }

  private observe(agent: Organism): Observation {
    const localFood = this.food[this.cell(agent.x, agent.y)];
    let best = localFood, dx = 0, dy = 0;
    for (let d = 0; d < DX.length; d++) {
      const probeX = DX[d] * agent.genome.sensor, probeY = DY[d] * agent.genome.sensor;
      const food = this.food[this.cell(agent.x + probeX, agent.y + probeY)];
      if (food > best) {
        best = food;
        dx = probeX;
        dy = probeY;
      }
    }
    return { agent, localFood, dx, dy };
  }

  private decide({ agent, localFood, dx, dy }: Observation): Intent {
    const heading = dx || dy ? Math.atan2(dy, dx) : agent.heading + (this.rng.next() - 0.5) * 1.2;
    return { agent, heading, speed: localFood >= 650 ? 0 : agent.genome.speed, portion: 0 };
  }

  private move(intents: Intent[]): Map<number, Intent[]> {
    const claims = new Map<number, Intent[]>();
    const { width, height } = this.config;
    for (const intent of intents) {
      const { agent, heading, speed } = intent;
      if (agent.born >= this.tick || agent.lastActionTick >= this.tick) throw Error('Ineligible or duplicate action');
      agent.lastActionTick = this.tick;
      agent.age++;
      agent.heading = heading;
      agent.velocity = speed;
      agent.x = (agent.x + Math.cos(heading) * speed + width) % width;
      agent.y = (agent.y + Math.sin(heading) * speed + height) % height;
      const cell = this.cell(agent.x, agent.y);
      const group = claims.get(cell);
      if (group) group.push(intent);
      else claims.set(cell, [intent]);
    }
    return claims;
  }

  private resolveClaims(claims: Map<number, Intent[]>, audit: Audit): void {
    for (const [cell, group] of claims) {
      const available = this.food[cell];
      const portion = Math.min(650, Math.floor(available / group.length));
      const consumed = portion * group.length;
      this.food[cell] = available - consumed;
      audit.consumed += consumed;
      for (const intent of group) intent.portion = portion;
    }
  }

  private feedAndMetabolize(intents: Intent[], audit: Audit): void {
    for (const { agent, portion } of intents) {
      const gain = Math.min(80000 - agent.energy, Math.floor(portion * agent.genome.efficiency));
      agent.energy += gain;
      audit.assimilated += gain;
      audit.digestiveLoss += portion - gain;
      const cost = Math.min(agent.energy, Math.ceil(70 + 35 * agent.velocity ** 2 + 4 * agent.genome.sensor + 16 * agent.genome.efficiency ** 2));
      agent.energy -= cost;
      audit.dissipated += cost;
      audit.actions++;
    }
  }

  private reproduce(survivors: Organism[], audit: Audit): Organism[] {
    const newborns: Organism[] = [];
    if (this.config.reproduction === false) return newborns;
    for (const agent of survivors) {
      if (agent.age < 45 || agent.energy < agent.genome.threshold * 1000) continue;
      const investment = Math.floor(agent.energy * 0.45);
      agent.energy -= investment + 1200;
      audit.reproductionCost += 1200;
      audit.transferred += investment;
      newborns.push({
        id: this.nextId++, parent: agent.id, generation: agent.generation + 1,
        x: agent.x, y: agent.y, heading: this.rng.next() * Math.PI * 2,
        velocity: 0, energy: investment, age: 0, born: this.tick, lastActionTick: -1,
        genome: mutate(agent.genome, this.rng, this.config.mutationRate)
      });
    }
    return newborns;
  }
  metrics(): Metrics {
    let food = 0, energy = 0, gen = 0;
    for (const f of this.food) food += f;
    for (const a of this.organisms) { energy += a.energy; gen = Math.max(gen, a.generation); }
    return { tick: this.tick, population: this.organisms.length, food: food / 1000, births: this.births, deaths: this.deaths, meanEnergy: energy / Math.max(1, this.organisms.length) / 1000, maxGeneration: gen };
  }
  assertValid(): void {
    const cells = this.config.width * this.config.height;
    if (this.food.length !== cells || this.capacity.length !== cells || this.growth.length !== cells) throw Error('Invalid grid size');
    let totalFood = 0;
    for (let i = 0; i < cells; i++) {
      if (this.food[i] < 0 || this.food[i] > this.capacity[i] || this.growth[i] < 0) throw Error(`Invalid resource cell ${i}`);
      totalFood += this.food[i];
    }
    if (this.expectedFood !== undefined && this.expectedFood !== totalFood) throw Error('Tick food ledger mismatch');
    if (!Number.isSafeInteger(this.tick) || this.tick < 0 || !Number.isSafeInteger(this.nextId)
      || this.nextId !== this.config.population + this.births + 1
      || this.organisms.length !== this.config.population + this.births - this.deaths) throw Error('Population ledger mismatch');

    const ids = new Set<number>();
    for (const a of this.organisms) {
      if (!Number.isSafeInteger(a.id) || a.id < 1 || a.id >= this.nextId || ids.has(a.id)) throw Error('Duplicate or invalid ID');
      ids.add(a.id);
      if (!Number.isFinite(a.heading) || !(a.x >= 0 && a.x < this.config.width) || !(a.y >= 0 && a.y < this.config.height)
        || !(a.velocity >= 0 && a.velocity <= a.genome.speed) || !Number.isInteger(a.energy) || a.energy <= 0 || a.energy > 80000) {
        throw Error('Invalid organism state');
      }
      if (!Number.isSafeInteger(a.born) || a.born < 0 || a.born > this.tick || a.age !== this.tick - a.born
        || a.lastActionTick !== (a.age === 0 ? -1 : this.tick)
        || (a.born === 0
          ? a.generation !== 0 || a.parent !== null || a.id > this.config.population
          : !Number.isSafeInteger(a.generation) || a.generation < 1
            || a.parent === null || !Number.isSafeInteger(a.parent) || a.parent < 1 || a.parent >= a.id)) {
        throw Error('Invalid lifecycle state');
      }
      for (const key of KEYS) {
        const [min, max] = GENE_BOUNDS[key];
        if (!(a.genome[key] >= min && a.genome[key] <= max)) throw Error('Invalid genome');
      }
    }
  }
  // Canonical state includes hidden future-affecting fields, not just visible metrics.
  canonical(): string {
    return JSON.stringify({ version: ENGINE_VERSION, config: this.config, rng: this.rng.state, tick: this.tick, nextId: this.nextId, births: this.births, deaths: this.deaths, capacity: Array.from(this.capacity), growth: Array.from(this.growth), food: Array.from(this.food), organisms: [...this.organisms].sort((a, b) => a.id - b.id) });
  }
}
