import type { Engine, Metrics, Organism } from './engine.ts';
import { GENES } from './genetics.ts';
import type { Genome } from './genetics.ts';

export const HISTORY_LIMITS = { dead: 4096, events: 180, ancestry: 8, maxAncestry: 32, lineages: 12 };
export type EventKind = 'births' | 'deaths' | 'variation' | 'generation' | 'lineage-extinction' | 'extinction' | 'population-crisis' | 'food-drop' | 'population-growth';
export type WorldEvent = { id: number; kind: EventKind; tick: number; severity: 'info' | 'notice' | 'critical'; count: number; from?: number; to?: number; intervalTicks?: number; entity?: number; founder?: number };
export type LifeRecord = {
  id: number; parent: number | null; founder: number; generation: number; born: number; genome: Genome;
  children: number; died: number | null;
  final: { x: number; y: number; age: number; energy: number; cause: 'energy-depleted' } | null;
};
type Line = { founder: number; living: number; born: number; deaths: number; maxGeneration: number; lastActivity: number };
export type LineSummary = Line & { age: number; generations: number; status: 'active' | 'extinct' };
export type LineDetail = LineSummary & { genes: Genome | null };
export type HistoryView = {
  tick: number; population: number; entity: LifeRecord | null; ancestors: LifeRecord[]; nextAncestor: number | null; missingAncestor: number | null;
  line: LineDetail | null; top: LineSummary[]; extinct: LineSummary[]; events: WorldEvent[];
  droppedEvents: number;
};

type Threshold = { kind: EventKind; before: number; after: number; minimum: number; ratio: number; growth?: boolean };
export function compareWorld(before: Metrics, after: Metrics) {
  if (after.tick - before.tick !== 100) return [];
  const thresholds: Threshold[] = [
    { kind: 'population-crisis', before: before.population, after: after.population, minimum: 10, ratio: .3 },
    { kind: 'food-drop', before: before.food, after: after.food, minimum: 10, ratio: .4 },
    { kind: 'population-growth', before: before.population, after: after.population, minimum: 10, ratio: .5, growth: true }
  ];
  return thresholds.flatMap(t => {
    const count = t.growth ? t.after - t.before : t.before - t.after;
    if (count < t.minimum || count < t.before * t.ratio) return [];
    return [{ kind: t.kind, from: t.before, to: t.after, count, intervalTicks: 100 }];
  });
}

export class PopulationHistory {
  private readonly live = new Map<number, LifeRecord>();
  private readonly recent = new Map<number, LifeRecord>();
  private readonly pinned = new Map<number, LifeRecord>();
  private readonly parentReferences = new Map<number, number>();
  private readonly lines = new Map<number, Line>();
  private readonly events: WorldEvent[] = [];
  private readonly lastWorldEvent = new Map<EventKind, number>();
  private previousMetrics: Metrics;
  private eventId = 0;
  private tick = 0;
  private added = 0;
  private lastEntity = 0;
  private removed = 0;
  private maxGeneration = 0;
  private extinctCount = 0;
  private pendingBirths = 0;
  private pendingDeaths = 0;
  private pendingVariants = 0;
  private lastBirth: LifeRecord | undefined;
  private lastDeath: LifeRecord | undefined;
  private lastVariant: LifeRecord | undefined;
  private lastFlush = 0;

  constructor(engine: Engine, deadLimit = HISTORY_LIMITS.dead) {
    if (engine.tick !== 0) throw Error('History starts at tick zero');
    if (!Number.isSafeInteger(deadLimit) || deadLimit < 0 || deadLimit > HISTORY_LIMITS.dead) throw Error('Invalid history limit');
    this.deadLimit = deadLimit;
    this.previousMetrics = engine.metrics();
    for (const agent of engine.organisms) {
      this.lastEntity = agent.id;
      this.live.set(agent.id, this.record(agent, agent.id));
      this.lines.set(agent.id, { founder: agent.id, living: 1, born: 1, deaths: 0, maxGeneration: 0, lastActivity: 0 });
    }
  }
  private readonly deadLimit: number;

  private record(agent: Organism, founder: number): LifeRecord {
    return { id: agent.id, parent: agent.parent, founder, generation: agent.generation, born: agent.born,
      genome: { ...agent.genome }, children: 0, died: null, final: null };
  }

