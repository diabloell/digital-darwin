import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const output = process.env.DD_EVIDENCE_DIR || 'outputs/verification';
await mkdir(output, { recursive: true });
const server = await startServer(0);
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.DD_BROWSER, headless: true });
const screenshots = [], runs = [];
try {
  for (const [width, height] of [[1920,1080],[1366,768],[390,844]]) {
    const page = await browser.newPage({ viewport: { width, height }, acceptDownloads: true });
    const errors = [];
    const checks = [];
    let accept = true;
    page.on('dialog', d => accept ? d.accept() : d.dismiss());
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => {
      const Native = window.Worker;
      window.Worker = class extends Native {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', ({ data }) => {
            if (data.kind === 'frame') window.__saveFrame = data;
            if (data.kind === 'history') window.__saveHistory = data.view;
          });
        }
      };
    });
    const state = () => page.evaluate(() => {
      const f = window.__saveFrame;
      return { seed: f.seed, metrics: f.metrics, positions: [...f.positions], ids: [...f.ids], food: [...f.food],
        founders: [...f.founders], samples: f.history, selectedId: f.selectedId, running: f.running };
    });
    const status = (text) => page.waitForFunction(text => document.querySelector('#save-status').textContent.includes(text), text);
    const tick = n => page.waitForFunction(t => window.__saveFrame?.metrics.tick === t, n);
    const open = async () => {
      if (!await page.locator('#world-saves').evaluate(el => el.open)) await page.locator('#world-saves summary').click();
      await page.locator('#save-world:enabled').waitFor();
    };
    const photo = async label => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const path = `${output}/${label}-${width}x${height}.png`;
      await page.screenshot({ path, fullPage: true });
      screenshots.push(path);
    };
    await page.goto(origin);
    await page.locator('#play:enabled').waitFor();
    await page.locator('#world-settings summary').click();
    await page.locator('#seed').fill('dd05-браузер🌱');
    for (const [key, value] of [['width',64],['height',64],['population',250]]) await page.locator(`[name="${key}"]`).fill(String(value));
    await page.getByRole('button', { name: 'Новый мир ↗' }).click();
    await page.waitForFunction(() => window.__saveFrame?.seed === 'dd05-браузер🌱');
    await page.locator('[data-speed="32"]').click();
    await page.locator('#play').click();
    await page.waitForFunction(() => window.__saveFrame?.metrics.births >= 150);
    await page.locator('#play').click();
    await page.waitForFunction(() => !window.__saveFrame?.running);
    await open();
    await page.locator('#save-name').fill('Лаборатория');
    const paused = await state();
    await page.locator('#save-world').click();
    await status('Сохранено в браузере');
    const slot = await page.locator('#save-list').inputValue();
    assert.ok(slot);
    assert.match(await page.locator('#save-info').innerText(), /dd05-браузер🌱/);
    if (width === 1920) await photo('slots');
    await page.reload();
    await page.locator('#play:enabled').waitFor();
    await open();
    await page.locator('#save-list').selectOption(slot);
    accept = false;
    await page.locator('#load-world').click();
    await page.locator('#load-world:enabled').waitFor();
    assert.equal((await state()).seed, 'coral-42');
    accept = true;
    await page.locator('#load-world').click();
    await status('Мир восстановлен на паузе');
    const restored = await state();
    assert.deepEqual(restored, paused);
    checks.push('IndexedDB survives reload; cancellation and exact paused world, genealogy IDs and charts');
    if (width === 1366) await photo('loaded');

    const downloaded = await Promise.all([page.waitForEvent('download'), page.locator('#export-slot').click()]).then(([d]) => d);
    const file = await readFile(await downloaded.path());
    const currentExport = await Promise.all([page.waitForEvent('download'), page.locator('#export-world').click()]).then(([d]) => d);
    const direct = JSON.parse(await readFile(await currentExport.path(), 'utf8'));
    assert.equal(direct.manifest.tick, paused.metrics.tick);
    const step = async () => {
      for (let i=1;i<=4;i++) { await page.locator('#step').click(); await tick(paused.metrics.tick+i); }
      return state();
    };
    const future = await step();
    const currentBeforeImport = await state();
    const importFile = payload => page.locator('#import-file').setInputFiles({ name: 'world.json', mimeType: 'application/json', buffer: payload });
    await importFile(Buffer.from('{broken'));
    await status('Некорректный JSON');
    const damaged = JSON.parse(file.toString());
    damaged.manifest.checksum = '0'.repeat(64);
    await importFile(Buffer.from(JSON.stringify(damaged)));
    await status('Контрольная сумма');
    damaged.manifest.format = 999;
    await importFile(Buffer.from(JSON.stringify(damaged)));
    await status('Неподдерживаемая версия');
    assert.deepEqual(await state(), currentBeforeImport);
    await importFile(file);
    await status('Файл проверен');
    if (width === 390) await photo('import-preview');
    await page.locator('#load-import').click();
    await status('Мир восстановлен на паузе');
    assert.deepEqual(await state(), paused);
    assert.deepEqual(await step(), future);
    await page.locator('[data-history="events"]').click();
    await page.locator('.event-list li').first().waitFor();
    const eventIds = await page.evaluate(() => window.__saveHistory.events.map(e => e.id));
    assert.equal(new Set(eventIds).size, eventIds.length);
    const child = await page.evaluate(() => {
      const f = window.__saveFrame;
      return f.ids.find((id, i) => f.generations[i] > 0);
    });
    assert.ok(child > 250);
    await page.locator('#inspect-first').click();
    await page.locator('[data-history="ancestry"]').click();
    await page.locator('.history-detail h3').waitFor();
    checks.push('export current or slot, reject corrupt input, import, same continuation, events and ancestry');
    await page.locator('#save-name').fill('Другая копия');
    await page.locator('#store-import').click();
    await status('Проверенный файл сохранён');
    const second = await page.locator('#save-list').inputValue();
    assert.notEqual(second, slot);
    await page.locator('#save-name').fill('Переименованный слот');
    await page.locator('#rename-slot').click();
    await status('Слот переименован');
    await page.locator('#save-world').click();
    await status('Сохранено в браузере');
    assert.equal(await page.locator('#save-list').inputValue(), second);
    assert.match(await page.locator('#save-info').innerText(), new RegExp(`тик ${future.metrics.tick}`));
    await page.locator('#delete-slot').click();
    await status('Слот удалён');
    assert.equal(await page.locator('#save-list option').count(), 2);
    checks.push('independent slot, rename, confirmed overwrite and delete');

    let quota = 'NOT RUN';
    if (width === 1920) {
      await page.locator('#world-settings summary').click();
      await page.locator('#seed').fill('dd05-quota');
      await page.locator('[name="population"]').fill('5000');
      await page.locator('[name="width"]').fill('512');
      await page.locator('[name="height"]').fill('512');
      await page.getByRole('button', { name: 'Новый мир ↗' }).click();
      await page.waitForFunction(() => window.__saveFrame?.seed === 'dd05-quota');
      await page.evaluate(() => {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
          const request = put.apply(this, args);
          if (this.name === 'worlds') {
            IDBObjectStore.prototype.put = put;
            throw new DOMException('Injected after queuing the replacement', 'QuotaExceededError');
          }
          return request;
        };
      });
      await page.locator('#save-name').fill('Лаборатория');
      await page.locator('#save-world').click();
      await status('Недостаточно места');
      await page.locator('#save-list').selectOption(slot);
      const d = await Promise.all([page.waitForEvent('download'), page.locator('#export-slot').click()]).then(([d]) => d);
      assert.deepEqual(await readFile(await d.path()), file);
      quota = 'PASS (injected QuotaExceededError after queuing real IndexedDB put; real quota NOT RUN)';
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    runs.push({ viewport: [width,height], tick: paused.metrics.tick, population: paused.metrics.population, checks, quota, errors });
    await page.close();
  }
  const profile = await mkdtemp('/tmp/dd05-browser-');
  let persistent;
  try {
    const launch = () => chromium.launchPersistentContext(profile, { executablePath: process.env.DD_BROWSER, headless: true });
    persistent = await launch();
    let page = persistent.pages()[0] ?? await persistent.newPage();
    await page.goto(origin);
    await page.locator('#play:enabled').waitFor();
    await page.locator('#world-saves summary').click();
    await page.locator('#save-world:enabled').click();
    await page.getByText('Сохранено в браузере.', { exact: true }).waitFor();
    await persistent.close();
    persistent = await launch();
    page = persistent.pages()[0] ?? await persistent.newPage();
    await page.goto(origin);
    await page.locator('#play:enabled').waitFor();
    await page.locator('#world-saves summary').click();
    await page.locator('#save-list option').filter({ hasText: 'Мой мир' }).waitFor({ state: 'attached' });
    await page.locator('#save-list').selectOption({ label: 'Мой мир' });
    page.on('dialog', dialog => dialog.accept());
    await page.locator('#load-world').click();
    await page.getByText('Мир восстановлен на паузе.', { exact: true }).waitFor();
  } finally {
    await persistent?.close();
    await rm(profile, { recursive: true, force: true });
  }
  await writeFile(`${output}/persistence-e2e.json`, JSON.stringify({ status: 'PASS', browser: browser.version(), runs, screenshots, browserRestart: 'PASS' }, null, 2));
  console.log('Persistence E2E PASS: 3 viewports, IndexedDB, verified imports, deterministic replay and quota rollback');
} catch (error) {
  await writeFile(`${output}/persistence-e2e.json`, JSON.stringify({ status: 'FAIL', runs, screenshots, failure: String(error) }, null, 2));
  throw error;
} finally {
  try { await browser.close(); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
