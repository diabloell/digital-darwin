import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, mutate, GENE_BOUNDS, TICK_PHASES } from '../src/core/engine.ts';
import { Rng } from '../src/core/rng.ts';
const fixture = () => { const e = new Engine({ width: 8, height: 8, population: 1, regrowth: false, mutationRate: 0 }); e.food.fill(0); return e; };
test('same seed, configuration and ticks produce identical complete states', () => { const a = fixture(), b = fixture(); a.step(100); b.step(100); assert.equal(a.canonical(), b.canonical()); });
test('different seeds produce distinct worlds', () => { assert.notEqual(new Engine({ seed: 'a', population: 0 }).canonical(), new Engine({ seed: 'b', population: 0 }).canonical()); });
test('food competition never overdraws even in crowded cells', () => { const e = new Engine({ width: 8, height: 8, population: 100, regrowth: false }); e.food.fill(5); for (const a of e.organisms) { a.x = 1; a.y = 1; } e.step(50); e.assertValid(); assert.ok(e.food.every(f => f >= 0)); });
test('feeding gain matches assimilation minus explicit metabolic cost', () => { const e = fixture(); e.food.fill(2000); const a = e.organisms[0], before = a.energy; e.step(); assert.equal(e.audit.consumed, 650); assert.equal(e.audit.assimilated, Math.floor(650 * a.genome.efficiency)); assert.equal(a.energy, before + e.audit.assimilated - e.audit.dissipated); });
test('reproduction transfers energy and pays cost instead of copying energy', () => { const e = fixture(), a = e.organisms[0]; a.age = 45; a.energy = 70000; const before = a.energy; e.step(); assert.equal(e.organisms.length, 2); const child = e.organisms[1]; assert.equal(child.energy, Math.floor((before - e.audit.dissipated) * .45)); assert.equal(a.energy + child.energy, before - e.audit.dissipated - 1200); assert.equal(child.parent, a.id); assert.equal(child.generation, a.generation + 1); assert.notEqual(child.id, a.id); });
test('zero mutation offspring inherits a separate exact genome', () => { const e = fixture(), a = e.organisms[0]; a.age = 45; a.energy = 70000; e.step(); assert.deepEqual(e.organisms[1].genome, a.genome); assert.notEqual(e.organisms[1].genome, a.genome); });
test('mutations stay within bounds for 10000 successive genomes', () => { const rng = new Rng('mutation-boundary'); let g = { speed: .25, sensor: 8, efficiency: 1, threshold: 32 }; let changed = false; for (let i = 0; i < 10000; i++) { const n = mutate(g, rng, 1); changed ||= JSON.stringify(n) !== JSON.stringify(g); g = n; for (const k of Object.keys(GENE_BOUNDS) as (keyof typeof g)[]) assert.ok(g[k] >= GENE_BOUNDS[k][0] && g[k] <= GENE_BOUNDS[k][1]); } assert.ok(changed); });
test('organism dies when energy is exhausted', () => { const e = fixture(); e.organisms[0].energy = 1; e.step(); assert.equal(e.organisms.length, 0); assert.equal(e.deaths, 1); });
test('confirmed dead organism never moves, eats or reproduces', () => { const e = fixture(), a = e.organisms[0]; a.energy = 0; a.age = 100; e.food.fill(2000); const x = a.x, y = a.y; e.step(); assert.equal(a.x, x); assert.equal(a.y, y); assert.equal(e.audit.consumed, 0); assert.equal(e.audit.actions, 0); assert.equal(e.births, 0); e.step(5); assert.equal(e.deaths, 1); });
test('one intent per organism per tick; newborn waits until next tick', () => { const e = fixture(); e.organisms[0].energy = 70000; e.organisms[0].age = 50; e.step(); assert.equal(e.audit.actions, 1); assert.equal(e.organisms[0].lastActionTick, 1); assert.equal(e.organisms[1].lastActionTick, -1); assert.equal(e.organisms[1].age, 0); e.step(); assert.equal(e.audit.actions, 2); assert.ok(e.organisms.every(a => a.lastActionTick === 2)); });
test('integer resource and energy budget closes over birth/death cycles', () => { const e = new Engine({ width: 16, height: 16, population: 40 }); for (let i = 0; i < 200; i++) { const beforeFood = e.food.reduce((a, b) => a + b, 0), beforeEnergy = e.organisms.reduce((s, a) => s + a.energy, 0); e.step(); const afterFood = e.food.reduce((a, b) => a + b, 0), afterEnergy = e.organisms.reduce((s, a) => s + a.energy, 0); assert.equal(afterFood, beforeFood + e.audit.grown - e.audit.consumed); assert.equal(afterEnergy, beforeEnergy + e.audit.assimilated - e.audit.dissipated - e.audit.reproductionCost); } });
test('no NaN or Infinity across multiple seeded worlds', () => { for (const seed of ['a', 'b', 'c', 'd']) { const e = new Engine({ seed, width: 32, height: 32, population: 100 }); for (let t = 0; t < 200; t++) { e.step(); e.assertValid(); } } });
test('toroidal cell lookup wraps both axes', () => { const e = fixture(); assert.equal(e.cell(-1, -1), 63); assert.equal(e.cell(8, 8), 0); });
test('invalid configs and tick counts are rejected', () => { for (const c of [{ width: NaN }, { seed: '' }, { population: -1 }, { mutationRate: Infinity }]) assert.throws(() => new Engine(c)); const e = fixture(); assert.throws(() => e.step(NaN)); assert.throws(() => e.step(-1)); });
test('proportional conflict allocation is independent of iteration order without mutation', () => { const a = new Engine({ seed: 'claims', width: 8, height: 8, population: 20, regrowth: false, mutationRate: 0 }), b = new Engine({ seed: 'claims', width: 8, height: 8, population: 20, regrowth: false, mutationRate: 0 }); a.food.fill(1500); b.food.fill(1500); for (const e of [a, b]) for (const org of e.organisms) { org.x = 1; org.y = 1; org.heading = 0; org.genome.speed = .5; } b.organisms.reverse(); a.step(); b.step(); assert.deepEqual(a.food, b.food); assert.deepEqual(a.organisms.sort((x,y)=>x.id-y.id).map(x=>x.energy), b.organisms.sort((x,y)=>x.id-y.id).map(x=>x.energy)); });

