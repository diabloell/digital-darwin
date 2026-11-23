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
      window.miniPaints=0;
      const put=CanvasRenderingContext2D.prototype.putImageData;
      CanvasRenderingContext2D.prototype.putImageData=function(...args){
        if(this.canvas.id==='planet-globe')window.miniPaints++;
        return put.apply(this,args);
      };
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
    // The intro keeps keyboard rotation but does not display directional buttons.
    assert.equal(await loc('#welcome-visual [data-globe-action="left"], #welcome-visual [data-globe-action="right"], #welcome-visual [data-globe-action="up"], #welcome-visual [data-globe-action="down"]').count(),0);
    const paint=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const pixels=()=>globe.evaluate(e=>e.toDataURL());
    const touch=width===390?await page.context().newCDPSession(page):null;
    const drag=async(dx=.32,dy=0,target=globe)=>{
      const r=await target.boundingBox();
      const x=r.x+r.width*.50,y=r.y+r.height*.50;
      if(touch){
        const send=(type,points)=>touch.send('Input.dispatchTouchEvent',{type,touchPoints:points});
        await send('touchStart',[{x,y}]);
        await send('touchMove',[{x:x+r.width*dx,y:y+r.height*dy}]);
        await send('touchEnd',[]);
      }else{
        await page.mouse.move(x,y);
        await page.mouse.down();
        await page.mouse.move(x+r.width*dx,y+r.height*dy,{steps:5});
        await page.mouse.up();
      }
      await paint();
    };
    await page.goto(origin);
    await loc('#play:enabled').waitFor();
    assert.ok(await loc('#planet-placeholder').isVisible());
    assert.equal(await loc('#planet-globe').isVisible(),false);
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
    await loc('#welcome-form details summary').click();
    const camera=[];
    for(const seed of ['dune','amber']){
      await loc('#welcome-form details summary').click();
      await loc('#welcome-seed').fill(seed);
      await loc('#welcome-form details summary').click();
      await loc('#world-welcome').evaluate(e=>e.scrollTo(0,0));
      await paint();
      const base=await pixels();
      const shifts=[];
      for(const sign of [-1,1]){
        await drag(sign*.08);
        const shift=await globe.evaluate(async(e,base)=>{
          const baseline=new Image();
          baseline.src=base;
          await baseline.decode();
          const ref=document.createElement('canvas');
          ref.width=ref.height=400;
          const ctx=ref.getContext('2d');
          ctx.drawImage(baseline,0,0);
          const a=ctx.getImageData(0,198,400,5).data;
          const b=e.getContext('2d').getImageData(0,198,400,5).data;
          const color=(pixels,x,y,c)=>{
            const u=(x+.5-200)/168,v=(y+.5-2)/168;
            const z=Math.sqrt(1-u*u-v*v);
            const shade=.40+.63*(-.47*u-.32*v+.82*z);
            return (pixels[(y*400+x)*4+c]-[28,49,61][c]*(1-z)**3)/shade;
          };
          let best={angle:0,error:Infinity};
          for(let step=-45;step<=45;step++){
            const angle=step/100;
            let error=0;
            for(const y of [0,4])for(let x=120;x<280;x++)for(let c=0;c<3;c++){
              const u=(x+.5-200)/168,v=(y+.5-2)/168;
              const rho=Math.sqrt(1-v*v);
              const shifted=Math.round(199.5+168*rho*Math.sin(Math.asin(u/rho)+angle));
              error+=(color(a,x,y,c)-color(b,shifted,y,c))**2;
            }
            if(error<best.error)best={angle,error};
          }
          return Math.round(168*Math.sin(best.angle));
        },base);
        assert.ok(shift*sign>=35&&shift*sign<=50,JSON.stringify({seed,shift,sign,width}));
        shifts.push(shift);
        await globe.focus();
        await page.keyboard.press('Home');
        await paint();
        assert.equal(await pixels(),base);
      }
      await drag(0,.18);
      assert.notEqual(await pixels(),base);
      await globe.focus();
      for(let j=0;j<8;j++)await page.keyboard.press('ArrowDown');
      await paint();
      const lower=await pixels();
      await page.keyboard.press('ArrowDown');
      await paint();
      assert.equal(await pixels(),lower);
      for(let j=0;j<10;j++)await page.keyboard.press('ArrowUp');
      await paint();
      const upper=await pixels();
      assert.notEqual(upper,lower);
      await page.keyboard.press('ArrowUp');
      await paint();
      assert.equal(await pixels(),upper);
      assert.ok(await globe.evaluate(e=>{
        const rgba=e.getContext('2d').getImageData(0,0,400,400).data;
        for(let y=0;y<400;y++)for(let x=0;x<400;x++){
          if((x+.5-200)**2+(y+.5-200)**2>=168**2)continue;
          const i=(y*400+x)*4;
          if(rgba[i+3]!==255||rgba[i]+rgba[i+1]+rgba[i+2]===0)return false;
        }
        return true;
      }));
      await page.keyboard.press('Home');
      await paint();
      assert.equal(await pixels(),base);
      camera.push({seed,horizontalPixelShifts:shifts,pitchClamped:true,resetPixelExact:true});
    }
    await loc('#welcome-form details summary').click();
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
    await globe.focus();
    await page.keyboard.press('ArrowUp');
    await paint();
    if(width!==1366)await page.screenshot({path:`${output}/fix2-rotated-${width}x${height}.png`});
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
    await page.screenshot({path:`${output}/fix2-welcome-${width}x${height}.png`});
    if(width===390){
      const points=y=>[{x:width-12,y}];
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(height-42)});
      for(const y of [height-85,height-145,height-215]){
        await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(y)});
      }
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForFunction(()=>document.querySelector('#world-welcome').scrollTop>0);
    }
    await loc('#globe-reset').click();
    await paint();
    assert.equal(await pixels(),baseline);
    assert.ok(await page.evaluate(()=>document.querySelector('#world-welcome').scrollWidth<=innerWidth));
    await loc('#welcome-create').click();
    await loc('#game-choice').waitFor();
    const mini=loc('#planet-globe');
    assert.equal(await loc('#planet-mini [data-globe-action="left"], #planet-mini [data-globe-action="right"], #planet-mini [data-globe-action="up"], #planet-mini [data-globe-action="down"]').count(),4);
    await mini.waitFor();
    await paint();
    const miniPixels=()=>mini.evaluate(e=>e.toDataURL());
    assert.equal(await miniPixels(),baseline);
    await loc('#planet-mini').evaluate(e=>e.scrollIntoView({block:'center'}));
    await page.screenshot({path:`${output}/fix2-mini-${width}x${height}.png`});
    const beforeMini=await state();
    await drag(.12,.14,mini);
    const movedMini=await miniPixels();
    assert.notEqual(movedMini,baseline);
    await loc('#planet-mini [data-globe-action="in"]').click();
    await paint();
    assert.notEqual(await miniPixels(),movedMini);
    await loc('#planet-mini [data-globe-action="reset"]').click();
    await paint();
    assert.equal(await miniPixels(),baseline);
    assert.deepEqual(await state(),beforeMini);
    const paints=await page.evaluate(()=>window.miniPaints);
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
    assert.equal(await page.evaluate(()=>window.miniPaints),paints);
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
    results.push({width,height,status:'PASS',openedMs,dragMs,pausedTick:paused.metrics.tick,touch:Boolean(touch),camera,miniPaintsDuringTicks:0,miniPixelExact:true,readings});
    await page.close();
  }
  await writeFile(output+'/fix2-e2e.json',JSON.stringify({status:'PASS',results},null,2)+'\n');
}finally{
  await browser.close();
  await new Promise(r=>server.close(r));
}
