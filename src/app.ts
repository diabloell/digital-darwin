import { LAYERS } from './core/planet.ts';
import { ECO_LAYERS } from './core/ecology.ts';
import type { TerrainLayer } from './map.ts';
import { drawTrends, updateConsole } from './console.ts';
import { GamePanel } from './game/ui.ts';
import { SavesPanel } from './saves-panel.ts';
import { HistoryPanel } from './history-panel.ts';
import { GENES, GENE_BOUNDS } from './core/genetics.ts';
import type { Genome, Rule } from './core/genetics.ts';
import { GENE_LABELS, GENE_UNITS, WorldMap } from './map.ts';
import type { Command, Event, Frame, Sample } from './protocol.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (n: number, decimals = 0) => n.toLocaleString('ru-RU', { maximumFractionDigits: decimals });
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
const send = (command: Command) => worker.postMessage(command);
const saves = new SavesPanel(send);
const viewport = $('viewport'), canvas = $<HTMLCanvasElement>('world'), chart = $<HTMLCanvasElement>('chart');
const chartMode = $<HTMLSelectElement>('chart-metric'), histogram = $<HTMLSelectElement>('histogram-trait');
const form = $<HTMLFormElement>('world-form');
const terrain = $<HTMLSelectElement>('terrain-layer');
const terrainLabels={...LAYERS,...ECO_LAYERS};
for (const [key, label] of Object.entries(terrainLabels)) terrain.add(new Option(label, key));
const play = $<HTMLButtonElement>('play'), step = $<HTMLButtonElement>('step');
const speeds = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-speed]'));
const map = new WorldMap(canvas, viewport, $('camera-readout'), $('color-legend'), id => send({ kind: 'inspect', id }));
const gamePanel=new GamePanel(send,()=>saves.confirmReplacement('Создать новый мир?'),founder=>map.highlight(founder));
let focusEntity: number | null = null;
const observerHistory = new HistoryPanel(send, id => {
  focusEntity = id;
  send({ kind: 'inspect', id });
}, id => map.highlight(id ?? frame?.game?.founder ?? null));
const bins = Array.from({ length: 8 }, () => {
  const meter = document.createElement('meter');
  meter.min = 0;
  $('speed-bins').append(meter);
  return meter;
});
let frame: Frame | undefined, creating = false, failed = false;
let chartPending = false;

function setControls() {
  play.disabled = !frame || failed || creating || Boolean(frame.game && (frame.game.founder===null||frame.game.lost));
  step.disabled = play.disabled || Boolean(frame?.running);
  speeds.forEach(button => { button.disabled = play.disabled; });
}

function error(message: string, recoverable: boolean) {
  creating = false;
  failed = !recoverable;
  $('error').hidden = false;
  $('error').textContent = recoverable ? `Мир не создан. ${message}` : `Симуляция остановлена. ${message}`;
  $('status').textContent = failed ? 'ОШИБКА' : frame?.running ? 'МИР ЖИВЁТ' : 'НА ПАУЗЕ';
  setControls();
}

