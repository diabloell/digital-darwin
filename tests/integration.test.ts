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

test('mass births, retained ancestry, pending events and extinction round trip', async () => {
  const { PopulationHistory } = await import('../src/core/history.ts');
  const { capture, decode, encode, restore } = await import('../src/snapshot.ts');
  const e = new Engine({ seed: 'dd05-archive', width: 32, height: 32, population: 40, regrowth: false });
  const h = new PopulationHistory(e, 12);
  for (let i=0;i<44;i++) { e.step(); h.observe(e); }
  for (const a of e.organisms) a.energy = 80000;
  e.step(); h.observe(e);
  assert.equal(e.lastBirths.length, 40);
  const roundtrip = async () => {
    const file = await encode(capture(e,h), 'Мир', '2026-11-22T00:00:00.000Z');
    const copy = restore((await decode(file.text)).state);
    assert.deepEqual(capture(copy.engine,copy.genealogy), capture(e,h));
    return copy;
  };
  await roundtrip();
  e.food.fill(0);
  for (const a of e.organisms) if (a.parent === null) a.energy = 1;
  e.step(); h.observe(e);
  assert.equal(e.lastDeaths.length, 40);
  const loaded = await roundtrip();
  assert.equal(loaded.genealogy.view(41,null).ancestors[0].died, 46);
  assert.equal(loaded.genealogy.storage.pinned, 40);
  for (const a of e.organisms) a.energy = 1;
  e.step(); h.observe(e);
  assert.equal(e.organisms.length, 0);
  const extinct = await roundtrip();
  assert.equal(extinct.genealogy.counts.extinct, 40);
  assert.equal(extinct.genealogy.view(null,null).events.filter(e => e.kind === 'extinction').length, 1);
});

test('lab pairs preserve founders and RNG and uniform landscape conserves integer totals', async ()=>{
  const { SCENARIOS }=await import('../src/lab/definition.ts');
  const { runSeries }=await import('../src/lab/runner.ts');
  const d={...SCENARIOS[3],duration:150,interval:25,seeds:['🌱','🌲'],replicas:2};
  const a=await runSeries(d,{environment:'test'}),b=await runSeries(d,{environment:'test'});
  assert.equal(a.status,'completed');
  assert.equal(a.scenarioHash,b.scenarioHash);
  assert.notEqual(a.seriesId,b.seriesId);
  assert.deepEqual(a.runs.map(r=>r.hash),b.runs.map(r=>r.hash));
  for(const seed of d.seeds) {
    const rows=a.runs.filter(r=>r.seed===seed);
    assert.equal(rows.length,4);
    assert.equal(new Set(rows.map(r=>r.origin?.founders)).size,1);
    assert.equal(new Set(rows.map(r=>r.origin?.rng)).size,1);
    assert.equal(new Set(rows.map(r=>JSON.stringify(r.origin?.totals))).size,1);
    assert.notEqual(rows[0].origin?.resources,rows[1].origin?.resources);
    assert.deepEqual(rows[0].config,rows[1].config);
    for(const r of rows) {
      const last=r.trajectory.at(-1)!;
      assert.equal(r.trajectory.slice(1).reduce((sum,p)=>sum+(p.values.intervalBirths??0),0),last.values.births);
      assert.equal(last.values.population,r.genetics?.live.population);
    }
  }
});
test('lab preserves extinct, failed and interrupted runs without filling undefined effects', async ()=>{
  const { SCENARIOS }=await import('../src/lab/definition.ts');
  const { runSeries }=await import('../src/lab/runner.ts');
  const { pack,unpack }=await import('../src/lab/archive.ts');
  const { compare,csv,markdown }=await import('../src/lab/comparison.ts');
  const d={...SCENARIOS[2],duration:30,interval:10,seeds:['☀'],replicas:1,initial:{width:8,height:8,population:0}};
  const empty=await runSeries(d,{environment:'test'});
  assert.ok(empty.runs.every(r=>r.extinct===0&&r.final?.population===0&&r.final.energy===null));
  assert.deepEqual(compare(empty,'population').map(c=>c.extinct),[1,1]);
  assert.equal(compare(empty,'energy')[1].effect.n,0);
  assert.equal(empty.runs[0].genetics?.lifetime.outsideFounderBirths,0);
  const failed=await runSeries(d,{environment:'test',afterTick:()=>{throw Error('fixture failure');}});
  assert.equal(failed.status,'failed');
  assert.ok(failed.runs.every(r=>r.status==='failed'&&r.error==='fixture failure'));
  assert.equal(compare(failed,'population')[1].pairs[0].status,'incomplete');
  let stop=false;
  const partial=await runSeries(d,{environment:'test',cancelled:()=>stop,afterTick:e=>{if(e.tick===2)stop=true;}});
  assert.equal(partial.status,'partial');
  assert.deepEqual(partial.runs.map(r=>r.status),['cancelled','not-run']);
  const archive=await pack(partial);
  assert.deepEqual(await unpack(archive),partial);
  const broken=JSON.parse(archive);broken.payload+=' ';
  await assert.rejects(unpack(JSON.stringify(broken)),/SHA-256/);
  broken.format=99;
  await assert.rejects(unpack(JSON.stringify(broken)),/формат/);
  assert.match(csv(partial),/not-run/);
  assert.match(markdown(partial),new RegExp(partial.scenarioHash));
  assert.match(markdown(failed),/fixture failure/);
});
test('mutation OFF produces no new genotypes after actual births',async()=>{
  const { SCENARIOS }=await import('../src/lab/definition.ts');
  const { runSeries }=await import('../src/lab/runner.ts');
  const a=await runSeries({...SCENARIOS[2],duration:220,interval:20,seeds:['dd02-amber'],replicas:1},{environment:'test'});
  assert.ok(a.runs[0].final!.births!>0);
  assert.equal(a.runs[0].final?.outsideFounder,0);
  assert.equal(a.runs[0].final?.mutations,0);
});
