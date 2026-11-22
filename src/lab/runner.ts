import { Engine } from '../core/engine.ts';
import { EvolutionObserver, geneMeans } from '../core/evolution.ts';
import { GENES } from '../core/genetics.ts';
import { sha256 } from '../snapshot.ts';
import { canonical, validateDefinition, VERSIONS } from './definition.ts';
import type { Condition, Definition, Metric } from './definition.ts';

export type Values = Partial<Record<Metric, number | null>>;
export type Point = { tick: number; values: Values; hash: string };
export type Run = {
  runId: string; experimentId: string; conditionId: string; seed: string; engineVersion: string; scenarioHash: string;
  status: 'completed' | 'failed' | 'cancelled' | 'not-run'; ticks: number; hash: string | null; error: string | null;
  config: Engine['config'] | null; trajectory: Point[]; final: Values | null; extinct: number | null;
  origin: { founders: string; resources: string; rng: string; totals: number[] } | null;
  genetics: ReturnType<EvolutionObserver['snapshot']> | null;
};
export type Series = { version: number; seriesId: string; definition: Definition; scenarioHash: string; environment: string;
  status: 'completed' | 'failed' | 'partial'; verdict: 'PASS' | 'FAIL' | 'NOT RUN' | 'DESCRIPTIVE'; runs: Run[] };
export type Progress = { run: number; total: number; seed: string; condition: string; tick: number; duration: number };
type Options = {
  environment: string; yieldControl?: () => Promise<void>; cancelled?: () => boolean; progress?: (p: Progress) => void;
  saveRun?: (r: Run) => Promise<void>; afterTick?: (e: Engine) => void;
};

function uniform(field: Int32Array) {
  const sum = field.reduce((total, value) => total + value, 0);
  const quotient = Math.floor(sum / field.length), remainder = sum % field.length;
  for (let i=0;i<field.length;i++) field[i] = quotient + Number(i < remainder);
}

