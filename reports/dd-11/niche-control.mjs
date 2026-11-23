import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {Engine} from '../../src/core/engine.ts';

const results=[];
for(const roaming of [false,true]){
  const engine=new Engine({seed:'dd11-niche-control',width:8,height:8,population:1,regrowth:false,ecology:1});
  engine.capacity.fill(7000);
  engine.food.fill(0);
  engine.food[0]=800; engine.food[1]=650; engine.food[4]=2000;
  const a=engine.organisms[0];
  Object.assign(a,{x:.5,y:.5,heading:0,energy:20000});
  a.genome={speed:roaming?1.1:.7,sensor:3.5,efficiency:roaming?.85:.90,threshold:44};
  const before=engine.snapshot();
  engine.step();
  engine.assertValid();
  assert.equal(engine.cell(a.x,a.y),roaming?1:0);
  assert.equal(engine.audit.consumed,650);
  results.push({roaming,genome:before.organisms[0].genome,energy:a.energy,cell:engine.cell(a.x,a.y),audit:engine.audit});
}
assert.ok(results[1].audit.dissipated>results[0].audit.dissipated);
await writeFile('reports/dd-11/niche-control.json',JSON.stringify({status:'PASS',results},null,2)+'\n');
console.log(results);
