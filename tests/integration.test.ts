import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/core/engine.ts';
test('1000-organism real ecology births, deaths and valid metrics', () => { const e = new Engine({ seed: 'dd00-integration' }); e.step(1000); e.assertValid(); const m = e.metrics(); assert.ok(m.births > 0); assert.ok(m.deaths > 0); assert.equal(m.population, 1000 + m.births - m.deaths); assert.ok(m.maxGeneration > 0); assert.equal(new Set(e.organisms.map(a=>a.id)).size, m.population); });
test('without food or regrowth all energy-dependent organisms die', () => { const e = new Engine({ population: 100, regrowth: false }); e.food.fill(0); e.step(1000); assert.equal(e.organisms.length, 0); assert.equal(e.deaths, 100); assert.equal(e.births, 0); });
test('batch size does not affect deterministic outcome', () => { const a = new Engine({ seed: 'batch', width: 32, height: 32, population: 100 }), b = new Engine({ seed: 'batch', width: 32, height: 32, population: 100 }); a.step(500); for (let i = 0; i < 50; i++) b.step(10); assert.equal(a.canonical(), b.canonical()); });

test('5000 claimants share a crowded cell equally under reversed storage', () => {
  const options = { seed: 'dense-claim', rule: 'dd01' as const, width: 8, height: 8, population: 5000, regrowth: false };
  const a = new Engine(options), b = new Engine(options);
  const cell = a.cell(3, 3);
  for (const e of [a, b]) {
    e.food.fill(0);
    e.food[cell] = 5001;
    for (const organism of e.organisms) {
      organism.x = 3;
      organism.y = 3;
      organism.genome.efficiency = 1;
      organism.genome.sensor = 1;
      organism.energy = 20000;
    }
  }
  b.organisms.reverse();
  for (const e of [a, b]) {
    e.step();
    e.assertValid();
    assert.equal(e.food[cell], 1);
    assert.equal(e.audit.consumed, 5000);
    assert.equal(e.audit.assimilated, 5000);
    assert.equal(e.audit.actions, 5000);
    assert.ok(e.organisms.every(organism => organism.energy === 19911));
  }
  assert.equal(a.canonical(), b.canonical());
});

test('eight seeded worlds conserve resources across batches, competition and lifecycle', () => {
  for (let i = 0; i < 8; i++) {
    const options = { seed: `ledger-${i}-🌱`, width: 16, height: 16, population: 32 + i * 7, mutationRate: i / 7 };
    const single = new Engine(options), batch = new Engine(options);
    for (let t = 0; t < 250; t++) {
      const energy = single.organisms.reduce((sum, a) => sum + a.energy, 0);
      const food = single.food.reduce((sum, f) => sum + f, 0);
      single.step();
      single.assertValid();
      const flow = single.audit;
      const newborns = single.organisms.filter(a => a.born === single.tick);
      assert.equal(newborns.reduce((sum, a) => sum + a.energy, 0), flow.transferred);
      assert.equal(flow.reproductionCost, newborns.length * 1200);
      assert.equal(flow.digestiveLoss + flow.assimilated, flow.consumed);
      assert.equal(single.food.reduce((sum, f) => sum + f, 0), food + flow.grown - flow.consumed);
      assert.equal(single.organisms.reduce((sum, a) => sum + a.energy, 0), energy + flow.assimilated - flow.dissipated - flow.reproductionCost);
    }
    batch.step(73);
    batch.organisms.reverse();
    batch.step(177);
    batch.assertValid();
    assert.equal(single.canonical(), batch.canonical());
  }
});

test('history is deterministic and bounded while preserving ancestry and Engine state', async () => {
  const { PopulationHistory, HISTORY_LIMITS } = await import('../src/core/history.ts');
  const config = { seed: 'lineage-integration', width: 48, height: 48, population: 180 };
  const original = new Engine(config), observed = new Engine(config);
  const a = new PopulationHistory(original, 16), b = new PopulationHistory(observed, 16);
  const untouched = new Engine(config);
  for (let i = 0; i < 5000; i++) {
    original.step(); a.observe(original);
    observed.step(); b.observe(observed);
    if (i % 100 === 0) { a.assertValid(original); b.assertValid(observed); }
  }
  untouched.step(5000);
  assert.equal(original.canonical(), untouched.canonical());
  assert.equal(observed.canonical(), untouched.canonical());
  assert.ok(original.births > 500 && original.deaths > 500);
  const v = a.view(original.organisms.at(-1)?.id ?? null, null, 32);
  assert.deepEqual(v, b.view(observed.organisms.at(-1)?.id ?? null, null, 32));
  assert.ok(v.top.length && v.top[0].maxGeneration > 2);
  assert.ok(v.ancestors.length <= 32);
  assert.equal(a.storage.recent, 16);
  assert.equal(a.storage.events, HISTORY_LIMITS.events);
  assert.ok(a.storage.droppedEvents > 0);
  assert.equal(a.counts.living + a.counts.extinct, config.population);
  assert.ok(v.events.every((e, i, es) => i === 0 || es[i - 1].id > e.id));
  const events = v.events.filter(e => e.kind === 'population-crisis');
  assert.ok(events.every((e, i) => i === 0 || events[i - 1].tick - e.tick >= 300));
});
