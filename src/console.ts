import { CARDS, TUNING } from './core/game.ts';
import { EVENT_LABELS } from './history-panel.ts';
import type { Frame } from './protocol.ts';

const element = (id: string) => document.getElementById(id)!;
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
  element('console-speed').textContent = `· ${frame.speed}×`;
  element('console-line').textContent = game?.line ? `#${game.line.founder} · ${format.format(game.line.living)} жив.` : '—';
  element('console-programme').textContent = active
    ? `${CARDS[active.card].title} · ${frame.metrics.tick - active.start}/${TUNING.duration}` : '—';
  const event = recentEvents.find(row => row.severity === 'critical') ?? recentEvents[0];
  element('console-event').textContent = game?.lost ? 'Линия вымерла'
    : event ? EVENT_LABELS[event.kind] : 'Пока нет';
  if (previous?.epoch !== frame.epoch || recentEvents[0]?.id !== previous.recentEvents[0]?.id) {
    const list = element('recent-events');
    const rows = recentEvents.map(row => {
      const li = document.createElement('li');
      const value = row.from !== undefined ? `${format.format(row.from)} → ${format.format(row.to!)}` : format.format(row.count);
      li.textContent = `Тик ${format.format(row.tick)} · ${EVENT_LABELS[row.kind]} · ${value}`;
      return li;
    });
    if (!rows.length) {
      const li = document.createElement('li');
      li.textContent = 'Событий пока нет.';
      rows.push(li);
    }
    list.replaceChildren(...rows);
  }
  const [last, before] = frame.history.slice(-2).reverse();
  element('world-changes').textContent = before
    ? `За ${last.tick - before.tick} тик. · живые ${delta.format(last.population - before.population)} · пища ${delta.format(last.food - before.food)} ед.`
    : 'Изменения появятся после двух отсчётов.';
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
