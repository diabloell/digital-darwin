import type { HistoryView } from './core/history.ts';
import type { Config, Metrics, Organism } from './core/engine.ts';
import type { Genome, Phenotype } from './core/genetics.ts';
export type WorldSettings = Pick<Config, 'width' | 'height' | 'population' | 'mutationRate' | 'mutationStrength' | 'regrowth' | 'rule'>;
export type Command = { kind: 'create'; seed: string; settings?: WorldSettings } | { kind: 'play'; value: boolean } | { kind: 'speed'; value: number } | { kind: 'step' } | { kind: 'inspect'; id: number | null } | { kind: 'ready' }
  | { kind: 'history'; request: number; entity: number | null; founder: number | null; depth: number };
export type Sample = Metrics & { genes: Genome | null; variants: number; interval: number; intervalBirths: number; intervalDeaths: number; totalEnergy: number; meanGeneration: number | null; livingLines: number; extinctLines: number };
export type Frame = {
  kind: 'frame'; epoch: number; seed: string; width: number; height: number; metrics: Metrics;
  positions: Float32Array; ids: Uint32Array; generations: Uint32Array; founders: Uint32Array; food: Uint8Array;
  selected: Organism | null; selectedId: number | null; selectedPhenotype: Phenotype | null;
  running: boolean; speed: number; tps: number; history: Sample[]; traitBins: Uint8Array;
  speedHistogram: number[]; histograms: number[][];
};
export type Event = Frame | { kind: 'history'; epoch: number; request: number; view: HistoryView } | { kind: 'error'; message: string; recoverable?: boolean };
