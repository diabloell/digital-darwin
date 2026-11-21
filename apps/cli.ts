import { Engine, ENGINE_VERSION, TICK_PHASES } from '../src/core/engine.ts';
import { EVOLUTION_VERSION, GENOME_VERSION } from '../src/core/genetics.ts';
import type { Rule } from '../src/core/genetics.ts';
import { EvolutionObserver } from '../src/core/evolution.ts';
import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { dirname } from 'node:path';
import os from 'node:os';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return fallback;
  const value = process.argv[i + 1];
  if (value === undefined || value.startsWith('--')) throw Error(`Missing value for --${name}`);
  return value;
}

function count(name: string, fallback: string): number {
  const value = Number(arg(name, fallback));
  if (!Number.isSafeInteger(value) || value < 1 || value > 1000000) throw Error(`--${name}: integer 1..1000000`);
  return value;
}

const seed = arg('seed', 'dd00-verification');
const ticks = count('ticks', '5000');
const auditEvery = count('audit-every', '1');
const checkpointEvery = count('checkpoint-every', '1000');
const noFood = process.argv.includes('--no-food');
const profiling = process.argv.includes('--profile');
const engine = new Engine({
  seed,
  width: Number(arg('width', '256')),
  height: Number(arg('height', '256')),
  population: Number(arg('population', '1000')),
  reproduction: !process.argv.includes('--no-reproduction'),
  regrowth: !noFood,
  rule: arg('rule', 'selection') as Rule,
  mutationRate: Number(arg('mutation-rate', '.12')),
  mutationStrength: Number(arg('mutation-strength', '.08')),
  resourceScale: Number(arg('resource-scale', '1'))
});
if (noFood) engine.food.fill(0);
const observer = process.argv.includes('--evolution') ? new EvolutionObserver(engine) : null;

const hashState = () => createHash('sha256').update(engine.canonical()).digest('hex');
const initial = engine.metrics(), history = [initial], checkpoints = [{ tick: 0, hash: hashState() }];
const timings: number[] = [];
const phases = new Map(TICK_PHASES.map(phase => [phase, [] as number[]]));
let phaseStart = 0, auditTimeMs = 0, audits = 0;
let peakSampledRssBytes = process.memoryUsage().rss;
let extinctionTick: number | null = initial.population === 0 ? 0 : null;
const start = performance.now();
for (let t = 1; t <= ticks; t++) {
  const tickStart = performance.now();
  phaseStart = tickStart;
  engine.step(1, profiling ? phase => {
    const now = performance.now();
    phases.get(phase)!.push(now - phaseStart);
    phaseStart = now;
  } : undefined);
  timings.push(performance.now() - tickStart);
  observer?.record(engine);
  if (engine.organisms.length === 0 && extinctionTick === null) extinctionTick = t;
  if (t % auditEvery === 0 || t === ticks) {
    const auditStart = performance.now();
    engine.assertValid();
    auditTimeMs += performance.now() - auditStart;
    audits++;
  }
  if (t % 100 === 0 || t === ticks) {
    history.push(engine.metrics());
    peakSampledRssBytes = Math.max(peakSampledRssBytes, process.memoryUsage().rss);
  }
  if (t % checkpointEvery === 0 || t === ticks) checkpoints.push({ tick: t, hash: hashState() });
}
const elapsedMs = performance.now() - start;

function summarize(samples: number[]) {
  samples.sort((a, b) => a - b);
  return {
    p50Ms: samples[Math.floor(samples.length * .5)],
    p95Ms: samples[Math.floor(samples.length * .95)],
    totalMs: samples.reduce((sum, sample) => sum + sample, 0)
  };
}
const timing = summarize(timings);
const result = {
  engineVersion: ENGINE_VERSION, genomeVersion: GENOME_VERSION, evolutionVersion: EVOLUTION_VERSION, seed, ticks, config: engine.config, noFood, initial,
  final: engine.metrics(), extinctionTick, errors: [], hash: checkpoints.at(-1)!.hash, checkpoints,
  elapsedMs, tps: ticks / elapsedMs * 1000, tickP50Ms: timing.p50Ms, tickP95Ms: timing.p95Ms,
  phases: profiling ? Object.fromEntries([...phases].map(([phase, samples]) => [phase, summarize(samples)])) : null,
  auditEvery, auditTimeMs, audits, peakSampledRssBytes,
  environment: {
    node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length, memoryBytes: process.memoryUsage().rss
  },
  history, evolution: observer?.snapshot(engine) ?? null
};
const output = arg('output', '');
if (output) {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify(result, null, 2));
