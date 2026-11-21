import type { Config, Metrics, Organism } from './core/engine.ts';
import type { Genome, Phenotype } from './core/genetics.ts';
export type WorldSettings = Pick<Config, 'width' | 'height' | 'population' | 'mutationRate' | 'mutationStrength' | 'regrowth' | 'rule'>;
export type Command = { kind: 'create'; seed: string; settings?: WorldSettings } | { kind: 'play'; value: boolean } | { kind: 'speed'; value: number } | { kind: 'step' } | { kind: 'inspect'; id: number | null } | { kind: 'ready' };
export type Sample = Metrics & { genes: Genome | null; variants: number };
export type Frame = {
  kind: 'frame'; epoch: number; seed: string; width: number; height: number; metrics: Metrics;
  positions: Float32Array; ids: Uint32Array; generations: Uint32Array; food: Uint8Array;
  selected: Organism | null; selectedId: number | null; selectedPhenotype: Phenotype | null;
  running: boolean; speed: number; tps: number; history: Sample[]; traitBins: Uint8Array;
  speedHistogram: number[]; histograms: number[][];
};
export type Event = Frame | { kind: 'error'; message: string; recoverable?: boolean };