test('UTF-16 seeds sharing a high surrogate initialize distinct RNG streams', () => {
  const sequence = (seed: string) => {
    const rng = new Rng(seed);
    return Array.from({ length: 16 }, () => rng.next());
  };
  assert.deepEqual(sequence('🌱'), sequence('🌱'));
  assert.notDeepEqual(sequence('🌱'), sequence('🌲'));
  assert.notDeepEqual(new Engine({ seed: '🌱', width: 8, height: 8 }).food,
    new Engine({ seed: '🌲', width: 8, height: 8 }).food);
});

test('tick stages publish in order and observations do not move organisms', () => {
  const e = fixture();
  const before = { ...e.organisms[0] };
  const phases: string[] = [];
  e.step(1, phase => {
    phases.push(phase);
    if (phase === 'observations' || phase === 'intents') assert.deepEqual(e.organisms[0], before);
  });
  assert.deepEqual(phases, TICK_PHASES);
  assert.equal(e.audit.actions, 1);
  e.assertValid();
});

test('an eligible organism never gives birth when reproduction is disabled', () => {
  const e = new Engine({ width: 8, height: 8, population: 1, reproduction: false });
  e.organisms[0].age = 45;
  e.organisms[0].energy = 80000;
  e.step();
  assert.equal(e.organisms.length, 1);
  assert.equal(e.births, 0);
  assert.equal(e.audit.transferred, 0);
  assert.equal(e.audit.reproductionCost, 0);
});

test('zero reserves skip every action while duplicate IDs fail the tick', () => {
  const e = new Engine({ width: 8, height: 8, population: 2 });
  e.organisms[0].energy = 0;
  e.step();
  assert.equal(e.audit.actions, 1);
  assert.equal(e.deaths, 1);
  e.assertValid();
  const duplicate = new Engine({ width: 8, height: 8, population: 2 });
  duplicate.organisms[1].id = duplicate.organisms[0].id;
  assert.throws(() => duplicate.step(), /Duplicate or invalid ID/);
});