export function initialWorld(d: Definition, c: Condition, seed: string) {
  const engine = new Engine({ seed, ...d.initial, ...c.changes });
  if (c.landscape === 'uniform') {
    uniform(engine.capacity);
    uniform(engine.food);
    uniform(engine.growth);
  }
  engine.assertValid();
  return engine;
}
function point(e: Engine, previousBirths: number, previousDeaths: number): Values {
  const m = e.metrics(), genes = geneMeans(e.organisms);
  return { population: m.population, births: m.births, deaths: m.deaths, food: m.food,
    energy: m.population ? m.meanEnergy : null, speed: genes?.speed ?? null, sensor: genes?.sensor ?? null,
    variants: new Set(e.organisms.map(({genome}) => GENES.map(g=>genome[g]).join(','))).size,
    intervalBirths: m.births-previousBirths, intervalDeaths: m.deaths-previousDeaths };
}
export async function runSeries(raw: unknown, options: Options): Promise<Series> {
  const d = validateDefinition(raw);
  const scenarioHash = await sha256(canonical(d));
  const seriesId = crypto.randomUUID();
  const runs: Run[] = [], initial = new Map<string, NonNullable<Run['origin']>>();
  let referenceState: string | null = null;
  let verdict: Series['verdict'] = d.criterion === 'identical-state' ? 'NOT RUN' : 'DESCRIPTIVE';
  const conditions = [d.control,...d.treatments], total = conditions.length*d.seeds.length;
  for (const seed of d.seeds) for (const c of conditions) {
    const row: Run = { runId: `${seriesId}-${runs.length+1}`, experimentId:d.id, conditionId:c.id, seed,
      engineVersion:VERSIONS.engine, scenarioHash, status:'not-run', ticks:0, hash:null, error:null, config:null,
      trajectory:[], final:null, extinct:null, origin:null, genetics:null };
    runs.push(row);
    if (!options.cancelled?.()) {
      try {
        const e = initialWorld(d,c,seed), observer = new EvolutionObserver(e);
        row.config = e.config;
        row.extinct = e.organisms.length ? null : 0;
        row.origin = {
          founders:await sha256(JSON.stringify(e.organisms)), rng:await sha256(JSON.stringify(e.rng.state)),
          resources:await sha256(JSON.stringify([e.food,e.capacity,e.growth].map(a=>Array.from(a)))),
          totals:[e.food,e.capacity,e.growth].map(a=>a.reduce((sum,v)=>sum+v,0))
        };
        const paired = initial.get(seed);
        if (paired && (paired.founders !== row.origin.founders || paired.rng !== row.origin.rng)) throw Error('Непарное начальное состояние');
        const sameScale=(d.control.changes.resourceScale??1)===(c.changes.resourceScale??1);
        if (paired && sameScale && (paired.totals.some((value,i)=>value!==row.origin!.totals[i])
          || (d.control.landscape===c.landscape && paired.resources!==row.origin.resources))) throw Error('Несогласованное воздействие на ресурсы');
        if (c === d.control) initial.set(seed,row.origin);
        let priorBirths=0, priorDeaths=0, populationSum=0, exposure=0;
        const rateGap=(group: typeof observer.groups[number]) => group.high.exposure&&group.low.exposure ?
          1000*(group.high.parents/group.high.exposure-group.low.parents/group.low.exposure):null;
        const sample = async () => {
          const values = point(e,priorBirths,priorDeaths);
          values.speedGap=rateGap(observer.groups[0]);values.sensorGap=rateGap(observer.groups[1]);
          values.averagePopulation=e.tick?populationSum/e.tick:null;
          values.reproduction=exposure?e.births*1000/exposure:null;
          values.survival=e.config.population+e.births?e.organisms.length/(e.config.population+e.births):null;
          if (!e.tick) { values.intervalBirths=null; values.intervalDeaths=null; }
          priorBirths=e.births; priorDeaths=e.deaths;
          row.trajectory.push({tick:e.tick,values,hash:await sha256(e.canonical())});
          options.progress?.({run:runs.length,total,seed,condition:c.id,tick:e.tick,duration:d.duration});
        };
        await sample();
        while (e.tick<d.duration && !options.cancelled?.()) {
          const target = Math.min(d.duration,e.tick+Math.min(c.batch,d.interval-e.tick%d.interval));
          e.step(target-e.tick,phase=>{
            if (phase!=='audit') return;
            e.assertValid();
            observer.record(e);
            populationSum+=e.organisms.length;
            exposure+=e.organisms.length+e.lastDeaths.length-e.lastBirths.length;
            if (row.extinct===null && !e.organisms.length) row.extinct=e.tick;
            row.ticks=e.tick;
            options.afterTick?.(e);
          });
          if (e.tick%d.interval===0 || e.tick===d.duration) await sample();
          if (options.yieldControl && (e.tick%d.interval===0 || e.tick%64<c.batch)) await options.yieldControl();
        }
        if (e.tick===d.duration) {
          const stats = observer.snapshot(e), state = e.canonical();
          row.genetics=stats;
          const [speed,sensor] = stats.live.genes, [speedGroups,sensorGroups] = stats.lifetime.groups;
          const gap = ({high,low}: typeof speedGroups) => high.birthsPer1000AgentTicks===null || low.birthsPer1000AgentTicks===null
            ? null : high.birthsPer1000AgentTicks-low.birthsPer1000AgentTicks;
          row.final={ ...row.trajectory.at(-1)!.values, averagePopulation:populationSum/e.tick,
            mutations:stats.lifetime.mutationFraction, outsideFounder:stats.lifetime.outsideFounderBirths,
            reproduction:exposure?e.births*1000/exposure:null, survival:e.config.population+e.births?e.organisms.length/(e.config.population+e.births):null,
            speedMedian:speed.median, sensorMedian:sensor.median, speedVariance:speed.variance,sensorVariance:sensor.variance,
            speedGap:gap(speedGroups),sensorGap:gap(sensorGroups),dissipated:stats.lifetime.dissipated/1000 };
          row.hash=row.trajectory.at(-1)!.hash;
          row.status='completed';
          if (d.criterion==='identical-state') {
            if (referenceState===null) referenceState=state;
            else verdict=referenceState===state?'PASS':'FAIL';
          }
        } else row.status='cancelled';
      } catch (error) {
        row.status='failed';
        row.error=error instanceof Error ? error.message : String(error);
      }
    }
    await options.saveRun?.(row);
  }
  const status = runs.some(r=>r.status==='failed') || verdict==='FAIL' ? 'failed'
    : runs.every(r=>r.status==='completed')?'completed':'partial';
  if (d.criterion==='identical-state' && status==='failed') verdict='FAIL';
  return {version:1, seriesId, definition:d, scenarioHash, environment:options.environment,status,verdict,runs};
}
