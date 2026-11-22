import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { SCENARIOS, validateDefinition } from '../src/lab/definition.ts';
import { runSeries } from '../src/lab/runner.ts';
import { csv, markdown } from '../src/lab/comparison.ts';
import { pack, unpack } from '../src/lab/archive.ts';

const [input='all', target='outputs/lab'] = process.argv.slice(2);
if (input==='--check') {
  const series=await unpack(await readFile(target,'utf8'));
  console.log(`Archive OK: ${series.scenarioHash} — ${series.status}`);
} else {
  const definitions=input==='all'?SCENARIOS:[SCENARIOS.find(d=>d.id===input)??validateDefinition(JSON.parse(await readFile(input,'utf8')))];
  let cancelled=false;
  process.on('SIGINT',()=>{cancelled=true;});
  for (const d of definitions) {
    await mkdir(target,{recursive:true});
    let dir=join(target,d.id);
    try { await mkdir(dir); }
    catch(error) {
      if ((error as NodeJS.ErrnoException).code!=='EEXIST') throw error;
      dir=join(target,d.id+'-'+crypto.randomUUID());
      await mkdir(dir);
    }
    await mkdir(join(dir,'runs'));
    const atomic=async (name:string,text:string)=>{
      await writeFile(join(dir,name+'.tmp'),text);
      await rename(join(dir,name+'.tmp'),join(dir,name));
    };
    await atomic('definition.json',JSON.stringify(d,null,2)+'\n');
    const start=performance.now(), initialRss=process.memoryUsage().rss;
    let peakRss=initialRss;
    const series=await runSeries(d,{environment:`Node ${process.version} ${process.platform}/${process.arch}`,yieldControl:setImmediate,
      cancelled:()=>cancelled, progress:p=>{ if (!p.tick || p.tick===p.duration) console.log(`${d.id} ${p.run}/${p.total} ${p.seed} ${p.condition} ${p.tick}/${p.duration}`); },
      saveRun:async r=>{peakRss=Math.max(peakRss,process.memoryUsage().rss);await atomic(join('runs',r.runId+'.json'),JSON.stringify(r));}});
    const elapsedMs=performance.now()-start, json=await pack(series);
    const artifacts=[['series.json',json],['series.csv',csv(series)],['report.md',markdown(series)]];
    const completedTicks=series.runs.reduce((sum,r)=>sum+r.ticks,0);
    await atomic('performance.json',JSON.stringify({elapsedMs,completedTicks,tps:completedTicks*1000/elapsedMs,initialRss,peakRss,
      bytes:Object.fromEntries(artifacts.map(([n,t])=>[n,Buffer.byteLength(t)]))},null,2));
    for (const [name,text] of artifacts) await atomic(name,text);
    console.log(`${d.id}: ${series.status} / ${series.verdict} · ${series.scenarioHash}`);
    if (series.status!=='completed') process.exitCode=1;
    if (cancelled) break;
  }
}
