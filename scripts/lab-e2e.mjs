import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startServer} from './serve.mjs';

const output=process.env.DD_EVIDENCE_DIR??'outputs/verification';
await mkdir(output,{recursive:true});
const server=await startServer(0);
let browser;
const results=[],screenshots=[];
const sizes=[[1920,1080],[1366,768],[390,844]].filter(([width])=>!process.argv[2]||String(width)===process.argv[2]);
assert.ok(sizes.length, 'Unknown viewport');
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.DD_BROWSER});
  for(const [width,height] of sizes){
    const page=await browser.newPage({viewport:{width,height}});
    page.setDefaultTimeout(12000);
    console.log(`Lab viewport ${width}×${height}: opening observer`);
    await page.addInitScript(()=>{
      const Native=Worker;
      window.Worker=class extends Native{
        constructor(...args){
          super(...args);
          this.addEventListener('message',({data})=>{
            if(data.kind==='frame')window.__observerFrame=data;
          });
        }
      };
    });
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#play:enabled').waitFor();
    await page.locator('#step').click();
    await page.waitForFunction(()=>document.querySelector('#tick').textContent==='1');
    const tick=await page.locator('#tick').innerText(),seed=await page.locator('#world-seed').innerText();
    const worldState=()=>page.evaluate(()=>{
      const f=window.__observerFrame;
      return {metrics:f.metrics,seed:f.seed,ids:[...f.ids],positions:[...f.positions],food:[...f.food]};
    });
    const before=await worldState();
    const snapshot=async name=>{
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const path=`${output}/${name}-${width}x${height}.png`;
      await page.screenshot({path,fullPage:true});screenshots.push(path);
    };
    await page.locator('#experiment-lab>summary').click();
    await page.locator('#lab-preset').selectOption('LAB-E02');
    await page.locator('#lab-seeds').fill('dd02-amber\n🌱-ui');
    await page.locator('#lab-duration').fill(width===1366?'2400':'1200');
    await page.locator('#lab-interval').fill('100');
    assert.equal(await page.locator('#lab-count').innerText(),'2');
    if(width===1920)await snapshot('laboratory');
    await page.locator('#lab-run').click();
    await page.waitForFunction(()=>document.querySelector('#lab-status').textContent.startsWith('Реплика'));
    console.log(`Lab viewport ${width}: live series progress`);
    const raf=await page.evaluate(async ()=>{
      const start=performance.now();
      let frames=0;
      await new Promise(resolve=>{
        function next(now){frames++;if(now-start>=400)resolve();else requestAnimationFrame(next);}
        requestAnimationFrame(next);
      });
      return frames;
    });
    assert.ok(raf>5);
    if(width===1366)await snapshot('progress');
    await page.getByText('Архивировано · completed',{exact:true}).waitFor();
    console.log(`Lab viewport ${width}: results archived`);
    const elapsedStart=performance.now();
    const download=async button=>{
      const [file]=await Promise.all([page.waitForEvent('download'),page.locator(button).click()]);
      return readFile(await file.path(),'utf8');
    };
    const packed=JSON.parse(await download('#lab-json')),series=JSON.parse(packed.payload);
    assert.equal(series.runs.length,4);
    const expected=series.runs.map(r=>[r.conditionId,r.seed,r.status,String(r.ticks),r.final.population.toLocaleString('ru-RU',{maximumFractionDigits:3})]);
    const actual=await page.locator('#lab-runs tbody tr').evaluateAll(rows=>rows.map(r=>Array.from(r.cells).slice(0,5).map(c=>c.textContent)));
    assert.deepEqual(actual,expected);
    assert.equal(await page.locator('#lab-hash').textContent(),series.scenarioHash);
    const text=await download('#lab-csv');
    assert.ok(text.includes('intervalBirths')&&text.includes(series.runs[0].hash));
    assert.ok((await download('#lab-md')).includes(series.scenarioHash));
    await page.locator('#lab-filter').selectOption('🌱-ui');
    assert.equal(await page.locator('#lab-runs tbody tr').count(),2);
    await page.locator('#lab-metric').selectOption('food');
    assert.match(await page.locator('#lab-chart').getAttribute('aria-label'),/Пища.*🌱-ui/);
    const renderMs=Number(await page.locator('#lab-chart').getAttribute('data-render-ms'));
    if(width===390)await snapshot('comparison');
    assert.deepEqual(await worldState(),before);
    assert.equal(await page.locator('#tick').innerText(),tick);
    assert.equal(await page.locator('#world-seed').innerText(),seed);
    const archived=await page.locator('#lab-archive').inputValue();
    assert.ok(archived);
    await page.reload();
    await page.locator('#experiment-lab>summary').click();
    await page.locator('#lab-archive option[value]:not([value=""])').first().waitFor({state:'attached'});
    await page.locator('#lab-archive').selectOption(archived);
    await page.getByText('Открыт архив',{exact:true}).waitFor();
    assert.equal(await page.locator('#lab-hash').textContent(),series.scenarioHash);
    if(width===1920){
      await page.locator('#lab-preset').selectOption('LAB-E02');
      await page.locator('#lab-duration').fill('20000');
      await page.locator('#lab-run').click();
      await page.waitForFunction(()=>document.querySelector('#lab-status').textContent.startsWith('Реплика'));
      await page.locator('#lab-cancel').click();
      await page.getByText('Архивировано · partial',{exact:true}).waitFor();
      assert.match(await page.locator('#lab-runs').innerText(),/cancelled/);
      assert.match(await page.locator('#lab-runs').innerText(),/not-run/);
      assert.equal(await page.locator('#lab-cancel').isDisabled(),true);
    }
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    results.push({viewport:[width,height],runs:series.runs.length,scenarioHash:series.scenarioHash,rafCallbacksIn400ms:raf,
      renderMs,exportAndFilterMs:performance.now()-elapsedStart,cancel:width===1920?'PASS':'NOT RUN',errors});
    await page.close();
  }
  await writeFile(`${output}/lab-e2e.json`,JSON.stringify({status:'PASS',browser:browser.version(),results,screenshots},null,2));
  console.log(`Lab E2E PASS: ${sizes.length} viewport(s), isolated worlds, archive reload and downloads`);
} catch(error){
  await writeFile(`${output}/lab-e2e.json`,JSON.stringify({status:'FAIL',results,screenshots,failure:String(error)},null,2));
  throw error;
} finally {
  try{await browser?.close();}finally{await new Promise(resolve=>server.close(resolve));}
}
