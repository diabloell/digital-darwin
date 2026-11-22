import { validateConfig } from './core/engine.ts';
import type { Audit, EngineSnapshot, Organism } from './core/engine.ts';
import { GENES, GENE_BOUNDS } from './core/genetics.ts';
import type { HistorySnapshot, LifeRecord } from './core/history.ts';
import { HISTORY_LIMITS } from './core/history.ts';
import type { Sample } from './protocol.ts';

const idMax = 0xffffffff;
export function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}
export function fields(value: unknown, names: string, optional = ''): Record<string, any> {
  const obj = value as Record<string, unknown>;
  requireValue(obj && typeof obj === 'object' && Object.getPrototypeOf(obj) === Object.prototype, 'Некорректный объект');
  const required = names.split(' '), allowed = new Set([...required, ...optional.split(' ')]);
  requireValue(required.every(k => Object.hasOwn(obj, k)) && Object.keys(obj).every(k => allowed.has(k)), `Поля не соответствуют формату: ${names}`);
  return obj;
}
const integer = (x: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): x is number =>
  typeof x === 'number' && Number.isSafeInteger(x) && x >= min && x <= max;
const number = (x: unknown, min = 0, max = Infinity): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
function array(value: unknown, max: number): any[] {
  requireValue(Array.isArray(value) && value.length <= max, 'Недопустимый размер массива');
  return value;
}
function integers(r: Record<string, unknown>, names: string, max = Number.MAX_SAFE_INTEGER) {
  requireValue(names.split(' ').every(k => integer(r[k], 0, max)), 'Недопустимое целое число');
}
function genome(value: unknown) {
  const g = fields(value, GENES.join(' '));
  requireValue(GENES.every(k => number(g[k], ...GENE_BOUNDS[k])), 'Недопустимый геном');
}

export function validateEngine(value: unknown): EngineSnapshot {
  const e = fields(value, 'config tick nextId births deaths rng food capacity growth organisms audit expectedFood lastBirths lastDeaths');
  const c = fields(e.config, 'seed width height population mutationRate regrowth reproduction rule resourceScale mutationStrength');
  requireValue(typeof c.reproduction === 'boolean' && typeof c.rule === 'string'
    && number(c.resourceScale, 0, 1) && number(c.mutationStrength, 0, 1), 'Некорректная конфигурация');
  validateConfig(c as EngineSnapshot['config']);
  integers(e, 'tick nextId births deaths', idMax);
  requireValue(e.nextId === c.population + e.births + 1, 'Несогласованный следующий ID');
  const rng = array(e.rng, 4);
  requireValue(rng.length === 4 && rng.every(v => integer(v, 0, idMax)) && rng.some(v => v !== 0), 'Некорректное состояние RNG');
  const size = c.width * c.height;
  for (const key of ['food', 'capacity', 'growth']) {
    const list = array(e[key], size);
    requireValue(list.length === size && list.every(x => integer(x, 0, 7000)), 'Недопустимая сетка ресурсов');
  }
  requireValue(e.food.every((v: number, i: number) => v <= e.capacity[i]) &&
    (e.tick === 0 ? e.expectedFood === null : integer(e.expectedFood)), 'Несогласованный ресурсный баланс');
  const audit = fields(e.audit, 'grown consumed assimilated dissipated reproductionCost digestiveLoss transferred actions') as Audit;
  requireValue(Object.values(audit).every(v => integer(v)) && audit.consumed === audit.assimilated + audit.digestiveLoss, 'Некорректный аудит');
  const organism = (value: unknown, dead: boolean) => {
    const a = fields(value, 'id parent generation x y heading velocity energy age born lastActionTick genome') as Organism;
    requireValue(integer(a.id, 1, e.nextId - 1) && (a.parent === null || integer(a.parent, 1, a.id - 1))
      && integer(a.generation, 0, e.tick) && integer(a.born, 0, e.tick)
      && a.age === e.tick - a.born && a.lastActionTick === (a.age ? e.tick : -1)
      && number(a.x) && a.x < c.width && number(a.y) && a.y < c.height && number(a.heading, -Infinity)
      && number(a.velocity, 0, 1.8) && (dead ? a.energy === 0 : integer(a.energy, 1, 80000)), 'Некорректный организм');
    genome(a.genome);
    return a;
  };
  const ids = new Map<number, Organism>();
  let previousId = 0;
  for (const value of array(e.organisms, idMax)) {
    const a = organism(value, false);
    requireValue(a.id > previousId, 'Организмы должны быть в порядке ID');
    previousId = a.id;
    ids.set(a.id, a);
  }
  const births = array(e.lastBirths, ids.size), deaths = array(e.lastDeaths, e.deaths);
  const seen = new Set<number>();
  for (const value of births) {
    const row = fields(value, 'parent child'), child = organism(row.child, false);
    genome(row.parent);
    const parent = child.parent === null ? undefined : ids.get(child.parent);
    requireValue(parent && child.born === e.tick && e.tick > 0 && !seen.has(child.id)
      && sameNumbers(parent.genome, row.parent) && sameOrganism(child, ids.get(child.id)), 'Некорректная запись рождения');
    seen.add(child.id);
  }
  requireValue(births.length === e.organisms.filter((a: Organism) => a.born === e.tick && e.tick > 0).length, 'Неполный журнал рождений тика');
  for (const value of deaths) {
    const d = organism(value, true);
    requireValue(!ids.has(d.id) && !seen.has(d.id) && d.born < e.tick, 'Некорректная запись смерти');
    seen.add(d.id);
  }
  return e as EngineSnapshot;
}

