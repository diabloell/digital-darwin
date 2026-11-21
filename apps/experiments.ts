import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Engine, ENGINE_VERSION } from '../src/core/engine.ts';
import { EvolutionObserver, geneMeans } from '../src/core/evolution.ts';
import { EVOLUTION_VERSION, GENES, GENOME_VERSION } from '../src/core/genetics.ts';
import type { Config } from '../src/core/engine.ts';

const seeds = ['dd02-amber', 'dd02-fern', 'dd02-dune', 'dd02-coral', 'dd02-slate'];
const ticks = 4000;
const conditions = {
  E01: { mutationRate: 0 },
  E02: { mutationRate: .12 },
  E03: { mutationRate: .12, resourceScale: .35 },
  E04: { mutationRate: .12, rule: 'neutral' }
} satisfies Record<string, Partial<Config>>;
type Condition = keyof typeof conditions;
const hash = (state: string) => createHash('sha256').update(state).digest('hex');

function run(seed: string, condition: Condition) {
  const engine = new Engine({ seed, width: 48, height: 48, population: 240, ...conditions[condition] });
  const observer = new EvolutionObserver(engine);
  const initial = engine.metrics(), genesAtStart = geneMeans(engine.organisms);
  const foundersHash = hash(JSON.stringify(engine.organisms));
  const trajectory = [{ ...initial, genes: genesAtStart }];
  let extinctionTick: number | null = null;
  for (let tick = 1; tick <= ticks; tick++) {
    engine.step();
    engine.assertValid();
    observer.record(engine);
    if (extinctionTick === null && !engine.organisms.length) extinctionTick = tick;
    if (tick % 100 === 0) trajectory.push({ ...engine.metrics(), genes: geneMeans(engine.organisms) });
  }
  const stats = observer.snapshot(engine);
  const result = { condition, seed, config: engine.config, foundersHash, ticks, extinctionTick, hash: hash(engine.canonical()), initial, final: engine.metrics(), trajectory, ...stats };
  if (condition === 'E01') {
    assert.equal(stats.lifetime.changedBirths, 0);
    assert.equal(stats.lifetime.outsideFounderBirths, 0);
  }
  if (condition === 'E02' && stats.lifetime.births) assert.ok(stats.lifetime.outsideFounderBirths > 0);
  for (const group of stats.lifetime.groups) {
    assert.equal(group.low.alive + group.high.alive, result.final.population);
    assert.equal(group.low.parents + group.high.parents, result.final.births);
  }
  return result;
}

const runs = (Object.keys(conditions) as Condition[]).flatMap(condition => seeds.map(seed => run(seed, condition)));
for (const seed of seeds) assert.equal(new Set(runs.filter(r => r.seed === seed).map(r => r.foundersHash)).size, 1);
function summarize(values: (number | null)[]) {
  const valid = values.filter((v): v is number => v !== null);
  return { n: valid.length, missing: values.length - valid.length, mean: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null,
    min: valid.length ? Math.min(...valid) : null, max: valid.length ? Math.max(...valid) : null };
}
const aggregate = (Object.keys(conditions) as Condition[]).map(condition => {
  const replicas = runs.filter(r => r.condition === condition);
  return {
    condition, extinctions: replicas.filter(r => r.extinctionTick !== null).length,
    population: summarize(replicas.map(r => r.final.population)),
    births: summarize(replicas.map(r => r.final.births)),
    changedBirthFraction: summarize(replicas.map(r => r.lifetime.mutationFraction)),
    variants: summarize(replicas.map(r => r.live.variants)),
    genes: GENES.map((gene, i) => ({
      gene, mean: summarize(replicas.map(r => r.live.genes[i].mean)),
      variance: summarize(replicas.map(r => r.live.genes[i].variance)),
      highMinusLowBirthRate: summarize(replicas.map(r => gap(r, i)))
    }))
  };
});
function gap(r: ReturnType<typeof run>, i: number) {
  const { high, low } = r.lifetime.groups[i];
  return high.birthsPer1000AgentTicks === null || low.birthsPer1000AgentTicks === null ? null : high.birthsPer1000AgentTicks - low.birthsPer1000AgentTicks;
}
const comparisons = (['E01', 'E03', 'E04'] as const).map(reference => ({
  contrast: 'E02 minus ' + reference,
  pairs: seeds.map(seed => {
    const normal = runs.find(r => r.seed === seed && r.condition === 'E02')!;
    const other = runs.find(r => r.seed === seed && r.condition === reference)!;
    return { seed, population: normal.final.population - other.final.population, births: normal.final.births - other.final.births,
      variants: normal.live.variants - other.live.variants,
      traitBirthRateDifferences: GENES.map((gene, i) => {
        const a = gap(normal, i), b = gap(other, i);
        return { gene, difference: a === null || b === null ? null : a - b };
      }) };
  })
}));
const report = { engineVersion: ENGINE_VERSION, genomeVersion: GENOME_VERSION, evolutionVersion: EVOLUTION_VERSION,
  seeds, ticks, replicasPerCondition: seeds.length, conditions, aggregate, comparisons, runs };
const output = process.argv[2] ?? 'outputs/dd02/experiments.json';
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report) + '\n');
console.log(`Experiments PASS: ${runs.length} runs × ${ticks} ticks; ${output}`);
