import { GENES, GENE_BOUNDS } from './core/genetics.ts';
import type { Genome } from './core/genetics.ts';
import type { Command, Event, Frame } from './protocol.ts';
const $ = <T extends HTMLElement>(selector: string): T => { const e = document.querySelector<T>(selector); if (!e) throw Error(`Missing ${selector}`); return e; };
const canvas = $<HTMLCanvasElement>('#world'), ctx = canvas.getContext('2d')!;
const chart = $<HTMLCanvasElement>('#chart'), cg = chart.getContext('2d')!;
const color = $<HTMLSelectElement>('#trait-color'), chartMetric = $<HTMLSelectElement>('#chart-metric');
const bins = Array.from({ length: 8 }, (_, index) => {
  const meter = document.createElement('meter');
  meter.min = 0;
  meter.setAttribute('aria-label', `Интервал скорости ${index + 1}`);
  $('#speed-bins').append(meter);
  return meter;
});
const viewport = $('#viewport'), seed = $<HTMLInputElement>('#seed');
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let frame: Frame | null = null, scale = 1, offsetX = 0, offsetY = 0, fitted = false, epoch = -1;
let drag: { x: number; y: number; ox: number; oy: number; moved: boolean } | null = null;
const layer = document.createElement('canvas'); layer.width = 256; layer.height = 256;
const lc = layer.getContext('2d')!, image = lc.createImageData(256, 256);
const send = (command: Command): void => worker.postMessage(command);
const fmt = (n: number): string => n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
function failure(message: string): void { const el = $('#error'); el.hidden = false; el.textContent = `Симуляция остановлена: ${message}. Создайте новый мир или обновите страницу.`; $('#status').textContent = 'ОШИБКА'; $<HTMLButtonElement>('#play').disabled = true; $<HTMLButtonElement>('#step').disabled = true; }
worker.onerror = e => failure(e.message);
worker.onmessage = (event: MessageEvent<Event>) => {
  const data = event.data;
  if (data.kind === 'error') { failure(data.message); return; }
  frame = data;
  if (epoch !== data.epoch) { epoch = data.epoch; fitted = false; $('#error').hidden = true; }
  for (let i = 0; i < data.food.length; i++) { const f = data.food[i] / 255; image.data.set([10 + f * 13, 23 + f * 56, 26 + f * 22, 255], i * 4); }
  lc.putImageData(image, 0, 0);
  $('#population').textContent = fmt(data.metrics.population); $('#tick').textContent = fmt(data.metrics.tick); $('#food').textContent = fmt(data.metrics.food);
  $('#births').textContent = fmt(data.metrics.births); $('#deaths').textContent = fmt(data.metrics.deaths); $('#tps').textContent = data.tps.toFixed(0);
  $('#status').textContent = data.running ? 'МИР ЖИВЁТ' : 'НА ПАУЗЕ'; $('#status-dot').classList.toggle('running', data.running);
  $('#world-seed').textContent = data.seed;
  const play = $<HTMLButtonElement>('#play'); play.disabled = false; play.textContent = data.running ? 'Ⅱ Пауза' : '▶ Запустить';
  $<HTMLButtonElement>('#step').disabled = data.running;
  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(b => b.classList.toggle('active', Number(b.dataset.speed) === data.speed));
  bins.forEach((meter, index) => {
    meter.max = Math.max(1, ...data.speedHistogram);
    meter.value = data.speedHistogram[index];
    meter.title = `${fmt(meter.value)} организмов`;
  });
  inspect(data); resize(); draw(); drawChart(); send({ kind: 'ready' });
};
function inspect(f: Frame): void {
  const el = $('#inspection'), a = f.selected;
  const traits = f.selectedPhenotype;
  if (a && traits) {
    // Only numeric engine data enters this template; user-controlled seed uses textContent.
    el.innerHTML = `<div class="agent-title">ОРГАНИЗМ #${a.id}</div><div class="agent-meta">ПОКОЛЕНИЕ ${a.generation} · ВОЗРАСТ ${a.age} ticks</div><div class="energy-bar"><span style="width:${a.energy / 800}%"></span></div><div class="gene-row"><span>Энергия</span><b>${(a.energy / 1000).toFixed(2)} / 80</b></div><div class="gene-row"><span>Родитель</span><b>${a.parent === null ? 'основатель' : '#' + a.parent}</b></div><div class="gene-row"><span>Координаты</span><b>${a.x.toFixed(1)}, ${a.y.toFixed(1)}</b></div><p>НАСЛЕДУЕМЫЙ ГЕНОМ</p>${Object.entries(a.genome).map(([k, v]) => `<div class="gene-row"><span>${({ speed: 'Скорость', sensor: 'Радиус поиска', efficiency: 'Усвоение пищи', threshold: 'Порог размножения' } as Record<string, string>)[k]}</span><b>${v.toFixed(3)}</b></div>`).join('')}<p>ФЕНОТИП</p><div class="gene-row"><span>Макс. скорость / радиус</span><b>${traits.speed.toFixed(2)} / ${traits.radius.toFixed(2)}</b></div><div class="gene-row"><span>Усвоение / порог энергии</span><b>${(traits.assimilation * 100).toFixed(1)}% / ${(traits.birthReserve / 1000).toFixed(1)}</b></div><div class="gene-row"><span>Содержание признаков</span><b>${(traits.maintenance / 1000).toFixed(3)} / тик</b></div>`;
  } else if (f.selectedId !== null) el.innerHTML = `<div class="specimen">◎</div><h3>Организм #${f.selectedId} погиб</h3><p>Энергия исчерпана. Его больше нет среди действующих организмов.</p><button id="inspect-first" class="outline">Выбрать живой организм</button>`;
  else if (!el.querySelector('#inspect-first')) el.innerHTML = '<div class="specimen">◎</div><h3>Выберите организм</h3><p>Кликните на карту, чтобы открыть его геном.</p><button id="inspect-first" class="outline">Выбрать организм</button>';
}
function resize(): void {
  const r = viewport.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!fitted) { fit(); fitted = true; }
}
function fit(): void { scale = Math.min(viewport.clientWidth, viewport.clientHeight) / 256 * 0.88; offsetX = (viewport.clientWidth - 256 * scale) / 2; offsetY = (viewport.clientHeight - 256 * scale) / 2; }
function draw(): void {
  if (!frame) return;
  const w = viewport.clientWidth, h = viewport.clientHeight;
  ctx.clearRect(0, 0, w, h); ctx.save(); ctx.translate(offsetX, offsetY); ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(layer, 0, 0);
  ctx.strokeStyle = '#34594b'; ctx.lineWidth = 1 / scale; ctx.strokeRect(0, 0, 256, 256);
  ctx.strokeStyle = '#c2efd209'; ctx.lineWidth = .5 / scale; ctx.beginPath();
  for (let i = 16; i < 256; i += 16) { ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.moveTo(0, i); ctx.lineTo(256, i); } ctx.stroke();
  const p = frame.positions, traitIndex = GENES.indexOf(color.value as keyof Genome);
  for (let i = 0; i < frame.ids.length; i++) {
    const x = p[i * 4], y = p[i * 4 + 1], energy = p[i * 4 + 2];
    const band = frame.traitBins[i * GENES.length + traitIndex];
    ctx.fillStyle = `hsl(${85 + band * 15} 65% ${55 + energy * 24}%)`;
    ctx.beginPath(); ctx.arc(x, y, Math.max(0.48, 1.25 / scale), 0, Math.PI * 2); ctx.fill();
    if (frame.ids[i] === frame.selectedId) { ctx.strokeStyle = '#f0dca1'; ctx.lineWidth = 1.3 / scale; ctx.beginPath(); ctx.arc(x, y, Math.max(3, 6 / scale), 0, Math.PI * 2); ctx.stroke(); if (frame.selected) { ctx.strokeStyle = '#f0dca145'; ctx.beginPath(); ctx.arc(x, y, frame.selected.genome.sensor, 0, Math.PI * 2); ctx.stroke(); } }
  }
  ctx.restore();
}
function drawChart(): void {
  if (!frame) return;
  const w = chart.clientWidth, h = chart.clientHeight, dpr = Math.min(devicePixelRatio, 2); chart.width = w * dpr; chart.height = h * dpr; cg.setTransform(dpr, 0, 0, dpr, 0, 0);
  const history = frame.history, metric = chartMetric.value;
  const range = metric === 'population' ? [0, Math.max(1200, ...history.map(p => p.population)) * 1.1] : GENE_BOUNDS[metric as keyof Genome];
  const [min, max] = range, first = history[0]?.tick ?? 0, last = history.at(-1)?.tick ?? 0;
  $('#chart-range').textContent = `tick ${first} → ${last}`;
  const left = 46, bottom = h - 21, top = 10;
  cg.font = '9px monospace'; cg.fillStyle = '#78928c'; cg.strokeStyle = '#22362e'; cg.lineWidth = 1;
  for (let i = 0; i < 3; i++) { const y = top + (bottom - top) * i / 2; cg.fillText((max - (max - min) * i / 2).toLocaleString('ru-RU', { maximumFractionDigits: 2 }), 0, y + 4); cg.beginPath(); cg.moveTo(left, y); cg.lineTo(w, y); cg.stroke(); }
  cg.fillText(String(first), left, h - 3); cg.fillText(String(last), w - 40, h - 3);
  cg.beginPath();
  let connected = false;
  for (const p of history) {
    const value = metric === 'population' ? p.population : p.genes?.[metric as keyof Genome];
    if (value === undefined) { connected = false; continue; }
    const x = left + (p.tick - first) / Math.max(1, last - first) * (w - left);
    const y = bottom - (value - min) / (max - min) * (bottom - top);
    if (connected) cg.lineTo(x, y);
    else cg.moveTo(x, y);
    connected = true;
  }
  cg.strokeStyle = '#b8efb7'; cg.lineWidth = 2; cg.stroke();
  if (metric !== 'population') return;
  cg.lineTo(w, bottom); cg.lineTo(left, bottom); cg.closePath(); const gradient = cg.createLinearGradient(0, top, 0, bottom); gradient.addColorStop(0, '#b8efb72a'); gradient.addColorStop(1, '#b8efb700'); cg.fillStyle = gradient; cg.fill();
}
function zoom(factor: number, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2): void { const next = Math.max(.5, Math.min(30, scale * factor)); offsetX = x - (x - offsetX) * next / scale; offsetY = y - (y - offsetY) * next / scale; scale = next; draw(); }
viewport.addEventListener('wheel', e => { e.preventDefault(); const r = viewport.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * .001), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY, moved: false }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (!drag) return; if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true; if (drag.moved) { offsetX = drag.ox + e.clientX - drag.x; offsetY = drag.oy + e.clientY - drag.y; draw(); } });
canvas.addEventListener('pointerup', e => { if (drag && !drag.moved && frame) { const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left - offsetX) / scale, y = (e.clientY - r.top - offsetY) / scale; let best = 10 / scale, id: number | null = null; for (let i = 0; i < frame.ids.length; i++) { const d = Math.hypot(frame.positions[i * 4] - x, frame.positions[i * 4 + 1] - y); if (d < best) { best = d; id = frame.ids[i]; } } send({ kind: 'inspect', id }); } drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });
$('#play').onclick = () => send({ kind: 'play', value: !frame?.running }); $('#step').onclick = () => send({ kind: 'step' });
$('#world-form').addEventListener('submit', e => { e.preventDefault(); if (seed.value.trim()) send({ kind: 'create', seed: seed.value.trim() }); });
document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(b => { b.onclick = () => send({ kind: 'speed', value: Number(b.dataset.speed) }); });
$('#inspection').addEventListener('click', e => { if ((e.target as HTMLElement).closest('#inspect-first') && frame?.ids.length) send({ kind: 'inspect', id: frame.ids[0] }); });
$('#zoom-in').onclick = () => zoom(1.4); $('#zoom-out').onclick = () => zoom(1 / 1.4); $('#fit').onclick = () => { fit(); draw(); };
document.addEventListener('keydown', e => { if ((e.target as HTMLElement).matches('input,textarea,select,button')) return; if (e.code === 'Space') { e.preventDefault(); send({ kind: 'play', value: !frame?.running }); } if (e.key === 'Escape') send({ kind: 'inspect', id: null }); if (e.key === '+' || e.key === '=') zoom(1.2); if (e.key === '-') zoom(1 / 1.2); if (e.key.startsWith('Arrow')) { e.preventDefault(); offsetX += e.key === 'ArrowLeft' ? 25 : e.key === 'ArrowRight' ? -25 : 0; offsetY += e.key === 'ArrowUp' ? 25 : e.key === 'ArrowDown' ? -25 : 0; draw(); } });
new ResizeObserver(() => { resize(); draw(); drawChart(); }).observe(viewport);
window.addEventListener('resize', drawChart);

color.onchange = draw;
chartMetric.onchange = drawChart;
