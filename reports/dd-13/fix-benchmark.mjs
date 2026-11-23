import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.DD_BROWSER});
const results=[];
try{
  for(const [label,dir] of [['base',process.argv[2]],['fix','.']]){
    const {startServer}=await import(pathToFileURL(resolve(dir,'scripts/serve.mjs')));
    const server=await startServer(0);
    const page=await browser.newPage({viewport:{width:1366,height:768}});
    try{
      await page.addInitScript(()=>{
        window.painted=[];
        const draw=CanvasRenderingContext2D.prototype.putImageData;
        CanvasRenderingContext2D.prototype.putImageData=function(...args){
          draw.apply(this,args);
          if(this.canvas.id==='welcome-globe')window.painted.push(performance.now());
        };
      });
      await page.goto('http://127.0.0.1:'+server.address().port);
      await page.locator('#play:enabled').waitFor();
      const openMs=[],turnMs=[];
      for(let i=0;i<6;i++){
        await page.locator('#game-seed').evaluate((input,i)=>{input.value=i%2?'amber':'dune';},i);
        const started=await page.locator('#quick-game').evaluate(button=>{const t=performance.now();button.click();return t;});
        await page.waitForFunction(t=>document.querySelector('#world-welcome').open&&window.painted.at(-1)>t,started);
        openMs.push(await page.evaluate(t=>window.painted.at(-1)-t,started));
        if(label==='fix'){
          const time=await page.locator('#globe-right').evaluate(button=>{const t=performance.now();button.click();return t;});
          await page.waitForFunction(t=>window.painted.at(-1)>t,time);
          turnMs.push(await page.evaluate(t=>window.painted.at(-1)-t,time));
        }
        await page.keyboard.press('Escape');
        await page.locator('#world-welcome').waitFor({state:'hidden'});
        await page.evaluate(()=>{window.painted.length=0;});
      }
      results.push({label,openMs,turnMs});
    }finally{
      await page.close();
      await new Promise(resolve=>server.close(resolve));
    }
  }
}finally{await browser.close();}
await writeFile('reports/dd-13/fix-performance.json',JSON.stringify({results},null,2)+'\n');