function sameNumbers(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return Object.keys(a).every(key => a[key] === b[key]);
}
function sameOrganism(a: Organism, b?: Organism) {
  if (!b) return false;
  const { genome: ag, ...ar } = a, { genome: bg, ...br } = b;
  return sameNumbers(ag, bg) && sameNumbers(ar, br);
}

const kinds = ['births', 'deaths', 'variation', 'generation', 'lineage-extinction', 'extinction', 'population-crisis', 'food-drop', 'population-growth'];
function metrics(value: unknown, extended = '') {
  const m = fields(value, ('tick population food births deaths meanEnergy maxGeneration ' + extended).trim());
  integers(m, 'tick population births deaths maxGeneration');
  requireValue(number(m.food) && number(m.meanEnergy, 0, 80), 'Некорректная метрика');
  return m;
}
export function validateHistory(value: unknown, e: EngineSnapshot): HistorySnapshot {
  const h = fields(value, 'deadLimit live recent pinned parentReferences lines events lastWorldEvent previousMetrics eventId tick added lastEntity removed maxGeneration extinctCount pendingBirths pendingDeaths pendingVariants lastBirth lastDeath lastVariant lastFlush');
  integers(h, 'deadLimit eventId tick added lastEntity removed maxGeneration extinctCount pendingBirths pendingDeaths pendingVariants lastFlush');
  requireValue(h.tick === e.tick && h.added === e.births && h.removed === e.deaths && h.lastEntity === e.nextId - 1
    && h.deadLimit <= HISTORY_LIMITS.dead && h.lastFlush <= e.tick && e.tick - h.lastFlush < 25
    && h.pendingBirths <= e.births && h.pendingDeaths <= e.deaths && h.pendingVariants <= h.pendingBirths, 'Некорректные счётчики истории');
  const previous = metrics(h.previousMetrics);
  requireValue(previous.tick === Math.floor(e.tick / 100) * 100 && previous.births <= e.births && previous.deaths <= e.deaths
    && previous.population === e.config.population + previous.births - previous.deaths, 'Некорректный отсчёт истории');
  const validateId = (id: unknown) => integer(id, 1, e.nextId - 1);
  const validateFounder = (id: unknown) => integer(id, 1, e.config.population);
  for (const [key, count] of [['lastBirth','pendingBirths'],['lastDeath','pendingDeaths'],['lastVariant','pendingVariants']]) {
    if (h[count] === 0) requireValue(h[key] === null, 'Лишняя ссылка события');
    else {
      const link = fields(h[key], 'id founder');
      requireValue(validateId(link.id) && validateFounder(link.founder), 'Некорректная ссылка события');
    }
  }
  const all = new Map<number, LifeRecord>(), live = new Map<number, LifeRecord>();
  for (const [key, limit] of [['live',e.organisms.length],['recent',h.deadLimit],['pinned',e.organisms.length]] as const) {
    const ids = new Set<number>();
    let previousDeath = -1;
    for (const value of array(h[key], limit)) {
      const r = fields(value, 'id parent founder generation born genome children died final') as LifeRecord;
      requireValue(validateId(r.id) && !ids.has(r.id) && validateFounder(r.founder) && integer(r.born, 0, e.tick)
        && integer(r.children, 0, e.births) && integer(r.generation, 0, h.maxGeneration)
        && (r.born === 0 ? r.id === r.founder && r.parent === null && r.generation === 0
          : r.id > e.config.population && integer(r.parent, r.founder, r.id - 1) && r.generation > 0), 'Некорректная генеалогическая запись');
      ids.add(r.id);
      genome(r.genome);
      if (key === 'live') {
        requireValue(r.died === null && r.final === null, 'Живая запись помечена умершей');
        live.set(r.id, r);
      } else {
        requireValue(integer(r.died, r.born + 1, e.tick), 'Недопустимый тик смерти');
        const f = fields(r.final, 'x y age energy cause');
        requireValue(f.cause === 'energy-depleted' && f.energy === 0 && f.age === r.died - r.born
          && number(f.x) && f.x < e.config.width && number(f.y) && f.y < e.config.height, 'Некорректная запись смерти');
        if (key === 'recent') {
          requireValue(r.died >= previousDeath, 'Нарушен порядок архива');
          previousDeath = r.died;
        }
      }
      const existing = all.get(r.id);
      if (existing) requireValue(key === 'pinned' && JSON.stringify(existing) === JSON.stringify(r), 'Несогласованные дубликаты архива');
      all.set(r.id, r);
    }
  }
  const references = new Map<number, number>();
  for (const a of e.organisms) {
    const row = live.get(a.id);
    requireValue(row && sameNumbers(a.genome, row.genome), 'Живой генотип не совпадает с архивом');
    if (row.parent !== null) references.set(row.parent, (references.get(row.parent) ?? 0) + 1);
  }
  for (const row of all.values()) {
    if (row.parent === null) continue;
    const parent = all.get(row.parent);
    if (parent) requireValue(parent.founder === row.founder && parent.born < row.born && parent.generation + 1 === row.generation
      && parent.children > 0 && (parent.died === null || parent.died > row.born), 'Несогласованный предок');
    else requireValue(row.died !== null, 'Отсутствует обязательный родитель');
  }
  const pinned = new Set((h.pinned as LifeRecord[]).map(row => row.id));
  for (const id of pinned) requireValue(references.has(id), 'Лишняя закреплённая запись');
  for (const id of references.keys()) requireValue(live.has(id) || pinned.has(id), 'Отсутствует закреплённый родитель');
  const pairs = array(h.parentReferences, references.size);
  requireValue(pairs.length === references.size, 'Несогласованные ссылки предков');
  for (const pair of pairs) {
    requireValue(Array.isArray(pair) && pair.length === 2 && references.get(pair[0]) === pair[1] && references.delete(pair[0]), 'Несогласованные ссылки предков');
  }
  const lineIds = new Set<number>();
  let maximum = 0;
  for (const line of array(h.lines, e.config.population)) {
    const l = fields(line, 'founder living born deaths maxGeneration lastActivity');
    integers(l, 'living born deaths maxGeneration lastActivity');
    requireValue(validateFounder(l.founder) && !lineIds.has(l.founder) && l.born >= 1 && l.lastActivity <= e.tick && l.maxGeneration <= h.maxGeneration, 'Некорректная линия');
    lineIds.add(l.founder);
    maximum = Math.max(maximum, l.maxGeneration);
  }
  requireValue(lineIds.size === e.config.population && maximum === h.maxGeneration, 'Неполный список линий');
  const events = array(h.events, HISTORY_LIMITS.events);
  requireValue(events.length === Math.min(h.eventId, HISTORY_LIMITS.events), 'Некорректная длина журнала');
  let eventId = h.eventId - events.length, tick = 0;
  for (const value of events) {
    const event = fields(value, 'id kind tick severity count', 'entity founder from to intervalTicks');
    requireValue(event.id === ++eventId && integer(event.tick, tick, e.tick) && kinds.includes(event.kind)
      && ['info','notice','critical'].includes(event.severity) && number(event.count, 0)
      && (!Object.hasOwn(event, 'entity') || validateId(event.entity)) && (!Object.hasOwn(event, 'founder') || validateFounder(event.founder))
      && (!Object.hasOwn(event, 'from') || number(event.from)) && (!Object.hasOwn(event, 'to') || number(event.to))
      && (!Object.hasOwn(event, 'intervalTicks') || integer(event.intervalTicks, 1, 100)), 'Некорректное событие');
    tick = event.tick;
  }
  const cooldown = new Set<string>();
  for (const pair of array(h.lastWorldEvent, 3)) {
    requireValue(Array.isArray(pair) && pair.length === 2 && ['population-crisis','food-drop','population-growth'].includes(pair[0])
      && !cooldown.has(pair[0]) && integer(pair[1], 100, previous.tick) && pair[1] % 100 === 0, 'Некорректный cooldown');
    cooldown.add(pair[0]);
  }
  return h as HistorySnapshot;
}

