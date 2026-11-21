import { Engine, ENGINE_VERSION } from '../src/core/engine.ts';
import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
function arg(name: string, fallback: string): string { const i = process.argv.indexOf('--' + name); return i < 0 ? fallback : process.argv[i + 1]; }
const seed = arg('seed', 'dd00-verification'), ticks = Number(arg('ticks', '5000')), population = Number(arg('population', '1000'));
if (!Number.isInteger(ticks) || ticks < 1 || ticks > 1000000) throw Error('Ticks: integer 1..1000000');
const engine = new Engine({ seed, population });
const initial = engine.metrics(), history = [initial], start = performance.now();
const timings: number[] = [];
for (let t = 0; t < ticks; t++) { const s = performance.now(); engine.step(); timings.push(performance.now() - s); engine.assertValid(); if (engine.tick % 100 === 0) history.push(engine.metrics()); }
const elapsedMs = performance.now() - start;
timings.sort((a,b)=>a-b);
const result = { engineVersion: ENGINE_VERSION, seed, ticks, config: engine.config, initial, final: engine.metrics(), errors: [], hash: createHash('sha256').update(engine.canonical()).digest('hex'), elapsedMs, tps: ticks / elapsedMs * 1000, tickP50Ms: timings[Math.floor(timings.length * .5)], tickP95Ms: timings[Math.floor(timings.length * .95)], environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryBytes: process.memoryUsage().rss }, history };
const output = arg('output', ''); if (output) { const { dirname } = await import('node:path'); await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(result, null, 2)); }
console.log(JSON.stringify(result, null, 2));
