import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startServer} from './serve.mjs';

const output=process.env.DD_EVIDENCE_DIR||'outputs/verification';
await mkdir(output,{recursive:true});
const server=await startServer(0);
const browser=await chromium.launch({executablePath:process.env.DD_BROWSER});
const results=[];
try {
  for(const [width,height] of [[1366,768],[390,844]]) {
    const page=await browser.newPage({viewport:{width,height}});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('dialog',d=>d.accept());
    await page.addInitScript(()=>{
      window.Worker=class extends Worker {
        constructor(...args){
          super(...args);
          this.addEventListener('message',({data})=>{if(data.kind==='frame')window.planetFrame=data;});
        }
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const loc=selector=>page.locator(selector);
    await loc('#evolution-game > summary').click();
    await loc('#game-planet').check();
    await loc('#game-form .primary').click();
    await loc('#planet-profile').waitFor();
    await loc('#game-founder').selectOption('73');
    await loc('#game-choose').click();
    await loc('#play:enabled').waitFor();
    const read=()=>page.evaluate(()=>{
      const {metrics,game,planet,ids,positions,food,running}=window.planetFrame;
      return {metrics,game,profile:{...planet,layers:Object.fromEntries(Object.entries(planet.layers).map(([k,v])=>[k,[...v]]))},ids:[...ids],positions:[...positions],food:[...food],running};
    });
    const initial=await read();
    const pixels=()=>loc('#world').evaluate(el=>el.toDataURL());
    const food=await pixels();
    for(const layer of ['water','fertility','temperature','light']){
      await loc('#terrain-layer').selectOption(layer);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.notEqual(await pixels(),food);
      assert.deepEqual(await read(),initial);
    }
    await loc('#terrain-layer').selectOption('water');
    await loc('#fit').click();
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:`${output}/planet-map-${width}x${height}.png`});
    await loc('[data-speed="16"]').click();
    await loc('#play').click();
    await page.waitForFunction(()=>window.planetFrame.metrics.tick>=100);
    await loc('#play').click();
    await page.waitForFunction(()=>!window.planetFrame.running);
    const paused=await read();
    assert.notEqual(paused.profile.cycle.lightPercent,initial.profile.cycle.lightPercent);
    await loc('#planet-profile').evaluate(el=>el.scrollIntoView({block:'center'}));
    await page.screenshot({path:`${output}/planet-cycle-${width}x${height}.png`});
    await loc('#world-saves summary').click();
    await loc('#save-world').click();
    await page.getByText('Сохранено в браузере',{exact:false}).waitFor();
    const slot=await loc('#save-list').inputValue();
    await page.reload();
    await loc('#world-saves summary').click();
    await loc('#save-list').selectOption(slot);
    await loc('#load-world').click();
    await page.getByText('Мир восстановлен на паузе',{exact:false}).waitFor();
    assert.deepEqual(await read(),paused);
    await loc('#step').click();
    await page.waitForFunction(t=>window.planetFrame.metrics.tick===t+1,paused.metrics.tick);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
    results.push({width,height,status:'PASS',seed:'coral-42',founder:73,tick:paused.metrics.tick,cycle:paused.profile.cycle});
    await page.close();
  }
  await writeFile(output+'/planet-e2e.json',JSON.stringify({status:'PASS',results},null,2)+'\n');
  console.log(results);
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
