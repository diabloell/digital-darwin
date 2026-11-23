import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';
import { generatePlanet, planetCell } from '../src/core/planet.ts';

const output=process.env.DD_EVIDENCE_DIR||'outputs/verification';
await mkdir(output,{recursive:true});
const server=await startServer(0);
const browser=await chromium.launch({executablePath:process.env.DD_BROWSER});
const origin='http://127.0.0.1:'+server.address().port;
const results=[];
try{
  for(const [width,height] of [[1920,1080],[1366,768],[390,844]]){
    const page=await browser.newPage({viewport:{width,height},hasTouch:width===390,reducedMotion:'reduce'});
    const errors=[],remote=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{if(!r.url().startsWith(origin))remote.push(r.url());});
    await page.addInitScript(()=>{
      window.Worker=class extends Worker{
        constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data.kind==='frame')window.fixFrame=data;});}
      };
    });
    const loc=s=>page.locator(s);
    const state=()=>page.evaluate(()=>{
      const {epoch,seed,metrics,game,running}=window.fixFrame;
      return {epoch,seed,metrics,game,running};
    });
    const geography=()=>page.evaluate(()=>{
      const f=window.fixFrame;
      return {seed:f.seed,metrics:f.metrics,game:f.game,food:[...f.food],ids:[...f.ids],positions:[...f.positions]};
    });
    const globe=loc('#welcome-globe');
    const paint=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const pixels=()=>globe.evaluate(e=>e.toDataURL());
    const touch=width===390?await page.context().newCDPSession(page):null;
    const drag=async()=>{
      const r=await globe.boundingBox();
      const x=r.x+r.width*.35,y=r.y+r.height*.50;
      if(touch){
        const send=(type,points)=>touch.send('Input.dispatchTouchEvent',{type,touchPoints:points});
        await send('touchStart',[{x,y}]);
        await send('touchMove',[{x:x+r.width*.32,y}]);
        await send('touchEnd',[]);
      }else{
        await page.mouse.move(x,y);
        await page.mouse.down();
        await page.mouse.move(x+r.width*.32,y,{steps:5});
        await page.mouse.up();
      }
      await paint();
    };
    await page.goto(origin);
    await loc('#play:enabled').waitFor();
    const started=performance.now();
    await loc('#quick-game').click();
    await globe.waitFor();
    await paint();
    const openedMs=performance.now()-started;
    await loc('#welcome-form details summary').click();
    const readings=[];
    for(const seed of ['dune','amber']){
      await loc('#welcome-seed').fill(seed);
      const p=generatePlanet(seed,40,40);
      const food=scale=>p.layers.fertility.reduce((sum,f)=>sum+planetCell(f,scale).food,0)/1000;
      for(const habitat of ['garden','scarce']){
        await loc('#welcome-difficulty').selectOption(habitat);
        const properties={light:p.light*100,heat:p.temperature*100,water:p.wetCells/16,fertility:p.meanFertility,food:food(habitat==='garden'?1:.30)/food(1)*100};
        for(const [key,value] of Object.entries(properties)){
          const metric=loc('#welcome-'+key+'-meter');
          assert.ok(Math.abs(await metric.evaluate(e=>e.value)-value)<1e-9);
          assert.ok(await metric.getAttribute('aria-valuetext'));
          assert.ok(await loc('#welcome-'+key+'-band').isVisible());
          assert.ok(await metric.locator('..').locator('p').isVisible());
          assert.equal(await loc('#welcome-'+key).isVisible(),false);
        }
        readings.push({seed,habitat,properties,food:food(habitat==='garden'?1:.30)});
      }
    }
    await loc('.welcome-raw summary').click();
    assert.match(await loc('#welcome-food').innerText(),/ед\./);
    assert.doesNotMatch(await loc('#welcome-heat').innerText(),/°/);
    await loc('.welcome-raw summary').click();
    await loc('#welcome-form details summary').click();
    await loc('#world-welcome').evaluate(el=>el.scrollTo(0,0));
    await paint();
    const baseline=await pixels(), interaction=performance.now();
    await drag();
    const dragMs=performance.now()-interaction;
    const rotated=await pixels();
    assert.notEqual(rotated,baseline);
    if(width!==1366)await page.screenshot({path:`${output}/fix-rotated-${width}x${height}.png`});
    await loc('#globe-in').click();
    await paint();
    assert.notEqual(await pixels(),rotated);
    if(!touch){
      const zoomed=await pixels();
      await globe.hover();
      const previousScroll=await loc('#world-welcome').evaluate(el=>el.scrollTop);
      await page.mouse.wheel(0,180);
      await paint();
      assert.notEqual(await pixels(),zoomed);
      assert.equal(await loc('#world-welcome').evaluate(el=>el.scrollTop),previousScroll);
    }
    await globe.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('-');
    await page.keyboard.press('Home');
    await paint();
    assert.equal(await pixels(),baseline);
    await loc('#world-welcome').evaluate(el=>el.scrollTo(0,0));
    await page.screenshot({path:`${output}/fix-welcome-${width}x${height}.png`});
    if(width===390){
      await page.mouse.move(width-10,height-20);
      await page.mouse.wheel(0,220);
      await page.waitForFunction(()=>document.querySelector('#world-welcome').scrollTop>0);
    }
    await loc('#globe-reset').click();
    await paint();
    assert.equal(await pixels(),baseline);
    assert.ok(await page.evaluate(()=>document.querySelector('#world-welcome').scrollWidth<=innerWidth));
    await loc('#welcome-create').click();
    await loc('#game-choice').waitFor();
    const created=await state();
    const originalGeography=await geography();
    assert.equal(created.seed,'amber');
    assert.equal(created.metrics.food,readings.at(-1).food);
    assert.equal(created.game.habitat,'scarce');
    assert.equal(created.metrics.tick,0);
    const select=async()=>{
      await loc('#game-choose').click();
      await loc('#play:enabled').click();
      await page.waitForFunction(()=>window.fixFrame.metrics.tick>=3);
    };
    await select();
    await loc('#quick-game').click();
    await loc('#world-welcome[open]').waitFor();
    const paused=await state();
    assert.equal(paused.running,false);
    await drag();
    await loc('#globe-in').click();
    await loc('#welcome-random').click();
    await loc('#welcome-difficulty').selectOption('garden');
    await page.keyboard.press('Escape');
    assert.deepEqual(await state(),paused);
    await loc('#quick-game').click();
    await globe.waitFor();
    await paint();
    assert.equal(await pixels(),baseline);
    await drag();
    await loc('#globe-in').click();
    page.once('dialog',d=>d.accept());
    await loc('#welcome-create').click();
    await loc('#game-choice').waitFor();
    assert.deepEqual(await geography(),originalGeography);
    assert.deepEqual(errors,[]);
    assert.deepEqual(remote,[]);
    results.push({width,height,status:'PASS',openedMs,dragMs,pausedTick:paused.metrics.tick,touch:Boolean(touch),readings});
    await page.close();
  }
  await writeFile(output+'/fix-e2e.json',JSON.stringify({status:'PASS',results},null,2)+'\n');
}finally{
  await browser.close();
  await new Promise(r=>server.close(r));
}
