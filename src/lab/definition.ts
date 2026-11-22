import { ENGINE_VERSION, validateConfig } from '../core/engine.ts';
import type { Config } from '../core/engine.ts';
import { EVOLUTION_VERSION } from '../core/genetics.ts';

export const VERSIONS = { format: 1, engine: ENGINE_VERSION, evolution: EVOLUTION_VERSION, metrics: 1, scenario: 1 } as const;
export const METRICS = {
  population: 'Живые, организмов', averagePopulation: 'Средняя численность, организмов',
  births: 'Рождения, накоплено', deaths: 'Смерти, накоплено',
  intervalBirths: 'Рождения за интервал', intervalDeaths: 'Смерти за интервал',
  food: 'Пища, ед. энергии', energy: 'Средняя энергия живых, ед.',
  variants: 'Уникальные генотипы живых', mutations: 'Доля рождений с изменённым геномом',
  outsideFounder: 'Рождения вне набора генотипов основателей',
  reproduction: 'Рождения на 1 000 организм-тиков',
  speed: 'Средняя наследственная скорость, кл./тик', sensor: 'Средний наследственный радиус, кл.',
  speedMedian: 'Медианная скорость, кл./тик', sensorMedian: 'Медианный радиус, кл.',
  speedVariance: 'Дисперсия скорости', sensorVariance: 'Дисперсия радиуса',
  speedGap: 'Рождения: высокая − низкая скорость, на 1 000 организм-тиков',
  sensorGap: 'Рождения: высокий − низкий радиус, на 1 000 организм-тиков',
  dissipated: 'Метаболические потери, накоплено, ед. энергии',
  survival: 'Доля живых среди всех вошедших'
} as const;
export type Metric = keyof typeof METRICS;
type Changes = Partial<Pick<Config, 'mutationRate' | 'mutationStrength' | 'resourceScale' | 'regrowth' | 'rule' | 'reproduction'>>;
export type Condition = { id: string; label: string; changes: Changes; landscape: 'patchy' | 'uniform'; batch: number };
export type Definition = {
  versions: typeof VERSIONS; id: string; title: string; description: string; hypothesis: string;
  initial: Pick<Config,'width' | 'height' | 'population'>; control: Condition; treatments: Condition[];
  seeds: string[]; replicas: number; duration: number; interval: number; burnIn: 0; primary: Metric;
  secondary: Metric[]; stopPolicy: 'fixed-ticks'; criterion: 'invariants' | 'identical-state'; limitations: string;
};
const seeds = ['dd02-amber','dd02-fern','dd02-dune','dd02-coral','dd02-slate'];
const initial = { width: 48, height: 48, population: 240 };
const condition = (id: string,label: string,changes: Changes = {}, landscape: Condition['landscape'] = 'patchy', batch = 1): Condition =>
  ({ id, label, changes, landscape, batch });
const base = {
  versions: VERSIONS, initial, seeds, replicas: 5, duration: 4000, interval: 100, burnIn: 0,
  stopPolicy: 'fixed-ticks', criterion: 'invariants',
  limitations: 'Фиксированный набор seed. Диапазон наблюдений описывает разброс, а не доверительный интервал. Связь признака с размножением не устанавливает причинность отдельного гена.'
} as const;
const garden = condition('control','Обычные ресурсы');
export const SCENARIOS: Definition[] = [
  { ...base, id:'LAB-E01', title:'Детерминизм', description:'Два независимых запуска с разными пакетами тиков.',
    hypothesis:'Полное состояние совпадает при одинаковых seed и условиях.', seeds:['dd00-verification'], replicas:1,
    duration:10000, control:condition('control','По одному тику'), treatments:[condition('batch','Пакеты по 17',{},'patchy',17)],
    criterion:'identical-state', primary:'population', secondary:['births','food'] },
  { ...base, id:'LAB-E02', title:'Дефицит ресурсов', description:'Изменяется только начальный запас и скорость роста пищи.',
    hypothesis:'Дефицит пищи изменит численность, энергию и репродуктивный успех.', control:garden,
    treatments:[condition('scarcity','35% ресурсов',{ resourceScale:.35 })], primary:'population',
    secondary:['averagePopulation','births','deaths','energy','food','reproduction','speed','sensor'] },
  { ...base, id:'LAB-E03', title:'Мутации ON / OFF', description:'Основатели и пища совпадают. Меняется вероятность мутации.',
    hypothesis:'Мутации создают новые варианты, но рост разнообразия может не сопровождаться ростом численности или числа рождений.',
    control:condition('control','Мутации OFF',{mutationRate:0}), treatments:[condition('mutations','Мутации ON',{mutationRate:.12})],
    primary:'variants', secondary:['population','births','outsideFounder','mutations','reproduction','speedVariance','sensorVariance'] },
  { ...base, id:'LAB-E04', title:'Подвижность и сенсоры', description:'Начальная пища, ёмкость и рост перераспределяются без изменения их сумм. Нейтральная пара отделяет прямой эффект выраженного фенотипа.',
    hypothesis:'Связь скорости и радиуса с частотой рождений зависит от пространственной структуры пищи.',
    control:condition('control','Равномерная',{},'uniform'),
    treatments:[condition('patchy','Пятнистая'),condition('neutral-uniform','Равномерная · нейтральная',{rule:'neutral'},'uniform'),condition('neutral-patchy','Пятнистая · нейтральная',{rule:'neutral'})],
    primary:'sensorGap', secondary:['speedGap','speed','sensor','speedMedian','sensorMedian','speedVariance','sensorVariance','survival','dissipated','births'] }
];
const changeKeys = ['mutationRate','mutationStrength','resourceScale','regrowth','rule','reproduction'];
const known = (x: unknown, keys: readonly string[]) => x !== null && typeof x === 'object' &&
  !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype && Object.keys(x).every(k => keys.includes(k));
