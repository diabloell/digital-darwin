import { readArchive,listArchives,saveArchive,pack,unpack } from './archive.ts';
import { compare,csv,markdown,summary } from './comparison.ts';
import { SCENARIOS,METRICS,validateDefinition } from './definition.ts';
import type { Definition,Metric } from './definition.ts';
import type { Series } from './runner.ts';
import type { LabCommand,LabEvent } from './worker.ts';

const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const lab=$<HTMLDetailsElement>('experiment-lab'), preset=$<HTMLSelectElement>('lab-preset'), archive=$<HTMLSelectElement>('lab-archive');
const reference=$<HTMLSelectElement>('lab-reference');
const metric=$<HTMLSelectElement>('lab-metric'), seedFilter=$<HTMLSelectElement>('lab-filter');
const seeds=$<HTMLTextAreaElement>('lab-seeds'), duration=$<HTMLInputElement>('lab-duration'), interval=$<HTMLInputElement>('lab-interval');
const draft=$<HTMLTextAreaElement>('lab-definition'), status=$('lab-status'), progress=$<HTMLProgressElement>('lab-progress');
const canvas=$<HTMLCanvasElement>('lab-chart'), form=$<HTMLFormElement>('lab-form');
const run=$<HTMLButtonElement>('lab-run'), cancel=$<HTMLButtonElement>('lab-cancel');
const buttons=['lab-json','lab-csv','lab-md'].map(id=>$<HTMLButtonElement>(id));
const colors=['#a5f4df','#ffc795','#c6b4ff','#ff9ac3'];
const format=(v:number|null|undefined)=>v==null?'—':v.toLocaleString('ru-RU',{maximumFractionDigits:3});
let worker:Worker|undefined,result:Series|undefined, pending=false, confirmation=false;
let lastDrawMs=0;