  founder(id: number): number {
    const row = this.live.get(id);
    if (!row) throw Error('Live entity has no lineage');
    return row.founder;
  }

  lookup(id: number): LifeRecord | undefined {
    return this.live.get(id) ?? this.recent.get(id) ?? this.pinned.get(id);
  }

  get counts() {
    return { living: this.lines.size - this.extinctCount, extinct: this.extinctCount };
  }

  get storage() {
    return { live: this.live.size, recent: this.recent.size, pinned: this.pinned.size,
      parentReferences: this.parentReferences.size, lines: this.lines.size, events: this.events.length, droppedEvents: this.eventId - this.events.length };
  }

  observe(engine: Engine): void {
    if (engine.tick !== this.tick + 1) throw Error('History requires consecutive completed ticks');
    const previousPopulation = this.live.size;
    this.tick = engine.tick;
    let newHighest: LifeRecord | undefined;
    for (const { child } of engine.lastBirths) {
      const parent = child.parent === null ? undefined : this.live.get(child.parent);
      if (!parent || parent.born >= child.born || child.born !== this.tick || parent.generation + 1 !== child.generation
        || parent.id >= child.id || child.id !== this.lastEntity + 1) throw Error('Invalid birth relationship');
      const row = this.record(child, parent.founder), line = this.lines.get(row.founder)!;
      this.lastEntity = row.id;
      this.live.set(row.id, row);
      this.parentReferences.set(parent.id, (this.parentReferences.get(parent.id) ?? 0) + 1);
      parent.children++;
      line.living++; line.born++; line.lastActivity = this.tick;
      line.maxGeneration = Math.max(line.maxGeneration, child.generation);
      this.added++; this.pendingBirths++; this.lastBirth = row;
      if (GENES.some(gene => row.genome[gene] !== parent.genome[gene])) {
        this.pendingVariants++; this.lastVariant = row;
      }
      if (row.generation > this.maxGeneration) {
        this.maxGeneration = row.generation;
        newHighest = row;
      }
    }
    const extinct: number[] = [];
    for (const agent of engine.lastDeaths) {
      const row = this.live.get(agent.id);
      if (!row || agent.energy !== 0) throw Error('Invalid death record');
      row.died = this.tick;
      row.final = { x: agent.x, y: agent.y, age: agent.age, energy: agent.energy, cause: 'energy-depleted' };
      this.live.delete(row.id);
      if (this.deadLimit) {
        this.recent.set(row.id, row);
        if (this.recent.size > this.deadLimit) this.recent.delete(this.recent.keys().next().value!);
      }
      if (this.parentReferences.has(row.id)) this.pinned.set(row.id, row);
      if (row.parent !== null) {
        const n = this.parentReferences.get(row.parent)! - 1;
        if (n) this.parentReferences.set(row.parent, n);
        else { this.parentReferences.delete(row.parent); this.pinned.delete(row.parent); }
      }
      const line = this.lines.get(row.founder)!;
      line.living--; line.deaths++; line.lastActivity = this.tick;
      if (!line.living) { this.extinctCount++; extinct.push(line.founder); }
      this.removed++; this.pendingDeaths++; this.lastDeath = row;
    }
    if (newHighest) this.publish('generation', 'notice', newHighest.generation, newHighest);
    if (extinct.length) this.publish('lineage-extinction', 'notice', extinct.length, undefined, extinct[0]);
    if (previousPopulation && !this.live.size) this.publish('extinction', 'critical', previousPopulation);
    if (this.tick % 25 === 0 || (previousPopulation && !this.live.size)) this.flush();
    if (this.tick % 100 === 0) {
      const current = engine.metrics();
      for (const { kind, count, ...details } of compareWorld(this.previousMetrics, current)) {
        if (this.tick - (this.lastWorldEvent.get(kind) ?? -300) < 300) continue;
        this.lastWorldEvent.set(kind, this.tick);
        this.publish(kind, kind === 'population-growth' ? 'notice' : 'critical', count, undefined, undefined, details);
      }
      this.previousMetrics = current;
    }
  }

  private flush() {
    const intervalTicks = this.tick - this.lastFlush;
    for (const [kind, count, row] of [
      ['births', this.pendingBirths, this.lastBirth], ['deaths', this.pendingDeaths, this.lastDeath], ['variation', this.pendingVariants, this.lastVariant]
    ] as const) if (count) this.publish(kind, 'info', count, row, undefined, { intervalTicks });
    this.pendingBirths = this.pendingDeaths = this.pendingVariants = 0;
    this.lastBirth = this.lastDeath = this.lastVariant = undefined;
    this.lastFlush = this.tick;
  }

