import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { gameWorld, TUNING } from '../src/core/game.ts';
import { capture, decode, encode, restore } from '../src/snapshot.ts';

const hash = value => createHash('sha256').update(value).digest('hex');
const digest = ({engine, genealogy, game}) => ({
  engine: hash(engine.canonical()),
  genealogy: hash(JSON.stringify(genealogy.snapshot())),
  game: hash(JSON.stringify(game.snapshot()))
});
async function checkpoint(world) {
  const {engine, genealogy, game} = world;
  const state = { ...capture(engine, genealogy), game: game.snapshot() };
  const file = await encode(state, 'Game checkpoint', '2026-11-22T00:00:00.000Z');
  const restored = restore((await decode(file.text)).state);
  assert.deepEqual(digest(restored), digest(world));
  return { world: restored, sha256: file.manifest.checksum };
}

async function run(seed, habitat, founder, replay, batch = 1) {
  let world = gameWorld(seed, habitat);
  const commands = [], checkpoints = [];
  const started = performance.now();
  let restored = false, elapsed = 0;
  const timings = [];
  const send = (action, accepted = true) => {
    const {engine, genealogy, game} = world;
    commands.push({tick:engine.tick, action, accepted});
    const receipt = game.command(action, engine, genealogy);
    assert.equal(receipt.accepted, accepted);
    const state = game.snapshot();
    assert.deepEqual(game.command(action, engine, genealogy), receipt);
    assert.deepEqual(game.snapshot(), state);
  };
  if (!replay) send({id:1,kind:'choose',founder});
  while (world.engine.tick < 1200) {
    for (let i = 0; i < batch && world.engine.tick < 1200; i++) {
      const {engine, game, genealogy} = world;
      if (replay) {
        for (const item of replay.filter(c => c.tick === engine.tick)) send(item.action, item.accepted);
      } else {
        const view = game.view(genealogy);
        if (engine.tick === 0) send({id:2,kind:'buy',card:'mobility'}, false);
        if (game.ep >= TUNING.price && !game.active && view.attempts.length < 2) {
          send({id:commands.length+1,kind:'buy',card:view.attempts.length?'fertility':'nutrition'});
        }
      }
      if (!replay && game.active && engine.tick===game.active.start+1) {
        send({id:commands.length+1,kind:'buy',card:'mobility'},false);
      }
      if (!game.ready) break;
      const before = performance.now();
      game.step(engine, genealogy);
      const duration = performance.now()-before;
      elapsed += duration;
      timings.push(duration);
      if (game.active && !restored && engine.tick === game.active.start+30) {
        const saved = await checkpoint(world);
        checkpoints.push({tick:engine.tick, sha256:saved.sha256});
        if (replay) world = saved.world;
        restored = true;
      }
    }
    if (!world.game.ready) break;
  }
  const saved = await checkpoint(world);
  const view = world.game.view(world.genealogy);
  assert.ok(view.ep >= 0);
  assert.equal(view.spent, view.attempts.length*TUNING.price);
  assert.equal(view.achievement, view.line.born > 1 ? TUNING.achievementEP : 0);
  assert.ok(view.renewal <= TUNING.maxRenewals*TUNING.renewalEP);
  assert.ok(view.sustained <= TUNING.maxWindows*TUNING.windowEP);
  assert.ok(view.attempts.every(a=>a.introduced <= TUNING.introductions && a.end-a.start === TUNING.duration));
  timings.sort((a,b)=>a-b);
  return {seed, habitat, founder, tick:world.engine.tick, world:world.engine.metrics(), game:view,
    commands, checkpoints, finalSave:saved.sha256, sha256:digest(world),
    performance:{wallMs:performance.now()-started, stepMs:elapsed, tps:timings.length*1000/elapsed,
      p50Ms:timings[Math.floor(timings.length*.5)], p95Ms:timings[Math.floor(timings.length*.95)], rssBytes:process.memoryUsage.rss()}};
}

const scenarios = [['coral-42','garden',1],['dune','scarce',1],['fern','scarce',2],['zero','empty',1]];
const results = [];
for (const params of scenarios) {
  const direct = await run(...params);
  const replay = await run(...params, direct.commands, 17);
  for (const key of ['sha256','checkpoints','finalSave','commands']) assert.deepEqual(replay[key], direct[key]);
  results.push(direct);
}
assert.deepEqual(results.map(r=>r.game.attempts.map(a=>a.established)), [[true,true],[true,false],[false],[]]);
assert.deepEqual(results.map(r=>r.game.lost), [false,false,true,true]);
const output = process.env.DD_EVIDENCE_DIR || 'outputs/verification';
await mkdir(output,{recursive:true});
await writeFile(output+'/game-replay.json',JSON.stringify({status:'PASS',batchSizes:[1,17],results},null,2)+'\n');
for (const {seed,tick,game,performance,sha256} of results) console.log(seed,tick,game.attempts.map(a=>[a.start,a.endingCount,a.established]),game.lost,Math.round(performance.tps),sha256.game);
