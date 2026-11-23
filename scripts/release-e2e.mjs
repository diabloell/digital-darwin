import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {packageRelease} from './release.mjs';
import {startStaticServer} from './local-server.mjs';
import {releaseWorld} from '../src/core/game.ts';

const output=process.env.DD_EVIDENCE_DIR||'outputs/verification';
await mkdir(output,{recursive:true});
const build=await packageRelease(output);
const second=await packageRelease(path.join(output,'.repro'));
assert.equal(build.manifest,second.manifest);

const journey=releaseWorld('dune');
const {game,engine,genealogy}=journey;
game.command({id:1,kind:'choose',founder:40},engine,genealogy);
const commands=[];
while(engine.tick<1200&&game.ready){
  if(!game.active&&game.ep){
    const v=game.view(genealogy,engine);
    const card=v.tree.offered.find(k=>v.tree.rows.find(row=>row.card===k).quote.price<=game.ep);
    if(card){
      const action={id:commands.length+2,kind:'buy',card};
      assert.ok(game.command(action,engine,genealogy).accepted);
      commands.push({tick:engine.tick,card});
      if(card==='local'||card==='explorer')break;
    }
  }
  game.step(engine,genealogy);
}
assert.equal(commands.length,11);

const server=await startStaticServer(0,path.join(build.target,'dist'));
const browser=await chromium.launch({executablePath:process.env.DD_BROWSER});
const base='http://127.0.0.1:'+server.address().port;
const results=[];
try{
  for(const [width,height] of [[1920,1080],[1366,768],[390,844]]){
    const page=await browser.newPage({viewport:{width,height}});
    const errors=[],remote=[];
    page.on('dialog',d=>d.accept());
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{if(!r.url().startsWith(base))remote.push(r.url());});
    await page.addInitScript(()=>{
      window.Worker=class extends Worker{
        constructor(...args){
          super(...args);
          this.addEventListener('message',({data})=>{
            if(data.kind!=='frame')return;
            window.releaseFrame=data;
            window.releaseWorker=this;
          });
        }
      };
      window.advanceRelease=target=>new Promise((resolve,reject)=>{
        const worker=window.releaseWorker;
        const timer=setTimeout(()=>{worker.removeEventListener('message',next);reject(Error('Step timeout'));},25000);
        function next({data}){
          if(data.kind!=='frame')return;
          if(data.metrics.tick>=target||data.game?.lost){
            clearTimeout(timer);worker.removeEventListener('message',next);resolve(data.metrics.tick);
          } else worker.postMessage({kind:'step'});
        }
        worker.addEventListener('message',next);
        worker.postMessage({kind:'step'});
      });
    });
    const loc=s=>page.locator(s);
    const read=()=>page.evaluate(()=>({metrics:window.releaseFrame.metrics,game:window.releaseFrame.game}));
    const snapshot=async(name,selector)=>{
      if(selector)await loc(selector).evaluate(el=>el.scrollIntoView({block:'center'}));
      else await page.evaluate(()=>scrollTo(0,0));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:`${output}/${name}-${width}x${height}.png`});
    };
    const to=t=>page.evaluate(tick=>window.advanceRelease(tick),t);
    const response=await page.goto(base);
    assert.match(response.headers()['content-security-policy'],/default-src 'self'/);
    await loc('#game-guide summary').click();
    await snapshot('first-run',width===390?'#quick-game':undefined);
    await loc('#game-guide summary').click();
    let clock;
    if(width===1920){
      await loc('#evolution-game summary').click();
      await loc('#game-seed').fill('dune');
      await loc('#game-release-start').click();
      await loc('#game-founder').selectOption('40');
      await loc('#game-choose').click();
      await loc('[data-speed="4"]').click();
      const started=performance.now();
      await loc('#play').click();
      await page.waitForFunction(()=>window.releaseFrame?.metrics.tick>=16);
      clock={tick:(await read()).metrics.tick,elapsedMs:performance.now()-started,speed:4};
      await loc('#play').click();
      await page.waitForFunction(()=>!window.releaseFrame.running);
      let hasCarriers=false;
      for(const [index,buy] of commands.entries()){
        assert.equal(await to(buy.tick),buy.tick);
        if(index===10)await snapshot('fork');
        await loc(`[data-card="${buy.card}"]:enabled`).click();
        await page.waitForFunction(card=>window.releaseFrame.game.active===card,buy.card);
        if(index<2){
          const end=buy.tick+40;
          assert.equal(await to(end),end);
          hasCarriers ||= (await read()).game.attempts.some(a=>a.carriers>0);
          if(index===0){
            await loc('#terrain-layer').selectOption('crisis');
            await snapshot('active-evolution');
            const before=await read();
            assert.ok(await page.evaluate(()=>window.releaseFrame.ecology.collapses>window.releaseFrame.ecology.recoveries));
            await snapshot('crisis');
            await loc('#world-saves summary').click();
            await loc('#save-list option').first().waitFor({state:'attached'});
            await loc('#import-file:enabled').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
            await page.getByText('Некорректный JSON',{exact:false}).waitFor();
            assert.deepEqual(await read(),before);
            await loc('#save-world').click();
            await page.getByText('Сохранено в браузере',{exact:false}).waitFor();
            const slot=await loc('#save-list').inputValue();
            await page.reload();
            await loc('#world-saves summary').click();
            await loc('#save-list').selectOption(slot);
            await loc('#load-world').click();
            await page.getByText('Мир восстановлен на паузе',{exact:false}).waitFor();
            assert.deepEqual(await read(),before);
            await loc('[data-open="experiment-lab"]').click();
            await loc('#lab-preset').waitFor();
            assert.deepEqual(await read(),before);
          }
        }
      }
      const terminal=await read();
      assert.equal(terminal.game.tree.completed,10);
      assert.ok(hasCarriers||terminal.game.attempts.some(a=>a.peak>0));
    } else {
      await loc('#quick-game').click();
      await loc('#game-choose').click();
      await page.waitForFunction(()=>window.releaseFrame?.game?.founder===1);
      assert.equal((await read()).game.version,3);
      await to(70);
      await loc('#game-cards button:enabled').first().click();
      await page.waitForFunction(()=>window.releaseFrame.game.attempts.length===1);
      await snapshot('active-evolution',width===390?'#game-programme':undefined);
    }
    if(width!==1920){
      await to(350);
      const lost=await read();
      assert.ok(lost.game.lost);
      await snapshot('debrief','#game-debrief');
      assert.match(await loc('#debrief-results').innerText(),/Адаптации/);
      const oldSeed=await loc('#world-seed').textContent();
      await loc('#retry-seed').click();
      await page.waitForFunction(()=>window.releaseFrame?.game?.founder===null);
      assert.equal((await read()).metrics.tick,0);
      assert.equal((await read()).game.ep,0);
      assert.equal(await loc('#world-seed').textContent(),oldSeed);
    }
    assert.deepEqual(errors,[]);
    assert.deepEqual(remote,[]);
    results.push({width,height,status:'PASS',clock,commands:width===1920?commands:undefined});
    await page.close();
  }
  await writeFile(output+'/release-e2e.json',JSON.stringify({status:'PASS',packageReproducible:true,results},null,2)+'\n');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
