import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {Engine} from '../src/core/engine.ts';
import {gameWorld} from '../src/core/game.ts';
import {capture,decode,encode,restore} from '../src/snapshot.ts';

const output=process.env.DD_EVIDENCE_DIR||'outputs/verification';
await mkdir(output,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const hashes=({engine,game,genealogy})=>({
  engine:sha(engine.canonical()),ecology:sha(JSON.stringify(engine.ecology.snapshot())),
  history:sha(JSON.stringify(genealogy.snapshot())),game:sha(JSON.stringify(game.snapshot())),planet:sha(JSON.stringify(engine.planet))
});
const date='2026-11-23T00:00:00.000Z';
const checkpoint=async world=>{
  const state={...capture(world.engine,world.genealogy),game:world.game.snapshot()};
  const record=await encode(state,'Ecology in crisis',date);
  const restored=restore((await decode(record.text)).state);
  assert.deepEqual(hashes(restored),hashes(world));
  const invalid=structuredClone(state);
  invalid.engine.ecology.pressure[0]=17;
  const damaged=await encode(invalid,'Invalid ecology',date);
  await assert.rejects(decode(damaged.text),/Некорректная сетка экологии/);
  return {world:restored,checksum:record.manifest.checksum,tick:world.engine.tick};
};

function observed(world,founder) {
  const {engine,genealogy}=world;
  const zones=new Set(), elsewhere=new Set();
  let exposed=0,ownFood=0;
  for(const a of engine.organisms){
    const cell=engine.cell(a.x,a.y),own=genealogy.founder(a.id)===founder;
    (own?zones:elsewhere).add(cell);
    if(own&&engine.ecology.collapsed[cell])exposed++;
    if(own&&a.lastActionTick===engine.tick)ownFood+=engine.ecology.harvest[cell]/engine.ecology.demand[cell];
  }
  return {metrics:engine.metrics(),line:genealogy.summary(founder),zones:zones.size,competitorZones:elsewhere.size,
    exposed,ownFood:ownFood/1000,crisis:engine.ecology.collapses-engine.ecology.recoveries,
    collapses:engine.ecology.collapses,recoveries:engine.ecology.recoveries};
}
const comparisons=[];
for(const competitors of [true,false]){
  const world=gameWorld('amber','garden',true,true,true);
  const {engine,game,genealogy}=world;
  const founder=58;
  assert.ok(game.command({id:1,kind:'choose',founder},engine,genealogy).accepted);
  const initial={founder:structuredClone(engine.organisms[founder-1]),food:engine.metrics().food,rng:[...engine.rng.state]};
  // Experimental removal before first demand. The production UI always starts with 80 active founders.
  if(!competitors)for(const a of engine.organisms)if(a.id!==founder)a.energy=0;
  const totals={consumed:0,withheld:0,ownSurvivorFood:0};
  const trends=[];
  const niches=[{actions:0,moved:0,food:0,upkeep:0},{actions:0,moved:0,food:0,upkeep:0}];
  let collapse=0,recovery=0;
  while(engine.tick<397){
    game.step(engine,genealogy);
    const obs=observed(world,founder);
    if(!collapse&&obs.collapses)collapse=engine.tick;
    if(!recovery&&obs.recoveries)recovery=engine.tick;
    if(engine.tick%50===0||engine.tick===397)trends.push(obs);
    totals.consumed+=engine.audit.consumed;
    totals.withheld+=engine.ecology.withheld;
    totals.ownSurvivorFood+=obs.ownFood;
    for(const [i,n] of niches.entries())for(const key of Object.keys(n))n[key]+=engine.ecology.niches[i][key];
  }
  engine.assertValid();
  comparisons.push({competitors,initial,collapse,recovery,totals,trends,niches,final:observed(world,founder)});
}
assert.deepEqual(comparisons[0].initial,comparisons[1].initial);
assert.equal(comparisons[0].final.line.living,0);
assert.ok(comparisons[1].final.line.living>0);
assert.ok(comparisons[0].collapse&&comparisons[0].recovery&&comparisons[0].totals.withheld>0);
assert.ok(comparisons[0].totals.consumed>comparisons[1].totals.consumed);
assert.ok(comparisons[0].totals.ownSurvivorFood<comparisons[1].totals.ownSurvivorFood);
const [local,roaming]=comparisons[0].niches;
assert.ok(roaming.moved/roaming.actions>local.moved/local.actions);

const crisisControl=[];
for(const suppress of [false,true]){
  const world=gameWorld('coral-42','garden',true,true,true);
  const {engine,game,genealogy}=world;
  game.command({id:1,kind:'choose',founder:73},engine,genealogy);
  if(suppress){
    // Keep the measured thresholds and decisions, but restore all growth in the control.
    const renew=engine.ecology.renew.bind(engine.ecology);
    engine.ecology.renew=(cell,growth,space)=>{renew(cell,growth,space);return Math.min(growth,space);};
  }
  let grown=0;
  while(engine.tick<280&&game.ready){
    game.step(engine,genealogy);
    grown+=engine.audit.grown;
  }
  assert.equal(engine.tick,280);
  engine.assertValid();
  const positions=engine.organisms.map(a=>[a.id,engine.cell(a.x,a.y)]);
  crisisControl.push({suppress,grown,positionsHash:sha(JSON.stringify(positions)),...observed(world,73)});
}
assert.notEqual(crisisControl[0].positionsHash,crisisControl[1].positionsHash);
assert.notEqual(crisisControl[0].grown,crisisControl[1].grown);
assert.notEqual(crisisControl[0].metrics.food,crisisControl[1].metrics.food);

const command=(world,action)=>world.game.command(action,world.engine,world.genealogy);
const step=world=>world.game.step(world.engine,world.genealogy);
const fresh=()=>gameWorld('coral-42','garden',true,true,true);
const start=()=>{const w=fresh();assert.ok(command(w,{id:1,kind:'choose',founder:73}).accepted);return w;};
const world=start();
const actions=[];
let saved;
while(world.engine.tick<330){
  if(world.game.ep>0&&!actions.length){
    const card=world.game.view(world.genealogy,world.engine).tree.offered[0];
    const action={id:2,kind:'buy',card};
    assert.ok(command(world,action).accepted);
    actions.push({tick:world.engine.tick,action});
  }
  step(world);
  if(saved)step(saved.world);
  if(!saved&&world.game.active&&world.engine.ecology.collapses>world.engine.ecology.recoveries)saved=await checkpoint(world);
}
assert.ok(saved);
assert.deepEqual(hashes(saved.world),hashes(world));
const replay=start();
for(let end=17;replay.engine.tick<330;end+=17){
  while(replay.engine.tick<Math.min(end,330)){
    const event=actions.find(a=>a.tick===replay.engine.tick);
    if(event)assert.ok(command(replay,event.action).accepted);
    step(replay);
  }
}
assert.deepEqual(hashes(replay),hashes(world));
const engineCases=[1,17].map(batch=>{
  const engine=new Engine({seed:'coral-42',width:40,height:40,population:80,planet:1,ecology:1});
  for(let tick=0;tick<340;tick+=batch)engine.step(batch);
  engine.assertValid();
  return sha(engine.canonical());
});
assert.equal(engineCases[0],engineCases[1]);

const timings=[];
for(const ecology of [false,true,false,true]){
  const e=new Engine({seed:'dd11-performance',population:5000,...(ecology?{ecology:1}:{})});
  e.step(40);
  const samples=[];
  for(let i=0;i<120;i++){
    const start=performance.now();e.step();samples.push(performance.now()-start);
  }
  e.assertValid();
  samples.sort((a,b)=>a-b);
  timings.push({ecology,tps:120000/samples.reduce((a,b)=>a+b,0),p95Ms:samples[114],rssBytes:process.memoryUsage.rss(),population:e.organisms.length});
}
const result={status:'PASS',comparisons,crisisControl,replay:{actions,checkpoint:{tick:saved.tick,checksum:saved.checksum},hashes:hashes(world),engineBatch:engineCases[0]},timings};
await writeFile(output+'/ecology-smoke.json',JSON.stringify(result,null,2)+'\n');
console.log('Ecology smoke PASS',comparisons.map(x=>[x.competitors,x.collapse,x.recovery,x.final.line.living]),result.replay.checkpoint);
