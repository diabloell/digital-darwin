import type { Rng } from './rng.ts';

export const GENOME_VERSION = '1';
export const EVOLUTION_VERSION = '1';
export const GENE_BOUNDS = { speed: [0.25, 1.8], sensor: [1, 8], efficiency: [0.65, 1], threshold: [32, 64] } as const;
export type Genome = { speed: number; sensor: number; efficiency: number; threshold: number };
export const GENES = Object.keys(GENE_BOUNDS) as (keyof Genome)[];
export type Rule = 'dd01' | 'selection' | 'neutral';
export type Phenotype = { speed: number; radius: number; assimilation: number; birthReserve: number; maintenance: number };
const COMMON_GENOME: Readonly<Genome> = { speed: .8, sensor: 3.5, efficiency: .85, threshold: 44 };

export function phenotype(genome: Genome, rule: Rule = 'selection'): Phenotype {
  const g = rule === 'neutral' ? COMMON_GENOME : genome;
  const assimilationCost = rule === 'dd01' ? 0 : 125 * ((g.efficiency - .65) / .35) ** 2;
  return {
    speed: g.speed, radius: g.sensor, assimilation: g.efficiency,
    birthReserve: g.threshold * 1000,
    maintenance: 4 * g.sensor + 16 * g.efficiency ** 2 + assimilationCost
  };
}

export function mutate(parent: Genome, rng: Rng, rate: number, strength = .08): Genome {
  const child = { ...parent };
  for (const key of GENES) {
    const [min, max] = GENE_BOUNDS[key];
    if (rng.next() < rate) child[key] = Math.min(max, Math.max(min, child[key] + (rng.next() * 2 - 1) * (max - min) * strength));
  }
  return child;
}
