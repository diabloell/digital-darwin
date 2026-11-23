import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { cycle } from '../src/core/planet.ts';
import { gameWorld } from '../src/core/game.ts';
import { capture, decode, encode, restore } from '../src/snapshot.ts';

const sha = text => createHash('sha256').update(text).digest('hex');
const hashes = ({engine,game,genealogy}) => ({
  engine:sha(engine.canonical()), game:sha(JSON.stringify(game.snapshot())), history:sha(JSON.stringify(genealogy.snapshot())),
  planet:engine.planet?sha(JSON.stringify(engine.planet)):null
});
const date = '2026-11-23T00:00:00.000Z';
const output=process.env.DD_EVIDENCE_DIR||'outputs/verification';
await mkdir(output,{recursive:true});

const checkpoint = async world => {
  const file=await encode({...capture(world.engine,world.genealogy),game:world.game.snapshot()},'Evolution tree',date);
  const saved=restore((await decode(file.text)).state);
  assert.deepEqual(hashes(saved),hashes(world));
  return {world:saved,tick:world.engine.tick,checksum:file.manifest.checksum};
};
const command = (world,action) => world.game.command(action,world.engine,world.genealogy);
const advance = world => world.game.step(world.engine,world.genealogy);
const view = world => world.game.view(world.genealogy,world.engine);
const creation = (seed,planet,founder) => {
  const world=gameWorld(seed,'garden',planet,true);
  assert.ok(command(world,{id:1,kind:'choose',founder}).accepted);
  return world;
};
const programme = async (world, action, midpoint) => {
  const {engine,game}=world;
  const tick=engine.tick;
  const ep=game.ep;
  const receipt=command(world,action);
  assert.ok(receipt.accepted,receipt.reason);
  const state=game.snapshot();
  assert.deepEqual(command(world,action),receipt);
  assert.deepEqual(game.snapshot(),state);
  assert.equal(ep-game.ep,game.active.quote.price);
  const rejected={id:action.id+1,kind:'buy',card:action.card};
  assert.equal(command(world,rejected).accepted,false);
  const attempts=state.attempts.length;
  let saved;
  const observations=[];
  while(game.active&&game.ready) {
    advance(world);
    if(engine.tick===tick+midpoint) saved=await checkpoint(world);
    else if(saved) advance(saved.world);
    if(engine.tick%20===0)observations.push({tick:engine.tick,line:view(world).line.living,
      population:engine.metrics().population,food:engine.metrics().food,light:engine.planet?cycle(engine.tick).lightPercent:null,sample:game.snapshot().samples.at(-1)});
  }
  assert.equal(game.snapshot().attempts.length,attempts);
  if(saved)assert.deepEqual(hashes(saved.world),hashes(world));
  return {buy:{tick,action},reject:{tick,action:rejected},attempt:game.snapshot().attempts.at(-1),
    checkpoint:saved&&{tick:saved.tick,checksum:saved.checksum},observations};
};

const scenarios=[];
for(const [seed,planet,founder] of [['coral-42',true,73],['coral-42',false,1],['amber',true,58]]) {
  const world=creation(seed,planet,founder);
  const minors=[];
  let id=2;
  while(world.game.ready&&world.engine.tick<1400) {
    const v=view(world);
    const key=v.tree.offered.find(card=>v.tree.rows.find(row=>row.card===card).quote.price<=v.ep);
    if(v.tree.offered.includes('local')&&v.tree.offered.includes('explorer'))break;
    if(key){
      minors.push(await programme(world,{id,kind:'buy',card:key},minors.length===0?32:0));
      id+=2;
    } else advance(world);
  }
  assert.equal(minors.length,10);
  assert.ok(minors[0].checkpoint);
  assert.ok(minors.some(p=>!p.attempt.established));
  const origin=await checkpoint(world);
  const choices=view(world).tree.rows.filter(r=>r.card==='local'||r.card==='explorer');
  if(founder===73)assert.deepEqual(choices.map(r=>r.quote.price),[4,7]);
  const runs=[];
  for(const key of founder===73?['local','explorer']:founder===58?['local']:['explorer']) {
    const candidate=(await checkpoint(world)).world;
    const run=await programme(candidate,{id,kind:'buy',card:key},45);
    assert.ok(run.checkpoint);
    const terminal=view(candidate);
    const replay=creation(seed,planet,founder);
    const journal=[...minors,run].flatMap(row=>[row.buy,row.reject]);
    let next=0;
    for(let limit=17;replay.engine.tick<candidate.engine.tick;limit+=17){
      while(replay.engine.tick<Math.min(limit,candidate.engine.tick)){
        while(journal[next]?.tick===replay.engine.tick){
          const item=journal[next];
          assert.equal(command(replay,item.action).accepted,next%2===0);
          next++;
        }
        advance(replay);
      }
    }
    assert.equal(next,journal.length);
    assert.deepEqual(hashes(replay),hashes(candidate));
    assert.equal(terminal.spent,10+run.attempt.quote.price);
    runs.push({key,run,journal,hashes:hashes(candidate),ep:{balance:terminal.ep,spent:terminal.spent,
      renewal:terminal.renewal,sustained:terminal.sustained,achievement:terminal.achievement},
      metrics:candidate.engine.metrics(),line:terminal.line,live:terminal.attempts.at(-1).carriers});
  }
  if(founder!==73)assert.ok(runs.some(r=>r.run.attempt.established===true && r.live>0));
  scenarios.push({seed,planet,founder,choices,origin:{tick:origin.tick,checksum:origin.checksum},minors,runs});
}

const empty=gameWorld('zero','empty',true,true);
assert.ok(command(empty,{id:1,kind:'choose',founder:1}).accepted);
assert.equal(command(empty,{id:2,kind:'buy',card:'nutrition'}).accepted,false);
while(empty.game.ready&&empty.engine.tick<400)advance(empty);
assert.equal(empty.game.ready,false);
assert.equal(empty.game.ep,0);
assert.equal(view(empty).line.born,1);
const legacy=[];
for(const name of ['dd05-v1','dd07-game-v1']){
  const {state,manifest}=await decode((await readFile(`tests/fixtures/${name}.ddworld.json`,'utf8')).trim());
  const world=restore(state);
  assert.notEqual(world.game?.snapshot().version,2);
  if(world.game)advance(world);
  legacy.push({name,checksum:manifest.checksum});
}
const performance=[];
for(const tree of [false,true,false,true]){
  const world=gameWorld('coral-42','garden',false,tree);
  command(world,{id:1,kind:'choose',founder:1});
  const start=globalThis.performance.now();
  for(let i=0;i<800;i++){
    advance(world);
    if(i%20===0)view(world);
  }
  performance.push({tree,tps:800000/(globalThis.performance.now()-start),rssBytes:process.memoryUsage.rss(),alive:world.engine.organisms.length});
}
await writeFile(output+'/tree-smoke.json',JSON.stringify({status:'PASS',scenarios,legacy,extinctionTick:empty.engine.tick,performance},null,2)+'\n');
console.log('Tree smoke PASS',scenarios.map(s=>[s.seed,s.planet,s.origin.tick,s.runs.map(r=>[r.key,r.run.attempt.introduced,r.live])]));