  private publish(kind: EventKind, severity: WorldEvent['severity'], count: number, row?: LifeRecord, founder?: number,
    details: Pick<WorldEvent, 'from' | 'to' | 'intervalTicks'> = {}) {
    this.events.push({ id: ++this.eventId, kind, tick: this.tick, severity, count, entity: row?.id, founder: row?.founder ?? founder, ...details });
    if (this.events.length > HISTORY_LIMITS.events) this.events.shift();
  }

  private summarize(line: Line): LineSummary {
    const status = line.living ? 'active' : 'extinct';
    return { ...line, status, age: line.living ? this.tick : line.lastActivity, generations: line.maxGeneration + 1 };
  }

  view(entity: number | null, founder: number | null, depth: number = HISTORY_LIMITS.ancestry): HistoryView {
    const selected = entity === null ? null : this.lookup(entity) ?? null;
    const ancestors: LifeRecord[] = [];
    let next = selected?.parent ?? null, missing: number | null = null;
    while (next !== null && ancestors.length < Math.min(depth, HISTORY_LIMITS.maxAncestry)) {
      const row = this.lookup(next);
      if (!row) { missing = next; next = null; break; }
      ancestors.push(row);
      next = row.parent;
    }
    const lines = [...this.lines.values()];
    const line = this.lines.get(founder ?? selected?.founder ?? -1);
    let detail: LineDetail | null = null;
    if (line) {
      const sums: Genome = { speed: 0, sensor: 0, efficiency: 0, threshold: 0 };
      if (line.living) {
        for (const row of this.live.values()) if (row.founder === line.founder) for (const gene of GENES) sums[gene] += row.genome[gene];
        for (const gene of GENES) sums[gene] /= line.living;
      }
      detail = { ...this.summarize(line), genes: line.living ? sums : null };
    }
    return { tick: this.tick, population: this.live.size, entity: selected, ancestors, nextAncestor: next, missingAncestor: missing, line: detail,
      top: lines.filter(l => l.living).sort((a,b) => b.living - a.living || a.founder - b.founder).slice(0, HISTORY_LIMITS.lineages).map(l => this.summarize(l)),
      extinct: lines.filter(l => !l.living).sort((a,b) => b.lastActivity - a.lastActivity || a.founder - b.founder).slice(0, HISTORY_LIMITS.lineages).map(l => this.summarize(l)),
      events: [...this.events].reverse(), droppedEvents: this.eventId - this.events.length };
  }

  assertValid(engine: Engine): void {
    if (this.tick !== engine.tick || this.added !== engine.births || this.removed !== engine.deaths
      || this.live.size !== engine.organisms.length || this.recent.size > this.deadLimit || this.events.length > HISTORY_LIMITS.events
      || this.pinned.size > this.live.size || this.parentReferences.size > this.live.size) throw Error('History ledger mismatch');
    let births = 0, deaths = 0, living = 0, extinct = 0;
    const byFounder = new Map<number, number>();
    for (const agent of engine.organisms) {
      const row = this.live.get(agent.id);
      if (!row || row.died !== null || agent.parent !== row.parent || agent.generation !== row.generation || agent.born !== row.born) throw Error('Invalid live history');
      if (row.parent !== null) {
        const parent = this.lookup(row.parent);
        if (!parent || parent.id >= row.id || parent.born >= row.born || parent.generation + 1 !== row.generation || parent.founder !== row.founder) throw Error('Invalid live ancestry');
      } else if (row.founder !== row.id || row.generation || row.born) throw Error('Invalid founder');
      byFounder.set(row.founder, (byFounder.get(row.founder) ?? 0) + 1);
    }
    for (const line of this.lines.values()) {
      if (line.born - line.deaths !== line.living || line.living !== (byFounder.get(line.founder) ?? 0)) throw Error('Invalid lineage totals');
      births += line.born - 1; deaths += line.deaths; living += line.living; extinct += Number(!line.living);
    }
    if (births !== this.added || deaths !== this.removed || living !== this.live.size || extinct !== this.extinctCount) throw Error('Invalid combined lineage totals');
  }
}
