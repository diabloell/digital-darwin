import type { Manifest, SaveFile } from './snapshot.ts';

export type Slot = { id: string; name: string; revision: string; summary: Manifest; bytes: number };
type Stored = Slot & { text: string };
let connection: Promise<IDBDatabase> | undefined;

async function database(): Promise<IDBDatabase> {
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('digital-darwin-saves', 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('worlds', { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: true });
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error('Закройте другую вкладку лаборатории и повторите'));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); connection = undefined; };
        resolve(db);
      };
    }).catch(error => { connection = undefined; throw error; });
  }
  return connection;
}

async function transact<T>(mode: IDBTransactionMode, run: (
  store: IDBObjectStore, finish: (v: T) => void, fail: (error: unknown) => void
) => void): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('worlds', mode);
    let result: T;
    const fail = (error: unknown) => { reject(error); transaction.abort(); };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(transaction.error ?? Error('Операция хранения отменена'));
    try { run(transaction.objectStore('worlds'), value => { result = value; }, fail); }
    catch (error) { fail(error); }
  });
}

export function listSlots() {
  return transact<Slot[]>('readonly', (store, done) => {
    const slots: Slot[] = [], request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { done(slots.sort((a,b) => b.summary.createdAt.localeCompare(a.summary.createdAt) || a.name.localeCompare(b.name))); return; }
      const { id, name, revision, summary, bytes } = cursor.value as Stored;
      slots.push({ id, name, revision, summary, bytes });
      cursor.continue();
    };
  });
}

export function readSlot(id: string) {
  return transact<Stored>('readonly', (store, done, fail) => {
    const request = store.get(id);
    request.onsuccess = () => request.result ? done(request.result) : fail(Error('Сохранение уже удалено'));
  });
}

function edit<T>(slot: Slot, update: (store: IDBObjectStore, current: Stored) => T) {
  return transact<T>('readwrite', (store, done, fail) => {
    const request = store.get(slot.id);
    request.onsuccess = () => {
      if (request.result?.revision !== slot.revision) { fail(Error('Слот изменён в другой вкладке. Обновите список.')); return; }
      try { done(update(store, request.result)); } catch (error) { fail(error); }
    };
  });
}
export async function writeSlot(file: SaveFile, name: string, current?: Slot) {
  const row = { id: current?.id ?? crypto.randomUUID(), revision: crypto.randomUUID(), name, summary: file.manifest,
    text: file.text, bytes: new Blob([file.text]).size };
  if (current) return edit(current, store => { store.put(row); return row.id; });
  return transact<string>('readwrite', (store, done) => { store.add(row); done(row.id); });
}
export function renameSlot(slot: Slot, name: string) {
  return edit(slot, (store, current) => store.put({ ...current, name, revision: crypto.randomUUID() }));
}
export function deleteSlot(slot: Slot) {
  return edit(slot, store => store.delete(slot.id));
}
