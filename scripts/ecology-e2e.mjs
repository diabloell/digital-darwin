import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startServer} from './serve.mjs';

const output=process.env.DD_EVIDENCE_DIR||'outputs/verification';
await mkdir(output,{recursive:true});
const server=await startServer(0);
const browser=await chromium.launch({executablePath:process.env.DD_BROWSER});
const results=[];
try{
  for(const [width,height] of [[1920,1080],[390,844]]){
    const page=await browser.newPage({viewport:{width,height}});
    const errors=[];
    page.on('dialog',d=>d.accept());
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(()=>{
      window.Worker=class extends Worker{
        constructor(...args){
          super(...args);
          this.addEventListener('message',({data})=>{if(data.kind==='frame')window.ecologyFrame=data;});
        }
      };
    });
    await page.goto('http://127.0.0.1:'+server.address().port);
    const loc=s=>page.locator(s);
    await loc('#evolution-game summary').click();
    for(const selector of ['#game-planet','#game-tree-mode','#game-ecology'])await loc(selector).check();
    await loc('#game-form .primary').click();
    await loc('#game-founder').selectOption('73');
    await loc('#game-choose').click();
    await loc('#play:enabled').waitFor();
    await loc('[data-speed="16"]').click();
    await loc('#play').click();
    await page.waitForFunction(()=>(window.ecologyFrame.metrics.tick>=120&&window.ecologyFrame.ecology.recoveries>0)||document.querySelector('#evolution-decision').open);
    if(await loc('#evolution-decision').evaluate(el=>el.open)){
      await loc('#decision-later').click();
      await loc('#play').click();
      await page.waitForFunction(()=>window.ecologyFrame.metrics.tick>=120&&window.ecologyFrame.ecology.recoveries>0);
    }
    await loc('#play').click();
    await page.waitForFunction(()=>!window.ecologyFrame.running);
    const read=()=>page.evaluate(()=>{
      const f=window.ecologyFrame;
      return {metrics:f.metrics,game:f.game,ecology:Object.fromEntries(Object.entries(f.ecology).map(([k,v])=>[k,ArrayBuffer.isView(v)?[...v]:v]))};
    });
    const before=await read();
    assert.ok(before.ecology.collapses>before.ecology.recoveries);
    assert.match(await loc('#ecology-status').innerText(),/Кризис:/);
    assert.match(await loc('#ecology-competitors').innerText(),/Другие линии/);
    await loc('#terrain-layer').selectOption('crisis');
    const pixels=()=>loc('#world').evaluate(el=>el.toDataURL());
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const crisis=await pixels();
    await loc('#terrain-layer').selectOption('demand');
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    assert.notEqual(await pixels(),crisis);
    assert.deepEqual(await read(),before);
    await loc('#terrain-layer').selectOption('crisis');
    await loc('#ecology-stats summary').click();
    assert.match(await loc('#ecology-roaming').innerText(),/Подвижный поиск/);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:`${output}/ecology-map-${width}x${height}.png`});
    if(width===390){
      await loc('#ecology-panel').evaluate(el=>el.scrollIntoView({block:'center'}));
      await page.screenshot({path:`${output}/ecology-panel-${width}x${height}.png`});
    }
    await loc('#world-saves summary').click();
    await loc('#save-list option').first().waitFor({state:'attached'});
    await loc('#save-world').click();
    await page.getByText('Сохранено в браузере',{exact:false}).waitFor();
    const slot=await loc('#save-list').inputValue();
    await page.reload();
    await loc('#world-saves summary').click();
    await loc('#save-list').selectOption(slot);
    await loc('#load-world').click();
    await page.getByText('Мир восстановлен на паузе',{exact:false}).waitFor();
    assert.deepEqual(await read(),before);
    await loc('#step').click();
    await page.waitForFunction(t=>window.ecologyFrame.metrics.tick===t+1,before.metrics.tick);
    assert.deepEqual(errors,[]);
    results.push({width,height,tick:before.metrics.tick,collapses:before.ecology.collapses,recoveries:before.ecology.recoveries,status:'PASS'});
    await page.close();
  }
  await writeFile(output+'/ecology-e2e.json',JSON.stringify({status:'PASS',results},null,2)+'\n');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
