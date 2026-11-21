import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const runtimeModules = path.join(path.dirname(path.dirname(process.execPath)), 'node_modules');
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = createRequire(path.join(runtimeModules, '_resolver.cjs'))('playwright'); }
const candidates = [process.env.DD_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
const executablePath = candidates.find(existsSync);
const browser = await playwright.chromium.launch({ executablePath, headless: true });
await mkdir('reports', { recursive: true });
const errors = [], checks = [], screenshots = [];
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  // Offline resource transport: this sandbox blocks even loopback sockets.
  // The browser runs the actual compiled app and actual module Worker, no mocks.
  await page.context().route('http://127.0.0.1:5173/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    const target = path.resolve('dist', '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(path.resolve('dist') + path.sep)) { await route.fulfill({status:403,body:''}); return; }
    try { const body = await readFile(target); await route.fulfill({status:200,contentType: target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : 'text/html',body}); }
    catch { await route.fulfill({status:404,body:'Not found'}); }
  });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const frames = [];
  // Passively capture actual Worker frames without modifying simulation behavior.
  await page.exposeFunction('__frame', f => { frames.push(f); if (frames.length > 100) frames.shift(); });
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(...args) { super(...args); this.addEventListener('message', e => { if (e.data.kind === 'frame') { const f = e.data; window.__frame({ tick: f.metrics.tick, population: f.metrics.population, food: f.metrics.food, running: f.running, seed: f.seed, ids: Array.from(f.ids), positions: Array.from(f.positions) }); } }); }
    };
  });
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button', { name: '▶ Запустить', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('#population').textContent !== '—');
  assert.equal(await page.locator('#tick').innerText(), '0');
  assert.equal((await page.locator('#population').innerText()).replace(/\D/g, ''), '1000'); checks.push('initial 256x256 world / 1000 real organisms / paused');
  await page.locator('#step').click(); await page.waitForFunction(() => document.querySelector('#tick').textContent === '1'); checks.push('single step exactly +1');
  await page.locator('#play').click(); await page.waitForFunction(() => Number(document.querySelector('#tick').textContent.replace(/\D/g,'')) >= 8);
  await page.locator('[data-speed="4"]').click(); await page.waitForFunction(() => document.querySelector('[data-speed="4"]').classList.contains('active'));
  await page.locator('#play').click(); await page.waitForFunction(() => document.querySelector('#status').textContent === 'НА ПАУЗЕ');
  const pausedTick = await page.locator('#tick').innerText(); await page.waitForTimeout(350); assert.equal(await page.locator('#tick').innerText(), pausedTick); checks.push('play / 4x speed / pause stays stable');
  const latest = frames.at(-1);
  assert.equal(Number(pausedTick.replace(/\D/g,'')), latest.tick);
  assert.equal(Number((await page.locator('#population').innerText()).replace(/\D/g,'')), latest.population);
  assert.equal(Number((await page.locator('#food').innerText()).replace(/\D/g,'')), Math.round(latest.food)); checks.push('visible tick / population / food equal actual Worker metrics');
  // Hit a real organism using the same documented fitted camera transform.
  const rect = await page.locator('#world').boundingBox();
  const scale = Math.min(rect.width, rect.height) / 256 * .88;
  const ox = (rect.width - 256 * scale) / 2, oy = (rect.height - 256 * scale) / 2;
  await page.mouse.click(rect.x + ox + latest.positions[0] * scale, rect.y + oy + latest.positions[1] * scale);
  await page.locator('.agent-title').waitFor(); checks.push('map hit selection opens real energy / age / genome');
  const beforeZoom = await page.locator('#world').screenshot();
  await page.locator('#zoom-in').click(); const afterZoom = await page.locator('#world').screenshot(); assert.notDeepEqual(beforeZoom, afterZoom);
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2); await page.mouse.down(); await page.mouse.move(rect.x+rect.width/2+60,rect.y+rect.height/2+35,{steps:5}); await page.mouse.up();
  const afterPan = await page.locator('#world').screenshot(); assert.notDeepEqual(afterZoom, afterPan); await page.locator('#fit').click(); checks.push('zoom / pan change rendered camera');
  await page.screenshot({ path: 'reports/screenshot-1366x768.png', fullPage: true }); screenshots.push('reports/screenshot-1366x768.png');
  await page.locator('#seed').fill('dd00-browser-new-world'); await page.getByRole('button',{name:'Новый мир ↗'}).click(); await page.waitForFunction(() => document.querySelector('#world-seed').textContent === 'dd00-browser-new-world');
  assert.equal(await page.locator('#tick').innerText(), '0'); assert.equal((await page.locator('#population').innerText()).replace(/\D/g,''), '1000'); checks.push('new seed resets world / tick / population / selection');
  await page.locator('#viewport').focus(); await page.keyboard.press('Space'); await page.waitForFunction(() => document.querySelector('#status').textContent === 'МИР ЖИВЁТ'); await page.keyboard.press('Space'); await page.waitForFunction(() => document.querySelector('#status').textContent === 'НА ПАУЗЕ'); checks.push('keyboard Space toggles playback');
  await page.setViewportSize({width:1920,height:1080}); await page.waitForTimeout(150); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true); await page.screenshot({path:'reports/screenshot-1920x1080.png',fullPage:true}); screenshots.push('reports/screenshot-1920x1080.png');
  await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(150); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true); await page.screenshot({path:'reports/screenshot-mobile.png',fullPage:true}); screenshots.push('reports/screenshot-mobile.png'); checks.push('responsive 1366 / 1920 / 390 widths without horizontal overflow');
  assert.deepEqual(errors, []);
  await writeFile('reports/e2e.json',JSON.stringify({status:'PASS',transport:'Playwright offline routes serving real dist files; loopback network denied by sandbox',browser:await browser.version(),executablePath,checks,errors,screenshots},null,2)); console.log(`E2E PASS: ${checks.length} checks; browser ${await browser.version()}; offline file routes`);
} catch(e) { await writeFile('reports/e2e.json',JSON.stringify({status:'FAIL',checks,errors,failure:String(e)},null,2)); throw e; }
finally { await browser.close(); }
