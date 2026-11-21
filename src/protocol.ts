import type { Metrics, Organism } from './core/engine.ts';
export type Command = { kind: 'create'; seed: string } | { kind: 'play'; value: boolean } | { kind: 'speed'; value: number } | { kind: 'step' } | { kind: 'inspect'; id: number | null } | { kind: 'ready' };
import type { Genome, Phenotype } from './core/genetics.ts';
export type Sample = { tick: number; population: number; genes: Genome | null };
export type Frame = { kind: 'frame'; epoch: number; seed: string; metrics: Metrics; positions: Float32Array; ids: Uint32Array; food: Uint8Array; selected: Organism | null; selectedId: number | null; running: boolean; speed: number; tps: number; history: Sample[]; traitBins: Uint8Array; speedHistogram: number[]; selectedPhenotype: Phenotype | null };
export type Event = Frame | { kind: 'error'; message: string };