test('full invariant check rejects counterfeited state and missing food', () => {
  const corruptions: ((e: Engine) => void)[] = [
    e => { e.food[0]--; },
    e => { e.organisms[0].energy = NaN; },
    e => { e.organisms[0].heading = Infinity; },
    e => { e.organisms[0].genome.speed = 2; },
    e => { e.organisms[0].energy += .5; },
    e => { e.organisms[0].lastActionTick--; },
    e => { e.nextId++; }
  ];
  for (const corrupt of corruptions) {
    const e = new Engine({ width: 8, height: 8, population: 1 });
    e.step();
    e.assertValid();
    corrupt(e);
    assert.throws(() => e.assertValid());
  }
});

test('phenotype maps the four genes and makes high assimilation costly', async () => {
  const { phenotype } = await import('../src/core/genetics.ts');
  const low = { speed: .8, sensor: 3.5, efficiency: .65, threshold: 44 };
  const high = { ...low, efficiency: 1 };
  const traits = phenotype(high);
  assert.equal(traits.speed, .8);
  assert.equal(traits.radius, 3.5);
  assert.equal(traits.assimilation, 1);
  assert.equal(traits.birthReserve, 44000);
  assert.ok(traits.maintenance > phenotype(low).maintenance);
  assert.deepEqual(phenotype(low, 'neutral'), phenotype(high, 'neutral'));
  const e = new Engine({ width: 8, height: 8, population: 2, regrowth: false });
  for (const [i, genome] of [low, high].entries()) {
    const a = e.organisms[i];
    a.genome = genome;
    a.x = a.y = i;
    a.energy = 20000;
  }
  e.food.fill(0);
  e.step();
  assert.ok(e.organisms[0].energy > e.organisms[1].energy);
  assert.equal(40000 - e.organisms.reduce((sum, a) => sum + a.energy, 0), e.audit.dissipated);
  e.assertValid();
});

test('mutation strength zero copies values and maximum strength remains bounded', () => {
  const e = fixture(), parent = e.organisms[0].genome;
  assert.deepEqual(mutate(parent, new Rng('zero-strength'), 1, 0), parent);
  const rng = new Rng('max-strength');
  let candidate = parent;
  for (let i = 0; i < 500; i++) {
    candidate = mutate(candidate, rng, 1, 1);
    for (const key of Object.keys(GENE_BOUNDS) as (keyof typeof parent)[]) {
      const [min, max] = GENE_BOUNDS[key];
      assert.ok(candidate[key] >= min && candidate[key] <= max);
    }
  }
  assert.throws(() => new Engine({ mutationStrength: Infinity }));
});

test('live genetic distributions, cohort deaths and zero-birth values reflect state', async () => {
  const { EvolutionObserver, describeGenomes } = await import('../src/core/evolution.ts');
  const e = new Engine({ width: 8, height: 8, population: 2, regrowth: false });
  e.organisms[0].genome.speed = GENE_BOUNDS.speed[0];
  e.organisms[1].genome.speed = GENE_BOUNDS.speed[1];
  const observer = new EvolutionObserver(e);
  const speed = describeGenomes(e.organisms)[0];
  assert.deepEqual(speed.histogram, [1, 0, 0, 0, 0, 0, 0, 1]);
  assert.equal(speed.mean, speed.median);
  assert.ok(Math.abs(speed.variance! - .600625) < 1e-12);
  e.food.fill(0);
  e.organisms[0].energy = 1;
  e.step();
  observer.record(e);
  const snapshot = observer.snapshot(e);
  assert.equal(snapshot.live.population, 1);
  assert.equal(snapshot.live.genes[0].mean, 1.8);
  assert.equal(snapshot.lifetime.groups[0].low.survivorFraction, 0);
  assert.equal(snapshot.lifetime.groups[0].high.survivorFraction, 1);
  assert.equal(snapshot.lifetime.mutationFraction, null);
});

test('world event thresholds use only adjacent 100-tick measurements', async () => {
  const { compareWorld } = await import('../src/core/history.ts');
  const baseline = new Engine({ width: 8, height: 8, population: 100 }).metrics();
  const before = { ...baseline, tick: 0, food: 100 };
  assert.deepEqual(compareWorld(before, { ...before, tick: 100, population: 71, food: 61 }), []);
  assert.deepEqual(compareWorld(before, { ...before, tick: 101, population: 0, food: 0 }), []);
  assert.deepEqual(compareWorld(before, { ...before, tick: 100, population: 70, food: 60 }).map(e => e.kind),
    ['population-crisis', 'food-drop']);
  assert.deepEqual(compareWorld(before, { ...before, tick: 100, population: 150 }).map(e => e.kind), ['population-growth']);
});

