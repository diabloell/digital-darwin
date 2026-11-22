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
  page.on('dialog', dialog => dialog.message().startsWith('Создать новый мир?') ? dialog.accept() : dialog.dismiss());
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const frames = [];
  // Passively capture actual Worker frames without modifying simulation behavior.
  await page.exposeFunction('__frame', f => { frames.push(f); if (frames.length > 100) frames.shift(); });
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(...args) { super(...args); this.addEventListener('message', e => { if (e.data.kind === 'frame') { const f = e.data; window.__frame({ epoch: f.epoch, width: f.width, height: f.height, sample: f.history.at(-1), foodGrid: f.metrics.tick === 0 ? Array.from(f.food) : null, tick: f.metrics.tick, population: f.metrics.population, food: f.metrics.food, running: f.running, speed: f.speed, selected: f.selected, births: f.metrics.births, deaths: f.metrics.deaths, seed: f.seed, ids: Array.from(f.ids), positions: Array.from(f.positions) }); } }); }
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
  await page.locator('[data-speed="4"]').click(); await page.waitForFunction(() => document.querySelector('[data-speed="4"]').getAttribute('aria-pressed') === 'true');
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
  assert.equal(await page.locator('.gene-row').filter({ hasText: /^Скорость/ }).locator('b').innerText(), selected.genome.speed.toFixed(3));
  checks.push('map hit selection opens real energy / age / genome');
  assert.match(await page.locator('#inspection').innerText(), /ФЕНОТИП/);
  const histogram = await page.locator('#speed-bins meter').evaluateAll(meters => meters.map(meter => meter.value));
  assert.equal(histogram.length, 8);
  const measuredBins = Array(8).fill(0);
  for (let i = 0; i < latest.ids.length; i++) measuredBins[Math.min(7, Math.floor((latest.positions[i * 4 + 3] - .25) / 1.55 * 8))]++;
  assert.deepEqual(histogram, measuredBins);
  const speedColors = await page.locator('#world').screenshot();
  await page.locator('#trait-color').selectOption('sensor');
  assert.notDeepEqual(await page.locator('#world').screenshot(), speedColors);
  await page.locator('#chart-metric').selectOption('efficiency');
  assert.equal(await page.locator('#chart-metric').inputValue(), 'efficiency');
  checks.push('genetic histogram matches real organisms; trait color and mean chart controls work');
  for (const mode of ['normal', 'energy', 'generation', 'speed', 'sensor', 'efficiency', 'threshold']) {
    await page.locator('#trait-color').selectOption(mode);
    await page.waitForFunction(mode => document.querySelector('#color-legend').dataset.mode === mode, mode);
  }
  const chartTitles = {
    population: 'Численность', food: 'Доступная пища', births: 'Рождения', deaths: 'Смерти',
    meanEnergy: 'Средняя энергия', variants: 'Генетическое разнообразие',
    maxGeneration: 'Максимальное поколение', speed: 'Скорость', sensor: 'Радиус поиска',
    efficiency: 'Усвоение', threshold: 'Порог размножения'
  };
  for (const [metric, label] of Object.entries(chartTitles)) {
    await page.locator('#chart-metric').selectOption(metric);
    await page.waitForFunction(label => document.querySelector('#chart-title').textContent === label, label);
    const sample = frames.at(-1).sample;
    const value = sample[metric] ?? sample.genes[metric];
    assert.ok((await page.locator('#chart').getAttribute('aria-label')).endsWith(value.toLocaleString('ru-RU', { maximumFractionDigits: 3 })));
  }
  for (const mode of ['sensor', 'efficiency', 'threshold', 'speed']) {
    await page.locator('#histogram-trait').selectOption(mode);
    assert.equal((await page.locator('#speed-bins meter').evaluateAll(meters => meters.map(m => m.value))).reduce((a,b) => a+b), latest.population);
  }
  for (const value of ['1', '4', '16', '32']) {
    const button = page.locator(`[data-speed="${value}"]`);
    await button.click();
    await button.and(page.locator('[aria-pressed="true"]')).waitFor();
  }
  await page.locator('#step').click();
  await page.waitForFunction(t => Number(document.querySelector('#tick').textContent.replace(/\D/g, '')) === t + 1, latest.tick);
  assert.equal(await page.locator('.agent-title').innerText(), title);
  checks.push('seven palettes, eleven charts, four distributions and speeds; selection survives a new frame');
  const beforeZoom = await page.locator('#world').screenshot();
  await page.locator('#zoom-in').click(); const afterZoom = await page.locator('#world').screenshot(); assert.notDeepEqual(beforeZoom, afterZoom);
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2); await page.mouse.down(); await page.mouse.move(rect.x+rect.width/2+60,rect.y+rect.height/2+35,{steps:5}); await page.mouse.up();
  const afterPan = await page.locator('#world').screenshot(); assert.notDeepEqual(afterZoom, afterPan); await page.locator('#fit').click(); checks.push('zoom / pan change rendered camera');
  await page.screenshot({ path: `${output}/screenshot-1366x768.png`, fullPage: true }); screenshots.push(`${output}/screenshot-1366x768.png`);
  await page.locator('#world-settings summary').click();
  await page.locator('#seed').fill('dd00-browser-new-world'); await page.getByRole('button',{name:'Новый мир ↗'}).click(); await page.waitForFunction(() => document.querySelector('#world-seed').textContent === 'dd00-browser-new-world');
  assert.equal(await page.locator('#tick').innerText(), '0'); assert.equal((await page.locator('#population').innerText()).replace(/\D/g,''), '1000'); await page.locator('.agent-title').waitFor({ state: 'detached' }); checks.push('new seed resets world / tick / population / selection');
  await page.locator('#viewport').focus(); await page.keyboard.press('Space'); await page.waitForFunction(() => document.querySelector('#status').textContent === 'МИР ЖИВЁТ'); await page.keyboard.press('Space'); await page.waitForFunction(() => document.querySelector('#status').textContent === 'НА ПАУЗЕ'); checks.push('keyboard Space toggles playback');
  await page.setViewportSize({width:1920,height:1080}); await page.waitForTimeout(150); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true); await page.screenshot({path:`${output}/screenshot-1920x1080.png`,fullPage:true}); screenshots.push(`${output}/screenshot-1920x1080.png`);
  await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(150); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true); await page.screenshot({path:`${output}/screenshot-mobile.png`,fullPage:true}); screenshots.push(`${output}/screenshot-mobile.png`); checks.push('responsive 1366 / 1920 / 390 widths without horizontal overflow');
  const customWorld = async (seed, population) => {
    await page.locator('#world-settings summary').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('#seed').fill(seed);
    await page.locator('[name="population"]').fill(String(population));
    await page.locator('[name="width"]').fill('12');
    await page.locator('[name="height"]').fill('10');
    await page.locator('[name="mutationRate"]').fill('0');
    await page.locator('[name="mutationStrength"]').fill('0.4');
    await page.locator('[name="rule"]').selectOption('neutral');
    await page.locator('[name="regrowth"]').uncheck();
    const epoch = frames.at(-1).epoch;
    await page.getByRole('button', { name: 'Новый мир ↗' }).click();
    await page.locator('#world-settings[open]').waitFor({ state: 'detached' });
    const f = frames.findLast(f => f.epoch > epoch && f.tick === 0);
    assert.ok(f);
    assert.equal(f.seed, seed);
    assert.equal(f.width, 12); assert.equal(f.height, 10);
    assert.equal(f.population, population);
    assert.equal(await page.locator('#world-size').innerText(), '12 × 10 кл.');
    return f;
  };
  const first = await customWorld('dd03-configured', 1);
  await page.locator('#viewport').focus();
  await page.keyboard.press('Enter');
  await page.locator('.agent-title').waitFor();
  assert.equal(frames.at(-1).selected.id, 1);
  assert.match(await page.locator('#inspection').innerText(), /0\.80 \/ 3\.50/);
  assert.match(await page.locator('#inspection').innerText(), /85\.0% \/ 44\.0/);
  const second = await customWorld('dd03-configured', 1);
  for (const key of ['ids', 'positions', 'foodGrid']) assert.deepEqual(first[key], second[key]);
  await page.locator('#inspect-first').click();
  await page.locator('.agent-title').waitFor();
  await page.locator('[data-speed="32"]').click();
  await page.locator('#play').click();
  await page.locator('.deceased').waitFor({ timeout: 30000 });
  assert.equal(await page.locator('.gene-row').count(), 0);
  await page.locator('#play').click();
  checks.push('configuration and seed replay match real buffers; dead selection clears live traits');
  await customWorld('dd03-empty', 0);
  await page.locator('#chart-metric').selectOption('meanEnergy');
  await page.locator('#chart-empty').waitFor();
  assert.equal(await page.locator('#inspect-first').isDisabled(), true);
  await page.locator('#world-settings summary').click();
  await page.locator('[name="width"]').fill('7');
  await page.getByRole('button', { name: 'Новый мир ↗' }).click();
  assert.equal(await page.locator('[name="width"]').evaluate(input => input.validity.rangeUnderflow), true);
  assert.equal(await page.locator('#world-seed').innerText(), 'dd03-empty');
  checks.push('empty charts are labeled and invalid configuration leaves the current world intact');
  const worldAtTick = async frameDelay => {
    const view = await browser.newPage();
    try {
      await view.addInitScript(delay => {
        const drawImage = CanvasRenderingContext2D.prototype.drawImage;
        window.__renderCalls = 0;
        CanvasRenderingContext2D.prototype.drawImage = function (...args) {
          window.__renderCalls++;
          return drawImage.apply(this, args);
        };
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
          set onmessage(handler) {
            super.onmessage = event => {
              if (delay) setTimeout(() => handler.call(this, event), delay);
              else handler.call(this, event);
            };
          }
          constructor(...args) {
            super(...args);
            this.addEventListener('message', ({ data }) => {
              if (data.kind === 'frame') window.__world = {
                metrics: data.metrics, ids: [...data.ids], positions: [...data.positions], food: [...data.food]
              };
            });
          }
        };
      }, frameDelay);
      await view.goto(`http://127.0.0.1:${server.address().port}/`);
      await view.locator('#step').waitFor();
      for (let tick = 1; tick <= 12; tick++) {
        await view.locator('#step').click();
        await view.waitForFunction(tick => window.__world?.metrics.tick === tick,
          tick, { polling: 20 });
      }
      await view.waitForFunction(() => document.querySelector('#tick').textContent === '12');
      assert.ok(await view.evaluate(() => window.__renderCalls > 0));
      return await view.evaluate(() => window.__world);
    } finally {
      await view.close();
    }
  };
  assert.deepEqual(await worldAtTick(0), await worldAtTick(100));
  checks.push('same 12 Worker ticks produce identical metrics and buffers with normal and delayed rendering');
  assert.deepEqual(errors, []);
  await writeFile(`${output}/e2e.json`,JSON.stringify({status:'PASS',transport:'Node HTTP server over loopback',browser:await browser.version(),executablePath,checks,errors,screenshots,speedMeasurement:{ticks:16,normalMs,acceleratedMs}},null,2)); console.log(`E2E PASS: ${checks.length} checks; browser ${await browser.version()}; loopback HTTP`);
} catch(e) { await writeFile(`${output}/e2e.json`,JSON.stringify({status:'FAIL',checks,errors,failure:String(e)},null,2)); throw e; }
finally {
  try { await browser?.close(); }
  finally { if (server) await new Promise(resolve => server.close(resolve)); }
}
