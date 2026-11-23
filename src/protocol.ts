import type { EcologyView } from './core/ecology.ts';
import type { Planet, cycle } from './core/planet.ts';
import type { Action, GameView, Habitat } from './core/game.ts';
import type { Manifest, SaveFile } from './snapshot.ts';
import type { HistoryView, WorldEvent } from './core/history.ts';
import type { Config, Metrics, Organism } from './core/engine.ts';
import type { Genome, Phenotype } from './core/genetics.ts';
export type WorldSettings = Pick<Config, 'width' | 'height' | 'population' | 'mutationRate' | 'mutationStrength' | 'regrowth' | 'rule'>;
export type Command = { kind: 'create'; seed: string; settings?: WorldSettings } | { kind: 'play'; value: boolean } | { kind: 'speed'; value: number } | { kind: 'step' } | { kind: 'inspect'; id: number | null } | { kind: 'ready'; epoch?: number }
  | { kind: 'history'; request: number; entity: number | null; founder: number | null; depth: number }
  | { kind: 'new-game'; seed: string; habitat: Habitat; planet?: boolean; tree?: boolean; ecology?: boolean; release?: boolean }
  | { kind: 'game-action'; epoch: number; action: Action }
  | { kind: 'snapshot'; request: number; epoch: number; name: string; createdAt: string }
  | { kind: 'restore'; request: number; epoch: number; text: string; preview: boolean };
export type Sample = Metrics & { genes: Genome | null; variants: number; interval: number; intervalBirths: number; intervalDeaths: number; totalEnergy: number; meanGeneration: number | null; livingLines: number; extinctLines: number };
export type Frame = {
  kind: 'frame'; epoch: number; seed: string; width: number; height: number; metrics: Metrics;
  positions: Float32Array; ids: Uint32Array; generations: Uint32Array; founders: Uint32Array; food: Uint8Array;
  selected: Organism | null; selectedId: number | null; selectedPhenotype: Phenotype | null;
  running: boolean; speed: number; tps: number; history: Sample[]; traitBins: Uint8Array;
  game?: GameView;
  planet?: Planet & { cycle: ReturnType<typeof cycle> };
  ecology?: EcologyView;
  recentEvents: WorldEvent[];
  speedHistogram: number[]; histograms: number[][];
};
export type PersistenceEvent =
  | { kind: 'snapshot-ready'; request: number; epoch: number; file: SaveFile }
  | { kind: 'restore-result'; request: number; epoch: number; manifest: Manifest; preview: boolean }
  | { kind: 'persistence-error'; request: number; epoch: number; message: string };
export type Event = Frame | PersistenceEvent | { kind: 'history'; epoch: number; request: number; view: HistoryView } | { kind: 'error'; message: string; recoverable?: boolean };
