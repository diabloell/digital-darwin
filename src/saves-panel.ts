import type { Command, Frame, PersistenceEvent } from './protocol.ts';
import { MAX_SAVE_BYTES } from './snapshot.ts';
import type { Manifest, SaveFile } from './snapshot.ts';
import { deleteSlot, listSlots, readSlot, renameSlot, writeSlot } from './save-storage.ts';
import type { Slot } from './save-storage.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
type Request = Extract<Command, { kind: 'snapshot' | 'restore' }>;
export class SavesPanel {
  private readonly send: (command: Command) => void;
  private readonly root = $<HTMLDetailsElement>('world-saves');
  private readonly name = $<HTMLInputElement>('save-name');
  private readonly list = $<HTMLSelectElement>('save-list');
  private readonly file = $<HTMLInputElement>('import-file');
  private readonly status = $('save-status');
  private readonly info = $('save-info');
  private slots: Slot[] = [];
  private preview: SaveFile | undefined;
  private request = 0;
  private pending: { request: number; epoch: number; resolve: (event: PersistenceEvent) => void; reject: (error: Error) => void } | undefined;
  private busy = false;
  private frame: Frame | undefined;
  private checkpoint: { tick: number; date: string | null; name: string } | undefined;

  constructor(send: (command: Command) => void) {
    this.send = send;
    this.root.ontoggle = () => { if (this.root.open && !this.busy) this.run(() => this.reload()); };
    this.list.onchange = () => this.render();
    $('save-world').onclick = () => this.run(async () => {
      const name = this.slotName(), current = await this.overwrite(name);
      if (current === false) return;
      const response = await this.snapshot(name);
      const id = await writeSlot(response.file, name, current);
      if (this.frame?.epoch === response.epoch) this.checkpoint = { tick: response.file.manifest.tick, date: response.file.manifest.createdAt, name };
      await this.reload(id);
      this.status.textContent = 'Сохранено в браузере.';
    });
    $('load-world').onclick = () => this.run(async () => {
      const slot = this.selected();
      if (!slot || !this.confirmReplacement('Загрузить выбранный слот?')) return;
      const stored = await readSlot(slot.id);
      await this.load(stored.text, stored.name);
    });
    $('export-world').onclick = () => this.run(async () => {
      const { file } = await this.snapshot(this.slotName());
      this.download(file.text, file.manifest);
      this.status.textContent = 'Файл текущего мира подготовлен.';
    });
    $('export-slot').onclick = () => this.run(async () => {
      const slot = this.selected();
      if (!slot) return;
      const { text, summary } = await readSlot(slot.id);
      this.download(text, summary);
    });
    $('rename-slot').onclick = () => this.run(async () => {
      const slot = this.selected();
      if (!slot) return;
      const name = this.slotName();
      await renameSlot(slot, name);
      await this.reload(slot.id);
      this.status.textContent = 'Слот переименован.';
    });
    $('delete-slot').onclick = () => this.run(async () => {
      const slot = this.selected();
      if (!slot || !confirm(`Удалить сохранение «${slot.name}»?`)) return;
      await deleteSlot(slot);
      await this.reload();
      this.status.textContent = 'Слот удалён.';
    });
    this.file.onchange = () => this.run(async () => {
      this.preview = undefined;
      const file = this.file.files?.[0];
      this.file.value = '';
      if (!file) return;
      if (file.size > MAX_SAVE_BYTES) throw Error('Файл превышает предел 32 МиБ');
      const text = await file.text();
      const result = await this.ask({ kind: 'restore', text, preview: true });
      if (result.kind !== 'restore-result') throw Error('Ответ проверки файла недоступен');
      this.preview = { text, manifest: result.manifest };
      this.name.value = result.manifest.name;
      this.status.textContent = 'Файл проверен. Выберите загрузку или сохранение в слот.';
    });
    $('load-import').onclick = () => this.run(async () => {
      if (this.preview && this.confirmReplacement('Загрузить проверенный файл?')) await this.load(this.preview.text, this.preview.manifest.name);
    });
    $('store-import').onclick = () => this.run(async () => {
      if (!this.preview) return;
      const name = this.slotName(), current = await this.overwrite(name);
      if (current === false) return;
      const id = await writeSlot(this.preview, name, current);
      await this.reload(id);
      this.status.textContent = 'Проверенный файл сохранён в браузере.';
    });
    this.render();
  }

  onFrame(frame: Frame) {
    if (this.frame?.epoch !== frame.epoch) this.checkpoint = undefined;
    this.frame = frame;
    if (this.root.open) this.renderCurrent();
  }

  onEvent(event: PersistenceEvent) {
    const pending = this.pending;
    if (!pending || pending.request !== event.request) return;
    this.pending = undefined;
    if (event.kind === 'persistence-error') pending.reject(Error(event.message));
    else if ((event.epoch === pending.epoch || (event.kind === 'restore-result' && !event.preview && event.epoch === pending.epoch + 1))
      && event.epoch === this.frame?.epoch) pending.resolve(event);
    else pending.reject(Error('Мир уже изменился'));
  }

