import { CARDS,GAME_VERSION,TUNING,Game } from '../core/game.ts';
import type { GameState,Card } from '../core/game.ts';
import { GENE_BOUNDS } from '../core/genetics.ts';
import type { Engine } from '../core/engine.ts';
import type { PopulationHistory } from '../core/history.ts';
import { fields,requireValue } from '../snapshot-schema.ts';

const int=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const finite=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const card=(v:unknown):v is Card=>typeof v==='string'&&Object.hasOwn(CARDS,v);
export function restoreGame(raw:unknown,e:Engine,h:PopulationHistory) {
  const s=fields(raw,'version habitat founder tick lost receipt renewal sustained achievement spent generation windowBirths attempts markers samples') as GameState;
  requireValue(s.version===GAME_VERSION&&['garden','scarce','empty'].includes(s.habitat)&&s.tick===e.tick
    && e.config.width===TUNING.width&&e.config.height===TUNING.height&&e.config.population===TUNING.founders
    && e.config.resourceScale===(s.habitat==='garden'?1:s.habitat==='scarce'?.30:0)
    && (s.founder===null?s.tick===0&&!s.lost:int(s.founder,1,e.config.population)&&s.lost===!h.summary(s.founder).living)
    && typeof s.lost==='boolean','Некорректный игровой мир');
  requireValue(int(s.renewal,0,TUNING.maxRenewals*TUNING.renewalEP)&&s.renewal%TUNING.renewalEP===0
    &&int(s.sustained,0,TUNING.maxWindows*TUNING.windowEP)&&s.sustained%TUNING.windowEP===0
    &&[0,TUNING.achievementEP].includes(s.achievement)&&int(s.spent,0,s.renewal+s.sustained+s.achievement)
    &&int(s.generation,0,e.tick)&&int(s.windowBirths,0,e.births),'Некорректный баланс EP');
  if(s.founder!==null){
    const line=h.summary(s.founder);
    requireValue(s.generation===line.maxGeneration&&s.achievement===(line.born>1?TUNING.achievementEP:0)
      &&s.windowBirths<line.born,'Некорректные начисления линии');
  } else requireValue(s.renewal+s.sustained+s.achievement+s.spent+s.generation+s.windowBirths===0,'Начисления до выбора');
  if(s.receipt!==null){
    const r=fields(s.receipt,'id tick accepted reason');
    requireValue(int(r.id,1)&&int(r.tick,0,e.tick)&&typeof r.accepted==='boolean'&&typeof r.reason==='string'&&r.reason.length<=200,'Некорректная квитанция');
  }
  requireValue(Array.isArray(s.attempts)&&s.attempts.length<=3&&s.spent===s.attempts.length*TUNING.price,'Некорректные покупки');
  const keys=new Set<Card>();
  let prev=0;
  for(const [i,a] of s.attempts.entries()){
    fields(a,'card start end introduced lastIntroduction endingCount established peak');
    requireValue(card(a.card)&&!keys.has(a.card)&&int(a.start,prev,e.tick)&&a.end===a.start+TUNING.duration
      &&int(a.introduced,0,TUNING.introductions)&&int(a.peak,0,TUNING.founders+e.births)
      &&(a.introduced?int(a.lastIntroduction,a.start+1,Math.min(e.tick,a.end)):a.lastIntroduction===-TUNING.gap)
      &&(a.established===null?i===s.attempts.length-1&&!s.lost&&e.tick<a.end&&a.endingCount===null:
        typeof a.established==='boolean'&&(s.lost||e.tick>=a.end)&&int(a.endingCount,0,a.peak)),'Некорректная программа');
    keys.add(a.card);prev=a.end;
  }
  const living=new Map(e.organisms.map(a=>[a.id,a]));
  requireValue(Array.isArray(s.markers)&&s.markers.length<=living.size&&Array.isArray(s.samples)&&s.samples.length<=100,'Некорректные метки');
  const ids=new Set<number>();
  for(const entry of s.markers){
    requireValue(Array.isArray(entry)&&entry.length===2,'Некорректная связь носителя');
    const [id,tags]=entry,a=living.get(id);
    requireValue(a&&!ids.has(id)&&h.founder(id)===s.founder&&Array.isArray(tags)&&tags.length>0&&tags.length<=3,'Некорректный носитель');
    ids.add(id);
    const marked=new Set<Card>();
    for(const tag of tags){
      requireValue(Array.isArray(tag)&&tag.length===2&&card(tag[0])&&keys.has(tag[0])&&!marked.has(tag[0]),'Некорректная метка');
      const [key,cutoff]=tag,c=CARDS[key];
      const [min,max]=GENE_BOUNDS[c.gene];
      requireValue(finite(cutoff,min,max)&&(c.delta>0?a.genome[c.gene]>=cutoff:a.genome[c.gene]<=cutoff),'Аллель не соответствует метке');
      marked.add(key);
    }
  }
  let tick=0;
  for(const p of s.samples){
    fields(p,'tick population energy values maintenance carriers');
    requireValue(int(p.tick,tick,e.tick)&&int(p.population,0,TUNING.founders+e.births)&&int(p.carriers,0,p.population)
      &&(p.population?finite(p.energy,0,80)&&finite(p.maintenance,0,1)&&p.values!==null:
        p.values===null&&p.energy===null&&p.maintenance===null),'Некорректный отсчёт линии');
    if(p.values){
      fields(p.values,'speed sensor efficiency threshold');
      for(const gene of Object.keys(GENE_BOUNDS) as (keyof typeof GENE_BOUNDS)[]){
        const [min,max]=GENE_BOUNDS[gene];
        requireValue(finite(p.values[gene],min-1e-9,max+1e-9),'Некорректный график генов');
      }
    }
    tick=p.tick;
  }
  return new Game(s.habitat,s);
}
