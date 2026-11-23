import { PlanetGlobe } from './game/globe.ts';
import { PERIOD } from './core/planet.ts';
import { CARDS } from './core/game.ts';
import { EVENT_LABELS } from './history-panel.ts';
import type { Frame } from './protocol.ts';

const element = (id: string) => document.getElementById(id)!;
const mini = element('planet-mini');
const globe = new PlanetGlobe(mini);
const format = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const delta = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const trends = ['population', 'food', 'energy', 'carriers'].map(name => ({
  canvas: element('trend-' + name) as HTMLCanvasElement,
  label: element('trend-' + name + '-label')
}));

export function updateConsole(frame: Frame, previous?: Frame): void {
  const { game, recentEvents } = frame;
  const active = game?.attempts.find(attempt => attempt.card === game.active);
  element('planet-seed').textContent = frame.seed;
  element('planet-size').textContent = `${frame.width} × ${frame.height} клеток · тороидальный мир`;
  const planet = frame.planet;
  if (previous?.epoch !== frame.epoch || previous.seed !== frame.seed
    || previous.width !== frame.width || previous.height !== frame.height) {
    mini.hidden = !planet;
    element('planet-placeholder').hidden = Boolean(planet);
    if (planet) globe.setTerrain(frame.seed, frame.width, frame.height, planet.layers);
  }
  element('planet-profile').hidden = !planet;
  if (planet) {
    const indices = (a: number, b: number) => `${Math.round(a * 100)} / ${Math.round(b * 100)}`;
    element('planet-climate').textContent = indices(planet.light, planet.temperature);
    element('planet-water').textContent = indices(planet.water, planet.geology);
    element('planet-wet').textContent = format.format(100 * planet.wetCells / (frame.width * frame.height)) + '%';
    element('planet-fertility').textContent = format.format(planet.meanFertility);
    const c = planet.cycle;
    element('planet-cycle').textContent = `Свет ${format.format(c.lightPercent)}% от базового · ${c.trend} · фаза ${c.phase}/${PERIOD}`;
  }
  element('console-speed').textContent = `· ${frame.speed}×`;
  element('console-line').textContent = game?.line ? `#${game.line.founder} · ${format.format(game.line.living)} жив.` : '—';
  element('console-programme').textContent = active
    ? `${CARDS[active.card].title} · ${frame.metrics.tick - active.start}/${active.end-active.start}` : '—';
  const event = recentEvents.find(row => row.severity === 'critical') ?? recentEvents[0];
  element('console-event').textContent = game?.lost ? 'Линия вымерла'
    : event ? EVENT_LABELS[event.kind] : 'Пока нет';
  const recent=recentEvents.map(row=>{
    const value=row.from!==undefined?`${format.format(row.from)} → ${format.format(row.to!)}`:format.format(row.count);
    return {tick:row.tick,text:`${EVENT_LABELS[row.kind]} · ${value}`};
  });
  for(const attempt of game?.attempts.slice(-2)??[]){
    recent.push({tick:attempt.start,text:`Начата программа «${CARDS[attempt.card].title}»`});
    if(attempt.established!==null)recent.push({tick:attempt.finished??Math.min(attempt.end,game!.tick),
      text:`Программа «${CARDS[attempt.card].title}» завершена · носителей ${attempt.endingCount??0}`});
  }
  const events=recent.sort((a,b)=>b.tick-a.tick).slice(0,5);
  const list=element('recent-events');
  const signature=JSON.stringify(events);
  if(list.dataset.signature!==signature){
    list.dataset.signature=signature;
    const rows=events.map(({tick,text})=>{
      const row=document.createElement('li');
      row.textContent=`Тик ${format.format(tick)} · ${text}`;
      return row;
    });
    list.replaceChildren(...rows);
    if(!rows.length)list.textContent='Событий пока нет.';
  }
  const [last, before] = frame.history.slice(-2).reverse();
  element('world-changes').textContent = before
    ? `За ${last.tick - before.tick} тик. · живые ${delta.format(last.population - before.population)} · пища ${delta.format(last.food - before.food)} ед.`
    : 'Изменения появятся после двух отсчётов.';
  updateEcology(frame,previous);
  element('line-map-legend').hidden=game?.founder==null;
  element('focus-line').hidden = !game?.line?.living;
}