worker.onerror = e => error(e.message, false);
worker.onmessage = ({ data }: MessageEvent<Event>) => {
  if (data.kind === 'snapshot-ready' || data.kind === 'restore-result' || data.kind === 'persistence-error') { saves.onEvent(data); return; }
  if (data.kind === 'history') { observerHistory.accept(data.epoch, data.request, data.view); return; }
  if (data.kind === 'error') { error(data.message, Boolean(data.recoverable)); return; }
  if (frame && data.epoch < frame.epoch) return;
  const previous = frame;
  frame = data;
  const newWorld = previous?.epoch !== data.epoch;
  if (newWorld) {
    if (creating) $<HTMLDetailsElement>('world-settings').open = false;
    creating = false;
    failed = false;
    $('error').hidden = true;
  }
  const tickChanged = newWorld || previous?.metrics.tick !== data.metrics.tick;
  if (tickChanged) {
    for (const key of ['population', 'tick', 'food', 'births', 'deaths'] as const) $(key).textContent = fmt(data.metrics[key]);
    $('world-seed').textContent = data.seed;
    $('world-size').textContent = `${data.width} × ${data.height} кл.`;
    updateHistogram();
    scheduleChart();
  }
  const status = data.game?.lost?'ЛИНИЯ ВЫМЕРЛА':data.game?.founder===null?'ВЫБЕРИТЕ ЛИНИЮ':data.running ? 'МИР ЖИВЁТ' : 'НА ПАУЗЕ';
  if (!creating && $('status').textContent !== status) $('status').textContent = status;
  $('status-dot').classList.toggle('running', data.running);
  $('tps').textContent = fmt(data.tps);
  play.textContent = data.running ? 'Ⅱ Пауза' : '▶ Запустить';
  setControls();
  speeds.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.speed) === data.speed)));
  if (previous?.selectedId !== data.selectedId || (tickChanged && data.selected) || (previous?.selected && !data.selected)) inspect(data);
  $<HTMLButtonElement>('inspect-first')?.toggleAttribute('disabled', !data.metrics.population);
  if (newWorld) { terrain.value = 'food'; terrain.onchange?.(new Event('change')); }
  if(newWorld)for(const option of Array.from(terrain.options))option.hidden=option.value!=='food'
    &&(Object.hasOwn(ECO_LAYERS,option.value)?!data.ecology:!data.planet);
  $('terrain-control').hidden = !data.planet&&!data.ecology;
  map.accept(data);
  if (focusEntity !== null && focusEntity === data.selectedId) {
    if (data.selected) map.centerOn(data.selected.x, data.selected.y);
    focusEntity = null;
  }
  observerHistory.onFrame(data.epoch, data.selectedId);
  gamePanel.update(data);
  updateConsole(data, previous);
  if (data.game?.founder != null && (newWorld || previous?.game?.founder !== data.game.founder)) map.focusLine(data.game.founder);
  if (data.game?.active !== previous?.game?.active) scheduleChart();
  saves.onFrame(data);
  send({ kind: 'ready', epoch: data.epoch });
};

function inspect(f: Frame) {
  const el = $('inspection'), a = f.selected, p = f.selectedPhenotype;
  if (!a || !p) {
    el.innerHTML = f.selectedId === null
      ? '<p>Выберите организм на карте.</p><button id="inspect-first">Выбрать организм</button>'
      : `<div class="agent-title">ОРГАНИЗМ #${f.selectedId}</div><p class="deceased">Погиб. Текущие показатели недоступны.</p><button id="inspect-first">Выбрать живой организм</button>`;
    return;
  }
  const energy = (a.energy / 1000).toFixed(2);
  const cost = Math.ceil(70 + 35 * a.velocity ** 2 + p.maintenance) / 1000;
  el.innerHTML = `<div class="agent-title">ОРГАНИЗМ #${a.id}</div>
    <p class="agent-meta">Жив · ПОКОЛЕНИЕ ${a.generation} · ВОЗРАСТ ${a.age} ticks</p>
    <meter class="energy-bar" aria-label="Энергия" max="80" value="${energy}"></meter>
    <div class="gene-row"><span>Энергия</span><b>${energy} / 80</b></div>
    <div class="gene-row"><span>Координаты</span><b>${a.x.toFixed(1)}, ${a.y.toFixed(1)}</b></div>
    <div class="gene-row"><span>Родитель</span><b>${a.parent === null ? 'основатель' : '#' + a.parent}</b></div>
    <div class="gene-row"><span>Текущая скорость</span><b>${a.velocity.toFixed(2)} кл./тик</b></div>
    <h3>Генотип</h3>
    ${GENES.map(g => {
      const [min, max] = GENE_BOUNDS[g], value = a.genome[g].toFixed(3);
      return `<div class="gene-row"><span>${GENE_LABELS[g]}</span><b>${value}</b></div>
        <meter aria-label="${GENE_LABELS[g]} от ${min} до ${max}" title="${min}–${max} ${GENE_UNITS[g]}" min="${min}" max="${max}" value="${value}"></meter>`;
    }).join('')}
    <h3>ФЕНОТИП</h3>
    <div class="gene-row"><span>Макс. скорость / радиус</span><b>${p.speed.toFixed(2)} / ${p.radius.toFixed(2)}</b></div>
    <div class="gene-row"><span>Усвоение / порог</span><b>${(p.assimilation * 100).toFixed(1)}% / ${(p.birthReserve / 1000).toFixed(1)}</b></div>
    <div class="gene-row"><span>Расчётный метаболизм</span><b>${cost.toFixed(3)} ед./тик</b></div>`;
}

