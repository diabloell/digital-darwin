import type { Engine, Organism } from './engine.ts';
import { GENES, GENE_BOUNDS } from './genetics.ts';
import type { Genome } from './genetics.ts';

export function geneMeans(agents: readonly Organism[]): Genome | null {
  if (!agents.length) return null;
  const means: Genome = { speed: 0, sensor: 0, efficiency: 0, threshold: 0 };
  for (const { genome } of agents) for (const gene of GENES) means[gene] += genome[gene];
  for (const gene of GENES) means[gene] /= agents.length;
  return means;
}

export function geneBin(gene: keyof Genome, value: number): number {
  const [min, max] = GENE_BOUNDS[gene];
  return Math.min(7, Math.floor((value - min) / (max - min) * 8));
}

export function describeGenomes(agents: readonly Organism[]) {
  const means = geneMeans(agents);
  return GENES.map(gene => {
    const values = agents.map(a => a.genome[gene]).sort((a, b) => a - b);
    const [min, max] = GENE_BOUNDS[gene], histogram = Array<number>(8).fill(0);
    for (const value of values) histogram[geneBin(gene, value)]++;
    const mean = means?.[gene] ?? null;
    return { gene, min, max, mean, median: values.length ? (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2 : null,
      variance: mean === null ? null : values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length, histogram };
  });
}

function cohort() {
  return { entrants: 0, deaths: 0, parents: 0, exposure: 0 };
}
const fingerprint = (g: Genome) => JSON.stringify(GENES.map(gene => g[gene]));

export class EvolutionObserver {
  readonly founders: Set<string>;
  readonly groups;
  private tick = 0;
  private changedBirths = 0;
  private outsideFounderBirths = 0;
  private changedAlleles: Genome = { speed: 0, sensor: 0, efficiency: 0, threshold: 0 };
  private readonly generations = Array.from({ length: 33 }, () => ({ births: 0, sums: { speed: 0, sensor: 0, efficiency: 0, threshold: 0 } }));
  private consumed = 0;
  private assimilated = 0;
  private dissipated = 0;
  private reproductionCost = 0;

  constructor(engine: Engine) {
    this.founders = new Set(engine.organisms.map(a => fingerprint(a.genome)));
    this.groups = describeGenomes(engine.organisms).map(({ gene, median }) => ({
      gene, split: median ?? (GENE_BOUNDS[gene][0] + GENE_BOUNDS[gene][1]) / 2, low: cohort(), high: cohort()
    }));
    for (const { genome } of engine.organisms) for (const g of this.groups) (genome[g.gene] < g.split ? g.low : g.high).entrants++;
  }

  record(engine: Engine): void {
    if (engine.tick !== this.tick + 1) throw Error('Evolution observer requires consecutive completed ticks');
    this.tick = engine.tick;
    for (const { parent, child } of engine.lastBirths) {
      const genome = child.genome;
      if (!this.founders.has(fingerprint(genome))) this.outsideFounderBirths++;
      let changed = false;
      const generation = this.generations[Math.min(32, child.generation)];
      generation.births++;
      for (const g of this.groups) {
        const gene = g.gene;
        if (genome[gene] !== parent[gene]) {
          this.changedAlleles[gene]++;
          changed = true;
        }
        generation.sums[gene] += genome[gene];
        (parent[gene] < g.split ? g.low : g.high).parents++;
        (genome[gene] < g.split ? g.low : g.high).entrants++;
      }
      if (changed) this.changedBirths++;
    }
    for (const { genome } of engine.lastDeaths) for (const g of this.groups) {
      const group = genome[g.gene] < g.split ? g.low : g.high;
      group.deaths++;
      group.exposure++;
    }
    for (const agent of engine.organisms) if (agent.born < engine.tick) {
      for (const g of this.groups) (agent.genome[g.gene] < g.split ? g.low : g.high).exposure++;
    }
    this.consumed += engine.audit.consumed;
    this.assimilated += engine.audit.assimilated;
    this.dissipated += engine.audit.dissipated;
    this.reproductionCost += engine.audit.reproductionCost;
  }

  snapshot(engine: Engine) {
    const summarize = (g: ReturnType<typeof cohort>) => ({
      ...g, alive: g.entrants - g.deaths,
      survivorFraction: g.entrants ? (g.entrants - g.deaths) / g.entrants : null,
      birthsPer1000AgentTicks: g.exposure ? g.parents * 1000 / g.exposure : null
    });
    return {
      live: {
        population: engine.organisms.length, genes: describeGenomes(engine.organisms),
        variants: new Set(engine.organisms.map(a => fingerprint(a.genome))).size,
        meanGeneration: engine.organisms.length ? engine.organisms.reduce((sum, a) => sum + a.generation, 0) / engine.organisms.length : null,
        maxGeneration: engine.metrics().maxGeneration
      },
      lifetime: {
        births: engine.births, deaths: engine.deaths, changedBirths: this.changedBirths,
        changedAlleles: { ...this.changedAlleles }, outsideFounderBirths: this.outsideFounderBirths,
        mutationFraction: engine.births ? this.changedBirths / engine.births : null,
        groups: this.groups.map(g => ({ gene: g.gene, split: g.split, low: summarize(g.low), high: summarize(g.high) })),
        generations: this.generations.flatMap(({ births, sums }, generation) => births ? [{
          generation: generation === 32 ? '32+' : generation, births,
          mean: Object.fromEntries(GENES.map(gene => [gene, sums[gene] / births]))
        }] : []),
        consumed: this.consumed, assimilated: this.assimilated, dissipated: this.dissipated,
        reproductionCost: this.reproductionCost, assimilationFraction: this.consumed ? this.assimilated / this.consumed : null
      }
    };
  }
}
