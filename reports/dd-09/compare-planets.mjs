import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { gameWorld } from '../../src/core/game.ts';
import { Engine } from '../../src/core/engine.ts';

const {engine: common} = gameWorld('dd09-matched-founders','garden',true);
const results = [];
for (const seed of ['coral-42','dune','amber']) {
  const {engine} = gameWorld(seed,'garden',true);
  engine.organisms = structuredClone(common.organisms);
  engine.rng.state = [...common.rng.state];
  assert.deepEqual(engine.organisms,common.organisms);
  const initial = engine.metrics();
  let grown = 0, consumed = 0;
  for (let i=0;i<800;i++) {
    engine.step();
    grown+=engine.audit.grown;
    consumed+=engine.audit.consumed;
  }
  engine.assertValid();
  results.push({seed,initial,final:engine.metrics(),grown:grown/1000,consumed:consumed/1000,
    wetCells:engine.planet.wetCells,meanFertility:engine.planet.meanFertility});
}

// Same grid size, tick count, and no organisms. Measure only the environment path.
const timings=[];
for(const planet of [false,true,false,true,false,true]){
  const engine=new Engine({seed:'coral-42',width:40,height:40,population:0,...(planet?{planet:1}:{})});
  engine.step(2000);
  const start=performance.now();
  engine.step(15000);
  timings.push({planet,tps:15000000/(performance.now()-start)});
}
const evidence={status:'PASS',founderSeed:'dd09-matched-founders',results,timings};
await writeFile(process.argv[2]||'reports/dd-09/matched-planets.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
