import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {Engine} from '../src/core/engine.ts';
import {gameWorld} from '../src/core/game.ts';
import {cycle, generatePlanet, PERIOD} from '../src/core/planet.ts';
import {capture,decode,encode,restore} from '../src/snapshot.ts';

const sha = data => createHash('sha256').update(data).digest('hex');
const canonical = world => [world.engine.canonical(), JSON.stringify(world.genealogy.snapshot()), JSON.stringify(world.game.snapshot())].map(sha);
const time = '2026-11-23T00:00:00.000Z';
const output = process.env.DD_EVIDENCE_DIR || 'outputs/verification';
await mkdir(output,{recursive:true});
const fixedSaves = await Promise.all(['dd05-v1','dd07-game-v1'].map(async name => {
  const {manifest,state} = await decode((await readFile(`tests/fixtures/${name}.ddworld.json`,'utf8')).trim());
  const {engine,game,genealogy} = restore(state);
  assert.equal(engine.planet,undefined);
  if (name.startsWith('dd07')) {
    assert.equal(game.active.card,'nutrition');
    assert.equal(game.snapshot().spent,5);
    game.step(engine,genealogy);
  }
  return {name,checksum:manifest.checksum,tick:manifest.tick};
}));
const cases = [];
for (const seed of ['coral-42','dune','amber']) {
  const {engine,game,genealogy} = gameWorld(seed,'garden',true);
  const {layers,...profile} = engine.planet;
  assert.deepEqual(engine.planet,generatePlanet(seed,40,40));
  assert.equal(profile.temperature,.20 + .58 * profile.light);
  assert.ok(profile.water + .20 * profile.temperature >= .31 && profile.water + .20 * profile.temperature <= .92);
  assert.ok(Object.values(layers).every(layer=>layer.every(v=>v<=100)));
  const statistics = {};
  for (const [name, values] of Object.entries({...layers,capacity:engine.capacity,baseGrowth:engine.growth})) {
    statistics[name] = {min:Math.min(...values),max:Math.max(...values),mean:values.reduce((a,b)=>a+b,0)/values.length};
  }
  const shifts = [];
  for(let i=0;i<layers.fertility.length;i++)shifts.push(Math.abs(layers.fertility[i]-layers.fertility[Math.floor(i/40)*40+(i+1)%40]));
  assert.ok(Math.max(...shifts)<statistics.fertility.max-statistics.fertility.min);
  const founders = 73;
  const initial = engine.metrics();
  game.command({id:1,kind:'choose',founder:founders},engine,genealogy);
  const current = {engine,game,genealogy};
  let id=1, restored, checkpoint;
  const commands=[];
  for(let i=0;i<800;i++){
    if (game.ready) {
      if(game.ep>=5&&!game.active&&game.snapshot().attempts.length<2) {
        const action={id:++id,kind:'buy',card:id===2?'nutrition':'fertility'};
        assert.equal(game.command(action,engine,genealogy).accepted,true);
        commands.push({tick:engine.tick,action});
        if (restored) assert.equal(restored.game.command(action,restored.engine,restored.genealogy).accepted,true);
      }
      game.step(engine,genealogy);
      if (restored) restored.game.step(restored.engine,restored.genealogy);
    } else {
      // Compare the whole ecosystem at the same tick after the player's run ends.
      engine.step();genealogy.observe(engine);
    }
    if(seed==='coral-42'&&engine.tick===103) {
      assert.ok(game.active);
      const state = {...capture(engine,genealogy),game:game.snapshot()};
      const save=await encode(state,'Planet checkpoint',time);
      checkpoint={tick:engine.tick,checksum:save.manifest.checksum,phase:cycle(engine.tick)};
      restored=restore((await decode(save.text)).state);
      assert.deepEqual(restored.engine.planet,engine.planet);
      assert.deepEqual(canonical(restored),canonical(current));
      const bad=structuredClone(state);
      bad.engine.growth[0]++;
      const tampered=await encode(bad,'Unsupported terrain',time);
      const invalid = (await decode(tampered.text)).state;
      assert.throws(()=>restore(invalid),/Invalid planet resource cell/);
    }
  }
  engine.assertValid();
  const hashes=canonical(current);
  if(restored) {
    assert.equal(game.snapshot().attempts.length,2);
    assert.equal(game.ready,true);
    assert.deepEqual(canonical(restored),hashes);
    const replay=gameWorld(seed,'garden',true);
    assert.equal(replay.game.command({id:1,kind:'choose',founder:founders},replay.engine,replay.genealogy).accepted,true);
    for(let tick=0;tick<800;tick++){
      const command=commands.find(c=>c.tick===tick);
      if(command)assert.equal(replay.game.command(command.action,replay.engine,replay.genealogy).accepted,true);
      replay.game.step(replay.engine,replay.genealogy);
    }
    assert.deepEqual(canonical(replay),hashes);
  }
  cases.push({seed,founder:founders,initial,profile,statistics,final:engine.metrics(),line:game.view(genealogy).line,
    attempts:game.snapshot().attempts,cycle:cycle(engine.tick),hashes,commands,checkpoint,restoredContinuation:!!restored});
}
assert.equal(new Set(cases.map(c=>c.statistics.fertility.mean)).size,3);
const climate = [1, PERIOD/2].map(tick=>{
  const engine = new Engine({seed:'coral-42',width:40,height:40,population:0,planet:1});
  engine.food.fill(0);
  engine.tick=tick-1;
  engine.step();
  assert.equal(engine.metrics().food,engine.audit.grown/1000);
  engine.assertValid();
  return {cycle:cycle(tick),grown:engine.audit.grown};
});
assert.ok(climate[1].grown>climate[0].grown);
const timing = [];
for(const planet of [false,true,false,true]){
  const {engine}=gameWorld('coral-42','garden',planet);
  engine.step(80);
  const start = performance.now();
  engine.step(500);
  timing.push({planet,tps:500000/(performance.now()-start),rssBytes:process.memoryUsage.rss(),final:engine.metrics()});
}
await writeFile(output+'/planet-smoke.json',JSON.stringify({status:'PASS',fixedSaves,cases,climate,timing},null,2)+'\n');
console.log('Planet smoke PASS:',cases.map(c=>[c.seed,c.final.population,c.final.births,c.final.food]),climate);
