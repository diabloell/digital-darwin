import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/core/engine.ts';
test('1000-organism real ecology births, deaths and valid metrics', () => { const e = new Engine({ seed: 'dd00-integration' }); e.step(1000); e.assertValid(); const m = e.metrics(); assert.ok(m.births > 0); assert.ok(m.deaths > 0); assert.equal(m.population, 1000 + m.births - m.deaths); assert.ok(m.maxGeneration > 0); assert.equal(new Set(e.organisms.map(a=>a.id)).size, m.population); });
test('without food or regrowth all energy-dependent organisms die', () => { const e = new Engine({ population: 100, regrowth: false }); e.food.fill(0); e.step(1000); assert.equal(e.organisms.length, 0); assert.equal(e.deaths, 100); assert.equal(e.births, 0); });
test('batch size does not affect deterministic outcome', () => { const a = new Engine({ seed: 'batch', width: 32, height: 32, population: 100 }), b = new Engine({ seed: 'batch', width: 32, height: 32, population: 100 }); a.step(500); for (let i = 0; i < 50; i++) b.step(10); assert.equal(a.canonical(), b.canonical()); });

test('5000 claimants share a crowded cell equally under reversed storage', () => {
  const options = { seed: 'dense-claim', width: 8, height: 8, population: 5000, regrowth: false };
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
