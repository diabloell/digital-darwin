import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Engine } from '../src/core/engine.ts';
import { PopulationHistory } from '../src/core/history.ts';

const output = process.env.DD_EVIDENCE_DIR || 'outputs/verification';
const endurance = process.argv.includes('--endurance');
const dd02 = JSON.parse(await readFile('reports/dd-02/long-run-a.json', 'utf8'));
const fixtures = endurance
  ? [{ seed: 'dd04-endurance', width: 40, height: 40, population: 200, ticks: 100000 }]
  : [{ ...dd02.config, ticks: dd02.ticks },
     { seed: 'dd04-density', width: 128, height: 128, population: 5000, ticks: 1000 }];
const results = [];
for (const { ticks, ...config } of fixtures) {
  const runs = [];
  for (const mode of ['off', 'off', 'detailed', 'detailed']) {
    if (endurance && runs.length) break;
    const engine = new Engine(config);
    const enabled = mode === 'detailed' || endurance;
    const history = enabled ? new PopulationHistory(engine) : null;
    const checkpoints = [], samples = [];
    let peakRss = process.memoryUsage().rss;
    let historyMs = 0, engineMs = 0;
    const start = performance.now();
    for (let tick = 1; tick <= ticks; tick++) {
      let at = performance.now();
      engine.step();
      engineMs += performance.now() - at;
      if (history) {
        at = performance.now();
        history.observe(engine);
        historyMs += performance.now() - at;
      }
      if (tick % 100 === 0 || tick === ticks) {
        engine.assertValid();
        history?.assertValid(engine);
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
      }
      if (tick % 1000 === 0 || tick === ticks) {
        checkpoints.push({ tick, hash: createHash('sha256').update(engine.canonical()).digest('hex') });
        samples.push({ ...engine.metrics(), storage: history?.storage ?? null, rss: process.memoryUsage().rss });
      }
    }
    const elapsedMs = performance.now() - start;
    runs.push({ mode: enabled ? 'detailed' : 'off', elapsedMs, tps: ticks / elapsedMs * 1000, engineMs, historyMs, peakRss,
      final: engine.metrics(), counts: history?.counts ?? null, checkpoints, samples,
      historyPacketJsonBytes: history ? Buffer.byteLength(JSON.stringify(history.view(engine.organisms.at(-1)?.id ?? null, null, 32))) : null });
  }
  if (!endurance) {
    for (const r of runs.slice(1)) assert.deepEqual(r.checkpoints, runs[0].checkpoints);
    if (config.seed === dd02.config.seed) assert.deepEqual(runs[0].checkpoints, dd02.checkpoints.slice(1));
  }
  results.push({ config, ticks, runs });
}
await mkdir(output, { recursive: true });
await writeFile(`${output}/history-${endurance ? 'endurance' : 'benchmark'}.json`, JSON.stringify({ status: 'PASS', node: process.version, results }, null, 2) + '\n');
console.log(`History PASS: ${results.map(f => f.ticks + ' ticks × ' + f.runs.length).join(', ')}`);