const CHARTS: Record<string, { title: string; unit: string; read: (s: Sample) => number | null }> = {
  population: { title: 'Численность', unit: 'Живые организмы', read: s => s.population },
  food: { title: 'Доступная пища', unit: 'Единицы энергии в мире', read: s => s.food },
  births: { title: 'Рождения', unit: 'Всего с тика 0', read: s => s.births },
  deaths: { title: 'Смерти', unit: 'Всего с тика 0', read: s => s.deaths },
  intervalBirths: { title: 'Рождения за интервал', unit: 'Рождения между соседними отсчётами', read: s => s.interval ? s.intervalBirths : null },
  intervalDeaths: { title: 'Смерти за интервал', unit: 'Смерти между соседними отсчётами', read: s => s.interval ? s.intervalDeaths : null },
  totalEnergy: { title: 'Совокупная энергия', unit: 'Единицы энергии живых', read: s => s.totalEnergy },
  meanGeneration: { title: 'Среднее поколение', unit: 'Поколение среди живых', read: s => s.meanGeneration },
  livingLines: { title: 'Живые линии', unit: 'Линии с живыми представителями', read: s => s.livingLines },
  extinctLines: { title: 'Вымершие линии', unit: 'Линии без живых представителей, всего', read: s => s.extinctLines },
  meanEnergy: { title: 'Средняя энергия', unit: 'Единицы энергии на живой организм', read: s => s.population ? s.meanEnergy : null },
  variants: { title: 'Генетическое разнообразие', unit: 'Уникальные генотипы живых', read: s => s.variants },
  maxGeneration: { title: 'Максимальное поколение', unit: 'Поколение среди живых', read: s => s.population ? s.maxGeneration : null }
};
for (const gene of GENES) CHARTS[gene] = { title: GENE_LABELS[gene], unit: `Среднее у живых · ${GENE_UNITS[gene]}`, read: s => s.genes?.[gene] ?? null };

function scheduleChart() {
  if (chartPending) return;
  chartPending = true;
  requestAnimationFrame(() => { chartPending = false; drawChart(); });
}

function drawChart() {
  if (!frame) return;
  drawTrends(frame);
  const { title, unit, read } = CHARTS[chartMode.value];
  const samples = frame.history;
  const values = samples.map(read);
  const numeric = values.filter((v): v is number => v !== null);
  const leftTick = samples[0].tick, rightTick = samples.at(-1)!.tick;
  $('chart-title').textContent = title;
  $('chart-unit').textContent = unit;
  $('chart-range').textContent = `тики ${fmt(leftTick)} → ${fmt(rightTick)}`;
  $('chart-empty').hidden = numeric.length > 0;
  const interval = chartMode.value === 'intervalBirths' || chartMode.value === 'intervalDeaths' ? samples.at(-1)!.interval : 0;
  if (interval) $('chart-unit').textContent += ` · последний интервал: ${interval} тик.`;
  chart.setAttribute('aria-label', `${title}. ${unit}. Последнее: ${values.at(-1) === null ? 'нет данных' : fmt(values.at(-1)!, 3)}`);
  const { width, height } = chart.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 2);
  if (chart.width !== Math.round(width * dpr)) chart.width = Math.round(width * dpr);
  if (chart.height !== Math.round(height * dpr)) chart.height = Math.round(height * dpr);
  const ctx = chart.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (!numeric.length) return;
  const geneRange = GENE_BOUNDS[chartMode.value as keyof Genome];
  const [min, max] = geneRange ?? [0, Math.max(1, ...numeric) * 1.05];
  const left = 52, right = width - 11, top = 12, bottom = height - 22;
  ctx.font = '11px monospace';
  ctx.fillStyle = '#a6c3c3'; ctx.strokeStyle = '#294448'; ctx.lineWidth = 1;
  for (let row = 0; row < 4; row++) {
    const y = top + row / 3 * (bottom - top);
    ctx.fillText(fmt(max - row / 3 * (max - min), 2), 0, y + 3);
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
  }
  ctx.fillText(fmt(leftTick), left, height - 3);
  if (rightTick !== leftTick) {
    const label = fmt(rightTick);
    ctx.fillText(label, right - ctx.measureText(label).width, height - 3);
  }
  ctx.beginPath();
  let connected = false;
  values.forEach((value, index) => {
    if (value === null) { connected = false; return; }
    const x = left + (samples[index].tick - leftTick) / Math.max(1, rightTick - leftTick) * (right - left);
    const y = bottom - (value - min) / (max - min) * (bottom - top);
    if (connected) ctx.lineTo(x, y);
    else { ctx.moveTo(x, y); ctx.lineTo(x + 1, y); }
    connected = true;
  });
  ctx.strokeStyle = '#a5f4df'; ctx.lineWidth = 2; ctx.stroke();
}

