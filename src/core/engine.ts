import { Rng } from './rng.ts';

export const ENGINE_VERSION = '0.1.0';
export const GENE_BOUNDS = { speed: [0.25, 1.8], sensor: [1, 8], efficiency: [0.65, 1], threshold: [32, 64] } as const;
export type Genome = { speed: number; sensor: number; efficiency: number; threshold: number };
export type Organism = { id: number; parent: number | null; generation: number; x: number; y: number; heading: number; velocity: number; energy: number; age: number; born: number; lastActionTick: number; genome: Genome };
export type Config = { seed: string; width: number; height: number; population: number; mutationRate: number; regrowth: boolean };
export type Metrics = { tick: number; population: number; food: number; births: number; deaths: number; meanEnergy: number; maxGeneration: number };
export type Audit = { grown: number; consumed: number; assimilated: number; dissipated: number; reproductionCost: number; actions: number };
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
  audit: Audit = { grown: 0, consumed: 0, assimilated: 0, dissipated: 0, reproductionCost: 0, actions: 0 };
  constructor(options: Partial<Config> = {}) {
    this.config = { seed: 'coral-42', width: 256, height: 256, population: 1000, mutationRate: 0.12, regrowth: true, ...options };
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
  step(count = 1): void {
    if (!Number.isInteger(count) || count < 1 || count > 100000) throw Error('Tick count: 1..100000');
    for (let t = 0; t < count; t++) this.advance();
  }
  private advance(): void {
    this.tick++;
    // Normalize storage order before assigning RNG draws and newborn IDs.
    this.organisms.sort((a, b) => a.id - b.id);
    const audit: Audit = { grown: 0, consumed: 0, assimilated: 0, dissipated: 0, reproductionCost: 0, actions: 0 };
    if (this.config.regrowth) for (let i = 0; i < this.food.length; i++) {
      const n = Math.min(this.growth[i], this.capacity[i] - this.food[i]); this.food[i] += n; audit.grown += n;
    }
    // All decisions use the same food field. Claims are resolved after movement.
    const claims = new Map<number, Organism[]>();
    for (const a of this.organisms) {
      if (a.energy <= 0) continue;
      if (a.lastActionTick === this.tick) throw Error('Duplicate action');
      a.lastActionTick = this.tick; a.age++; audit.actions++;
      const localFood = this.food[this.cell(a.x, a.y)];
      let best = localFood, bx = 0, by = 0;
      for (let d = 0; d < 8; d++) {
        const dx = DX[d] * a.genome.sensor, dy = DY[d] * a.genome.sensor;
        const f = this.food[this.cell(a.x + dx, a.y + dy)];
        if (f > best) { best = f; bx = dx; by = dy; }
      }
      a.heading = bx || by ? Math.atan2(by, bx) : a.heading + (this.rng.next() - 0.5) * 1.2;
      // Rest and feed on a rich cell; otherwise forage toward sensed resources.
      const speed = localFood >= 650 ? 0 : a.genome.speed;
      a.velocity = speed;
      a.x = (a.x + Math.cos(a.heading) * speed + this.config.width) % this.config.width;
      a.y = (a.y + Math.sin(a.heading) * speed + this.config.height) % this.config.height;
      const cell = this.cell(a.x, a.y);
      const group = claims.get(cell); if (group) group.push(a); else claims.set(cell, [a]);
    }
    for (const [cell, agents] of claims) {
      // Equal demand, proportional integer allocation; remainder stays as food.
      const portion = Math.min(650, Math.floor(this.food[cell] / agents.length));
      this.food[cell] -= portion * agents.length; audit.consumed += portion * agents.length;
      for (const a of agents) {
        const gain = Math.min(80000 - a.energy, Math.floor(portion * a.genome.efficiency));
        a.energy += gain; audit.assimilated += gain;
      }
    }
    const survivors: Organism[] = [], newborns: Organism[] = [];
    for (const a of this.organisms) {
      if (a.energy <= 0) { this.deaths++; continue; }
      const cost = Math.ceil(70 + 35 * a.velocity ** 2 + 4 * a.genome.sensor + 16 * a.genome.efficiency ** 2);
      audit.dissipated += Math.min(cost, a.energy); a.energy -= cost;
      if (a.energy <= 0) { a.energy = 0; this.deaths++; continue; }
      if (a.age >= 45 && a.energy >= a.genome.threshold * 1000) {
        const investment = Math.floor(a.energy * 0.45);
        a.energy -= investment + 1200; audit.reproductionCost += 1200;
        newborns.push({ id: this.nextId++, parent: a.id, generation: a.generation + 1, x: a.x, y: a.y, heading: this.rng.next() * Math.PI * 2, velocity: 0, energy: investment, age: 0, born: this.tick, lastActionTick: -1, genome: mutate(a.genome, this.rng, this.config.mutationRate) });
        this.births++;
      }
      survivors.push(a);
    }
    this.organisms = survivors.concat(newborns); this.audit = audit;
  }
  metrics(): Metrics {
    let food = 0, energy = 0, gen = 0;
    for (const f of this.food) food += f;
    for (const a of this.organisms) { energy += a.energy; gen = Math.max(gen, a.generation); }
    return { tick: this.tick, population: this.organisms.length, food: food / 1000, births: this.births, deaths: this.deaths, meanEnergy: energy / Math.max(1, this.organisms.length) / 1000, maxGeneration: gen };
  }
  assertValid(): void {
    const ids = new Set<number>();
    for (let i = 0; i < this.food.length; i++) if (!Number.isInteger(this.food[i]) || this.food[i] < 0 || this.food[i] > this.capacity[i]) throw Error(`Invalid food ${i}`);
    for (const a of this.organisms) {
      if (ids.has(a.id)) throw Error('Duplicate ID'); ids.add(a.id);
      for (const n of [a.x, a.y, a.energy, a.heading, a.velocity, a.age, ...Object.values(a.genome)]) if (!Number.isFinite(n)) throw Error('Nonfinite organism');
      if (a.energy <= 0 || a.x < 0 || a.y < 0 || a.x >= this.config.width || a.y >= this.config.height) throw Error('Invalid organism');
      for (const key of KEYS) { const [min, max] = GENE_BOUNDS[key]; if (a.genome[key] < min || a.genome[key] > max) throw Error('Invalid genome'); }
    }
  }
  // Canonical state includes hidden future-affecting fields, not just visible metrics.
  canonical(): string {
    return JSON.stringify({ version: ENGINE_VERSION, config: this.config, rng: this.rng.state, tick: this.tick, nextId: this.nextId, births: this.births, deaths: this.deaths, capacity: Array.from(this.capacity), growth: Array.from(this.growth), food: Array.from(this.food), organisms: [...this.organisms].sort((a, b) => a.id - b.id) });
  }
}
