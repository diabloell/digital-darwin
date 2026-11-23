import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startServer} from './serve.mjs';

const output=process.env.DD_EVIDENCE_DIR||'outputs/verification';
await mkdir(output,{recursive:true});
const server=await startServer(0);
const browser=await chromium.launch({executablePath:process.env.DD_BROWSER});
const origin='http://127.0.0.1:'+server.address().port;
const rows=[];
try{
  for(const [width,height] of [[1920,1080],[1366,768],[390,844]]){
    const page=await browser.newPage({viewport:{width,height},hasTouch:width===390});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      window.Worker=class extends Worker{
        constructor(...args){
          super(...args);
          this.addEventListener('message',({data})=>{
            if(data.kind!=='frame')return;
            window.impactFrame=data;
            if(data.latestCarriers?.includes(1))window.sawCarrier??={tick:data.metrics.tick,at:performance.now()};
          });
        }
      };
    });
    const loc=s=>page.locator(s);
    const read=()=>page.evaluate(()=>({
      tick:window.impactFrame.metrics.tick, running:window.impactFrame.running,
      attempt:window.impactFrame.game.attempts.at(-1),
      line:window.impactFrame.game.line,
      count:window.impactFrame.latestCarriers?.reduce((a,b)=>a+b,0),
      misplaced:window.impactFrame.latestCarriers?.some((marked,i)=>marked&&window.impactFrame.founders[i]!==40)
    }));
    await page.goto(origin);
    await loc('#play:enabled').waitFor();
    assert.equal(await loc('#line-map-legend').isVisible(),false);
    await loc('#quick-game').click();
    await loc('#welcome-form details summary').click();
    await loc('#welcome-seed').fill('dune');
    await loc('#welcome-create').click();
    await loc('#game-founder').selectOption('40');
    const started=await page.evaluate(()=>performance.now());
    await loc('#game-choose').click();
    await loc('[data-speed="16"]').click();
    await loc('#play').click();
    await loc('#evolution-decision[open]').waitFor();
    const firstMs=await page.evaluate(t=>performance.now()-t,started);
    const first=await read();
    assert.equal(first.running,false);
    assert.equal(await loc('#terrain-layer').inputValue(),'forage');
    await loc('[data-decision-card="mobility"]').click();
    await page.waitForFunction(()=>window.impactFrame.game.active==='mobility');
    await loc('#play').click();
    await page.waitForFunction(()=>window.sawCarrier!==undefined);
    const firstCarrier=await page.evaluate(t=>({tick:window.sawCarrier.tick,elapsedMs:window.sawCarrier.at-t}),started);
    await loc('#evolution-decision[open]').waitFor();
    const secondMs=await page.evaluate(t=>performance.now()-t,started);
    const second=await read();
    assert.equal(second.running,false);
    assert.equal(second.attempt.end-second.attempt.start,160);
    assert.ok(second.attempt.introduced>0);
    assert.equal(second.count,second.attempt.carriers);
    assert.equal(second.misplaced,false);
    assert.ok(second.count>0);
    await loc('#decision-later').click();
    await loc('#line-map-legend').waitFor();
    await loc('#fit').click();
    const colors=await loc('#world').evaluate(canvas=>{
      const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let carriers=0,own=0;
      for(let i=0;i<data.length;i+=4){
        if(data[i]===139&&data[i+1]===245&&data[i+2]===255)carriers++;
        if(data[i]===255&&data[i+1]===224&&data[i+2]===161)own++;
      }
      return {carriers,own};
    });
    assert.ok(colors.carriers>0&&colors.own>0);
    await loc('#viewport').evaluate(e=>e.scrollIntoView({block:'start'}));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`${output}/map-${width}.png`});
    assert.match(await loc('#programme-feedback').innerText(),/завершилась/);
    assert.match(await loc('#impact-comparison').innerText(),/Скорость/);
    const events=await loc('#recent-events li').allTextContents();
    assert.ok(events.length>=3&&events.length<=5);
    assert.ok(events.some(event=>event.includes('завершена')));
    assert.ok(events.slice(1).every((event,i)=>Number(event.match(/\d+/)[0])<=Number(events[i].match(/\d+/)[0])));
    await loc('#programme-feedback').evaluate(e=>e.scrollIntoView({block:'center'}));
    await page.screenshot({path:`${output}/result-${width}.png`});
    await loc('#recent-events').evaluate(e=>e.scrollIntoView({block:'center'}));
    if(width===390)await page.screenshot({path:`${output}/events-${width}.png`});
    assert.deepEqual(errors,[]);
    rows.push({width,height,first:{tick:first.tick,elapsedMs:firstMs},firstCarrier,second:{...second,elapsedMs:secondMs},colors,events});
    await page.close();
  }
  await writeFile(output+'/impact-browser.json',JSON.stringify({browser:browser.version(),results:rows},null,2)+'\n');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
