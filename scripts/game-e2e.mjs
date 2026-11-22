import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { gameWorld } from '../src/core/game.ts';
import { startServer } from './serve.mjs';

const output = process.env.DD_EVIDENCE_DIR || 'outputs/verification';
await mkdir(output, { recursive:true });
const server = await startServer(0);
const browser = await chromium.launch({ executablePath:process.env.DD_BROWSER });
const sizes = [[1920,1080],[1366,768],[390,844]].filter(([width])=>!process.argv[2]||width===Number(process.argv[2]));
assert.ok(sizes.length);
try {
  for (const [width,height] of sizes) {
    const page = await browser.newPage({viewport:{width,height}});
    const errors = [];
    page.on('pageerror', error=>errors.push(error.message));
    page.on('console', msg=>{ if(msg.type()==='error')errors.push(msg.text()); });
    page.on('dialog', dialog=>dialog.accept());
    await page.addInitScript(()=>{
      const Native = window.Worker;
      window.Worker = class extends Native {
        constructor(...args){
          super(...args);
          this.addEventListener('message',({data})=>{ if(data.kind==='frame')window.__gameFrame=data; });
        }
      };
    });
    const url = `http://127.0.0.1:${server.address().port}`;
    const loc = selector=>page.locator(selector);
    const wait = (predicate,arg)=>page.waitForFunction(predicate,arg,{timeout:20000});
    const read = ()=>page.evaluate(()=>({game:window.__gameFrame.game,tick:window.__gameFrame.metrics.tick,running:window.__gameFrame.running}));
    const start = async ()=>{
      await loc('[data-speed="32"]').click();
      await loc('#play').click();
      await wait(()=>window.__gameFrame.running);
    };
    const pause = async ()=>{
      await loc('#play').click();
      await wait(()=>!window.__gameFrame.running);
    };
    const create = async (seed,habitat)=>{
      await loc('#game-seed').fill(seed);
      await loc('#game-habitat').selectOption(habitat);
      await loc('#game-form button').click();
      await wait(seed=>window.__gameFrame?.seed===seed&&window.__gameFrame?.game?.founder===null,seed);
      assert.equal(await loc('#play').isDisabled(),true);
      await loc('#game-choose').click();
      await wait(()=>window.__gameFrame.game.founder===1);
    };
    const saveAndReload = async name=>{
      const paused = await read();
      if(!await loc('#world-saves').evaluate(el=>el.open))await loc('#world-saves summary').click();
      await loc('#save-name').fill(name);
      await loc('#save-world').click();
      await wait(()=>document.querySelector('#save-status').textContent.includes('Сохранено в браузере'));
      const slot = await loc('#save-list').inputValue();
      await page.reload();
      await loc('#world-saves summary').click();
      await loc('#save-list').selectOption(slot);
      await loc('#load-world').click();
      await wait(()=>document.querySelector('#save-status').textContent.includes('Мир восстановлен на паузе'));
      assert.deepEqual(await read(),paused);
    };
    await page.goto(url);
    await loc('#evolution-game > summary').click();
    await create('coral-42','garden');
    assert.equal(await locatorDisabled('nutrition'),true);
    await start();
    await loc('[data-card="nutrition"]:enabled').waitFor();
    await pause();
    await loc('[data-card="nutrition"]').click();
    await wait(()=>window.__gameFrame.game.active==='nutrition');
    assert.equal(await locatorDisabled('mobility'),true);
    await saveAndReload('Активная программа');
    await start();
    await loc('[data-card="fertility"]:enabled').waitFor();
    await pause();
    await loc('[data-card="fertility"]').click();
    await wait(()=>window.__gameFrame.game.active==='fertility');
    await start();
    await wait(()=>window.__gameFrame.game.attempts[1]?.established!==null);
    await pause();
    const completed = await read();
    assert.equal(completed.game.spent,10);
    assert.ok(completed.game.attempts[0].introduced>0);
    assert.ok(completed.game.attempts[1].introduced>0);
    await saveAndReload('Два решения');
    const direct = gameWorld('coral-42','garden');
    const {engine,game,genealogy}=direct;
    game.command({id:1,kind:'choose',founder:1},engine,genealogy);
    for (const [i,attempt] of completed.game.attempts.entries()) {
      while(engine.tick<attempt.start)game.step(engine,genealogy);
      assert.ok(game.command({id:i+2,kind:'buy',card:attempt.card},engine,genealogy).accepted);
    }
    await loc('#step').click();
    await wait(tick=>window.__gameFrame.metrics.tick===tick,completed.tick+1);
    while(engine.tick<=completed.tick)game.step(engine,genealogy);
    assert.deepEqual((await read()).game,game.view(genealogy));
    assert.deepEqual(await page.evaluate(()=>window.__gameFrame.metrics),engine.metrics());
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
    const screenshot = `${output}/game-${width}x${height}.png`;
    await page.screenshot({path:screenshot,fullPage:true});
    await create('zero','empty');
    await start();
    await wait(()=>window.__gameFrame.game.lost);
    assert.equal(await loc('#play').isDisabled(),true);
    assert.match(await loc('#game-status').innerText(),/вымерла/i);
    await create('coral-42','garden');
    assert.equal((await read()).game.spent,0);
    assert.deepEqual(errors,[]);
    await writeFile(`${output}/game-e2e-${width}.json`,JSON.stringify({status:'PASS',viewport:{width,height},completed,screenshot,
      checks:['two purchases','active and completed slots survive reload','CLI/Worker agreement after resumed step','clock locks on extinction','restart clears progression','no horizontal overflow','no console errors']},null,2)+'\n');
    await page.close();
    console.log(`${width}x${height}: PASS`);
    function locatorDisabled(card){return loc(`[data-card="${card}"]`).isDisabled();}
  }
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
