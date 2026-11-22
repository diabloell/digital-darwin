import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { SCENARIOS } from '../../src/lab/definition.ts';
import { runSeries } from '../../src/lab/runner.ts';

assert.equal(typeof globalThis.gc, 'function');
const definition = { ...SCENARIOS[1], initial: { width:24, height:24, population:120 }, seeds:['gc-stress'], replicas:1, duration:500, interval:50 };
const samples = [];
async function run() {
  const series = await runSeries(definition,{environment:process.version});
  assert.equal(series.status,'completed');
}
for (let i=0;i<24;i++) {
  await run();
  await setImmediate();
  globalThis.gc();
  const { heapUsed, rss } = process.memoryUsage();
  samples.push({series:i+1,heapUsed,rss});
}
const median = xs => [...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const afterWarmup = median(samples.slice(4,9).map(s=>s.heapUsed));
const final = median(samples.slice(-5).map(s=>s.heapUsed));
await writeFile(process.argv[2],JSON.stringify({method:'Node heapUsed after explicit GC; one Engine in flight; results released before GC',afterWarmup,final,delta:final-afterWarmup,samples},null,2)+'\n');
console.log({afterWarmup,final,delta:final-afterWarmup});
