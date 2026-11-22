import { Rng } from './rng.ts';
import { EVOLUTION_VERSION, GENOME_VERSION, GENES, GENE_BOUNDS, mutate, phenotype } from './genetics.ts';
import type { Genome, Phenotype, Rule } from './genetics.ts';
export { GENE_BOUNDS, mutate } from './genetics.ts';
export type { Genome } from './genetics.ts';

export const ENGINE_VERSION = '0.3.0';
export type Organism = { id: number; parent: number | null; generation: number; x: number; y: number; heading: number; velocity: number; energy: number; age: number; born: number; lastActionTick: number; genome: Genome };
export type Config = { seed: string; width: number; height: number; population: number; mutationRate: number; regrowth: boolean; reproduction?: boolean; rule?: Rule; resourceScale?: number; mutationStrength?: number };
export type Metrics = { tick: number; population: number; food: number; births: number; deaths: number; meanEnergy: number; maxGeneration: number };
export type Audit = { grown: number; consumed: number; assimilated: number; dissipated: number; reproductionCost: number; digestiveLoss: number; transferred: number; actions: number };
export const TICK_PHASES = ['environment', 'observations', 'intents', 'movement', 'competition', 'metabolism', 'death', 'reproduction', 'audit'] as const;
export type TickPhase = typeof TICK_PHASES[number];
export type EngineSnapshot = {
  config: Engine['config']; tick: number; nextId: number; births: number; deaths: number;
  rng: number[]; food: number[]; capacity: number[]; growth: number[]; organisms: Organism[];
  audit: Audit; expectedFood: number | null; lastBirths: Birth[]; lastDeaths: Organism[];
};
export type NewbornHook = (parent: Readonly<Organism>, child: Organism) => void;
export type Birth = { parent: Genome; child: Organism };
type Observation = { agent: Organism; traits: Phenotype; localFood: number; dx: number; dy: number };
type Intent = { agent: Organism; traits: Phenotype; heading: number; speed: number; portion: number };

function newAudit(): Audit {
  return { grown: 0, consumed: 0, assimilated: 0, dissipated: 0, reproductionCost: 0, digestiveLoss: 0, transferred: 0, actions: 0 };
}

