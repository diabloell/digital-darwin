import { METRICS } from './definition.ts';
import type { Metric } from './definition.ts';
import type { Series } from './runner.ts';

export function summary(values: readonly (number | null | undefined)[]) {
  const sample = values.filter((x):x is number=>typeof x==='number' && Number.isFinite(x)).sort((a,b)=>a-b);
  const n=sample.length, mean=n?sample.reduce((sum,v)=>sum+v,0)/n:null;
  return {n, missing:values.length-n, mean, median:n?(sample[Math.floor((n-1)/2)]+sample[Math.floor(n/2)])/2:null,
    min:sample[0]??null,max:sample.at(-1)??null,
    sd:n>1?Math.sqrt(sample.reduce((sum,v)=>sum+(v-mean!)**2,0)/(n-1)):null};
}
export function compare(series: Series, metric: Metric, reference = series.definition.control.id) {
  const {definition:d,runs}=series;
  const normal=runs.filter(r=>r.conditionId===reference);
  return [d.control,...d.treatments].map(c=>{
    const group=runs.filter(r=>r.conditionId===c.id), completed=group.filter(r=>r.status==='completed');
    const pairs=d.seeds.map(seed=>{
      const a=normal.find(r=>r.seed===seed), b=group.find(r=>r.seed===seed);
      const av=a?.final?.[metric],bv=b?.final?.[metric];
      return {seed,status:a?.status==='completed'&&b?.status==='completed'?'complete':'incomplete',
        difference:a?.status==='completed'&&b?.status==='completed'&&av!=null&&bv!=null?bv-av:null};
    });
    return {id:c.id,label:c.label,done:completed.length,total:group.length,extinct:completed.filter(r=>r.extinct!==null).length,
      values:summary(completed.map(r=>r.final?.[metric])),pairs,effect:summary(pairs.map(p=>p.difference))};
  });
}
const csvCell=(v:unknown)=>{
  const raw=String(v??'');
  // Preserve strings as literal spreadsheet cells.
  const safe=typeof v==='string'&&/^[\s]*[=+\-@]|^[\t\r\n]/.test(raw)?"'"+raw:raw;
  return '"'+safe.replaceAll('"','""')+'"';
};
export function csv(series:Series) {
  const metrics=Object.keys(METRICS) as Metric[];
  const row=(values:unknown[])=>values.map(csvCell).join(',');
  return [row(['runId','condition','seed','status','completedTicks','tick','kind','hash','extinctionTick','error',...metrics]),
    ...series.runs.flatMap(r=>{
      const values=(p:Record<string,unknown>|null)=>metrics.map(key=>p?.[key]);
      return [...r.trajectory.map(p=>row([r.runId,r.conditionId,r.seed,r.status,r.ticks,p.tick,'sample',p.hash,r.extinct,r.error,...values(p.values)])),
        row([r.runId,r.conditionId,r.seed,r.status,r.ticks,r.ticks,'final',r.hash,r.extinct,r.error,...values(r.final)])];
    })].join('\n')+'\n';
}
const md=(v:unknown)=>String(v??'—').replace(/[<>|\r\n]/g,c=>({'<':'&lt;','>':'&gt;','|':'\\|','\r':' ','\n':' '}[c]!));
const n=(v:number|null)=>v===null?'—':v.toFixed(3);
export function markdown(series:Series) {
  const d=series.definition,m=d.primary;
  const effects=compare(series,m);
  const seriesRows=effects.map(c=>`| ${md(c.label)} | ${c.done}/${c.total} | ${c.extinct}/${c.done} | ${n(c.values.mean)} | ${n(c.values.median)} | ${n(c.values.min)}…${n(c.values.max)} | ${n(c.effect.mean)} | ${c.effect.n} |`);
  const rows=series.runs.map(r=>`| ${md(r.conditionId)} | ${md(r.seed)} | ${r.status} | ${r.ticks} | ${n(r.final?.[m]??null)} | ${md(r.extinct)} | ${md(r.hash)} | ${md(r.error)} |`);
  const values=series.runs.flatMap(r=>r.trajectory.map(p=>p.values[m]).filter((v):v is number=>v!=null));
  const low=values.length?Math.min(...values):0, high=values.length?Math.max(...values):1;
  const plot=series.runs.map(r=>`${md(r.conditionId)}/${md(r.seed)}: ${r.trajectory.map(p=>{
    const x=p.values[m]; return x==null?'·':'▁▂▃▄▅▆▇█'[Math.min(7,Math.floor(8*(x-low)/Math.max(high-low,1e-12)))];
  }).join('')}`).join('\n');
  return `# ${md(d.title)}

## Hypothesis
${md(d.hypothesis)}

## Protocol
${md(d.description)}
${d.replicas} seed на условие: ${d.seeds.map(md).join(', ')}. ${d.duration} тиков, выборка через ${d.interval}. Burn-in: ${d.burnIn}.

## Results
Статус ${series.status}, критерий ${series.verdict}. Основная метрика: ${METRICS[m]}.

| Условие | Завершено | Вымирания | Среднее | Медиана | Мин…макс | Парное Δ | n пар |
| --- | --- | --- | --- | --- | --- | --- | --- |
${seriesRows.join('\n')}

| Условие | Seed | Статус | Тиков | Значение | Тик вымирания | SHA-256 | Ошибка |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

Траектории на общей шкале ${n(low)}…${n(high)}. Точка означает отсутствие значения. Исходные отсчёты в JSON и CSV.

~~~text
${plot}
~~~

## Interpretation
${md(d.limitations)}
Средние парные различия относятся только к завершённым парам с определённой метрикой. Изменение численности и корреляции признаков описывают эту модель.

## Reproducibility
Scenario SHA-256: ${series.scenarioHash}. Engine ${VERSIONS_LABEL(d)}. Среда: ${md(series.environment)}.

    node apps/lab.ts definition.json outputs/lab

~~~json
${JSON.stringify(d,null,2)}
~~~
`;
}
function VERSIONS_LABEL(d:Series['definition']) {
  return `${d.versions.engine}, эволюция ${d.versions.evolution}, метрики ${d.versions.metrics}, сценарий ${d.versions.scenario}`;
}
