import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const output = process.env.DD_EVIDENCE_DIR || 'outputs/verification';
await mkdir(output, { recursive: true });
const server = await startServer(0);
const browser = await chromium.launch({ executablePath: process.env.DD_BROWSER, headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [], checks = [], screenshots = [];
page.on('dialog', dialog => dialog.message().startsWith('Создать новый мир?') ? dialog.accept() : dialog.dismiss());
  page.on('pageerror', error => errors.push(error.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
await page.addInitScript(() => {
  const Native = window.Worker;
  window.Worker = class extends Native {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', ({ data }) => {
        if (data.kind === 'frame') window.__ddFrame = data;
        if (data.kind === 'history') window.__ddHistory = data.view;
      });
    }
  };
});
async function create(seed, population, regrowth = true, size = 64) {
  await page.locator('#world-settings summary').click();
  await page.locator('#seed').fill(seed);
  for (const [name, value] of [['population', population], ['width', size], ['height', size]]) {
    await page.locator(`[name="${name}"]`).fill(String(value));
  }
  await page.locator('[name="regrowth"]').setChecked(regrowth);
  await page.getByRole('button', { name: 'Новый мир ↗' }).click();
  await page.waitForFunction(seed => window.__ddFrame?.seed === seed, seed);
}
async function runTo(predicate, arg) {
  await page.locator('[data-speed="32"]').click();
  await page.locator('#play').click();
  await page.waitForFunction(predicate, arg);
  await page.locator('#play').click();
  await page.waitForFunction(() => window.__ddFrame && !window.__ddFrame.running);
}
async function capture(name, width, height) {
  await page.setViewportSize({ width, height });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const path = `${output}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  screenshots.push(path);
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('#play:enabled').waitFor();
  await create('dd04-browser', 250);
  await runTo(() => window.__ddFrame?.metrics?.births >= 150);
  const child = await page.evaluate(() => {
    const f = window.__ddFrame;
    const i = f.generations.findIndex((generation, index) => generation > 0 && f.ids.every((_, other) => {
      return other === index || (f.positions[index * 4] - f.positions[other * 4]) ** 2
        + (f.positions[index * 4 + 1] - f.positions[other * 4 + 1]) ** 2 > .5;
    }));
    return { id: f.ids[i], founder: f.founders[i], x: f.positions[i * 4], y: f.positions[i * 4 + 1] };
  });
  assert.ok(child.id > 250 && child.founder <= 250);
  await page.locator('#fit').click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const rect = await page.locator('#world').boundingBox();
  const scale = Math.min(rect.width, rect.height) / 64 * .88;
  await page.mouse.click(rect.x + (rect.width - 64 * scale) / 2 + child.x * scale,
    rect.y + (rect.height - 64 * scale) / 2 + child.y * scale);
  await page.locator('.agent-title').waitFor();
  assert.equal(await page.evaluate(() => window.__ddFrame.selectedId), child.id);
  await page.locator('[data-history="ancestry"]').click();
  await page.locator('.ancestor-chain button').first().waitFor();
  const observed = await page.evaluate(() => ({ history: window.__ddHistory, selected: window.__ddFrame.selected }));
  assert.equal(observed.history.entity.id, observed.selected.id);
  assert.equal(observed.history.entity.parent, observed.history.ancestors[0].id);
  assert.equal(observed.history.ancestors[0].generation + 1, observed.history.entity.generation);
  assert.ok(observed.history.ancestors[0].born < observed.history.entity.born);
  await capture('ancestry-1920x1080', 1920, 1080);
  const parent = observed.history.ancestors[0];
  await page.locator('.ancestor-chain button').first().click();
  await page.waitForFunction(id => window.__ddFrame.selectedId === id && window.__ddHistory?.entity?.id === id, parent.id);
  assert.equal(await page.locator('.history-detail h3').innerText(), `Организм #${parent.id}`);
  checks.push('live child selection and navigation to its actual parent');

  await page.locator('.history-detail [data-action="line"]').click();
  await page.waitForFunction(founder => window.__ddHistory?.line?.founder === founder, parent.founder);
  const summary = await page.evaluate(() => window.__ddHistory.line);
  const liveCount = await page.evaluate(founder => Array.from(window.__ddFrame.founders).filter(id => id === founder).length, parent.founder);
  assert.equal(summary.living, liveCount);
  assert.equal(summary.born - summary.deaths, summary.living);
  assert.ok(summary.born > 1);
  await capture('lineages-1366x768', 1366, 768);
  const highlighted = await page.locator('#world').screenshot();
  await page.getByRole('button', { name: 'Убрать подсветку' }).click();
  await page.getByRole('button', { name: 'Убрать подсветку' }).waitFor({ state: 'detached' });
  assert.notDeepEqual(await page.locator('#world').screenshot(), highlighted);
  checks.push('multi-member lineage counts match founder buffer and highlight can be cleared');

  const charts = {
    intervalBirths: 'Рождения за интервал', intervalDeaths: 'Смерти за интервал',
    totalEnergy: 'Совокупная энергия', livingLines: 'Живые линии', extinctLines: 'Вымершие линии',
    meanGeneration: 'Среднее поколение'
  };
  for (const [key, title] of Object.entries(charts)) {
    await page.locator('#chart-metric').selectOption(key);
    await page.waitForFunction(title => document.querySelector('#chart-title').textContent === title, title);
    const value = await page.evaluate(key => window.__ddFrame.history.at(-1)[key], key);
    assert.ok((await page.locator('#chart').getAttribute('aria-label')).endsWith(value.toLocaleString('ru-RU', { maximumFractionDigits: 3 })));
  }
  const latest = await page.evaluate(() => window.__ddFrame.history.at(-1));
  assert.equal(latest.livingLines + latest.extinctLines, 250);
  assert.ok(Math.abs(latest.totalEnergy / latest.population - latest.meanEnergy) < 1e-12);
  checks.push('lineage and population charts match sampled Worker data');

  await page.locator('[data-history="events"]').click();
  await page.locator('#event-filter').selectOption('generation');
  const event = page.locator('.event-list li[data-event="generation"]').first();
  await event.waitFor();
  assert.equal(await page.locator('.event-list li:not([data-event="generation"])').count(), 0);
  await capture('events-1366x768', 1366, 768);
  const entity = Number(await event.locator('[data-action="entity"]').getAttribute('data-id'));
  await event.locator('[data-action="entity"]').click();
  await page.waitForFunction(entity => window.__ddHistory?.entity?.id === entity, entity);
  await page.locator('#history-close').click();
  assert.ok(await page.locator('#history-body').isHidden());
  await page.locator('#fit').click();
  await capture('laboratory-390x844', 390, 844);
  checks.push('generation event is filterable and links to the corresponding entity; return to world');

  await create('dd04-death', 1, false, 8);
  await page.locator('#inspect-first').click();
  await page.locator('.agent-title').waitFor();
  await runTo(() => window.__ddFrame.metrics.population === 0);
  await page.locator('[data-history="ancestry"]').click();
  await page.getByText('Энергетическое истощение.', { exact: false }).waitFor();
  assert.equal(await page.locator('#inspection .gene-row').count(), 0);
  await page.locator('[data-history="events"]').click();
  await page.locator('#event-filter').selectOption('extinction');
  await page.locator('[data-event="extinction"]').waitFor();
  assert.equal(await page.locator('[data-event="extinction"]').count(), 1);
  await page.locator('#history-close').click();
  await capture('extinction-390x844', 390, 844);
  assert.deepEqual(errors, []);
  checks.push('historical death card, world extinction once, and all three layouts without overflow');
  await writeFile(`${output}/lineage-e2e.json`, JSON.stringify({ status: 'PASS', checks, screenshots, errors, browser: browser.version() }, null, 2));
  console.log(`Lineage E2E PASS: ${checks.length} checks`);
} catch (error) {
  await page.screenshot({ path: `${output}/lineage-failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${output}/lineage-e2e.json`, JSON.stringify({ status: 'FAIL', checks, screenshots, errors, failure: String(error) }, null, 2));
  throw error;
} finally {
  try { await browser.close(); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
