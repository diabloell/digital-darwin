import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async file => JSON.parse(JSON.parse(await readFile(file,'utf8')).payload);
const [baseline = 'reports/dd-06', candidate = 'outputs/dd07-final/lab-batches'] = process.argv.slice(2);
const results = [];
for (const scenario of ['LAB-E01','LAB-E02','LAB-E03','LAB-E04']) {
  const [old, current] = await Promise.all([baseline,candidate].map(dir=>read(`${dir}/${scenario}/series.json`)));
  const state = series => series.runs.map(r=>({
    condition:r.conditionId, seed:r.seed, status:r.status, ticks:r.ticks, hash:r.hash,
    sampledHashes:r.trajectory.map(p=>[p.tick,p.hash])
  }));
  assert.equal(current.scenarioHash,old.scenarioHash);
  assert.deepEqual(state(current),state(old));
  results.push({scenario,scenarioHash:current.scenarioHash,runs:state(current)});
}
console.log(JSON.stringify({status:'PASS',replicas:results.reduce((sum,s)=>sum+s.runs.length,0),results},null,2));
