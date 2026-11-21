import type { Metrics, Organism } from './core/engine.ts';
export type Command = { kind: 'create'; seed: string } | { kind: 'play'; value: boolean } | { kind: 'speed'; value: number } | { kind: 'step' } | { kind: 'inspect'; id: number | null } | { kind: 'ready' };
export type Frame = { kind: 'frame'; epoch: number; seed: string; metrics: Metrics; positions: Float32Array; ids: Uint32Array; food: Uint8Array; selected: Organism | null; selectedId: number | null; running: boolean; speed: number; tps: number; history: { tick: number; population: number }[] };
export type Event = Frame | { kind: 'error'; message: string };
