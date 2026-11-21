import type { EventKind, HistoryView, LifeRecord, LineSummary, WorldEvent } from './core/history.ts';
import type { Command } from './protocol.ts';

const LABELS: Record<EventKind, string> = {
  births: 'Рождения', deaths: 'Смерти', variation: 'Потомки с изменённым генотипом',
  generation: 'Новое максимальное поколение', 'lineage-extinction': 'Вымирание линий',
  extinction: 'Полное вымирание', 'population-crisis': 'Сокращение популяции',
  'food-drop': 'Сокращение запасов пищи', 'population-growth': 'Рост популяции'
};
const fmt = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
type Mode = 'ancestry' | 'lineages' | 'events';

export class HistoryPanel {
  private readonly body = document.getElementById('history-body')!;
  private readonly filter = document.getElementById('event-filter') as HTMLSelectElement;
  private readonly filterLabel = document.getElementById('event-filter-label')!;
  private readonly close = document.getElementById('history-close') as HTMLButtonElement;
  private readonly nav = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-history]'));
  private mode: Mode | null = null;
  private depth = 8;
  private entity: number | null = null;
  private founder: number | null = null;
  private epoch = -1;
  private request = 0;
  private lastRequest = -Infinity;
  private view: HistoryView | undefined;
  private readonly send: (c: Command) => void;
  private readonly chooseEntity: (id: number) => void;
  private readonly chooseLine: (id: number | null) => void;

  constructor(send: (c: Command) => void, chooseEntity: (id: number) => void, chooseLine: (id: number | null) => void) {
    this.send = send;
    this.chooseEntity = chooseEntity;
    this.chooseLine = chooseLine;
    for (const [kind, label] of Object.entries(LABELS)) this.filter.add(new Option(label, kind));
    this.filter.onchange = () => this.render();
    for (const button of this.nav) button.onclick = () => this.open(button.dataset.history as Mode);
    this.close.onclick = () => {
      const previous = this.nav.find(button => button.dataset.history === this.mode);
      this.open(null);
      previous?.focus();
    };
    this.body.onclick = event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if (!button) return;
      const id = Number(button.dataset.id);
      switch (button.dataset.action) {
        case 'entity':
          this.depth = 8;
          this.entity = id;
          this.chooseEntity(id);
          this.open('ancestry');
          break;
        case 'line':
          this.founder = id;
          this.chooseLine(id);
          this.open('lineages');
          break;
        case 'clear-line':
          this.founder = null;
          this.chooseLine(null);
          this.refresh(true);
          break;
        case 'world':
          this.open(null);
          document.getElementById('viewport')?.focus();
          break;
        case 'more':
          this.depth += 8;
          this.refresh(true);
          break;
      }
    };
  }

  onFrame(epoch: number, selected: number | null): void {
    const reset = epoch !== this.epoch;
    if (reset) {
      this.epoch = epoch;
      this.view = undefined;
      this.founder = null;
      this.chooseLine(null);
    }
    const changed = this.entity !== selected;
    if (changed || reset) {
      this.entity = selected;
      this.depth = 8;
    }
    this.refresh(changed || reset);
  }

  accept(epoch: number, request: number, view: HistoryView): void {
    if (epoch !== this.epoch || request !== this.request || !this.mode) return;
    this.view = view;
    this.render();
  }

  private open(mode: Mode | null) {
    this.mode = mode;
    this.body.hidden = this.close.hidden = mode === null;
    this.filterLabel.hidden = mode !== 'events';
    for (const button of this.nav) button.setAttribute('aria-pressed', String(button.dataset.history === mode));
    this.refresh(true);
  }

  private refresh(force: boolean) {
    if (!this.mode || this.epoch < 0) return;
    const now = performance.now();
    if (!force && (now - this.lastRequest < 1000 || this.body.contains(document.activeElement))) return;
    this.lastRequest = now;
    if (force) this.body.setAttribute('aria-busy', 'true');
    this.send({ kind: 'history', request: ++this.request, entity: this.entity, founder: this.mode === 'lineages' ? this.founder : null, depth: this.depth });
  }

  private render() {
    if (!this.mode || !this.view) return;
    this.body.removeAttribute('aria-busy');
    const active = document.activeElement as HTMLButtonElement | null;
    const action = this.body.contains(active) ? active?.dataset.action : undefined;
    const id = active?.dataset.id;
    this.body.innerHTML = this.mode === 'ancestry' ? this.ancestry(this.view) : this.mode === 'lineages' ? this.lineages(this.view) : this.events(this.view);
    if (action) Array.from(this.body.querySelectorAll<HTMLButtonElement>('[data-action]'))
      .find(button => button.dataset.action === action && button.dataset.id === id)?.focus({ preventScroll: true });
  }

  private entityButton(id: number, label = `#${id}`) {
    return `<button data-action="entity" data-id="${id}">${label}</button>`;
  }

  private lineButton(id: number) {
    return `<button data-action="line" data-id="${id}">Линия #${id}</button>`;
  }

  private ancestry(view: HistoryView) {
    const row = view.entity;
    if (!row) return this.entity === null ? '<p>Выберите организм на карте.</p>' : `<p>Подробная запись #${this.entity} больше недоступна.</p>`;
    const facts = (r: LifeRecord) => `поколение ${r.generation}, ${r.died === null ? 'жив' : 'умер на тике ' + fmt(r.died)}`;
    return `<div class="history-detail"><h3>Организм #${row.id}</h3>
      <p>${facts(row)} · рождение ${fmt(row.born)} · прямые потомки: ${fmt(row.children)}</p>
      <p>Родитель: ${row.parent === null ? 'основатель' : '#' + row.parent} · основатель: #${row.founder}</p>
      ${row.final ? `<p>Энергетическое истощение. Последнее положение на тике смерти:
        ${fmt(row.final.x)}, ${fmt(row.final.y)}; возраст ${fmt(row.final.age)}; энергия ${fmt(row.final.energy / 1000)}.</p>` : ''}
      <p>Генотип при рождении: скорость ${fmt(row.genome.speed)}, радиус ${fmt(row.genome.sensor)},
        усвоение ${fmt(row.genome.efficiency)}, порог ${fmt(row.genome.threshold)}.</p>
      ${this.lineButton(row.founder)}${row.died === null ? ' <button data-action="world">К карте</button>' : ''}
      </div>
      ${view.ancestors.length ? `<ol class="ancestor-chain">${view.ancestors.map(r =>
        `<li>${this.entityButton(r.id)} <span>${facts(r)}</span></li>`).join('')}</ol>` : ''}
      ${view.missingAncestor === null ? '' : `<p>Предок #${view.missingAncestor}: подробная запись вытеснена.</p>`}
      ${view.nextAncestor === null ? '' : this.depth < 32 ? '<button data-action="more">Показать ещё 8 предков</button>' : '<p>Достигнут предел просмотра: 32 предка.</p>'}`;
  }

  private lineages(view: HistoryView) {
    const line = view.line;
    const status = (l: LineSummary) => l.status === 'active' ? 'существует' : 'вымерла';
    const detail = line ? `<div class="history-detail"><h3>Линия #${line.founder}</h3><p>${status(line)} · живых ${fmt(line.living)} ·
      всего представителей ${fmt(line.born)} · смертей ${fmt(line.deaths)}</p><p>Поколений ${line.generations} · максимум ${line.maxGeneration} ·
      возраст ${fmt(line.age)} тиков · последняя активность ${fmt(line.lastActivity)}</p>
      <p>${line.genes ? `Средние у живых: скорость ${fmt(line.genes.speed)}, радиус ${fmt(line.genes.sensor)},
      усвоение ${fmt(line.genes.efficiency)}, порог ${fmt(line.genes.threshold)}.` : 'Живых представителей нет.'}</p>
      ${this.entityButton(line.founder, 'Основатель #' + line.founder)}
      ${this.founder === null ? '' : '<button data-action="clear-line">Убрать подсветку</button>'}</div>` : '';
    const rest = view.population - view.top.reduce((sum, l) => sum + l.living, 0);
    return `${detail}<div class="lineage-columns">
      <section><h3>Распределение живых · крупнейшие линии</h3><ul class="history-list">${view.top.map(l =>
        `<li>${this.lineButton(l.founder)} <meter aria-label="Доля живых в линии ${l.founder}" max="${view.population}" value="${l.living}"></meter>
        <strong>${fmt(l.living)}</strong><small>всего ${fmt(l.born)} · поколение до ${l.maxGeneration}</small></li>`).join('')}
        ${rest ? `<li>Прочие линии · ${fmt(rest)} живых</li>` : ''}</ul>${view.top.length ? '' : '<p>Живых линий нет.</p>'}</section>
      <section><h3>Недавно вымершие</h3><ul class="history-list">${view.extinct.map(l => `<li>${this.lineButton(l.founder)}
        <span>тик ${fmt(l.lastActivity)} · всего ${fmt(l.born)}</span></li>`).join('')}</ul>
        ${view.extinct.length ? '' : '<p>Вымираний линий пока нет.</p>'}</section></div>`;
  }

  private events(view: HistoryView) {
    const visible = view.events.filter(e => !this.filter.value || e.kind === this.filter.value);
    const details = (e: WorldEvent) => e.from !== undefined ? `${fmt(e.from)} → ${fmt(e.to!)} за ${e.window} тиков`
      : `${fmt(e.count)}${e.window ? ' за ' + e.window + ' тиков' : ''}`;
    return `${view.droppedEvents ? `<p>Старые записи вытеснены: ${fmt(view.droppedEvents)}.</p>` : ''}
      ${visible.length ? '' : '<p>Событий этого типа пока нет.</p>'}
      <ol class="history-list event-list">${visible.map(e => `<li data-event="${e.kind}"><small>Тик ${fmt(e.tick)}</small>
        <strong>${LABELS[e.kind]}</strong><span class="event-${e.severity}">${details(e)}</span>
        ${e.entity ? this.entityButton(e.entity, 'Организм #' + e.entity) : ''}
        ${e.founder ? this.lineButton(e.founder) : ''}</li>`).join('')}</ol>`;
  }
}