test('energy exhaustion is recorded once, aggregated and bounded during mass extinction', async () => {
  const { PopulationHistory } = await import('../src/core/history.ts');
  const e = new Engine({ seed: 'mass', width: 8, height: 8, population: 100, regrowth: false });
  const history = new PopulationHistory(e, 4);
  e.food.fill(0);
  for (const a of e.organisms) a.energy = 1;
  e.step();
  history.observe(e);
  history.assertValid(e);
  assert.deepEqual(history.counts, { living: 0, extinct: 100 });
  assert.equal(history.storage.recent, 4);
  assert.equal(history.lookup(100)?.final?.cause, 'energy-depleted');
  assert.equal(history.lookup(1), undefined);
  const view = history.view(100, 1);
  assert.equal(view.entity?.died, 1);
  assert.equal(view.line?.deaths, 1);
  assert.equal(view.line?.lastActivity, 1);
  assert.equal(view.events.find(e => e.kind === 'extinction')?.count, 100);
  assert.equal(view.events.find(e => e.kind === 'lineage-extinction')?.count, 100);
  assert.equal(view.events.find(e => e.kind === 'deaths')?.count, 100);
  assert.throws(() => history.observe(e), /consecutive/);
  for (let i = 0; i < 100; i++) { e.step(); history.observe(e); }
  assert.equal(history.view(null, null).events.filter(e => e.kind === 'extinction').length, 1);
  const empty = new Engine({ population: 0, width: 8, height: 8 });
  const none = new PopulationHistory(empty);
  empty.step(); none.observe(empty); none.assertValid(empty);
  assert.deepEqual(none.counts, { living: 0, extinct: 0 });
  assert.equal(none.view(null, null).events.length, 0);
});

test('living offspring retain their direct parent after historical eviction', async () => {
  const { PopulationHistory } = await import('../src/core/history.ts');
  const e = new Engine({ seed: 'parent', width: 8, height: 8, population: 1, regrowth: false, mutationRate: 0 });
  const history = new PopulationHistory(e, 0);
  e.food.fill(0);
  for (let i = 0; i < 44; i++) { e.step(); history.observe(e); }
  e.organisms[0].energy = 80000;
  e.step(); history.observe(e);
  const child = e.organisms[1];
  assert.equal(child.parent, 1);
  assert.equal(history.lookup(1)?.children, 1);
  e.organisms[0].energy = 1;
  e.step(); history.observe(e); history.assertValid(e);
  assert.equal(history.storage.recent, 0);
  assert.equal(history.storage.pinned, 1);
  const v = history.view(child.id, 1);
  assert.equal(v.ancestors[0].died, 46);
  assert.equal(v.ancestors[0].id, child.parent);
  assert.equal(v.entity?.generation, 1);
  assert.equal(v.line?.living, 1);
  assert.equal(v.line?.born, 2);
  assert.equal(v.events.filter(e => e.kind === 'variation').length, 0);
});

test('food-drop event cooldown suppresses a qualifying repeat then permits a later one', async () => {
  const { PopulationHistory } = await import('../src/core/history.ts');
  const e = new Engine({ width: 8, height: 8, population: 0, regrowth: false });
  e.food.fill(500);
  const history = new PopulationHistory(e);
  for (let interval = 1; interval <= 5; interval++) {
    e.food.fill(interval % 2 ? 100 : 500);
    for (let t = 0; t < 100; t++) { e.step(); history.observe(e); }
  }
  const drops = history.view(null, null).events.filter(event => event.kind === 'food-drop');
  assert.deepEqual(drops.map(event => event.tick), [500, 100]);
  for (const event of drops) {
    assert.equal(event.from, 32);
    assert.equal(event.to, 6.4);
    assert.equal(event.intervalTicks, 100);
  }
});

