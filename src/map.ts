import { PRESSURE_MAX } from './core/ecology.ts';
import type { EcoLayer } from './core/ecology.ts';
import type { PlanetLayer } from './core/planet.ts';
import { GENES, GENE_BOUNDS } from './core/genetics.ts';
import type { Genome } from './core/genetics.ts';
import type { Frame } from './protocol.ts';

export const GENE_LABELS: Record<keyof Genome, string> = { speed: 'Скорость', sensor: 'Радиус поиска', efficiency: 'Усвоение', threshold: 'Порог размножения' };
export const GENE_UNITS: Record<keyof Genome, string> = { speed: 'кл./тик', sensor: 'клетки', efficiency: 'доля', threshold: 'ед. энергии' };
const PALETTE = ['#badfff', '#a6c7fd', '#aaaaf9', '#c0a0fb', '#db9cf3', '#f49bdb', '#ffabc5', '#ffc0ae'];
export type TerrainLayer=PlanetLayer|EcoLayer|'food';
const ECO_SCALE: Record<EcoLayer,number>={pressure:PRESSURE_MAX,crisis:1,demand:8};
const TERRAIN_COLORS: Record<PlanetLayer|EcoLayer, readonly [number, number, number]> = {
  pressure:[230,137,55],crisis:[230,70,60],demand:[138,120,230],
  light: [226, 185, 84], temperature: [222, 112, 67], water: [53, 164, 232], fertility: [124, 214, 97]
};
const ORGANISM = '#b8fff0';

export class WorldMap {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly landscape = document.createElement('canvas');
  private readonly terrain = this.landscape.getContext('2d')!;
  private readonly benchmark = new URLSearchParams(location.search).has('benchmark');
  private readonly groups = PALETTE.map(() => [] as number[]);
  private readonly trail: { x: number; y: number; tick: number }[] = [];
  private image: ImageData | undefined;
  private frame: Frame | undefined;
  private paintedTick = -1;
  private scheduled = false;
  private scale = 1;
  private x = 0;
  private y = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private highlighted: number | null = null;
  private readonly linePositions: number[] = [];
  private mode = 'normal';
  private layer: TerrainLayer = 'food';
  private drag: { startX: number; startY: number; x: number; y: number; moved: boolean; id: number } | undefined;

  private readonly canvas: HTMLCanvasElement;
  private readonly viewport: HTMLElement;
  private readonly coordinates: HTMLElement;
  private readonly legend: HTMLElement;
  private readonly pick: (id: number | null) => void;

