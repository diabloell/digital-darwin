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
      if(!await loc('#evolution-game').evaluate(el=>el.open))await loc('#evolution-game summary').click();
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
    const screenshotConsole = async (name) => {
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:`${output}/${name}-${width}x${height}.png`});
    };
    const atTop = () => page.evaluate(()=>window.scrollTo(0,0));
    const rawWorld = () => page.evaluate(()=>{
      const {metrics,positions,ids,food,game}=window.__gameFrame;
      return {metrics,positions:[...positions],ids:[...ids],food:[...food],game};
    });
    await atTop();
    for (const selector of ['#viewport','#game-ep','#game-cards button','#play']) {
      if(width===390 && selector.includes('game-cards'))continue;
      const box=await loc(selector).first().boundingBox();
      assert.ok(box && box.y>=0 && box.y+box.height<=height,`${selector} outside first viewport at ${width}`);
    }
    if(width===390){
      await loc('#viewport').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'zoom-in');
    }
    await screenshotConsole('console');
    const initial = await rawWorld();
    const camera = await loc('#camera-readout').textContent();
    await loc('#world').hover();
    const scrollBefore = await page.evaluate(()=>scrollY);
    await page.mouse.wheel(0,-200);
    await wait(before=>document.querySelector('#camera-readout').textContent!==before,camera);
    assert.equal(await page.evaluate(()=>scrollY),scrollBefore);
    await loc('#focus-line').click();
    await loc('#fit').click();
    assert.deepEqual(await rawWorld(),initial);
    await loc('#star-system summary').click();
    assert.match(await loc('#star-system p').innerText(),/Декоративная схема/);
    assert.deepEqual(await rawWorld(),initial);
    if(width===1366)await screenshotConsole('star-system');
    await loc('#star-system summary').click();
    await atTop();
    await loc('.masthead nav [data-open="experiment-lab"]').click();
    await loc('#lab-preset').waitFor();
    assert.deepEqual(await rawWorld(),initial);
    await loc('#experiment-lab > summary').click();
    await atTop();
    await page.mouse.move(width-9,Math.min(250,height-5));
    await page.mouse.wheel(0,420);
    await wait(()=>scrollY>100);
    await atTop();
    assert.equal(await locatorDisabled('nutrition'),true);
    await start();
    await loc('[data-card="nutrition"]:enabled').waitFor();
    await pause();
    await loc('[data-card="nutrition"]').click();
    await wait(()=>window.__gameFrame.game.active==='nutrition');
    assert.equal(await locatorDisabled('mobility'),true);
    assert.match(await loc('#console-programme').innerText(),/Усвоение/);
    assert.equal(await loc('#game-progress').isVisible(),true);
    assert.match(await loc('#game-programme').innerText(),/носители/);
    if(width===1366){
      await start();
      await wait(()=>window.__gameFrame.metrics.tick>=window.__gameFrame.game.attempts[0].start+75);
      await pause();
      await atTop();
      await screenshotConsole('active-programme');
    }
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
    if(width===1366){
      await loc('#game-analysis > summary').click();
      await loc('#game-samples table').waitFor();
      await loc('#analysis').evaluate(el=>el.scrollIntoView());
      await screenshotConsole('deep-analysis');
    }
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
      checks:['two purchases','active and completed slots survive reload','CLI/Worker agreement after resumed step','clock locks on extinction','restart clears progression','first-screen console','camera and star system preserve paused world','laboratory navigation preserves paused game','wheel zoom and page scroll','no horizontal overflow','no console errors']},null,2)+'\n');
    await page.close();
    console.log(`${width}x${height}: PASS`);
    function locatorDisabled(card){return loc(`[data-card="${card}"]`).isDisabled();}
  }
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
