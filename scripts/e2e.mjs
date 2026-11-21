import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const executablePath = process.env.DD_BROWSER;
const output = process.env.DD_EVIDENCE_DIR || 'outputs/verification';
await mkdir(output, { recursive: true });
const errors = [], checks = [], screenshots = [];
let server, browser;
try {
  server = await startServer(0);
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const frames = [];
  // Passively capture actual Worker frames without modifying simulation behavior.
  await page.exposeFunction('__frame', f => { frames.push(f); if (frames.length > 100) frames.shift(); });
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(...args) { super(...args); this.addEventListener('message', e => { if (e.data.kind === 'frame') { const f = e.data; window.__frame({ tick: f.metrics.tick, population: f.metrics.population, food: f.metrics.food, running: f.running, speed: f.speed, selected: f.selected, births: f.metrics.births, deaths: f.metrics.deaths, seed: f.seed, ids: Array.from(f.ids), positions: Array.from(f.positions) }); } }); }
    };
  });
  const response = await page.goto(`http://127.0.0.1:${server.address().port}/`);
  assert.equal(response.status(), 200);
  await page.getByRole('button', { name: '▶ Запустить', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('#population').textContent !== '—');
  assert.equal(await page.locator('#tick').innerText(), '0');
  assert.equal((await page.locator('#population').innerText()).replace(/\D/g, ''), '1000'); checks.push('initial 256x256 world / 1000 real organisms / paused');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator('#world-seed').innerText(), 'coral-42');
  const initial = frames.find(frame => frame.tick === 0);
  assert.ok(initial);
  await page.locator('#step').click(); await page.waitForFunction(() => document.querySelector('#tick').textContent === '1'); checks.push('single step exactly +1');
  const tick = () => page.locator('#tick').innerText().then(text => Number(text.replace(/\D/g, '')));
  const advance = async count => {
    const target = (await tick()) + count;
    const start = performance.now();
    await page.waitForFunction(target => Number(document.querySelector('#tick').textContent.replace(/\D/g, '')) >= target, target);
    return performance.now() - start;
  };
  await page.locator('#play').click();
  const normalMs = await advance(16);
  const movement = frames.find(frame => frame.tick >= 8);
  assert.ok(movement);
  assert.deepEqual(movement.ids, initial.ids);
  assert.ok(initial.ids.some((_, i) => movement.positions[i * 4] !== initial.positions[i * 4]
    || movement.positions[i * 4 + 1] !== initial.positions[i * 4 + 1]));
  checks.push('organisms change coordinates while running');
  await page.locator('[data-speed="4"]').click(); await page.waitForFunction(() => document.querySelector('[data-speed="4"]').classList.contains('active'));
  const acceleratedMs = await advance(16);
  assert.ok(acceleratedMs < normalMs, `16 ticks at 4×: ${acceleratedMs} ms; at 1×: ${normalMs} ms`);
  await page.locator('#play').click(); await page.waitForFunction(() => document.querySelector('#status').textContent === 'НА ПАУЗЕ');
  const pausedTick = await page.locator('#tick').innerText(); await page.waitForTimeout(350); assert.equal(await page.locator('#tick').innerText(), pausedTick); checks.push('play / 4x speed / pause stays stable');
  const latest = frames.at(-1);
  assert.equal(latest.speed, 4);
  assert.equal(latest.running, false);
  assert.notEqual(latest.food, initial.food);
  assert.equal(Number(pausedTick.replace(/\D/g,'')), latest.tick);
  assert.equal(Number((await page.locator('#population').innerText()).replace(/\D/g,'')), latest.population);
  assert.equal(Number((await page.locator('#food').innerText()).replace(/\D/g,'')), Math.round(latest.food));
  assert.equal(Number((await page.locator('#births').innerText()).replace(/\D/g, '')), latest.births);
  assert.equal(Number((await page.locator('#deaths').innerText()).replace(/\D/g, '')), latest.deaths);
  checks.push('visible tick / population / food equal actual Worker metrics');
  // Hit a real organism using the same documented fitted camera transform.
  const rect = await page.locator('#world').boundingBox();
  const scale = Math.min(rect.width, rect.height) / 256 * .88;
  const ox = (rect.width - 256 * scale) / 2, oy = (rect.height - 256 * scale) / 2;
  await page.mouse.click(rect.x + ox + latest.positions[0] * scale, rect.y + oy + latest.positions[1] * scale);
  await page.locator('.agent-title').waitFor();
  const title = await page.locator('.agent-title').innerText();
  const selected = frames.at(-1).selected;
  assert.ok(selected);
  assert.equal(title, `ОРГАНИЗМ #${selected.id}`);
  assert.match(await page.locator('.agent-meta').innerText(), new RegExp(`ВОЗРАСТ ${selected.age} ticks`));
  assert.equal(await page.locator('.gene-row').filter({ hasText: 'Энергия' }).locator('b').innerText(), `${(selected.energy / 1000).toFixed(2)} / 80`);
  assert.equal(await page.locator('.gene-row').filter({ hasText: 'Скорость' }).locator('b').innerText(), selected.genome.speed.toFixed(3));
  checks.push('map hit selection opens real energy / age / genome');
  const beforeZoom = await page.locator('#world').screenshot();
  await page.locator('#zoom-in').click(); const afterZoom = await page.locator('#world').screenshot(); assert.notDeepEqual(beforeZoom, afterZoom);
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2); await page.mouse.down(); await page.mouse.move(rect.x+rect.width/2+60,rect.y+rect.height/2+35,{steps:5}); await page.mouse.up();
  const afterPan = await page.locator('#world').screenshot(); assert.notDeepEqual(afterZoom, afterPan); await page.locator('#fit').click(); checks.push('zoom / pan change rendered camera');
  await page.screenshot({ path: `${output}/screenshot-1366x768.png`, fullPage: true }); screenshots.push(`${output}/screenshot-1366x768.png`);
  await page.locator('#seed').fill('dd00-browser-new-world'); await page.getByRole('button',{name:'Новый мир ↗'}).click(); await page.waitForFunction(() => document.querySelector('#world-seed').textContent === 'dd00-browser-new-world');
  assert.equal(await page.locator('#tick').innerText(), '0'); assert.equal((await page.locator('#population').innerText()).replace(/\D/g,''), '1000'); await page.locator('.agent-title').waitFor({ state: 'detached' }); checks.push('new seed resets world / tick / population / selection');
  await page.locator('#viewport').focus(); await page.keyboard.press('Space'); await page.waitForFunction(() => document.querySelector('#status').textContent === 'МИР ЖИВЁТ'); await page.keyboard.press('Space'); await page.waitForFunction(() => document.querySelector('#status').textContent === 'НА ПАУЗЕ'); checks.push('keyboard Space toggles playback');
  await page.setViewportSize({width:1920,height:1080}); await page.waitForTimeout(150); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true); await page.screenshot({path:`${output}/screenshot-1920x1080.png`,fullPage:true}); screenshots.push(`${output}/screenshot-1920x1080.png`);
  await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(150); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true); await page.screenshot({path:`${output}/screenshot-mobile.png`,fullPage:true}); screenshots.push(`${output}/screenshot-mobile.png`); checks.push('responsive 1366 / 1920 / 390 widths without horizontal overflow');
  assert.deepEqual(errors, []);
  await writeFile(`${output}/e2e.json`,JSON.stringify({status:'PASS',transport:'Node HTTP server over loopback',browser:await browser.version(),executablePath,checks,errors,screenshots,speedMeasurement:{ticks:16,normalMs,acceleratedMs}},null,2)); console.log(`E2E PASS: ${checks.length} checks; browser ${await browser.version()}; loopback HTTP`);
} catch(e) { await writeFile(`${output}/e2e.json`,JSON.stringify({status:'FAIL',checks,errors,failure:String(e)},null,2)); throw e; }
finally {
  try { await browser?.close(); }
  finally { if (server) await new Promise(resolve => server.close(resolve)); }
}
