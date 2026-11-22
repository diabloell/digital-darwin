import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const output = process.env.DD_EVIDENCE_DIR || 'outputs/verification';
const server = await startServer(0);
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.DD_BROWSER, headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const rows = await page.evaluate(async () => {
    const { Engine } = await import('/src/core/engine.js');
    const { PopulationHistory } = await import('/src/core/history.js');
    const { capture, encode, decode, restore } = await import('/src/snapshot.js');
    const { writeSlot, readSlot } = await import('/src/save-storage.js');
    const results = [];
    const advance = (e,h,n) => { for (let i=0;i<n;i++) { e.step(); h.observe(e); } };
    const bytes = value => new Blob([JSON.stringify(value)]).size;
    for (const [scenario, config, ticks] of [
      ['1000 founders', { seed:'dd05-small', population:1000 }, 0],
      ['5000 founders', { seed:'dd05-large', population:5000 }, 0],
      ['10000 ticks and filled archive', { seed:'dd00-verification', population:1000 }, 10000],
      ['extinct world and lines', { seed:'dd05-empty', population:5000,width:64,height:64,regrowth:false }, 600]
    ]) {
      const e = new Engine(config), h = new PopulationHistory(e);
      if (scenario.startsWith('extinct')) e.food.fill(0);
      advance(e,h,ticks);
      const heap = [];
      const memory = () => { if (performance.memory) heap.push(performance.memory.usedJSHeapSize); };
      const times = {};
      let start = performance.now();
      const mark = key => { times[key] = performance.now() - start; memory(); start = performance.now(); };
      memory(); start = performance.now();
      const state = capture(e,h); mark('snapshot');
      const file = await encode(state, scenario, '2026-11-22T00:00:00.000Z', mark);
      const id = await writeSlot(file, scenario); mark('indexedDbWrite');
      const saved = await readSlot(id); mark('indexedDbRead');
      const decoded = await decode(saved.text); mark('decodeAndValidate');
      const copy = restore(decoded.state, mark);
      const match = copy.engine.canonical() === e.canonical();
      const storage = h.storage, lineages = h.counts, metrics = e.metrics();
      const originalStart = performance.now();
      advance(e,h,100);
      const originalMs = performance.now() - originalStart;
      const restoreStart = performance.now();
      advance(copy.engine,copy.genealogy,100);
      const restoredMs = performance.now() - restoreStart;
      results.push({ scenario, config: state.engine.config, metrics, lineages, storage, times,
        biologyBytes: bytes(state.engine), historyBytes: bytes(state.history), fileBytes: saved.bytes,
        sampledPeakJsHeap: heap.length ? Math.max(...heap) : null,
        originalTps: 100000 / originalMs, restoredTps: 100000 / restoredMs,
        match, futureMatch: copy.engine.canonical() === e.canonical() &&
          JSON.stringify(copy.genealogy.snapshot()) === JSON.stringify(h.snapshot()) });
    }
    return results;
  });
  assert.ok(rows.every(row => row.match && row.futureMatch));
  assert.equal(rows[2].storage.recent, 4096);
  assert.equal(rows[3].metrics.population, 0);
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/save-benchmark.json`, JSON.stringify({ status:'PASS', browser:browser.version(),
    memoryScope:'periodic renderer JS heap samples, excluding Worker and browser RSS', rows }, null, 2));
  console.log(`Save benchmark PASS: ${rows.length} worlds`);
} finally {
  try { await browser?.close(); } finally { await new Promise(resolve => server.close(resolve)); }
}
