import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { gameWorld } from '../../src/core/game.ts';
import { capture, restore } from '../../src/snapshot.ts';

const {engine,game,genealogy}=gameWorld('amber','garden',true,true);
let id=1;
game.command({id,kind:'choose',founder:58},engine,genealogy);
while (game.ready && engine.tick<1200) {
  const v=game.view(genealogy,engine);
  if(!game.active&&v.tree.offered.includes('local')&&v.ep>=7)break;
  if(!game.active&&game.ep&&v.tree.offered.length&&!v.tree.offered.includes('local'))
    assert.ok(game.command({id:++id,kind:'buy',card:v.tree.offered[0]},engine,genealogy).accepted);
  game.step(engine,genealogy);
}
const fork={...capture(engine,genealogy),game:game.snapshot()};
const results=[];
for(const regrowth of [true,false]){
  const world=restore(fork);
  world.engine.config.regrowth=regrowth;
  assert.ok(world.game.command({id:id+1,kind:'buy',card:'local'},world.engine,world.genealogy).accepted);
  while(world.game.active&&world.game.ready)world.game.step(world.engine,world.genealogy);
  world.engine.assertValid();
  results.push({regrowth,metrics:world.engine.metrics(),line:world.game.view(world.genealogy).line,
    attempt:world.game.snapshot().attempts.at(-1)});
}
await writeFile('reports/dd-10/resource-control.json',JSON.stringify({seed:'amber',founder:58,forkTick:engine.tick,results},null,2)+'\n');
console.log(results.map(r=>[r.regrowth,r.attempt.introduced,r.attempt.endingCount,r.metrics.food,r.metrics.population]));