const text = (x: unknown, max: number) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
const int = (x: number, min: number, max: number) => Number.isSafeInteger(x) && x >= min && x <= max;

export function validateDefinition(data: unknown): Definition {
  const d = data as Definition;
  if (!known(d,Object.keys(SCENARIOS[0])) || !known(d.versions,Object.keys(VERSIONS))
    || Object.entries(VERSIONS).some(([k,v]) => d.versions[k as keyof typeof VERSIONS] !== v)) throw Error('Несовместимая версия декларации');
  if (!text(d.id,64) || !/^[A-Za-z0-9_-]+$/.test(d.id) || !text(d.title,120) || !text(d.description,1000)
    || !text(d.hypothesis,1000) || !text(d.limitations,2000) || !known(d.initial,['width','height','population'])
    || !int(d.initial.width,8,128) || !int(d.initial.height,8,128) || !int(d.initial.population,0,2000)
    || !int(d.duration,1,20000) || !int(d.interval,1,d.duration) || Math.ceil(d.duration/d.interval)>400
    || d.stopPolicy !== 'fixed-ticks' || d.burnIn !== 0 || !['invariants','identical-state'].includes(d.criterion)
    || !Array.isArray(d.seeds) || !int(d.seeds.length,1,12) || d.replicas !== d.seeds.length
    || new Set(d.seeds).size !== d.seeds.length || d.seeds.some(s => !text(s,128))
    || !Object.hasOwn(METRICS,d.primary) || !Array.isArray(d.secondary) || d.secondary.length>20 || d.secondary.some(m=>!Object.hasOwn(METRICS,m))
    || !Array.isArray(d.treatments) || !int(d.treatments.length,1,3)) throw Error('Некорректные параметры, seed или размер серии');
  const ids = new Set<string>();
  for (const c of [d.control,...d.treatments]) {
    if (!known(c,['id','label','changes','landscape','batch']) || !text(c.id,32) || !/^[A-Za-z0-9_-]+$/.test(c.id)
      || ids.has(c.id) || !text(c.label,100) || !known(c.changes,changeKeys) || !['patchy','uniform'].includes(c.landscape)
      || !int(c.batch,1,64) || Object.values(c.changes).some(v=>v===undefined)) throw Error('Некорректное условие');
    ids.add(c.id);
    validateConfig({ seed:d.seeds[0], ...d.initial, mutationRate:.12, regrowth:true, ...c.changes });
  }
  if (d.criterion==='identical-state' && (d.treatments.length !== 1 || d.replicas !== 1
    || d.treatments[0].landscape !== d.control.landscape
    || canonical(d.treatments[0].changes) !== canonical(d.control.changes))) throw Error('Для проверки детерминизма нужны одинаковые условия и один seed');
  if (d.id === 'LAB-E01' && (d.criterion !== 'identical-state' || d.duration !== 10000)) throw Error('LAB-E01 требует 10 000 тиков');
  return structuredClone(d);
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const row = value as Record<string,unknown>;
    return '{' + Object.keys(row).sort().map(k=>JSON.stringify(k)+':'+canonical(row[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}