const DX = [1, 0.7071067811865476, 0, -0.7071067811865476, -1, -0.7071067811865476, 0, 0.7071067811865476];
const DY = [0, 0.7071067811865476, 1, 0.7071067811865476, 0, -0.7071067811865476, -1, -0.7071067811865476];
export function validateConfig(c: Config): void {
  if (typeof c.seed !== 'string' || c.seed.length === 0 || c.seed.length > 128) throw Error('Seed: от 1 до 128 символов');
  for (const k of ['width', 'height'] as const) if (!Number.isInteger(c[k]) || c[k] < 8 || c[k] > 512) throw Error('Размер мира: 8..512');
  if (!Number.isInteger(c.population) || c.population < 0 || c.population > 20000) throw Error('Популяция: 0..20000');
  if (!Number.isFinite(c.mutationRate) || c.mutationRate < 0 || c.mutationRate > 1) throw Error('Мутация: 0..1');
  if (c.reproduction !== undefined && typeof c.reproduction !== 'boolean') throw Error('Invalid reproduction flag');
  if (c.rule !== undefined && !['dd01', 'selection', 'neutral'].includes(c.rule)) throw Error('Invalid evolution rule');
  for (const value of [c.mutationStrength, c.resourceScale]) {
    if (value !== undefined && !(Number.isFinite(value) && value >= 0 && value <= 1)) throw Error('Evolution scale: 0..1');
  }
  if (typeof c.regrowth !== 'boolean') throw Error('Некорректный рост ресурсов');
}
export class Engine {
  config: Config & Required<Pick<Config, 'rule' | 'resourceScale' | 'mutationStrength'>>;
  lastBirths: Birth[] = [];
  lastDeaths: Organism[] = [];
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
  private stepping = false;
  constructor(options: Partial<Config> = {}, snapshot?: EngineSnapshot) {
    if (snapshot) {
      this.config = { ...snapshot.config };
      this.rng = new Rng(this.config.seed, snapshot.rng);
      this.food = Int32Array.from(snapshot.food);
      this.capacity = Int32Array.from(snapshot.capacity);
      this.growth = Int32Array.from(snapshot.growth);
      this.tick = snapshot.tick;
      this.nextId = snapshot.nextId;
      this.births = snapshot.births;
      this.deaths = snapshot.deaths;
      this.audit = { ...snapshot.audit };
      this.expectedFood = snapshot.expectedFood ?? undefined;
      this.organisms = structuredClone(snapshot.organisms);
      this.lastBirths = structuredClone(snapshot.lastBirths);
      this.lastDeaths = structuredClone(snapshot.lastDeaths);
      this.assertValid();
      return;
    }
    this.config = { seed: 'coral-42', width: 256, height: 256, population: 1000, mutationRate: 0.12, regrowth: true, ...options, rule: options.rule === undefined ? 'selection' : options.rule, resourceScale: options.resourceScale === undefined ? 1 : options.resourceScale, mutationStrength: options.mutationStrength === undefined ? .08 : options.mutationStrength, reproduction: options.reproduction === undefined ? true : options.reproduction };
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
      this.food[i] = Math.floor(this.capacity[i] * (0.3 + this.rng.next() * 0.7) * this.config.resourceScale);
      this.growth[i] = Math.floor(Math.max(2, Math.floor(fertility * 28)) * this.config.resourceScale);
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
  step(count = 1, phaseCompleted?: (phase: TickPhase) => void, newborn?: NewbornHook): void {
    if (!Number.isInteger(count) || count < 1 || count > 100000) throw Error('Tick count: 1..100000');
    if (this.stepping) throw Error('Nested Engine step');
    this.stepping = true;
    try { for (let t = 0; t < count; t++) this.advance(phaseCompleted, newborn); }
    finally { this.stepping = false; }
  }

  private advance(phaseCompleted?: (phase: TickPhase) => void, newborn?: NewbornHook): void {
    this.tick++;
    const audit = newAudit();
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

    const survivors: Organism[] = [];
    this.lastDeaths = [];
    for (const agent of this.organisms) {
      if (agent.energy > 0) survivors.push(agent);
      else this.lastDeaths.push(agent);
    }
    const dead = this.lastDeaths.length;
    phaseCompleted?.('death');

    this.lastBirths = [];
    const newborns = this.reproduce(survivors, audit, newborn);
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
    const traits = phenotype(agent.genome, this.config.rule);
    const localFood = this.food[this.cell(agent.x, agent.y)];
    let best = localFood, dx = 0, dy = 0;
    for (let d = 0; d < DX.length; d++) {
      const probeX = DX[d] * traits.radius, probeY = DY[d] * traits.radius;
      const food = this.food[this.cell(agent.x + probeX, agent.y + probeY)];
      if (food > best) {
        best = food;
        dx = probeX;
        dy = probeY;
      }
    }
    return { agent, traits, localFood, dx, dy };
  }

  private decide({ agent, traits, localFood, dx, dy }: Observation): Intent {
    const heading = dx || dy ? Math.atan2(dy, dx) : agent.heading + (this.rng.next() - 0.5) * 1.2;
    return { agent, traits, heading, speed: localFood >= 650 ? 0 : traits.speed, portion: 0 };
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
    for (const { agent, traits, portion } of intents) {
      const gain = Math.min(80000 - agent.energy, Math.floor(portion * traits.assimilation));
      agent.energy += gain;
      audit.assimilated += gain;
      audit.digestiveLoss += portion - gain;
      // Preserve the precise DD-01 operation order in its compatibility mode.
      const base = 70 + 35 * agent.velocity ** 2;
      const demand = this.config.rule === 'dd01'
        ? base + 4 * agent.genome.sensor + 16 * agent.genome.efficiency ** 2
        : base + traits.maintenance;
      const cost = Math.min(agent.energy, Math.ceil(demand));
      agent.energy -= cost;
      audit.dissipated += cost;
      audit.actions++;
    }
  }

  private reproduce(survivors: Organism[], audit: Audit, newborn?: NewbornHook): Organism[] {
    const newborns: Organism[] = [];
    if (this.config.reproduction === false) return newborns;
    for (const agent of survivors) {
      if (agent.age < 45 || agent.energy < phenotype(agent.genome, this.config.rule).birthReserve) continue;
      const investment = Math.floor(agent.energy * 0.45);
      agent.energy -= investment + 1200;
      audit.reproductionCost += 1200;
      audit.transferred += investment;
      const child: Organism = {
        id: this.nextId++, parent: agent.id, generation: agent.generation + 1,
        x: agent.x, y: agent.y, heading: this.rng.next() * Math.PI * 2,
        velocity: 0, energy: investment, age: 0, born: this.tick, lastActionTick: -1,
        genome: mutate(agent.genome, this.rng, this.config.mutationRate, this.config.mutationStrength)
      };
      newborn?.(agent, child);
      newborns.push(child);
      this.lastBirths.push({ parent: agent.genome, child });
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
        || !(a.velocity >= 0 && a.velocity <= phenotype(a.genome, this.config.rule).speed) || !Number.isInteger(a.energy) || a.energy <= 0 || a.energy > 80000) {
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
      for (const key of GENES) {
        const [min, max] = GENE_BOUNDS[key];
        if (!(a.genome[key] >= min && a.genome[key] <= max)) throw Error('Invalid genome');
      }
    }
  }
  snapshot(): EngineSnapshot {
    if (this.stepping) throw Error('Snapshot requires a completed tick');
    return {
      config: { ...this.config }, tick: this.tick, nextId: this.nextId, births: this.births, deaths: this.deaths,
      rng: [...this.rng.state], food: Array.from(this.food), capacity: Array.from(this.capacity), growth: Array.from(this.growth),
      organisms: structuredClone(this.organisms), audit: { ...this.audit }, expectedFood: this.expectedFood ?? null,
      lastBirths: structuredClone(this.lastBirths), lastDeaths: structuredClone(this.lastDeaths)
    };
  }
  // Canonical state includes hidden future-affecting fields, not just visible metrics.
  canonical(): string {
    return JSON.stringify({ version: ENGINE_VERSION, genomeVersion: GENOME_VERSION, evolutionVersion: EVOLUTION_VERSION, config: this.config, rng: this.rng.state, tick: this.tick, nextId: this.nextId, births: this.births, deaths: this.deaths, capacity: Array.from(this.capacity), growth: Array.from(this.growth), food: Array.from(this.food), organisms: [...this.organisms].sort((a, b) => a.id - b.id) });
  }
}