export function drawTrends(frame: Frame): void {
  const attempt = frame.game?.attempts.at(-1);
  const card = attempt && CARDS[attempt.card];
  const name = element('trend-adaptation-name');
  name.textContent = card ? card.title + ' · средний ген' : 'Носители линии';
  const history = frame.history.slice(-36);
  const data = [
    history.map(row => [row.tick, row.population] as const),
    history.map(row => [row.tick, row.food] as const),
    history.filter(row => row.population).map(row => [row.tick, row.meanEnergy] as const),
    (frame.game?.samples ?? []).slice(-36).flatMap(row => {
      const value = card ? row.values?.[card.gene] : row.carriers;
      return value === undefined ? [] : [[row.tick, value] as const];
    })
  ];
  trends.forEach(({ canvas, label }, i) => {
    const points = data[i], last = points.at(-1);
    label.textContent = last ? format.format(last[1]) : 'Нет данных';
    const caption = canvas.parentElement?.querySelector('figcaption');
    canvas.setAttribute('aria-label', caption?.textContent ?? '');
    const width = canvas.clientWidth, height = canvas.clientHeight, dpr = Math.min(devicePixelRatio, 2);
    const pixelWidth = Math.round(width * dpr), pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!last) return;
    const min = Math.min(...points.map(p => p[1])), max = Math.max(...points.map(p => p[1]));
    const span = last[0] - points[0][0];
    ctx.beginPath();
    for (const [index, [tick, value]] of points.entries()) {
      const x = span ? 3 + (tick - points[0][0]) / span * (width - 6) : 3;
      const y = max === min ? height / 2 : height - 4 - (value - min) / (max - min) * (height - 8);
      if (index) ctx.lineTo(x, y);
      else { ctx.moveTo(x, y); ctx.lineTo(x + 2, y); }
    }
    ctx.strokeStyle = ['#75e8c4', '#91c763', '#80bff3', '#ffca80'][i];
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

const distributionLog:{tick:number;own:number;other:number;food:number}[]=[];
function updateEcology(frame:Frame,previous?:Frame){
  const eco=frame.ecology;
  element('ecology-panel').hidden=!eco;
  if(!eco)return;
  const active=eco.collapses-eco.recoveries;
  element('ecology-status').textContent=active?`Кризис: ${active} клеток · восстановлений ${eco.recoveries}`
    :eco.recoveries?`Кризисных клеток нет · восстановлений ${eco.recoveries}`:'Кризисных клеток нет';
  if(active&&!frame.game?.lost)element('console-event').textContent=`Дефицит · ${active} клеток кризиса`;
  element('ecology-grants').textContent=`Дефицитная конкуренция: ${eco.contested} клеток · потеря прироста ${format.format(eco.withheld/1000)} ед./тик`;
  const founder=frame.game?.founder;
  const lines=new Map<number,number>();
  const exposed=[0,0], alive=[0,0];
  for(let i=0;i<frame.founders.length;i++){
    const id=frame.founders[i],own=id===founder?0:1;
    alive[own]++;
    if(own)lines.set(id,(lines.get(id)??0)+1);
    const cell=Math.floor(frame.positions[i*4+1])%frame.height*frame.width+Math.floor(frame.positions[i*4])%frame.width;
    if(eco.collapsed[cell])exposed[own]++;
  }
  const top=[...lines].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,3);
  element('ecology-competitors').textContent=top.length
    ?`Другие линии: ${lines.size} · крупнейшие ${top.map(([id,n])=>`#${id} (${n})`).join(', ')}`:'Других живых линий нет';
  for(const [i,key,label] of [[0,'ecology-local','Локальный поиск'],[1,'ecology-roaming','Подвижный поиск']] as const){
    const n=eco.niches[i];
    element(key).textContent=n.actions?`${label}: ${n.actions} действий · двигались ${format.format(100*n.moved/n.actions)}% · пища ${format.format(n.food/1000)} · затраты ${format.format(n.upkeep/1000)} ед.`:`${label}: действий за тик нет`;
  }
  if(previous?.epoch!==frame.epoch)distributionLog.length=0;
  const tick=frame.metrics.tick;
  if(!distributionLog.length||tick-distributionLog.at(-1)!.tick>=20){
    const food=eco.harvest.reduce((sum,v,i)=>sum+(eco.collapsed[i]?v:0),0);
    distributionLog.push({tick,own:exposed[0],other:exposed[1],food});
    if(distributionLog.length>5)distributionLog.shift();
    const rows=distributionLog.map(row=>{
      const li=document.createElement('li');
      li.textContent=`Тик ${row.tick}: своих ${row.own}, других ${row.other} · съедено ${format.format(row.food/1000)} ед.`;
      return li;
    });
    element('ecology-trend').replaceChildren(...rows);
  }
  const before=frame.history.at(-2);
  element('ecology-distribution').textContent=`В кризисных клетках: моя линия ${exposed[0]}/${alive[0]}, другие ${exposed[1]}/${alive[1]}.${before?` Изменение населения мира за ${frame.metrics.tick-before.tick} тик.: ${delta.format(frame.metrics.population-before.population)}.`:''}`;
}
