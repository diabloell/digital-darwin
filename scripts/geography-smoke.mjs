import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {Ecology} from '../src/core/ecology.ts';
import {Engine} from '../src/core/engine.ts';
import {releaseWorld} from '../src/core/game.ts';
import {categorize,REGIONS} from '../src/core/geography.ts';
import {cycle,seasonalGrowth} from '../src/core/planet.ts';
import {capture,decode,encode,restore} from '../src/snapshot.ts';

const output=process.env.DD_EVIDENCE_DIR||'outputs/verification';
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const checkpoint=w=>({...capture(w.engine,w.genealogy),game:w.game.snapshot()});
const results=[];
for(const seed of ['dune','amber','slate']){
  // Keep the entire ecosystem running even when one lineage dies.
  const {engine}=releaseWorld(seed,'garden',true);
  const ids=categorize(engine.planet.layers);
  const {water,temperature,fertility}=engine.planet.layers;
  const regionStats=REGIONS.map(({name},i)=>{
    const cells=Array.from(ids.keys()).filter(cell=>ids[cell]===i);
    if(!cells.length)return {name,cells:0};
    const mean=fn=>cells.reduce((sum,cell)=>sum+fn(cell),0)/cells.length;
    return {name,cells:cells.length,water:mean(c=>water[c]),heat:mean(c=>temperature[c]),fertility:mean(c=>fertility[c]),
      capacity:mean(c=>engine.capacity[c]/1000),baseGrowth:mean(c=>engine.growth[c]/1000),
      growthAtMinimum:mean(c=>seasonalGrowth(engine.growth[c],water[c],0)/1000),
      growthAtMaximum:mean(c=>seasonalGrowth(engine.growth[c],water[c],160)/1000)};
  });
  const samples=[];
  let before=engine.food.slice();
  const emptyWindow=()=>REGIONS.map(()=>({grown:0,births:0,deaths:0}));
  let window=emptyWindow();
  const index=a=>ids[Math.floor(a.y)*engine.config.width+Math.floor(a.x)];
  for(let tick=1;tick<=320;tick++){
    engine.step();
    let actual=0;
    for(const [i,value] of engine.food.entries()){
      const grown=value+engine.ecology.harvest[i]-before[i];
      assert.ok(grown>=0);
      actual+=grown;
      window[ids[i]].grown+=grown;
    }
    assert.equal(actual,engine.audit.grown);
    before.set(engine.food);
    for(const {child} of engine.lastBirths)window[index(child)].births++;
    for(const a of engine.lastDeaths)window[index(a)].deaths++;
    if(tick%40)continue;
    const cells=REGIONS.map(()=>({stock:0,pressure:0,crisis:0,occupants:0,meanEnergy:0}));
    for(const a of engine.organisms){
      const r=cells[index(a)];r.occupants++;r.meanEnergy+=a.energy/1000;
    }
    for(const [i,id] of ids.entries()){
      const r=cells[id];r.stock+=engine.food[i]/1000;r.pressure+=engine.ecology.pressure[i];r.crisis+=engine.ecology.collapsed[i];
    }
    samples.push({tick,light:cycle(tick).lightPercent,world:engine.metrics(),regions:cells.map((r,i)=>({
      ...r,births:window[i].births,deaths:window[i].deaths,meanEnergy:r.occupants?r.meanEnergy/r.occupants:null,meanStock:regionStats[i].cells?r.stock/regionStats[i].cells:null,
      meanPressure:regionStats[i].cells?r.pressure/regionStats[i].cells:null,
      meanGrowthPerCellTick:regionStats[i].cells?window[i].grown/(40000*regionStats[i].cells):null
    }))});
    window=emptyWindow();
  }
  engine.assertValid();
  const replay=releaseWorld(seed,'garden',true).engine;
  for(let added=0;added<320;added+=13)replay.step(Math.min(13,320-added));
  assert.equal(replay.canonical(),engine.canonical());
  const controls=releaseWorld(seed,'garden',true).engine;
  controls.step(80);
  const initial=controls.snapshot();
  // Compare existing light extremes against the same resource gaps and pressure.
  const phasePair=[0,160].map(strength=>{
    const ecology=new Ecology(ids.length,initial.ecology);
    const regions=REGIONS.map(()=>0);
    for(const [i,region] of ids.entries()){
      const potential=seasonalGrowth(initial.growth[i],water[i],strength);
      regions[region]+=ecology.renew(i,potential,initial.capacity[i]-initial.food[i])/1000;
    }
    return {strength,regionalGrowth:regions};
  });
  // Freeze all regeneration in one branch to measure the effect of the existing rule.
  const resourcePair=[true,false].map(regrowth=>{
    const state=structuredClone(initial);
    state.config.regrowth=regrowth;
    const branch=new Engine({},state);
    const start=branch.metrics();
    let grown=0,consumed=0;
    for(let i=0;i<80;i++){
      branch.step();
      grown+=branch.audit.grown;
      consumed+=branch.audit.consumed;
    }
    branch.assertValid();
    return {regrowth,start,end:branch.metrics(),grown:grown/1000,consumed:consumed/1000};
  });
  const finalSha256=sha(engine.canonical());
  results.push({seed,regionStats,samples,phasePair,resourcePair,finalSha256});
}
assert.ok(results.filter(r=>r.regionStats.filter(s=>s.cells).length>=2).length>=2);

const world=releaseWorld('dune','garden',true);
const {game,engine,genealogy}=world;
assert.ok(game.command({id:1,kind:'choose',founder:40},engine,genealogy).accepted);
for(let i=0;i<45;i++)game.step(engine,genealogy);
assert.ok(game.command({id:2,kind:'buy',card:'mobility'},engine,genealogy).accepted);
while(engine.tick<110)game.step(engine,genealogy);
assert.ok(engine.ecology.collapses>engine.ecology.recoveries&&game.active);
const file=await encode(checkpoint(world),'DD-15 transition','2026-11-23T00:00:00.000Z');
const saved=restore((await decode(file.text)).state);
assert.deepEqual(checkpoint(saved),checkpoint(world));
while(engine.tick<240){
  saved.game.step(saved.engine,saved.genealogy);
  game.step(engine,genealogy);
}
assert.deepEqual(checkpoint(saved),checkpoint(world));
await mkdir(output,{recursive:true});
await writeFile(output+'/geography.json',JSON.stringify({results,restore:{version:4,startTick:110,endTick:240,checksum:file.manifest.checksum,finalSha256:sha(checkpoint(world))}},null,2)+'\n');