  constructor(
    canvas: HTMLCanvasElement,
    viewport: HTMLElement,
    coordinates: HTMLElement,
    legend: HTMLElement,
    pick: (id: number | null) => void
  ) {
    this.canvas = canvas;
    this.viewport = viewport;
    this.coordinates = coordinates;
    this.legend = legend;
    this.pick = pick;
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(viewport);
    canvas.addEventListener('pointerdown', e => {
      if (this.drag || e.button !== 0) return;
      e.preventDefault();
      this.drag = { startX: e.clientX, startY: e.clientY, x: this.x, y: this.y, moved: false, id: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
      if (Math.hypot(dx, dy) > 4) d.moved = true;
      if (d.moved) { this.x = d.x + dx; this.y = d.y + dy; this.invalidate(); }
    });
    canvas.addEventListener('pointerup', e => {
      if (this.drag?.id !== e.pointerId) return;
      if (!this.drag.moved) {
        const rect = canvas.getBoundingClientRect();
        this.selectAt(e.clientX - rect.left, e.clientY - rect.top);
      }
      this.drag = undefined;
    });
    canvas.addEventListener('lostpointercapture', () => { this.drag = undefined; });
    viewport.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.height : 1);
      this.zoom(Math.exp(-delta * .0015), e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });
  }

  accept(frame: Frame): void {
    const previous = this.frame;
    const reset = previous?.epoch !== frame.epoch;
    this.frame = frame;
    if (reset) {
      this.drag = undefined;
      this.landscape.width = frame.width;
      this.landscape.height = frame.height;
      this.image = this.terrain.createImageData(frame.width, frame.height);
      this.paintedTick = -1;
      this.fit();
    }
    if (reset || previous?.selectedId !== frame.selectedId || !frame.selected) this.trail.length = 0;
    const last = this.trail.at(-1);
    if (frame.selected && last?.tick !== frame.metrics.tick) {
      const { x, y } = frame.selected;
      this.trail.push({ x, y, tick: frame.metrics.tick });
      if (this.trail.length > 32) this.trail.shift();
    }
    if (reset || previous?.metrics.tick !== frame.metrics.tick || previous.selectedId !== frame.selectedId) this.invalidate();
  }

  highlight(founder: number | null): void {
    this.highlighted = founder;
    this.invalidate();
  }

  centerOn(x: number, y: number): void {
    this.x = this.width / 2 - x * this.scale;
    this.y = this.height / 2 - y * this.scale;
    this.invalidate();
  }

  focusLine(founder: number): void {
    const frame = this.frame;
    if (!frame) return;
    const index = frame.founders.indexOf(founder) * 4;
    if (index < 0) return;
    this.fit();
    this.zoom(1.25);
    const x = this.width / 2 - frame.positions[index] * this.scale;
    const y = this.height / 2 - frame.positions[index + 1] * this.scale;
    const limit = (origin: number, view: number, world: number) =>
      world <= view * .68 ? (view - world) / 2 : Math.min(view * .16, Math.max(view * .84 - world, origin));
    this.x = limit(x, this.width, frame.width * this.scale);
    this.y = limit(y, this.height, frame.height * this.scale);
    this.invalidate();
  }

  setTerrain(layer: TerrainLayer): void {
    this.layer = layer;
    this.paintedTick = -1;
    this.invalidate();
  }

  setMode(mode: string): void {
    this.mode = mode;
    this.invalidate();
  }

  private resize(): void {
    const width = this.viewport.clientWidth, height = this.viewport.clientHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);
    if (width === this.width && height === this.height && dpr === this.dpr) return;
    const hadSize = this.width > 0 && this.height > 0;
    this.x += (width - this.width) / 2;
    this.y += (height - this.height) / 2;
    this.width = width; this.height = height; this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    if (hadSize) this.invalidate();
    else this.fit();
  }

  fit(): void {
    if (!this.frame) return;
    this.scale = Math.min(this.width / this.frame.width, this.height / this.frame.height) * .88 || 1;
    this.x = (this.width - this.frame.width * this.scale) / 2;
    this.y = (this.height - this.frame.height * this.scale) / 2;
    this.invalidate();
  }

  zoom(factor: number, atX = this.width / 2, atY = this.height / 2): void {
    const next = Math.max(.1, Math.min(40, this.scale * factor));
    this.x = atX - (atX - this.x) * next / this.scale;
    this.y = atY - (atY - this.y) * next / this.scale;
    this.scale = next;
    this.invalidate();
  }

  pan(dx: number, dy: number): void { this.x += dx; this.y += dy; this.invalidate(); }

  selectAt(x = this.width / 2, y = this.height / 2, nearest = false): void {
    if (!this.frame) return;
    const { positions, ids } = this.frame;
    let best = nearest ? Infinity : (12 / this.scale) ** 2, id: number | null = null;
    const wx = (x - this.x) / this.scale, wy = (y - this.y) / this.scale;
    for (let i = 0; i < ids.length; i++) {
      const distance = (positions[i * 4] - wx) ** 2 + (positions[i * 4 + 1] - wy) ** 2;
      if (distance < best) { best = distance; id = ids[i]; }
    }
    this.pick(id);
  }

  private invalidate(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      const start = this.benchmark ? performance.now() : 0;
      this.draw();
      if (this.benchmark && this.frame) window.dispatchEvent(new CustomEvent('dd:paint', {
        detail: { ms: performance.now() - start, tick: this.frame.metrics.tick }
      }));
    });
  }

  private draw(): void {
    const { frame, ctx, image } = this;
    if (!frame || !image) return;
    const ecological = Object.hasOwn(ECO_SCALE,this.layer);
    if (this.paintedTick < 0 || ((this.layer === 'food'||ecological) && this.paintedTick !== frame.metrics.tick)) {
      const data = image.data;
      const layer = ecological ? frame.ecology?.[this.layer === 'crisis' ? 'collapsed' : this.layer as 'pressure'|'demand'] : frame.planet?.layers[this.layer as PlanetLayer];
      const max = ecological ? ECO_SCALE[this.layer as EcoLayer] : 100;
      const rgb = this.layer === 'food' ? undefined : TERRAIN_COLORS[this.layer];
      for (let i = 0; i < frame.food.length; i++) {
        const f = frame.food[i], j = i * 4;
        if (layer && rgb) {
          const value = Math.min(1,layer[i] / max);
          data[j] = 13 + rgb[0] * value; data[j + 1] = 20 + rgb[1] * value; data[j + 2] = 24 + rgb[2] * value;
        } else {
          data[j] = 13 + f * .11; data[j + 1] = 30 + f * .34; data[j + 2] = 29 + f * .25;
        }
        data[j + 3] = 255;
      }
      this.terrain.putImageData(image, 0, 0);
      this.paintedTick = frame.metrics.tick;
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale, this.scale);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.landscape, 0, 0);
    ctx.strokeStyle = '#557a76'; ctx.lineWidth = 1 / this.scale;
    ctx.strokeRect(0, 0, frame.width, frame.height);
    const gene = GENES.indexOf(this.mode as keyof Genome);
    const { positions, ids } = frame;
    this.groups.forEach(group => { group.length = 0; });
    this.linePositions.length = 0;
    const minX = -this.x / this.scale, minY = -this.y / this.scale;
    const maxX = minX + this.width / this.scale, maxY = minY + this.height / this.scale;
    for (let i = 0; i < ids.length; i++) {
      const x = positions[i * 4], y = positions[i * 4 + 1];
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      const bin = gene >= 0 ? frame.traitBins[i * GENES.length + gene]
        : this.mode === 'energy' ? Math.min(7, Math.floor(positions[i * 4 + 2] * 8))
        : this.mode === 'generation' ? Math.min(7, Math.floor(frame.generations[i] / 5)) : 0;
      this.groups[bin].push(i * 4);
      if (frame.founders[i] === this.highlighted) this.linePositions.push(i * 4);
    }
    const radius = Math.max(.35, 1.35 / this.scale);
    for (const [bin, group] of this.groups.entries()) {
      if (!group.length) continue;
      ctx.fillStyle = this.mode === 'normal' ? ORGANISM : PALETTE[bin];
      ctx.beginPath();
      for (const i of group) {
        const x = positions[i], y = positions[i + 1];
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
      }
      ctx.fill();
    }
    if (this.linePositions.length) {
      ctx.strokeStyle = '#ffe0a1';
      ctx.lineWidth = 1.25 / this.scale;
      ctx.beginPath();
      const ring = radius + 2 / this.scale;
      for (const i of this.linePositions) {
        ctx.moveTo(positions[i] + ring, positions[i + 1]);
        ctx.arc(positions[i], positions[i + 1], ring, 0, 2 * Math.PI);
      }
      ctx.stroke();
    }
    if (frame.selected) this.drawSelection(frame);
    ctx.restore();
    const text = `Центр ${((this.width / 2 - this.x) / this.scale).toFixed(1)}, ${((this.height / 2 - this.y) / this.scale).toFixed(1)} · ${this.scale.toFixed(2)} пикс./кл.`;
    if (this.coordinates.textContent !== text) this.coordinates.textContent = text;
    this.updateLegend(gene);
  }

  private drawSelection(frame: Frame): void {
    const { ctx, scale, trail } = this, { x, y } = frame.selected!;
    ctx.strokeStyle = '#ffd394'; ctx.lineWidth = 1.5 / scale;
    ctx.beginPath();
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i], prev = trail[i - 1];
      if (!prev || Math.abs(prev.x - p.x) > frame.width / 2 || Math.abs(prev.y - p.y) > frame.height / 2) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, Math.max(2.5, 6 / scale), 0, Math.PI * 2); ctx.stroke();
    if (frame.selectedPhenotype) {
      ctx.strokeStyle = '#ffd39470';
      ctx.beginPath(); ctx.arc(x, y, frame.selectedPhenotype.radius, 0, Math.PI * 2); ctx.stroke();
    }
  }

  private updateLegend(gene: number): void {
    if (this.legend.dataset.mode === this.mode) return;
    this.legend.dataset.mode = this.mode;
    if (this.mode === 'normal') {
      this.legend.innerHTML = '<i class="organism-key"></i> Организмы';
      return;
    }
    const key = GENES[gene], range = key ? `${GENE_BOUNDS[key].join(' → ')} ${GENE_UNITS[key]}`
      : this.mode === 'energy' ? '0 → 80 ед. энергии' : '0 → 35+ поколений';
    this.legend.innerHTML = `<i class="ramp" aria-hidden="true"></i> ${range}`;
  }
}
