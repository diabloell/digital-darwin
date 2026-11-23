import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const baseline=process.argv[2];
if(!baseline)throw Error('Specify a git archive of the DD-12 main checkout');
const from=(dir,file)=>import(pathToFileURL(resolve(dir,file)));
const output=process.argv[3]||'reports/dd-13/performance.json';
const browser=await chromium.launch({executablePath:process.env.DD_BROWSER,args:['--enable-precise-memory-info']});
const results=[];
try{
  for(const [version,directory] of [[12,baseline],[13,'.']]){
    const {startServer}=await from(directory,'scripts/serve.mjs');
    const {Engine}=await from(directory,'src/core/engine.ts');
    const {releaseWorld}=await from(directory,'src/core/game.ts');
    for(const integrated of [false,true]){
      const run=integrated?releaseWorld('dune')
        :{engine:new Engine({seed:'dd12-benchmark',population:5000})};
      const {engine,game,genealogy}=run;
      if(game)game.command({id:1,kind:'choose',founder:40},engine,genealogy);
      const step=()=>game?game.step(engine,genealogy):engine.step();
      for(let i=0;i<80;i++)step();
      const times=[];
      for(let i=0;i<160;i++){
        const start=performance.now();
        step();
        if(game&&i%20===0)game.view(genealogy,engine);
        times.push(performance.now()-start);
      }
      engine.assertValid();
      times.sort((a,b)=>a-b);
      const node={tick:engine.tick,alive:engine.organisms.length,tps:160000/times.reduce((a,b)=>a+b,0),
        p95Ms:times[152],rssMiB:process.memoryUsage.rss()/1048576};
      const server=await startServer(0);
      const page=await browser.newPage({viewport:{width:1366,height:768}});
      try{
        await page.addInitScript(()=>{
          window.paints=[];
          window.firstMapPaint=null;
          addEventListener('dd:paint',e=>{window.firstMapPaint??=performance.now();window.paints.push(e.detail.ms);});
          window.Worker=class extends Worker{
            constructor(...args){
              super(...args);
              this.addEventListener('message',({data})=>{if(data.kind==='frame')window.lastFrame=data;});
            }
          };
        });
        await page.goto('http://127.0.0.1:'+server.address().port+'/?benchmark=1');
        const loc=selector=>page.locator(selector);
        page.on('dialog',dialog=>dialog.accept());
        await page.waitForFunction(()=>window.firstMapPaint!==null&&performance.getEntriesByName('first-contentful-paint').length);
        const initial=await page.evaluate(()=>({fcp:performance.getEntriesByName('first-contentful-paint')[0].startTime,firstMap:window.firstMapPaint}));
        if(integrated){
          await loc('#evolution-game summary').click();
          await loc('#game-seed').fill('dune');
          await loc('#game-release-start').click();
          if(version===13)await loc('#welcome-create').click();
          await loc('#game-founder').selectOption('40');
          await loc('#game-choose').click();
        }else{
          await loc('#world-settings summary').click();
          await loc('#seed').fill('dd12-benchmark');
          await loc('#world-form [name="population"]').fill('5000');
          await loc('#world-form button[type="submit"]').click();
          await page.waitForFunction(()=>window.lastFrame?.seed==='dd12-benchmark');
        }
        await loc(integrated?'[data-speed="1"]':'[data-speed="16"]').click();
        await loc('#play').click();
        const chromium=await page.evaluate(async()=>{
          const before=window.lastFrame.metrics.tick;
          const start=performance.now();
          window.paints.length=0;
          await new Promise(resolve=>setTimeout(resolve,4000));
          const seconds=(performance.now()-start)/1000;
          const t=window.paints.sort((a,b)=>a-b);
          return {started:before,ended:window.lastFrame.metrics.tick,tps:(window.lastFrame.metrics.tick-before)/seconds,
            actualPaintsPerSecond:t.length/seconds,p95Ms:t[Math.floor(t.length*.95)],heapMiB:performance.memory.usedJSHeapSize/1048576};
        });
        results.push({version,integrated,node,chromium,initial});
      }finally{
        await page.close();
        await new Promise(resolve=>server.close(resolve));
      }
    }
  }
}finally{await browser.close();}
await writeFile(output,JSON.stringify({browser:browser.version(),node:process.version,results},null,2)+'\n');
console.log(JSON.stringify(results,null,2));
