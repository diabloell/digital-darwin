import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {SCENARIOS} from '../src/lab/definition.ts';
import {runSeries} from '../src/lab/runner.ts';
import {pack} from '../src/lab/archive.ts';
const dir=process.env.DD_EVIDENCE_DIR??'outputs/verification';
const d={...SCENARIOS[1],duration:500,interval:50,initial:{width:24,height:24,population:120},seeds:['stress'],replicas:1};
const memory=[];
let reference;
for(let i=0;i<16;i++){
  const row=await runSeries(d,{environment:process.version});
  const hashes=row.runs.map(r=>r.hash);
  if(reference)assert.deepEqual(hashes,reference);
  reference=hashes;
  assert.equal(row.status,'completed');
  memory.push({series:i+1,bytes:Buffer.byteLength(await pack(row)),rss:process.memoryUsage().rss});
}
assert.equal(new Set(memory.map(m=>m.bytes)).size,1);
await mkdir(dir,{recursive:true});
await writeFile(`${dir}/lab-stress.json`,JSON.stringify({status:'PASS',description:'RSS sampled at the end of each independent series; previous series references are released',memory},null,2));
console.log('Stress PASS: 16 series, identical hashes and archive sizes');
