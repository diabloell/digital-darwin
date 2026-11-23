import { Rng } from './rng.ts';

export const PLANET_VERSION = 1;
export const PERIOD = 320;
export const PLANET_MAX_CAPACITY = 14700;
export const LAYERS = { light: 'Базовый свет', temperature: 'Температура', water: 'Влага', fertility: 'Плодородие' } as const;
export type PlanetLayer = keyof typeof LAYERS;
export type Planet = ReturnType<typeof generatePlanet>;

const unit = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const interpolate = (a: number, b: number, t: number) => a + (b - a) * t;

export function cycle(tick: number) {
  const phase = tick % PERIOD;
  const strength = phase <= PERIOD / 2 ? phase : PERIOD - phase;
  return { phase, strength, lightPercent: 72 + 46 * strength / (PERIOD / 2),
    trend: phase < PERIOD / 2 ? 'растёт' : 'снижается' };
}

export function generatePlanet(seed: string, width: number, height: number) {
  const rng = new Rng('planet-v1:' + seed);
  const light = .55 + .45 * rng.next();
  const temperature = .20 + .58 * light;
  const water = unit(.31 + .61 * rng.next() - .20 * temperature);
  const geology = .44 + .55 * rng.next();
  const mesh = (n: number) => {
    const nodes = Array.from({length:n*n}, () => rng.next());
    return (x: number, y: number) => {
      x = x * n / width;
      y = y * n / height;
      const i = Math.floor(x), j = Math.floor(y);
      const a = smooth(x - i), b = smooth(y - j);
      const node = (col: number, row: number) => nodes[row % n * n + col % n];
      return interpolate(interpolate(node(i,j),node(i+1,j),a),interpolate(node(i,j+1),node(i+1,j+1),a),b);
    };
  };
  const terrain = mesh(4), basins = mesh(6);
  const layers = { light: new Uint8Array(width*height), temperature: new Uint8Array(width*height),
    water: new Uint8Array(width*height), fertility: new Uint8Array(width*height) };
  let wetCells = 0, fertilitySum = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    const relief = terrain(x,y);
    const sunny = unit(light * (.62 + .38 * relief));
    const heat = unit(temperature + .38 * (sunny - light * .81) - .19 * (relief - .5));
    const moisture = unit(water + .76 * (basins(x,y) - .5) - .25 * (relief - .5) - .28 * (heat - temperature));
    const fertile = unit(geology * (.42 + .58 * sunny) * (.12 + .88 * moisture) * (1 - .85 * Math.abs(heat - .60)));
    layers.light[index] = Math.round(100 * sunny);
    layers.temperature[index] = Math.round(100 * heat);
    layers.water[index] = Math.round(100 * moisture);
    layers.fertility[index] = Math.round(100 * fertile);
    if (layers.water[index] >= 60) wetCells++;
    fertilitySum += layers.fertility[index];
  }
  return { layers, light, temperature, water, geology, wetCells, meanFertility: fertilitySum / (width * height) };
}

export function planetCell(fertility: number, scale: number) {
  const capacity = 5200 + 95 * fertility;
  return { capacity, growth: Math.floor((105 + 5.50 * fertility) * scale), food: Math.floor(capacity * .94 * scale) };
}

export function seasonalGrowth(base: number, moisture: number, strength: number) {
  // Humid zones benefit more from the same increase in light.
  return Math.floor(base * (11520 + (26 + Math.floor(.33 * moisture)) * strength) / 16000);
}
