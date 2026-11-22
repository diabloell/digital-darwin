import { sha256 } from '../snapshot.ts';
import { canonical, METRICS, validateDefinition } from './definition.ts';
import type { Series } from './runner.ts';

export const MAX_RESULT = 12 * 1024 * 1024;
export const MAX_SERIES = 8;
export async function pack(series:Series) {
  const payload=JSON.stringify(series);
  const text=JSON.stringify({format:1,checksum:await sha256(payload),payload});
  if (new Blob([text]).size>MAX_RESULT) throw Error('Архив превышает 12 МиБ');
  return text;
}
export async function unpack(text:string):Promise<Series> {
  if (text.length>MAX_RESULT || new Blob([text]).size>MAX_RESULT) throw Error('Архив превышает 12 МиБ');
  const archive=JSON.parse(text);
  if (archive?.format!==1) throw Error('Несовместимый формат архива');
  if (typeof archive.payload!=='string' || await sha256(archive.payload)!==archive.checksum) throw Error('Повреждён архив SHA-256');
  const series=JSON.parse(archive.payload) as Series;
  const d=validateDefinition(series.definition), hash=await sha256(canonical(d));
  const conditions=[d.control,...d.treatments];
  if (series.version!==1 || typeof series.seriesId!=='string' || !/^[a-f0-9-]{36}$/.test(series.seriesId) || series.scenarioHash!==hash || typeof series.environment!=='string'
    || !['completed','partial','failed'].includes(series.status) || !['PASS','FAIL','NOT RUN','DESCRIPTIVE'].includes(series.verdict)
    || !Array.isArray(series.runs) || series.runs.length!==conditions.length*d.replicas) throw Error('Некорректный манифест серии');
  const validValues=(v:unknown)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.entries(v).every(([key,value])=>
    Object.hasOwn(METRICS,key)&&(value===null||typeof value==='number'&&Number.isFinite(value)));
  const validHash=(x:unknown)=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
  for (const [i,r] of series.runs.entries()) {
    if (r?.seed!==d.seeds[Math.floor(i/conditions.length)] || r.conditionId!==conditions[i%conditions.length].id
      || r.runId!==`${series.seriesId}-${i+1}` || r.experimentId!==d.id || r.scenarioHash!==hash || r.engineVersion!==d.versions.engine
      || !['completed','failed','cancelled','not-run'].includes(r.status) || !Number.isSafeInteger(r.ticks) || r.ticks<0 || r.ticks>d.duration
      || !Array.isArray(r.trajectory)||r.trajectory.length>401 || (r.error!==null&&typeof r.error!=='string')
      || (r.extinct!==null&&(!Number.isSafeInteger(r.extinct)||r.extinct<0||r.extinct>r.ticks))) throw Error('Некорректная реплика');
    let tick=-1;
    for (const p of r.trajectory) {
      if (!p||!Number.isSafeInteger(p.tick)||p.tick<=tick||p.tick>r.ticks||!validHash(p.hash)||!validValues(p.values)) throw Error('Некорректная траектория');
      tick=p.tick;
    }
    if (r.status==='completed' ? (r.ticks!==d.duration||tick!==d.duration||r.trajectory.at(-1)?.hash!==r.hash||!validValues(r.final))
      : (r.hash!==null||r.final!==null)) throw Error('Некорректный итог реплики');
  }
  const expected=series.runs.some(r=>r.status==='failed')||series.verdict==='FAIL'?'failed'
    :series.runs.every(r=>r.status==='completed')?'completed':'partial';
  if (expected!==series.status || (series.verdict==='PASS' && (d.criterion!=='identical-state'||series.status!=='completed'
    || new Set(series.runs.map(r=>r.hash)).size!==1))) throw Error('Несогласованный статус серии');
  return series;
}

type ArchiveItem={id:string; title:string; date:string; status:Series['status']; text:string};
async function db() {
  return new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('digital-darwin-experiments',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('runs',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(Error('Архив открыт в другой версии приложения'));
  });
}
async function transaction<T>(mode:IDBTransactionMode, execute:(s:IDBObjectStore, result:(value:T)=>void)=>void) {
  const connection=await db();
  try {
    return await new Promise<T>((resolve,reject)=>{
      const tx=connection.transaction('runs',mode);
      let value:T;
      tx.oncomplete=()=>resolve(value); tx.onabort=()=>reject(tx.error??Error('Запись архива отменена'));
      try { execute(tx.objectStore('runs'), v=>{value=v;}); }
      catch(error) { tx.abort(); reject(error); }
    });
  } finally { connection.close(); }
}
export function listArchives() {
  return transaction<Omit<ArchiveItem,'text'>[]>('readonly',(store,done)=>{
    const rows:Omit<ArchiveItem,'text'>[]=[], cursor=store.openCursor();
    cursor.onsuccess=()=>{
      const next=cursor.result;
      if (!next) {done(rows.reverse());return;}
      const {id,title,date,status}=next.value as ArchiveItem;
      rows.push({id,title,date,status});next.continue();
    };
  });
}
export function readArchive(id:string) {
  return transaction<ArchiveItem|undefined>('readonly',(store,done)=>{
    const request=store.get(id);request.onsuccess=()=>done(request.result);
  });
}
export async function saveArchive(series:Series) {
  const text=await pack(series),date=new Date().toISOString(),id=date+'-'+crypto.randomUUID();
  await transaction<void>('readwrite',(store,done)=>{
    const keys=store.getAllKeys();
    keys.onsuccess=()=>{
      for (const key of keys.result.slice(0,Math.max(0,keys.result.length-MAX_SERIES+1))) store.delete(key);
      store.add({id,title:series.definition.title,date,status:series.status,text});
      done();
    };
  });
  return id;
}