function controls() {
  const busy=Boolean(worker)||pending;
  run.disabled=busy; cancel.disabled=!worker||confirmation;
  archive.disabled=busy; preset.disabled=busy;
  buttons.forEach(button=>button.disabled=busy||!result);
}
function conditionText(d:Definition) {
  $('lab-hypothesis').textContent=d.hypothesis;
  $('lab-conditions').replaceChildren(...[d.control,...d.treatments].map((c,i)=>{
    const li=document.createElement('li');
    li.textContent=`${i===0?'Контроль':'Условие'} · ${c.label} · ${c.landscape==='uniform'?'равномерная':'пятнистая'} · ${JSON.stringify(c.changes)}`;
    return li;
  }));
}
function choosePreset() {
  const d=SCENARIOS[preset.selectedIndex];
  draft.value=JSON.stringify(d,null,2); seeds.value=d.seeds.join('\n'); duration.value=String(d.duration); interval.value=String(d.interval);
  const fixed=d.criterion==='identical-state';
  seeds.readOnly=fixed;duration.readOnly=fixed;
  $('lab-count').textContent=String(d.replicas);
  conditionText(d);
}
function getDefinition(){
  const d=JSON.parse(draft.value) as Definition;
  d.seeds=seeds.value.split('\n').map(s=>s.trim()).filter(Boolean);
  d.replicas=d.seeds.length;
  d.duration=Number(duration.value);
  d.interval=Number(interval.value);
  return validateDefinition(d);
}
async function refresh(selected=archive.value) {
  const slots=await listArchives();
  archive.replaceChildren(new Option('Выберите серию',''),...slots.map(row=>new Option(
    `${row.title} · ${row.status} · ${new Date(row.date).toLocaleString('ru-RU')}`,row.id)));
  archive.value=selected;
}
function fail(error:unknown){status.textContent=`Ошибка: ${error instanceof Error?error.message:String(error)}`;}
function table(area:HTMLElement,headers:string[],rows:(string|number)[][]) {
  const head=document.createElement('thead'),body=document.createElement('tbody'),row=head.insertRow();
  for(const name of headers) {const cell=document.createElement('th');cell.scope='col';cell.textContent=name;row.append(cell);}
  for(const values of rows){const tr=body.insertRow();for(const v of values)tr.insertCell().textContent=String(v);}
  const t=document.createElement('table');t.append(head,body);area.replaceChildren(t);
}
function drawChart() {
  if (!result||!lab.open) return;
  const start=performance.now();
  const key=metric.value as Metric,filter=seedFilter.value;
  const rows=result.runs.filter(r=>r.status==='completed'&&(!filter||r.seed===filter));
  const d=result.definition;
  const sets=[d.control,...d.treatments].map(c=>{
    const runs=rows.filter(r=>r.conditionId===c.id);
    return runs[0]?.trajectory.map((p,i)=>({tick:p.tick,...summary(runs.map(r=>r.trajectory[i]?.values[key]))}))??[];
  });
  const values=sets.flatMap(set=>set.flatMap(p=>p.min===null?[]:[p.min,p.max!]));
  const rect=canvas.getBoundingClientRect(),width=rect.width,height=rect.height,ratio=Math.min(devicePixelRatio,2);
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  const ctx=canvas.getContext('2d')!;
  ctx.setTransform(ratio,0,0,ratio,0,0);
  const left=55,right=width-12,top=14,bottom=height-25;
  const min=values.length?Math.min(0,...values):0,max=values.length?Math.max(min+1e-6,...values):1;
  const x=(tick:number)=>left+tick/d.duration*(right-left),y=(v:number)=>bottom-(v-min)/(max-min)*(bottom-top);
  $('lab-empty').hidden=values.length>0;
  canvas.setAttribute('aria-label',`${METRICS[key]}. ${filter||'Средние по seed и наблюдаемый диапазон'}. Тики 0–${d.duration}.`);
  ctx.font='10px monospace';ctx.fillStyle='#b6cccc';ctx.strokeStyle='#2b4548';
  for(let i=0;i<4;i++) {
    const v=min+(max-min)*i/3;
    ctx.beginPath();ctx.moveTo(left,y(v));ctx.lineTo(right,y(v));ctx.stroke();
    ctx.fillText(format(v),0,y(v)+3);
  }
  ctx.fillText('0',left,height-7);const label=`${d.duration} тик.`;ctx.fillText(label,right-ctx.measureText(label).width,height-7);
  sets.forEach((set,i)=>{
    // Range bars display observed min–max. Null observations break trajectories.
    if(!filter){
      ctx.strokeStyle=colors[i]+'50';ctx.beginPath();
      for(const p of set) if(p.min!==null){ctx.moveTo(x(p.tick),y(p.min));ctx.lineTo(x(p.tick),y(p.max!));}
      ctx.stroke();
    }
    ctx.strokeStyle=colors[i];ctx.lineWidth=2;ctx.beginPath();
    let connected=false;
    for(const p of set){
      if(p.mean===null){connected=false;continue;}
      if(connected)ctx.lineTo(x(p.tick),y(p.mean));
      else ctx.moveTo(x(p.tick),y(p.mean));
      connected=true;
    }
    ctx.stroke(); ctx.lineWidth=1;
  });
  lastDrawMs=performance.now()-start;
  canvas.dataset.renderMs=String(lastDrawMs);
}
function render(){
  if(!result)return;
  const key=metric.value as Metric;
  const comparison=compare(result,key,reference.value);
  const seed=seedFilter.value;
  table($('lab-summary'),['Условие','Завершено','Вымирания','Среднее','Медиана','Мин…макс','Парное Δ','n пар'],
    comparison.map(c=>[c.label,`${c.done}/${c.total}`,`${c.extinct}/${c.done}`,format(c.values.mean),format(c.values.median),
      `${format(c.values.min)}…${format(c.values.max)}`,format(c.effect.mean),c.effect.n]));
  table($('lab-runs'),['Условие','Seed','Статус','Тики','Значение','Вымирание, тик','Δ к базе','Ошибка'],
    result.runs.filter(r=>!seed||r.seed===seed).map(r=>[r.conditionId,r.seed,r.status,r.ticks,format(r.final?.[key]),format(r.extinct),
      format(comparison.find(c=>c.id===r.conditionId)?.pairs.find(p=>p.seed===r.seed)?.difference),r.error??'—']));
  drawChart();
}
function show(series:Series){
  result=series;
  $('lab-results').hidden=false;
  $('lab-result-label').textContent=`${series.definition.title} · ${series.status} · ${series.verdict}`;
  $('lab-hash').textContent=series.scenarioHash;
  $('lab-protocol').textContent=JSON.stringify(series.definition,null,2);
  metric.value=series.definition.primary;
  reference.replaceChildren(...[series.definition.control,...series.definition.treatments].map(c=>new Option(c.label,c.id)));
  seedFilter.replaceChildren(new Option('Все seed',''),...series.definition.seeds.map(s=>new Option(s,s)));
  $('lab-legend').replaceChildren(...[series.definition.control,...series.definition.treatments].map((c,i)=>{
    const li=document.createElement('li');li.style.borderColor=colors[i];li.textContent=c.label;return li;
  }));
  render();
}
function send(c:LabCommand){worker?.postMessage(c);}
function finish(){
  worker?.terminate();worker=undefined;confirmation=false;
  controls();
}
form.onsubmit=e=>{
  e.preventDefault();
  if(worker||pending)return;
  try{
    const d=getDefinition();
    conditionText(d);
    worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
    controls();
    progress.value=0;status.textContent='Подготовка серии';
    worker.onerror=e=>{finish();fail(e.message);};
    worker.onmessage=({data}:MessageEvent<LabEvent>)=>{
      if(data.kind==='progress'){
        const p=data.progress;
        progress.max=p.total;
        progress.value=p.run-1+p.tick/p.duration;
        status.textContent=confirmation?'Остановка после текущего пакета':`Реплика ${p.run}/${p.total} · ${p.seed} · ${p.condition} · ${p.tick}/${p.duration}`;
        return;
      }
      if(data.kind==='error'){finish();fail(data.message);return;}
      pending=true;finish();
      show(data.series);
      status.textContent=`Серия ${data.series.status} · запись архива`;
      void saveArchive(data.series).then(refresh).then(()=>{status.textContent=`Архивировано · ${data.series.status}`;})
        .catch(fail).finally(()=>{pending=false;controls();});
    };
    send({kind:'run',definition:d});
  }catch(error){finish();fail(error);}
};
cancel.onclick=()=>{confirmation=true;controls();send({kind:'cancel'});};
archive.onchange=()=>{
  if(!archive.value||worker)return;
  pending=true;controls();
  void readArchive(archive.value).then(row=>{if(!row)throw Error('Запись уже вытеснена');return unpack(row.text);})
    .then(series=>{show(series);status.textContent='Открыт архив';}).catch(fail).finally(()=>{pending=false;controls();});
};
function download(text:string,extension:string,type:string){
  const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');
  a.href=url;a.download=`${result!.definition.id}.${extension}`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
buttons[0].onclick=()=>{if(result)void pack(result).then(text=>download(text,'json','application/json')).catch(fail);};
buttons[1].onclick=()=>{if(result)download(csv(result),'csv','text/csv');};
buttons[2].onclick=()=>{if(result)download(markdown(result),'md','text/markdown');};
preset.onchange=choosePreset;
seeds.oninput=()=>{$('lab-count').textContent=String(seeds.value.split('\n').filter(s=>s.trim()).length);};
draft.onchange=()=>{try{conditionText(getDefinition());}catch(error){fail(error);}};
metric.onchange=seedFilter.onchange=reference.onchange=render;
lab.ontoggle=()=>{if(lab.open){drawChart();void refresh().catch(fail);}};
new ResizeObserver(drawChart).observe(canvas);
SCENARIOS.forEach(d=>preset.add(new Option(`${d.id} · ${d.title}`,d.id)));
Object.entries(METRICS).forEach(([key,value])=>metric.add(new Option(value,key)));
choosePreset();controls();
