import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { phenotype } from '../../src/core/genetics.ts';
import { gameWorld } from '../../src/core/game.ts';

const measurements = [];
for (const [seed,habitat,purchases] of [
  ['coral-42','garden',[[79,'nutrition'],[319,'fertility']]],
  ['dune','scarce',[[447,'nutrition'],[687,'fertility']]]
]) {
  for (const adaptation of [false,true]) {
    const { game,engine,genealogy } = gameWorld(seed,habitat);
    game.command({id:1,kind:'choose',founder:1},engine,genealogy);
    let id = 1;
    const observations = [];
    for (let i = 0; i <= 1200 && game.ready; i++) {
      const purchase = purchases.find(([tick])=>tick===i);
      if (adaptation && purchase && !game.command({id:++id,kind:'buy',card:purchase[1]},engine,genealogy).accepted)
        throw Error('Expected accepted purchase');
      if (i === 1200 || purchases.some(([tick])=>i===tick||i===tick+240)) {
        const {line,attempts,ep} = game.view(genealogy);
        const living = engine.organisms.filter(organism => genealogy.founder(organism.id)===1);
        const mean = metric => living.length ? living.reduce((sum,organism)=>sum+metric(organism),0)/living.length : null;
        observations.push({tick:i,line,energy:mean(a=>a.energy/1000),maintenance:mean(a=>phenotype(a.genome,engine.config.rule).maintenance/1000),
          efficiency:mean(a=>a.genome.efficiency),threshold:mean(a=>a.genome.threshold),attempts,ep});
      }
      if(i<1200)game.step(engine,genealogy);
    }
    measurements.push({seed,habitat,adaptation,observations});
  }
}
const {game,engine,genealogy} = gameWorld('amber','garden');
game.command({id:1,kind:'choose',founder:3},engine,genealogy);
while(engine.tick<62)game.step(engine,genealogy);
assert.ok(game.command({id:2,kind:'buy',card:'mobility'},engine,genealogy).accepted);
while(engine.tick<643)game.step(engine,genealogy);
const failedFirst = game.view(genealogy).attempts[0];
assert.equal(failedFirst.established,false);
const secondPurchase = game.command({id:3,kind:'buy',card:'nutrition'},engine,genealogy);
assert.ok(secondPurchase.accepted);
await writeFile(process.argv[2] || 'reports/dd-07/balance-controls.json',
  JSON.stringify({measurements,recovery:{seed:'amber',habitat:'garden',founder:3,failedFirst,secondPurchase}},null,2)+'\n');