test('version 1 fixture restores exact numbers, IDs, typed resources and independent copies', async () => {
  const { readFile } = await import('node:fs/promises');
  const { capture, decode, encode, restore } = await import('../src/snapshot.ts');
  const file = (await readFile(new URL('./fixtures/dd05-v1.ddworld.json', import.meta.url), 'utf8')).trim();
  const { manifest, state } = await decode(file);
  const a = restore(state), b = restore(state);
  assert.equal(a.engine.config.seed, 'dd05-формат🌱');
  assert.deepEqual(a.engine.rng.state, state.engine.rng);
  assert.ok(a.engine.food instanceof Int32Array);
  assert.deepEqual(Array.from(a.engine.food), state.engine.food);
  assert.deepEqual(a.engine.organisms, state.engine.organisms);
  assert.equal((await encode(capture(a.engine,a.genealogy), manifest.name, manifest.createdAt)).text, file);
  a.engine.step(); a.genealogy.observe(a.engine);
  assert.notEqual(a.engine.canonical(), b.engine.canonical());
  assert.equal(b.genealogy.snapshot().tick, 0);
  assert.throws(() => b.engine.step(1, () => b.engine.snapshot()), /completed tick/);
});

test('malformed, unsupported and honestly checksummed invalid snapshots are rejected', async () => {
  const { PopulationHistory } = await import('../src/core/history.ts');
  const { capture, encode, decode, restore, MAX_SAVE_BYTES } = await import('../src/snapshot.ts');
  const e = new Engine({ width:8, height:8, population:2 });
  const h = new PopulationHistory(e);
  const pack = (s: ReturnType<typeof capture>) => encode(s, '<img onerror=bad>', '2026-11-22T00:00:00.000Z');
  const file = await pack(capture(e,h));
  await assert.rejects(decode('{'), /JSON/);
  await assert.rejects(decode(' '.repeat(MAX_SAVE_BYTES + 1)), /32/);
  const broken = JSON.parse(file.text);
  broken.manifest.format = 100;
  await assert.rejects(decode(JSON.stringify(broken)), /версия/);
  broken.manifest.format = 1;
  broken.manifest.checksum = '0'.repeat(64);
  await assert.rejects(decode(JSON.stringify(broken)), /SHA-256/);
  const corruptions: ((s: ReturnType<typeof capture>) => void)[] = [
    s => { s.engine.rng.fill(0); },
    s => { s.engine.food.pop(); },
    s => { s.engine.capacity[0] = 2147483648; },
    s => { s.engine.organisms[0].energy = NaN; },
    s => { s.engine.organisms[0].genome.speed = 999; },
    s => { s.engine.organisms[1].id = s.engine.organisms[0].id; },
    s => { Object.defineProperty(s.engine.config, '__proto__', { value: {}, enumerable: true }); },
    s => { s.history.live.pop(); },
    s => { s.history.lines[0].founder = 0; },
    s => { s.history.lastWorldEvent.push(['food-drop',999]); }
  ];
  for (const corrupt of corruptions) {
    const s = capture(e,h);
    corrupt(s);
    const f = await pack(s);
    await assert.rejects(async () => restore((await decode(f.text)).state));
  }
  assert.equal(e.tick, 0);
  assert.equal(h.storage.live, 2);
});

test('lab definition hashes are stable and reject invalid budgets, seeds and schema versions', async () => {
  const { canonical,SCENARIOS,validateDefinition }=await import('../src/lab/definition.ts');
  const { sha256 }=await import('../src/snapshot.ts');
  const d=SCENARIOS[1];
  assert.equal(await sha256(canonical(validateDefinition(d))),await sha256(canonical(validateDefinition({ ...d,initial:{population:240,width:48,height:48} }))));
  assert.notEqual(await sha256(canonical(d)),await sha256(canonical({...d,duration:4100})));
  for(const invalid of [{...d,seeds:[],replicas:0},{...d,seeds:Array.from({length:13},(_,i)=>String(i)),replicas:13},
    {...d,versions:{...d.versions,metrics:99}},{...d,initial:{...d.initial,width:513}},{...d,interval:1}]) {
    assert.throws(()=>validateDefinition(invalid));
  }
});

test('lab summary uses defined completed values and reports sample SD', async () => {
  const { summary }=await import('../src/lab/comparison.ts');
  assert.deepEqual(summary([1,3,null,2]),{n:3,missing:1,mean:2,median:2,min:1,max:3,sd:1});
  assert.deepEqual(summary([null]),{n:0,missing:1,mean:null,median:null,min:null,max:null,sd:null});
});
