import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const output=process.env.DD_EVIDENCE_DIR||'outputs/verification';
await mkdir(output,{recursive:true});
const server=await startServer(0);
const browser=await chromium.launch({executablePath:process.env.DD_BROWSER});
const origin='http://127.0.0.1:'+server.address().port;
const sizes=[[1920,1080],[1366,768],[390,844]].filter(([w])=>!process.argv[2]||w===Number(process.argv[2]));
const results=[];
try{
  for(const [width,height] of sizes){
    const page=await browser.newPage({viewport:{width,height},hasTouch:width===390,reducedMotion:'reduce'});
    const errors=[],remote=[];
    page.on('dialog',d=>d.accept());
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{if(!r.url().startsWith(origin))remote.push(r.url());});
    await page.addInitScript(()=>{
      window.Worker=class extends Worker{
        constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data.kind==='frame')window.dd13=data;});}
      };
    });
    const loc=s=>page.locator(s);
    const read=()=>page.evaluate(()=>({epoch:window.dd13.epoch,metrics:window.dd13.metrics,game:window.dd13.game,running:window.dd13.running}));
    const photo=async(name,center)=>{
      if(center)await loc(center).evaluate(e=>e.scrollIntoView({block:'center'}));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:`${output}/${name}-${width}x${height}.png`});
    };
    const openSaves=async()=>{
      if(!await loc('#world-saves').evaluate(e=>e.open))await loc('#world-saves summary').click();
      await loc('#save-list option').first().waitFor({state:'attached'});
    };
    const globe=()=>loc('#planet-globe').evaluate(e=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(e.toDataURL())))));
    const saveReload=async name=>{
      const savedPlanet=await globe();
      const before=await read();
      await openSaves();
      await loc('#save-name').fill(name);
      await loc('#save-world').click();
      await page.getByText('Сохранено в браузере',{exact:false}).waitFor();
      const slot=await loc('#save-list').inputValue();
      await page.reload();
      await loc('#play:enabled').waitFor();
      await openSaves();
      await loc('#save-list').selectOption(slot);
      await loc('#load-world').click();
      await page.getByText('Мир восстановлен на паузе',{exact:false}).waitFor().catch(async error=>{
        throw new Error(await loc('#save-status').textContent()+' | '+errors.join(' | '),{cause:error});
      });
      const {epoch,...world}=await read(),{epoch:old,...expected}=before;
      assert.deepEqual(world,expected);
      assert.equal(await globe(),savedPlanet);
      assert.equal(await loc('dialog[open]').count(),0);
    };
    await page.goto(origin);
    await loc('#play:enabled').waitFor();
    const observer=await read();
    await loc('#quick-game').focus();
    await page.keyboard.press('Enter');
    const firstName=await loc('#welcome-name').innerText();
    await loc('#welcome-random').click();
    assert.notEqual(await loc('#welcome-name').innerText(),firstName);
    await page.keyboard.press('Escape');
    assert.deepEqual(await read(),observer);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'quick-game');
    await loc('#quick-game').click();
    await loc('#welcome-advanced').click();
    assert.equal(await loc('#evolution-game').evaluate(e=>e.open),true);
    await photo('advanced','#evolution-game');
    await loc('#game-release-start').click();
    const seed=width===1366?'amber':'dune';
    await loc('#welcome-form details summary').click();
    await loc('#welcome-seed').fill(seed);
    const garden=await loc('#welcome-food').textContent();
    await loc('#welcome-difficulty').selectOption('scarce');
    assert.notEqual(await loc('#welcome-food').textContent(),garden);
    await photo('difficulty','#welcome-difficulty');
    await loc('#welcome-difficulty').selectOption('garden');
    assert.equal(await loc('#welcome-food').textContent(),garden);
    await loc('#world-welcome').evaluate(e=>e.scrollTo(0,0));
    await photo('welcome');
    const previewPixels=await loc('#welcome-globe').evaluate(e=>e.toDataURL());
    const expectedFood=Number(garden.replace(/[\s\u00a0]/g,'').replace(',','.').replace('ед.',''));
    if(width===390)await loc('#welcome-create').tap();
    else await loc('#welcome-create').click();
    await loc('#game-choice').waitFor();
    assert.equal(await globe(),previewPixels);
    const spawned=await read();
    assert.equal(spawned.metrics.tick,0);
    assert.equal(spawned.game.founder,null);
    assert.equal(spawned.running,false);
    assert.ok(Math.abs(spawned.metrics.food-expectedFood)<.051);
    const founder=seed==='amber'?58:40;
    await loc('#game-founder').selectOption(String(founder));
    await photo('founder',width===390?'#game-choice':undefined);
    await loc('#game-choose').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(id=>window.dd13.game.founder===id,founder);
    await loc('[data-speed="16"]').click();
    await loc('#play').click();
    await loc('#evolution-decision[open]').waitFor();
    const first=await read();
    assert.equal(first.running,false);
    assert.ok(first.game.ep>=1);
    const decisionCount=await loc('#decision-cards button').count();
    assert.ok(decisionCount>=3&&decisionCount<=4);
    await page.keyboard.press('Shift+Tab');
    assert.ok(await page.evaluate(()=>document.querySelector('#evolution-decision').contains(document.activeElement)));
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(()=>document.querySelector('#evolution-decision').contains(document.activeElement)));
    await loc('#evolution-tree').evaluate(e=>{e.open=true;});
    await loc('#tree-nodes li').first().waitFor({state:'attached'});
    const descriptions=await loc('#game-cards section').all();
    assert.equal(descriptions.length,14);
    const copy=await import('../src/game/card-copy.ts');
    const tree=await loc('#tree-nodes li').allTextContents();
    for(const [card,description] of Object.entries(copy.CARD_COPY)){
      const panel=loc(`#game-cards section:has([data-card="${card}"])`);
      const text=await panel.textContent();
      for(const field of Object.values(description))assert.ok(text.includes(field));
      assert.ok(tree.some(row=>Object.values(description).every(field=>row.includes(field))));
    }
    for(const button of await loc('#decision-cards button').all()){
      const card=await button.getAttribute('data-decision-card');
      const text=await button.locator('..').textContent();
      for(const field of Object.values(copy.CARD_COPY[card]))assert.ok(text.includes(field));
    }
    await loc('#evolution-tree').evaluate(e=>{e.open=false;});
    await loc('#decision-cards summary').first().click();
    await photo('fix2-decision');
    await page.keyboard.press('Escape');
    await loc('#evolution-decision').waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.activeElement.id==='choose-adaptation');
    assert.deepEqual(await read(),first);
    await loc('#step').click();
    await page.waitForFunction(t=>window.dd13.metrics.tick===t+1,first.metrics.tick);
    assert.equal(await loc('#evolution-decision').evaluate(e=>e.open),false);
    await saveReload('Доступная адаптация');
    await loc('#choose-adaptation').click();
    await loc('#decision-cards button').first().evaluate(button=>{button.click();button.click();});
    await page.waitForFunction(()=>window.dd13.game.active!==null);
    const purchase=await read();
    assert.equal(purchase.running,false);
    assert.equal(purchase.game.spent,1);
    assert.equal(purchase.game.attempts.length,1);
    assert.match(await loc('#programme-feedback').innerText(),/началась программа/);
    await saveReload('Активная программа');
    await loc('[data-speed="16"]').click();
    await loc('#play').click();
    await loc('#evolution-decision[open]').waitFor();
    await loc('#decision-later').click();
    assert.match(await loc('#programme-feedback').innerText(),/программа завершилась/);
    await photo('feedback','#programme-feedback');
    const completed=await read();
    assert.equal(completed.game.spent,1);
    assert.equal(completed.running,false);
    if(seed==='amber'){
      await loc('[data-speed="32"]').click();
      await loc('#play').click();
      await loc('#retry-seed').waitFor();
      await loc('#retry-seed').click();
      await loc('#game-choice').waitFor();
      assert.equal((await read()).game.founder,null);
      assert.equal((await read()).metrics.tick,0);
    }
    assert.deepEqual(errors,[]);
    assert.deepEqual(remote,[]);
    results.push({width,height,seed,founder,firstTick:first.metrics.tick,purchaseTick:purchase.metrics.tick,
      finishedTick:completed.metrics.tick,options:decisionCount,spent:completed.game.spent});
    await page.close();
  }
  await writeFile(output+'/welcome-e2e.json',JSON.stringify({status:'PASS',results},null,2)+'\n');
}finally{
  await browser.close();
  await new Promise(r=>server.close(r));
}
