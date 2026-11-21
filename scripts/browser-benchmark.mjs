import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const output = process.env.DD_EVIDENCE_DIR || 'outputs/verification';
const executablePath = process.env.DD_BROWSER;
const server = await startServer(0);
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  const runs = [];
  for (const population of [1000, 5000]) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/?benchmark`);
    await page.locator('#play:enabled').waitFor();
    await page.locator('#world-settings summary').click();
    await page.locator('#seed').fill(`dd03-benchmark-${population}`);
    await page.locator('[name="population"]').fill(String(population));
    await page.getByRole('button', { name: 'Новый мир ↗' }).click();
    await page.waitForFunction(n => Number(document.querySelector('#population').textContent.replace(/\D/g, '')) === n, population);
    await page.locator('#world-settings[open]').waitFor({ state: 'detached' });
    const latency = await page.evaluate(async () => {
      const results = [];
      const button = document.querySelector('#step');
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        const tick = Number(document.querySelector('#tick').textContent.replace(/\D/g, '')) + 1;
        const painted = new Promise((resolve, reject) => {
          const timer = setTimeout(() => { window.removeEventListener('dd:paint', onPaint); reject(Error('Step did not paint')); }, 3000);
          function onPaint(event) {
            if (event.detail.tick !== tick) return;
            clearTimeout(timer);
            window.removeEventListener('dd:paint', onPaint);
            resolve(performance.now() - start);
          }
          window.addEventListener('dd:paint', onPaint);
        });
        button.click();
        results.push(await painted);
      }
      return results;
    });
    await page.locator('#trait-color').selectOption('efficiency');
    await page.locator('[data-speed="16"]').click();
    await page.locator('#play').click();
    await page.waitForFunction(() => Number(document.querySelector('#tps').textContent) > 0);
    const measurement = await page.evaluate(async () => {
      const numeric = id => Number(document.getElementById(id).textContent.replace(/\D/g, ''));
      const render = [], raf = [], heap = [];
      const observe = event => render.push(event.detail.ms);
      window.addEventListener('dd:paint', observe);
      const start = performance.now(), startTick = numeric('tick'), startPopulation = numeric('population');
      let previous = start;
      await new Promise(resolve => {
        function measure(now) {
          raf.push(now - previous);
          previous = now;
          if (performance.memory && raf.length % 30 === 0) heap.push(performance.memory.usedJSHeapSize);
          if (now - start >= 8000) resolve();
          else requestAnimationFrame(measure);
        }
        requestAnimationFrame(measure);
      });
      window.removeEventListener('dd:paint', observe);
      return { render, raf, heap, elapsedMs: previous - start, startTick, endTick: numeric('tick'),
        startPopulation, endPopulation: numeric('population') };
    });
    assert.deepEqual(errors, []);
    assert.ok(measurement.endTick - measurement.startTick >= 100 && measurement.render.length > 10);
    const percentile = (values, fraction) => [...values].sort((a,b) => a-b)[Math.floor(values.length * fraction)];
    const { render, raf, heap, ...interval } = measurement;
    runs.push({
      initialPopulation: population, ...interval,
      engineTps: (interval.endTick - interval.startTick) * 1000 / interval.elapsedMs,
      browserRafFps: raf.length * 1000 / interval.elapsedMs,
      maxRafGapMs: Math.max(...raf),
      mapPaintFps: render.length * 1000 / interval.elapsedMs,
      mapRenderP50Ms: percentile(render, .50), mapRenderP95Ms: percentile(render, .95),
      stepToPaintP50Ms: percentile(latency, .50), stepToPaintP95Ms: percentile(latency, .95),
      peakJsHeapBytes: heap.length ? Math.max(...heap) : null
    });
    await page.close();
  }
  await mkdir(output, { recursive: true });
  const data = { status: 'PASS', browser: browser.version(), platform: process.platform, viewport: '1366x768', speed: '16×',
    method: 'Chromium headless, landscape and organisms on Canvas; map draw wall time inside RAF; browser FPS is RAF cadence; sampled JS heap is approximate and excludes GPU/OS RSS.', runs };
  await writeFile(`${output}/browser-benchmark.json`, JSON.stringify(data, null, 2) + '\n');
  console.log(JSON.stringify(data, null, 2));
} finally {
  try { await browser?.close(); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
