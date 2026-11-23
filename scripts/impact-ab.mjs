import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { CARDS, releaseWorld } from '../src/core/game.ts';
import { phenotype } from '../src/core/genetics.ts';
import { capture, decode, encode, restore } from '../src/snapshot.ts';

const out=process.env.DD_EVIDENCE_DIR||'outputs/verification';
const checkpoint=w=>({...capture(w.engine,w.genealogy),game:w.game.snapshot()});
const sha=w=>createHash('sha256').update(JSON.stringify(checkpoint(w))).digest('hex');
const step=w=>w.game.step(w.engine,w.genealogy);
const accepted=(w,action)=>assert.ok(w.game.command(action,w.engine,w.genealogy).accepted);
const offers=({engine,game,genealogy})=>{
  const view=game.view(genealogy,engine);
  return view.tree.rows.filter(row=>view.tree.offered.includes(row.card)&&row.quote.price<=view.ep).map(row=>row.card);
};
const mean=(rows,measure)=>rows.length?rows.reduce((sum,a)=>sum+measure(a),0)/rows.length:null;
function trace(w,founder,card,harvest){
  const {engine,game,genealogy}=w, view=game.view(genealogy);
  const own=engine.organisms.filter(a=>genealogy.founder(a.id)===founder);
  const cell=a=>Math.floor(a.y)*engine.config.width+Math.floor(a.x);
  const average=rows=>({
    energy:mean(rows,a=>a.energy/1000), maintenance:mean(rows,a=>phenotype(a.genome).maintenance/1000),
    velocity:mean(rows,a=>a.velocity), localFood:mean(rows,a=>engine.food[cell(a)]/1000),
    pressure:mean(rows,a=>engine.ecology.pressure[cell(a)]),
    genes:Object.fromEntries(['speed','sensor','efficiency','threshold'].map(g=>[g,mean(rows,a=>a.genome[g])]))
  });
  const marked=new Set(game.snapshot().markers.filter(([,tags])=>tags.some(([key])=>key===card)).map(([id])=>id));
  return {tick:engine.tick,world:engine.metrics(),line:view.line,spent:view.spent,ep:view.ep,lost:view.lost,
    attempts:view.attempts,harvest,crisisCells:engine.ecology.collapses-engine.ecology.recoveries,
    own:average(own),carriers:average(own.filter(a=>marked.has(a.id))),sha256:sha(w)};
}
const results=[];
for(const version of [3,4])for(const [seed,founder] of [['dune',40],['amber',58],['slate',1]])for(const habitat of ['garden','scarce']){
  const start=releaseWorld(seed,habitat,version===4);
  accepted(start,{id:1,kind:'choose',founder});
  while(start.game.ready&&start.engine.tick<500&&!offers(start).length)step(start);
  const available=offers(start), snapshot=checkpoint(start), decision=start.engine.tick;
  const policies=[null,...available.filter(key=>['nutrition','mobility','fertility'].includes(key))];
  const runs=[];
  for(const card of policies){
    async function run(){
      const w=restore(snapshot), points=[];
      assert.equal(sha(w),sha(start));
      points.push(trace(w,founder,card,0));
      if(card){
        accepted(w,{id:2,kind:'buy',card});
        points.push(trace(w,founder,card,0));
      }else{
        assert.equal(w.game.markLatestCarriers(Uint32Array.from(w.engine.organisms,a=>a.id)),undefined);
      }
      let harvest=0, resumed;
      while(w.game.ready&&w.engine.tick<decision+300){
        step(w);
        if(resumed)step(resumed);
        harvest+=w.engine.audit.consumed;
        const elapsed=w.engine.tick-decision;
        if(card&&elapsed===40&&w.game.active){
          const file=await encode(checkpoint(w),'Impact checkpoint','2026-11-23T00:00:00.000Z');
          resumed=restore((await decode(file.text)).state);
          assert.equal(sha(resumed),sha(w));
          const ids=Uint32Array.from(w.engine.organisms,a=>a.id);
          const mask=w.game.markLatestCarriers(ids);
          const markers=new Set(w.game.snapshot().markers.filter(([,tags])=>tags.some(([key])=>key===card)).map(([id])=>id));
          assert.deepEqual([...mask],Array.from(ids,id=>Number(markers.has(id))));
          assert.deepEqual(resumed.game.markLatestCarriers(ids),mask);
          const duplicate=w.game.command({id:2,kind:'buy',card},w.engine,w.genealogy);
          assert.ok(duplicate.accepted);
          assert.equal(sha(resumed),sha(w));
        }
        if([20,40,60,80,160,240,300].includes(elapsed)||!w.game.ready)points.push(trace(w,founder,card,harvest/1000));
      }
      w.engine.assertValid();
      if(resumed)assert.equal(sha(resumed),sha(w));
      return points;
    }
    const points=await run();
    assert.deepEqual(await run(),points);
    runs.push({card,trait:card?CARDS[card].gene:null,points});
  }
  results.push({version,seed,founder,habitat,decision,available,snapshotSha256:sha(start),runs});
}
await mkdir(out,{recursive:true});
await writeFile(out+'/ab.json',JSON.stringify({results},null,2)+'\n');
for(const {version,seed,habitat,decision,runs} of results)console.log(version,seed,habitat,decision,runs.map(({card,points})=>{
  const p=points.at(-1);
  return [card,p.tick,p.line.living,p.line.born,p.attempts[0]?.introduced,p.attempts[0]?.carriers];
}));
