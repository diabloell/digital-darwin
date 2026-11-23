import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startServer} from './serve.mjs';

const output=process.env.DD_EVIDENCE_DIR||'outputs/verification';
await mkdir(output,{recursive:true});
const server=await startServer(0);
const browser=await chromium.launch({executablePath:process.env.DD_BROWSER});
const result=[];
try{
  for(const [width,height] of [[1920,1080],[1366,768],[390,844]]){
    const mobile=width===390;
    const page=await browser.newPage({viewport:{width,height},hasTouch:mobile});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      window.Worker=class extends Worker{
        constructor(...args){
          super(...args);
          window.geographyWorker=this;
          this.addEventListener('message',({data})=>{if(data.kind==='frame')window.geographyFrame=data;});
        }
      };
    });
    const loc=s=>page.locator(s);
    await page.goto('http://127.0.0.1:'+server.address().port);
    await loc('#play:enabled').waitFor();
    assert.equal(await loc('#explore-regions').isVisible(),false);
    await loc('#quick-game').click();
    await loc('#welcome-form details summary').click();
    await loc('#welcome-seed').fill('amber');
    await loc('#welcome-create').click();
    await loc('#game-founder').selectOption('58');
    await loc('#game-choose').click();
    await page.waitForFunction(()=>window.geographyFrame.game.founder===58);
    await loc('#explore-regions').click();
    await loc('#fit').click();
    assert.equal(await loc('#terrain-layer').inputValue(),'regions');
    assert.equal(await loc('#explore-regions').getAttribute('aria-pressed'),'true');
    assert.equal(await loc('#region-key span').count(),3);
    await loc('#viewport').evaluate(e=>e.scrollIntoView({block:'start'}));
    const targets=await page.evaluate(()=>{
      const {planet,width}=window.geographyFrame;
      const rows=[];
      for(let y=6;y<30;y++)for(let x=6;x<30;x++){
        const i=y*width+x,w=planet.layers.water[i],f=planet.layers.fertility[i],t=planet.layers.temperature[i];
        if(w<38||f<25)rows[0]??={x,y,name:'Скудные земли'};
        if(w>=60&&f>=38&&Math.abs(t-60)<=12)rows[1]??={x,y,name:'Влажные плодородные земли'};
      }
      return rows;
    });
    assert.ok(targets[0]&&targets[1]);
    const inspect=async({x,y,name})=>{
      const box=await loc('#world').boundingBox();
      const scale=Math.min(box.width,box.height)/40*.88;
      const px=box.x+box.width/2+(x+.5-20)*scale, py=box.y+box.height/2+(y+.5-20)*scale;
      if(mobile)await page.touchscreen.tap(px,py);
      else await page.mouse.move(px,py);
      assert.match(await loc('#region-cell').innerText(),new RegExp(name+' · '+x+', '+y));
      const expected=await page.evaluate(i=>{
        const f=window.geographyFrame,n=v=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:3}).format(v);
        return {stock:n(f.planetFood[i]/1000),moisture:f.planet.layers.water[i],heat:f.planet.layers.temperature[i],fertility:f.planet.layers.fertility[i]};
      },y*40+x);
      const text=await loc('#region-values').innerText();
      assert.ok(text.includes('Пища '+expected.stock+' /'));
      assert.ok(text.includes('Влага '+expected.moisture+'/100')&&text.includes('Тепло '+expected.heat+'/100')&&text.includes('Плодородие '+expected.fertility+'/100'));
      assert.match(text,/Давление [0-9]+\/16/);
      return text;
    };
    const dry=await inspect(targets[0]);
    const wet=await inspect(targets[1]);
    await loc('#viewport').focus();
    await page.keyboard.press('ArrowRight');
    assert.ok((await loc('#region-cell').innerText()).includes(` · ${targets[1].x+1}, ${targets[1].y}`));
    const zoomBefore=await loc('#camera-readout').innerText();
    await page.keyboard.press('+');
    await page.waitForFunction(old=>document.querySelector('#camera-readout').textContent!==old,zoomBefore);
    await loc('#fit').click();
    await inspect(targets[1]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`${output}/regions-${width}.png`});
    await page.evaluate(()=>new Promise(resolve=>{
      const worker=window.geographyWorker;
      let lastRequested=window.geographyFrame.metrics.tick;
      worker.addEventListener('message',function receive({data}){
        if(data.kind!=='frame')return;
        if(data.metrics.tick>=110){worker.removeEventListener('message',receive);resolve();return;}
        if(data.metrics.tick<=lastRequested)return;
        lastRequested=data.metrics.tick;
        worker.postMessage({kind:'step'});
      });
      worker.postMessage({kind:'step'});
    }));
    if(await loc('#evolution-decision').isVisible()){
      await loc('#decision-later').click();
      await page.waitForFunction(()=>document.activeElement?.id==='choose-adaptation');
    }
    await loc('#viewport').evaluate(e=>e.scrollIntoView({block:'start'}));
    assert.ok(await page.evaluate(()=>window.geographyFrame.ecology.collapsed.some(Boolean)));
    const tickLater=await page.evaluate(()=>window.geographyFrame.metrics.tick);
    assert.equal(tickLater,110);
    const wetLater=await inspect(targets[1]);
    assert.notEqual(wetLater,wet);
    assert.equal(await loc('#line-map-legend').isVisible(),true);
    await loc('#viewport').evaluate(e=>e.scrollIntoView({block:'start'}));
    await page.screenshot({path:`${output}/change-${width}.png`});
    await loc('#explore-regions').click();
    assert.equal(await loc('#terrain-layer').inputValue(),'forage');
    assert.deepEqual(errors,[]);
    result.push({width,height,input:mobile?'touch':'mouse',targets,dry,wet,tickLater,wetLater});
    await page.close();
  }
  await writeFile(output+'/geography-browser.json',JSON.stringify({browser:browser.version(),result},null,2)+'\n');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
