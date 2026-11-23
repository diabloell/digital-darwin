import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';
import { gameWorld } from '../src/core/game.ts';
import { capture, decode, encode, restore } from '../src/snapshot.ts';

const output=process.env.DD_EVIDENCE_DIR||'outputs/verification';
await mkdir(output,{recursive:true});
const {engine,game,genealogy}=gameWorld('coral-42','garden',false,true);
game.command({id:1,kind:'choose',founder:1},engine,genealogy);
let id=1;
while(engine.tick<1200){
  const v=game.view(genealogy,engine);
  if(!game.active&&v.tree.offered.includes('explorer'))break;
  if(!game.active&&game.ep&&v.tree.offered.length)
    assert.ok(game.command({id:++id,kind:'buy',card:v.tree.offered[0]},engine,genealogy).accepted);
  game.step(engine,genealogy);
}
assert.equal(game.snapshot().attempts.length,10);
const file=await encode({...capture(engine,genealogy),game:game.snapshot()},'Готовая развилка','2026-11-23T00:00:00.000Z');
restore((await decode(file.text)).state);
const server=await startServer(0);
const browser=await chromium.launch({executablePath:process.env.DD_BROWSER});
const results=[];
try{
  for(const [width,height] of [[1920,1080],[1366,768],[390,844]]){
    const page=await browser.newPage({viewport:{width,height}});
    const errors=[];
    page.on('dialog',d=>d.accept());
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(()=>{
      window.Worker=class extends Worker{
        constructor(...args){
          super(...args);
          this.addEventListener('message',({data})=>{if(data.kind==='frame')window.treeFrame=data;});
        }
      };
    });
    const loc=s=>page.locator(s);
    await page.goto('http://127.0.0.1:'+server.address().port);
    await loc('#evolution-game summary').click();
    await loc('#game-tree-mode').check();
    await loc('#game-form .primary').click();
    await loc('#game-choose').click();
    await loc('#evolution-tree summary').click();
    assert.match(await loc('#tree-progress').innerText(),/0\/10/);
    assert.equal(await loc('#game-cards button:visible').count(),4);
    await loc('#world-saves summary').click();
    await loc('#save-list option').first().waitFor({state:'attached'});
    await loc('#save-world:enabled').waitFor();
    if(width===1366){
      const bad={...capture(engine,genealogy),game:game.snapshot()};
      bad.game.attempts[0].quote.duration++;
      const malformed=await encode(bad,'Invalid tree','2026-11-23T00:00:00.000Z');
      await loc('#import-file:enabled').setInputFiles({name:'world.json',mimeType:'application/json',buffer:Buffer.from(malformed.text)});
      await page.getByText('Некорректная малая программа',{exact:false}).waitFor();
      assert.equal(await page.evaluate(()=>window.treeFrame.metrics.tick),0);
      assert.equal(await page.evaluate(()=>window.treeFrame.game.tree.completed),0);
    }
    await loc('#import-file:enabled').setInputFiles({name:'world.json',mimeType:'application/json',buffer:Buffer.from(file.text)});
    await page.waitForFunction(()=>/Файл проверен|Ошибка|Некоррект|Недопуст|Несоглас|Неподдерж/.test(document.querySelector('#save-status').textContent),undefined,{timeout:5000})
      .catch(async error=>{ throw Error(JSON.stringify(await loc('#save-status').textContent()),{cause:error}); });
    assert.match(await loc('#save-status').textContent(),/Файл проверен/);
    await loc('#load-import:enabled').click();
    await page.waitForFunction(()=>window.treeFrame?.game?.tree?.completed===10);
    await loc('[data-card="explorer"]:enabled').click();
    await page.waitForFunction(()=>window.treeFrame?.game?.active==='explorer');
    await loc('[data-speed="4"]').click();
    await loc('#play').click();
    await page.waitForFunction(()=>window.treeFrame.game.attempts.at(-1).carriers>0);
    await loc('#play').click();
    await page.waitForFunction(()=>!window.treeFrame.running);
    const read=()=>page.evaluate(()=>({game:window.treeFrame.game,metrics:window.treeFrame.metrics}));
    const before=await read();
    assert.match(await loc('#game-programme').innerText(),/Дальние разведчики/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await loc('#evolution-tree').evaluate(el=>{el.open=true;});
    if(width===390)await loc('#evolution-tree').evaluate(el=>el.scrollIntoView({block:'center'}));
    else await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:`${output}/tree-${width}x${height}.png`});
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
    await page.waitForFunction(t=>window.treeFrame.metrics.tick===t+1,before.metrics.tick);
    assert.deepEqual(errors,[]);
    results.push({width,height,tick:before.metrics.tick,ep:before.game.ep,attempt:before.game.attempts.at(-1),status:'PASS'});
    await page.close();
  }
  await writeFile(output+'/tree-e2e.json',JSON.stringify({status:'PASS',results},null,2)+'\n');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