  confirmReplacement(question: string) {
    const creating = question === 'Создать новый мир?';
    if (creating && this.busy) return false;
    const tick = this.frame?.metrics.tick ?? 0;
    const dirty = Boolean(this.frame?.running) || tick > (this.checkpoint?.tick ?? 0);
    if (creating && !dirty) return true;
    return confirm(dirty ? `${question} После последнего сохранения появились новые тики.` : question);
  }

  private ask(command: Omit<Extract<Request, { kind: 'snapshot' }>, 'request' | 'epoch'>
    | Omit<Extract<Request, { kind: 'restore' }>, 'request' | 'epoch'>): Promise<PersistenceEvent> {
    const epoch = this.frame?.epoch;
    if (epoch === undefined) return Promise.reject(Error('Мир ещё загружается'));
    const request = ++this.request;
    return new Promise((resolve, reject) => {
      this.pending = { request, epoch, resolve, reject };
      this.send({ ...command, request, epoch });
    });
  }

  private async snapshot(name: string) {
    const response = await this.ask({ kind: 'snapshot', name, createdAt: new Date().toISOString() });
    if (response.kind !== 'snapshot-ready') throw Error('Снимок недоступен');
    return response;
  }

  private async load(text: string, name: string) {
    const response = await this.ask({ kind: 'restore', text, preview: false });
    if (response.kind !== 'restore-result') throw Error('Ответ восстановления недоступен');
    this.checkpoint = { tick: response.manifest.tick, date: response.manifest.createdAt, name };
    this.name.value = name;
    this.status.textContent = 'Мир восстановлен на паузе.';
  }

  private selected() { return this.slots.find(slot => slot.id === this.list.value); }
  private slotName() {
    const name = this.name.value.trim();
    if (!name || name.length > 80) throw Error('Введите имя из 1–80 символов');
    return name;
  }

  private async overwrite(name: string) {
    const existing = (await listSlots()).find(slot => slot.name === name);
    return existing && !confirm(`Перезаписать «${name}»?`) ? false : existing;
  }

  private async reload(select = this.list.value) {
    this.slots = await listSlots();
    this.list.replaceChildren(new Option('Выберите сохранение', ''), ...this.slots.map(slot => new Option(slot.name, slot.id)));
    this.list.value = this.slots.some(slot => slot.id === select) ? select : '';
  }

  private run(action: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    this.status.textContent = 'Выполняется…';
    this.render();
    void action().then(() => { if (this.status.textContent === 'Выполняется…') this.status.textContent = ''; }).catch(error => {
      this.status.textContent = error?.name === 'QuotaExceededError'
        ? 'Недостаточно места. Предыдущее сохранение сохранено.'
        : error?.name === 'ConstraintError' ? 'Слот с таким именем уже существует.' : `Ошибка: ${error instanceof Error ? error.message : String(error)}`;
    }).finally(() => { this.busy = false; this.render(); });
  }

  private details(m: Manifest, bytes: number) {
    return `${m.seed} · ${m.width} × ${m.height} · тик ${m.tick} · живых ${m.population} · ${new Date(m.createdAt).toLocaleString('ru-RU')} · ${Math.ceil(bytes / 1024)} КиБ · формат ${m.format}`;
  }

  private renderCurrent() {
    const tick = this.frame?.metrics.tick ?? 0;
    const date = this.checkpoint?.date;
    const text = `${this.checkpoint?.name ?? this.frame?.seed ?? 'Мир'} · тик ${tick}${date ? ` · сохранение: ${new Date(date).toLocaleString('ru-RU')}` : ''}${tick > (this.checkpoint?.tick ?? 0) ? ' · есть несохранённые тики' : ''}`;
    const status = $('current-save');
    if (status.textContent !== text) status.textContent = text;
  }

  private render() {
    const slot = this.selected();
    this.info.textContent = slot ? this.details(slot.summary, slot.bytes) : 'Сохранения хранятся в этом браузере.';
    $('import-info').textContent = this.preview ? this.details(this.preview.manifest, new Blob([this.preview.text]).size) : '';
    this.root.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = this.busy; });
    for (const id of ['load-world', 'export-slot', 'rename-slot', 'delete-slot']) $<HTMLButtonElement>(id).disabled = this.busy || !slot;
    for (const id of ['load-import', 'store-import']) $<HTMLButtonElement>(id).disabled = this.busy || !this.preview;
    this.file.disabled = this.busy;
    this.renderCurrent();
  }

  private download(text: string, manifest: Manifest) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    link.href = url;
    link.download = `digital-darwin-${manifest.tick}.ddworld.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
