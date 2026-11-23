import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const {gameWorld}=await import(pathToFileURL(resolve('src/core/game.ts')));
const {engine,game,genealogy}=gameWorld('coral-42','garden',true,process.argv[2]==='tree');
game.command({id:1,kind:'choose',founder:73},engine,genealogy);
const times=[];
for(let i=0;i<800 && game.ready;i++){
 const start=performance.now();
 game.step(engine,genealogy);
 if(i%20===0)game.view(genealogy,engine);
 if(i>=100)times.push(performance.now()-start);
}
times.sort((a,b)=>a-b);
console.log(JSON.stringify({mode:process.argv[2],node:process.version,tick:engine.tick,alive:engine.organisms.length,
  tps:times.length*1000/times.reduce((a,b)=>a+b,0),p95Ms:times[Math.floor(times.length*.95)],rssBytes:process.memoryUsage.rss()}));