function updateHistogram() {
  if (!frame) return;
  const gene = histogram.value as keyof Genome;
  const spread = frame.histograms[GENES.indexOf(gene)], [min, max] = GENE_BOUNDS[gene];
  const width = (max - min) / bins.length;
  bins.forEach((meter, i) => {
    meter.max = Math.max(1, ...spread);
    meter.value = spread[i];
    const text = `${fmt(min + i * width, 3)}–${fmt(min + (i + 1) * width, 3)}: ${fmt(spread[i])} организмов`;
    meter.title = text; meter.setAttribute('aria-label', text);
  });
  $('histogram-range').textContent = frame.metrics.population
    ? `${fmt(min, 2)}–${fmt(max, 2)} ${GENE_UNITS[gene]} · ${fmt(frame.metrics.population)} живых`
    : 'Нет живых организмов';
}

form.addEventListener('submit', e => {
  e.preventDefault();
  if (creating || !form.reportValidity()) return;
  const data = new FormData(form);
  const seed = String(data.get('seed')).trim();
  if (!seed) { error('Введите seed мира.', true); return; }
  if (!saves.confirmReplacement('Создать новый мир?')) return;
  creating = true;
  $('error').hidden = true;
  $('status').textContent = 'ПОДГОТОВКА МИРА';
  setControls();
  send({ kind: 'create', seed, settings: {
    population: Number(data.get('population')), width: Number(data.get('width')), height: Number(data.get('height')),
    mutationRate: Number(data.get('mutationRate')), mutationStrength: Number(data.get('mutationStrength')),
    regrowth: data.has('regrowth'), rule: data.get('rule') as Rule
  } });
});

play.onclick = () => send({ kind: 'play', value: !frame?.running });
step.onclick = () => send({ kind: 'step' });
speeds.forEach(button => { button.onclick = () => send({ kind: 'speed', value: Number(button.dataset.speed) }); });
$('inspection').addEventListener('click', e => {
  if ((e.target as HTMLElement).closest('#inspect-first') && frame?.ids.length) send({ kind: 'inspect', id: frame.ids[0] });
});
$('zoom-in').onclick = () => map.zoom(1.4);
$('zoom-out').onclick = () => map.zoom(1 / 1.4);
$('focus-line').onclick = () => {
  const founder = frame?.game?.founder;
  if (founder != null) { map.highlight(founder); map.focusLine(founder); }
};
document.querySelectorAll<HTMLElement>('[data-open]').forEach(link => {
  link.addEventListener('click', () => { $<HTMLDetailsElement>(link.dataset.open!).open = true; });
});
$('fit').onclick = () => map.fit();
$<HTMLSelectElement>('trait-color').onchange = e => map.setMode((e.target as HTMLSelectElement).value);
terrain.onchange = () => {
  const layer = terrain.value as TerrainLayer;
  map.setTerrain(layer);
  $('map-layer-heading').textContent = layer === 'food' ? 'ПИЩЕВОЙ ЛАНДШАФТ' : terrainLabels[layer].toUpperCase();
  $('terrain-legend').textContent = layer === 'food' ? 'Пища · яркость по запасу' : `${terrainLabels[layer]} · ${layer==='crisis'?'красный: рост снижен':layer==='pressure'?'0–16':layer==='demand'?'0–8+ заявок':'тёмный 0 → яркий 100'}`;
};
chartMode.onchange = scheduleChart;
histogram.onchange = updateHistogram;
new ResizeObserver(scheduleChart).observe(chart);
document.addEventListener('keydown', e => {
  if ((e.target as HTMLElement).matches('input,textarea,select,button,summary,a')) return;
  if (e.code === 'Space' && !play.disabled) { e.preventDefault(); play.click(); }
  if (e.key === 'Escape') send({ kind: 'inspect', id: null });
  if (e.target !== viewport) return;
  const directions: Record<string, [number, number]> = { ArrowLeft: [25, 0], ArrowRight: [-25, 0], ArrowUp: [0, 25], ArrowDown: [0, -25] };
  if (e.key in directions) { e.preventDefault(); map.pan(...directions[e.key]); }
  if (e.key === '+' || e.key === '=') map.zoom(1.2);
  if (e.key === '-') map.zoom(1 / 1.2);
  if (e.key === 'Home') { e.preventDefault(); map.fit(); }
  if (e.key === 'Enter') map.selectAt(undefined, undefined, true);
});
setControls();