export function validateSamples(value: unknown, e: EngineSnapshot): Sample[] {
  const rows = array(value, 300);
  let previous: Sample | undefined;
  for (const row of rows) {
    const m = metrics(row, 'genes variants interval intervalBirths intervalDeaths totalEnergy meanGeneration livingLines extinctLines') as Sample;
    integers(m, 'variants interval intervalBirths intervalDeaths livingLines extinctLines');
    requireValue(m.tick <= e.tick && m.births <= e.births && m.deaths <= e.deaths && m.population === e.config.population + m.births - m.deaths
      && m.variants <= m.population && (m.population ? m.genes !== null && number(m.meanGeneration, 0, m.maxGeneration) : m.genes === null && m.meanGeneration === null)
      && m.livingLines + m.extinctLines === e.config.population && m.livingLines <= m.population
      && number(m.totalEnergy, 0, 80 * m.population)
      && (!previous || (m.tick > previous.tick && m.interval === m.tick - previous.tick
        && m.intervalBirths === m.births - previous.births && m.intervalDeaths === m.deaths - previous.deaths)), 'Несогласованная аналитика');
    if (m.genes) {
      const g = fields(m.genes, GENES.join(' '));
      requireValue(GENES.every(k => number(g[k], GENE_BOUNDS[k][0] - 1e-9, GENE_BOUNDS[k][1] + 1e-9)), 'Некорректные средние генов');
    }
    previous = m;
  }
  return rows;
}
