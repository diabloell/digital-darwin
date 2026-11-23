import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {gameWorld,releaseWorld} from '../src/core/game.ts';
import {capture,decode,encode,restore} from '../src/snapshot.ts';

const output=process.env.DD_EVIDENCE_DIR||'outputs/verification';
await mkdir(output,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const hashes=({engine,game,genealogy})=>({
  engine:sha(engine.canonical()),game:sha(JSON.stringify(game.snapshot())),history:sha(JSON.stringify(genealogy.snapshot())),
  planet:sha(JSON.stringify(engine.planet)),ecology:sha(JSON.stringify(engine.ecology.snapshot()))
});
const command=(w,action)=>w.game.command(action,w.engine,w.genealogy);
const step=w=>w.game.step(w.engine,w.genealogy);
const checkpoint=async world=>{
  const state={...capture(world.engine,world.genealogy),game:world.game.snapshot()};
  const file=await encode(state,'Release checkpoint','2026-11-23T00:00:00.000Z');
  const w=restore((await decode(file.text)).state);
  assert.deepEqual(hashes(w),hashes(world));
  const bad=structuredClone(state);
  bad.game.birthEP++;
  const tampered=await encode(bad,'Invalid points','2026-11-23T00:00:00.000Z');
  const input=(await decode(tampered.text)).state;
  assert.throws(()=>restore(input),/Некорректная версия баланса/);
  return {w,tick:world.engine.tick,checksum:file.manifest.checksum};
};

const scenarios=[['coral-42',73,'first'],['coral-42',1,'first'],['amber',58,'first'],['dune',40,'first'],
  ['fern',1,'none'],['amber',1,'first'],['slate',1,'first'],['dune',2,'first'],['dune',40,'defer']];
const results=[];
for(const version of [2,3])for(const [seed,founder,policy] of scenarios){
  const create=()=>version===3?releaseWorld(seed):gameWorld(seed,'garden',true,true,true);
  const w=create(),{engine,game,genealogy}=w;
  const journal=[{tick:0,action:{id:1,kind:'choose',founder}}];
  assert.ok(command(w,journal[0].action).accepted);
  let saved,maxCarriers=0,firstCrisis=null,firstRecovery=null;
  const timeline=[];
  const started=performance.now();
  while(game.ready&&engine.tick<1700){
    let action;
    if(!game.active&&game.ep&&policy!=='none'&&(policy!=='defer'||engine.tick>=250)){
      const v=game.view(genealogy,engine);
      const card=v.tree.offered.find(k=>v.tree.rows.find(row=>row.card===k).quote.price<=game.ep);
      if(card){
        action={id:journal.length+1,kind:'buy',card};
        assert.ok(command(w,action).accepted);
        journal.push({tick:engine.tick,action});
        if(saved)assert.ok(command(saved.w,action).accepted);
      }
    }
    step(w);
    if(saved)step(saved.w);
    if(version===3&&seed==='dune'&&founder===40&&policy==='first'&&!saved&&game.active&&engine.ecology.collapses>engine.ecology.recoveries)
      saved=await checkpoint(w);
    if(engine.ecology.collapses&&!firstCrisis)firstCrisis=engine.tick;
    if(engine.ecology.recoveries&&!firstRecovery)firstRecovery=engine.tick;
    if(engine.tick%100===0||engine.tick===1700||!game.ready){
      const v=game.view(genealogy);
      maxCarriers=Math.max(maxCarriers,...v.attempts.map(a=>a.carriers));
      timeline.push({tick:engine.tick,metrics:engine.metrics(),line:v.line,crisis:engine.ecology.collapses-engine.ecology.recoveries,
        recovery:engine.ecology.recoveries,ep:v.ep,carriers:v.attempts.reduce((sum,a)=>sum+a.carriers,0)});
    }
  }
  engine.assertValid();
  const view=game.view(genealogy,engine);
  const final=hashes(w);
  if(saved){
    assert.deepEqual(hashes(saved.w),final);
    const replay=create();
    let next=0;
    for(let end=17;replay.engine.tick<engine.tick;end+=17){
      while(replay.engine.tick<Math.min(end,engine.tick)){
        while(journal[next]?.tick===replay.engine.tick)assert.ok(command(replay,journal[next++].action).accepted);
        step(replay);
      }
    }
    assert.equal(next,journal.length);
    assert.deepEqual(hashes(replay),final);
    assert.ok(maxCarriers>0);
  }
  const a=view.attempts;
  results.push({version,seed,founder,policy,tick:engine.tick,elapsedMs:performance.now()-started,lost:view.lost,
    metrics:engine.metrics(),line:view.line,first:a[0]?.start??null,small:view.tree.completed,
    fork:a.find(x=>x.card==='local'||x.card==='explorer')?.start??null,
    ep:{balance:view.ep,spent:view.spent,birthEP:view.birthEP??0,renewal:view.renewal,sustained:view.sustained,achievement:view.achievement},
    maxCarriers,firstCrisis,firstRecovery,attempts:a,timeline,journal,hashes:final,checkpoint:saved&&{tick:saved.tick,sha256:saved.checksum}});
}
const release=results.filter(r=>r.version===3);
assert.ok(release.some(r=>r.small===10&&r.fork!==null&&r.checkpoint));
assert.ok(release.some(r=>r.lost));
assert.ok(release.some(r=>r.firstCrisis&&r.firstRecovery));
assert.ok(results.filter(r=>r.version===2&&r.policy==='first').every(r=>r.fork===null));
assert.ok(results.some(r=>r.version===2&&r.policy==='defer'&&r.fork!==null));
assert.ok(release.filter(r=>r.policy==='first'&&r.fork!==null).length>=2);
await writeFile(output+'/release-smoke.json',JSON.stringify({status:'PASS',results},null,2)+'\n');
console.log(release.map(({seed,founder,policy,first,fork,lost})=>({seed,founder,policy,first,fork,lost})));
