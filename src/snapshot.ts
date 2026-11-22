import { restoreGame } from './game/schema.ts';
import type { GameState } from './core/game.ts';
import { Engine, ENGINE_VERSION } from './core/engine.ts';
import type { EngineSnapshot } from './core/engine.ts';
import { EVOLUTION_VERSION, GENOME_VERSION } from './core/genetics.ts';
import { PopulationHistory } from './core/history.ts';
import type { HistorySnapshot } from './core/history.ts';
import type { Sample } from './protocol.ts';
import { fields, requireValue, validateEngine, validateHistory, validateSamples } from './snapshot-schema.ts';

export const SAVE_VERSION = 1;
export const MAX_SAVE_BYTES = 32 * 1024 * 1024;
export type Manifest = {
  format: number; engine: string; genome: string; evolution: string; compatibility: string;
  createdAt: string; name: string; seed: string; tick: number; width: number; height: number; population: number;
  config: EngineSnapshot['config']; checksum: string;
};
export type CapturedWorld = { engine: EngineSnapshot; history: HistorySnapshot; samples: Sample[]; game?: GameState };
export type SaveFile = { manifest: Manifest; text: string };
const encoder = new TextEncoder();
const compatible = 'exact';
export async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(bytes), v => v.toString(16).padStart(2, '0')).join('');
}

export function capture(engine: Engine, history: PopulationHistory, samples: Sample[] = []): CapturedWorld {
  const state = engine.snapshot();
  engine.assertValid();
  history.assertValid(engine);
  return { engine: state, history: history.snapshot(), samples: structuredClone(samples) };
}

function checksumInput(m: Omit<Manifest, 'checksum'>, payload: string) {
  // Fixed tuple, including exact payload bytes. The config copy is verified against that payload.
  return JSON.stringify([m.format, m.engine, m.genome, m.evolution, m.compatibility,
    m.createdAt, m.name, m.seed, m.tick, m.width, m.height, m.population, payload]);
}

export async function encode(captured: CapturedWorld, name: string, createdAt: string, measured?: (stage: 'serialize' | 'sha256' | 'envelope') => void): Promise<SaveFile> {
  const e = captured.engine;
  name = name.trim();
  requireValue(name.length > 0 && name.length <= 80, 'Имя мира должно содержать от 1 до 80 символов');
  requireValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(createdAt) && Number.isFinite(Date.parse(createdAt)), 'Некорректная дата сохранения');
  const base = { format: SAVE_VERSION, engine: ENGINE_VERSION, genome: GENOME_VERSION, evolution: EVOLUTION_VERSION,
    compatibility: compatible, createdAt, name, seed: e.config.seed, tick: e.tick, width: e.config.width,
    height: e.config.height, population: e.organisms.length, config: e.config };
  const payload = JSON.stringify(captured);
  measured?.('serialize');
  const checksum = await sha256(checksumInput(base, payload));
  measured?.('sha256');
  const manifest = { ...base, checksum };
  const text = JSON.stringify({ manifest, payload });
  requireValue(new Blob([text]).size <= MAX_SAVE_BYTES, 'Сохранение превышает предел 32 МиБ');
  measured?.('envelope');
  return { manifest, text };
}

export async function decode(text: string): Promise<{ manifest: Manifest; state: CapturedWorld }> {
  requireValue(typeof text === 'string' && text.length <= MAX_SAVE_BYTES && new Blob([text]).size <= MAX_SAVE_BYTES, 'Файл превышает предел 32 МиБ');
  let outer: unknown;
  try { outer = JSON.parse(text); } catch { throw Error('Некорректный JSON файла'); }
  const file = fields(outer, 'manifest payload');
  const m = fields(file.manifest, 'format engine genome evolution compatibility createdAt name seed tick width height population config checksum') as Manifest;
  requireValue(m.format === SAVE_VERSION, 'Неподдерживаемая версия сохранения');
  requireValue(m.engine === ENGINE_VERSION && m.genome === GENOME_VERSION && m.evolution === EVOLUTION_VERSION && m.compatibility === compatible,
    'Несовместимые версии движка или правил');
  requireValue(typeof m.name === 'string' && m.name.trim().length > 0 && m.name.length <= 80 && typeof m.seed === 'string' && m.seed.length <= 128
    && typeof m.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(m.createdAt) && Number.isFinite(Date.parse(m.createdAt))
    && [m.tick, m.width, m.height, m.population].every(n => Number.isSafeInteger(n) && n >= 0)
    && typeof file.payload === 'string' && typeof m.checksum === 'string' && /^[0-9a-f]{64}$/.test(m.checksum), 'Некорректный манифест');
  requireValue(await sha256(checksumInput(m, file.payload)) === m.checksum, 'Контрольная сумма SHA-256 не совпадает');
  let payload: unknown;
  try { payload = JSON.parse(file.payload); } catch { throw Error('Некорректный JSON состояния'); }
  const raw = fields(payload, 'engine history samples', 'game');
  const engine = validateEngine(raw.engine);
  const config = fields(m.config, Object.keys(engine.config).join(' '));
  requireValue(m.seed === engine.config.seed && m.tick === engine.tick && m.width === engine.config.width && m.height === engine.config.height
    && m.population === engine.organisms.length && Object.entries(engine.config).every(([k,v]) => config[k] === v), 'Манифест расходится с состоянием');
  return { manifest: m, state: { engine, history: validateHistory(raw.history, engine), samples: validateSamples(raw.samples, engine), ...(Object.hasOwn(raw,'game') ? { game: raw.game } : {}) } };
}

export function restore(state: CapturedWorld, measured?: (stage: 'engine' | 'history') => void) {
  const engine = new Engine({}, state.engine);
  measured?.('engine');
  const genealogy = new PopulationHistory(engine, state.history.deadLimit, state.history);
  const samples = structuredClone(state.samples);
  const last = samples.at(-1);
  if (last?.tick === engine.tick) {
    requireValue(Object.entries(engine.metrics()).every(([key, value]) => last[key as keyof Sample] === value)
      && last.livingLines === genealogy.counts.living && last.extinctLines === genealogy.counts.extinct, 'Последний график не соответствует миру');
  }
  measured?.('history');
  const game = Object.hasOwn(state,'game') ? restoreGame(state.game,engine,genealogy) : null;
  return { engine, genealogy, samples, game };
}
