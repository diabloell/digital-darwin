import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { Engine } from '../src/core/engine.ts';
import { PopulationHistory } from '../src/core/history.ts';
import { capture, decode, encode, restore, sha256 } from '../src/snapshot.ts';
const seeds = ['dd05-alpha', 'dd05-beta', '🌱-рост', '青い🌲', 'dd05-omega'];
const output = process.env.DD_EVIDENCE_DIR || 'outputs/verification';
const date = '2026-11-22T00:00:00.000Z';

function create(config) {
  const engine = new Engine(config);
  return { engine, genealogy: new PopulationHistory(engine) };
}
function advance(world, ticks) {
  for (let i = 0; i < ticks; i++) {
    world.engine.step();
    world.genealogy.observe(world.engine);
  }
}
async function save(world) {
  return encode(capture(world.engine, world.genealogy), 'Replay fixture', date);
}
async function reload(world) {
  const { text } = await save(world);
  world.engine = undefined;
  world.genealogy = undefined;
  return restore((await decode(text)).state);
}
async function compare(a, b) {
  const engineA = a.engine.canonical(), engineB = b.engine.canonical();
  const historyA = JSON.stringify(a.genealogy.snapshot()), historyB = JSON.stringify(b.genealogy.snapshot());
  assert.equal(engineA, engineB);
  assert.deepEqual(a.engine.snapshot(), b.engine.snapshot());
  assert.equal(historyA, historyB);
  return { engineContinuous: await sha256(engineA), engineRestored: await sha256(engineB),
    historyContinuous: await sha256(historyA), historyRestored: await sha256(historyB),
    tick: a.engine.tick, metrics: a.engine.metrics(), lineages: a.genealogy.counts, storage: a.genealogy.storage };
}
const results = [];
for (const seed of seeds) {
  const config = { seed, width: 32, height: 32, population: 140 };
  const a = create(config);
  let b = create(config);
  advance(a, 6000);
  advance(b, 5000);
  b = await reload(b);
  advance(b, 1000);
  results.push({ config, ...await compare(a,b) });
}
const config = { seed: 'dd05-repeat', width: 32, height: 32, population: 180 };
const a = create(config);
let b = create(config);
const checkpoints = [0, 25, 1234, 5000, 8001, 10000];
let tick = 0;
for (const checkpoint of checkpoints) {
  advance(b, checkpoint - tick);
  tick = checkpoint;
  const before = await save(b);
  b = await reload(b);
  assert.equal((await save(b)).text, before.text);
}
advance(a, 10000);
const repeat = { checkpoints, ...await compare(a,b) };
await mkdir(output, { recursive: true });
await writeFile(`${output}/replay.json`, JSON.stringify({ status: 'PASS', results, repeat }, null, 2) + '\n');
console.log('Replay PASS: five 6000 vs 5000 + 1000 worlds and six restore points over 10000 ticks');
