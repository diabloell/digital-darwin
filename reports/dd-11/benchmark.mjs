import {Engine} from '../../src/core/engine.ts';
const enabled=process.argv[2]==='on';
const engine=new Engine({seed:'dd11-performance',population:5000,...(enabled?{ecology:1}:{})});
engine.step(60);
const times=[];
for(let i=0;i<160;i++){
  const start=performance.now();
  engine.step();
  times.push(performance.now()-start);
}
engine.assertValid();
times.sort((a,b)=>a-b);
console.log(JSON.stringify({enabled,node:process.version,tps:160000/times.reduce((a,b)=>a+b,0),
  p95Ms:times[152],rssMiB:process.memoryUsage.rss()/1048576,population:engine.organisms.length}));
