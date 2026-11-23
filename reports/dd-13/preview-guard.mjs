import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startServer} from '../../scripts/serve.mjs';
import {generatePlanet,planetCell} from '../../src/core/planet.ts';

const server=await startServer(0);
const browser=await chromium.launch({executablePath:process.env.DD_BROWSER});
try{
  const page=await browser.newPage({viewport:{width:1366,height:768}});
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('dialog',dialog=>dialog.dismiss());
  await page.addInitScript(()=>{
    window.Worker=class extends Worker{
      constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data.kind==='frame')window.guardFrame=data;});}
    };
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('#play:enabled').waitFor();
  const started=performance.now();
  await page.locator('#quick-game').click();
  await page.locator('#world-welcome[open]').waitFor();
  const previewMs=performance.now()-started;
  await page.locator('#welcome-form details summary').click();
  await page.locator('#welcome-seed').fill('amber');
  await page.locator('#welcome-difficulty').selectOption('scarce');
  await page.locator('#welcome-create').click();
  await page.locator('#game-choice').waitFor();
  const state=()=>page.evaluate(()=>{
    const {seed,epoch,metrics,game,running}=window.guardFrame;
    return {seed,epoch,metrics,game,running};
  });
  const initial=await state();
  const stock=generatePlanet('amber',40,40).layers.fertility.reduce((sum,g)=>sum+planetCell(g,.30).food,0)/1000;
  assert.equal(initial.game.habitat,'scarce');
  assert.equal(initial.metrics.food,stock);
  assert.equal(initial.metrics.tick,0);
  await page.locator('#game-choose').click();
  await page.locator('#play:enabled').click();
  await page.waitForFunction(()=>window.guardFrame.metrics.tick>=3);
  await page.locator('#quick-game').click();
  await page.locator('#world-welcome[open]').waitFor();
  const paused=await state();
  assert.equal(paused.running,false);
  await page.locator('#welcome-random').click();
  await page.locator('#welcome-create').click();
  assert.equal(await page.locator('#world-welcome').evaluate(e=>e.open),true);
  await page.keyboard.press('Escape');
  assert.deepEqual(await state(),paused);
  assert.deepEqual(errors,[]);
  const result={status:'PASS',previewMs,seed:initial.seed,exactFood:stock,cancelledAt:paused.metrics.tick};
  await writeFile('reports/dd-13/preview-guard.json',JSON.stringify(result,null,2)+'\n');
  console.log(result);
}finally{
  await browser.close();
  await new Promise(r=>server.close(r));
}
