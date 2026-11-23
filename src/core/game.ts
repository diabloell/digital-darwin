import { ECOLOGY_VERSION } from './ecology.ts';
import { CARDS, FORK_AFTER, LEGACY_CARDS, MINOR_PRICE, MINOR_TICKS } from './tree.ts';
import type { Card, Quote } from './tree.ts';
export { CARDS } from './tree.ts';
export type { Card } from './tree.ts';
import { PLANET_VERSION } from './planet.ts';
import { Engine } from './engine.ts';
import type { Organism } from './engine.ts';
import { phenotype, GENE_BOUNDS } from './genetics.ts';
import type { Genome } from './genetics.ts';
import { PopulationHistory } from './history.ts';

export const GAME_VERSION = 1;
export const RELEASE_BALANCE = { birthEP:8, forkBirths:6 };
export const TUNING = { founders:80,width:40,height:40,duration:240,gap:18,introductions:8,windowTicks:80,maxRenewals:6,maxWindows:12,
  renewalEP:2,windowEP:2,achievementEP:3,price:5,establishedFraction:.10,establishedMinimum:2 };
export type Habitat='garden'|'scarce'|'empty';
export type Action={id:number;kind:'choose';founder:number}|{id:number;kind:'buy';card:Card};
export type Receipt={id:number;tick:number;accepted:boolean;reason:string};
type Marker=[Card,number,number?];
export type Attempt={card:Card;start:number;end:number;introduced:number;lastIntroduction:number;endingCount:number|null;established:boolean|null;peak:number;quote?:Quote;finished?:number};
type Sample={tick:number;population:number;energy:number|null;values:Genome|null;maintenance:number|null;carriers:number;traits?:Partial<Record<Card,{count:number;energy:number;gene:number;secondary?:number}>>};
export type GameState={version:1|2|3|4;habitat:Habitat;founder:number|null;tick:number;lost:boolean;receipt:Receipt|null;
  renewal:number;sustained:number;achievement:number;birthEP?:number;spent:number;generation:number;windowBirths:number;
  attempts:Attempt[];markers:[number,Marker[]][];samples:Sample[]};

export const IMPACT_GAME_VERSION = 4;
export const minorDuration=(version:GameState['version'],attempts:number)=>version===IMPACT_GAME_VERSION&&attempts===0?160:MINOR_TICKS;

export function gameWorld(seed:string,habitat:Habitat, planet = false, tree = false, ecology = false, release: boolean|typeof IMPACT_GAME_VERSION = false) {
  if (!['garden','scarce','empty'].includes(habitat)) throw Error('Неизвестная игровая среда');
  if(release)planet=tree=ecology=true;
  const e=new Engine({seed,width:TUNING.width,height:TUNING.height,population:TUNING.founders,...(ecology?{ecology:ECOLOGY_VERSION}:{}),...(planet?{planet:PLANET_VERSION}:{}),resourceScale:habitat==='garden'?1:habitat==='scarce'?.30:0});
  for(const a of e.organisms) {
    const g=a.genome;
    a.genome={speed:.8+(g.speed-.8)*.12,sensor:3.5+(g.sensor-3.5)*.12,
      efficiency:.85+(g.efficiency-.85)*.12,threshold:44+(g.threshold-44)*.12};
  }
  return {engine:e,genealogy:new PopulationHistory(e),game:new Game(habitat,undefined,release===IMPACT_GAME_VERSION?IMPACT_GAME_VERSION:release?3:tree?2:1)};
}

export class Game {
  private state: Omit<GameState,'markers'>;
  private readonly markers:Map<number,Marker[]>;
  constructor(habitat:Habitat,snapshot?:GameState, version:GameState['version'] = 1) {
    if(snapshot) {
      const {markers,...state}=structuredClone(snapshot);
      this.state=state;this.markers=new Map(markers);
    } else {
      this.state={version,habitat,founder:null,tick:0,lost:false,receipt:null,renewal:0,sustained:0,achievement:0,...(version>=3?{birthEP:0}:{}),spent:0,
        generation:0,windowBirths:0,attempts:[],samples:[]};
      this.markers=new Map();
    }
  }
  get active(){const attempt=this.state.attempts.at(-1);return attempt?.established===null?attempt:undefined;}
  get ep(){const s=this.state;return s.renewal+s.sustained+s.achievement+(s.birthEP??0)-s.spent;}
  get ready(){return this.state.founder!==null&&!this.state.lost;}
  snapshot():GameState{return structuredClone({...this.state,markers:[...this.markers]});}
  private options(e:Engine,h:PopulationHistory) {
    const s=this.state;
    const attempted=new Set(s.attempts.map(a=>a.card));
    const completed=s.attempts.filter(a=>a.established!==null&&!CARDS[a.card].major).length;
    const line=s.founder===null?null:h.summary(s.founder);
    const requiredBirths=s.version>=3?RELEASE_BALANCE.forkBirths:FORK_AFTER;
    const forkReady=completed>=FORK_AFTER && e.tick>=FORK_AFTER*MINOR_TICKS && (line?.born??0)>requiredBirths;
    const living=e.organisms.filter(a=>h.founder(a.id)===s.founder);
    const supported=(key:Card)=>{
      const hit = living.filter(({genome:g})=>key==='local' ? g.efficiency>=.88 || g.threshold<=41 : g.speed>=.90 || g.sensor>=4).length;
      const prior=s.attempts.filter(a=>a.established&&CARDS[a.card].track===key).length;
      return Math.min(1,(living.length?hit/living.length:0)*.8+Math.min(prior,2)*.1);
    };
    const rows=(Object.keys(CARDS) as Card[]).map(card=>{
      const node=CARDS[card];
      const prepared=node.major?supported(card):0;
      const quote=node.major?{price:prepared>=.4?4:7,duration:prepared>=.4?180:300,prepared}
        :{price:MINOR_PRICE,duration:minorDuration(s.version,s.attempts.length),prepared};
      const reason=attempted.has(card)?'Попытка проведена'
        :node.major?(s.attempts.some(a=>CARDS[a.card].major)?'Развилка уже выбрана':!forkReady?(s.version>=3?`Нужно 10 программ, 800 тиков и ${requiredBirths} потомков`:'Нужно 10 программ и 10 потомков'):'')
        :forkReady?'Доступна крупная развилка':s.version>=3&&completed>=FORK_AFTER?'Дождитесь размножения для развилки':node.requires&&!attempted.has(node.requires as Card)?'После попытки: '+CARDS[node.requires as Card].title:'';
      return {card,quote,reason};
    });
    // The ordering is advisory. Unfavorable major routes remain purchasable.
    const sample=s.samples.at(-1)?.values;
    const foodDensity=e.food.reduce((sum,v)=>sum+v,0)/(1000*e.food.length);
    const score=(card:Card)=>{
      const n=CARDS[card];
      if(!sample)return 0;
      const [min,max]=GENE_BOUNDS[n.gene];
      const headroom=n.delta>0?max-sample[n.gene]:sample[n.gene]-min;
      return Math.min(1,headroom/Math.abs(n.delta)) + (n.track===(foodDensity<4?'explorer':'local')?.15:0);
    };
    const offered=rows.filter(row=>!row.reason).sort((a,b)=>score(b.card)-score(a.card)).slice(0,4).map(row=>row.card);
    return {completed,rows,offered,...(s.version>=3?{requiredBirths}:{})};
  }
  command(action:Action,e:Engine,h:PopulationHistory):Receipt {
    const s=this.state;
    if (!Number.isSafeInteger(action.id)||action.id<1) return {id:0,tick:e.tick,accepted:false,reason:'Некорректный ID'};
    if (s.receipt && action.id<=s.receipt.id) return action.id===s.receipt.id?s.receipt:
      {id:action.id,tick:e.tick,accepted:false,reason:'Команда уже обработана'};
    let reason='';
    if(action.kind==='choose') {
      if(s.founder!==null||e.tick!==0||!Number.isInteger(action.founder)||action.founder<1||action.founder>e.config.population)
        reason='Основатель выбирается один раз на тике 0';
      else s.founder=action.founder;
    } else if(action.kind==='buy') {
      const tree=s.version>=2?this.options(e,h):null;
      const option=tree?.rows.find(row=>row.card===action.card);
      const quote=option?.quote;
      const price=quote?.price??TUNING.price;
      if(!this.ready)reason='Выберите живую линию';
      else if(this.active)reason='Дождитесь окончания программы';
      else if(s.attempts.some(a=>a.card===action.card)||!(tree?tree.offered.includes(action.card):LEGACY_CARDS.includes(action.card)))
        reason=option?.reason||'Карта недоступна';
      else if(this.ep<price)reason='Недостаточно EP';
      else {
        s.spent+=price;
        s.attempts.push({card:action.card,start:e.tick,end:e.tick+(quote?.duration??TUNING.duration),introduced:0,lastIntroduction:-TUNING.gap,
          endingCount:null,established:null,peak:0,...(quote?{quote}:{})});
        this.sample(e,h);
      }
    } else reason='Неизвестная команда';
    return s.receipt={id:action.id,tick:e.tick,accepted:!reason,reason};
  }
  private newborn(parent:Readonly<Organism>,child:Organism,h:PopulationHistory,tick:number) {
    if(h.founder(parent.id)!==this.state.founder)return;
    const markers=(this.markers.get(parent.id)??[]).filter(tag=>hasTrait(tag,child.genome));
    const a=this.active;
    const gap=a?.quote?(CARDS[a.card].major?18:10):TUNING.gap;
    if(a&&a.introduced<TUNING.introductions&&tick-a.lastIntroduction>=gap&&!markers.some(([key])=>key===a.card)) {
      const card=CARDS[a.card];
      const primary=shift(child.genome,card.gene,card.delta);
      const secondary=card.secondary&&shift(child.genome,...card.secondary);
      if(primary&&(!card.secondary||secondary)) {
        child.genome[card.gene]=primary.value;
        if(secondary&&card.secondary)child.genome[card.secondary[0]]=secondary.value;
        markers.push(secondary?[a.card,primary.cutoff,secondary.cutoff]:[a.card,primary.cutoff]);
        a.introduced++;a.lastIntroduction=tick;
      }
    }
    // A programme can move a gene across a previously inherited marker boundary.
    if(this.state.version>=2)for(let i=markers.length-1;i>=0;i--)if(!hasTrait(markers[i],child.genome))markers.splice(i,1);
    if(markers.length)this.markers.set(child.id,markers);
  }
  step(e:Engine,h:PopulationHistory) {
    if(!this.ready)return;
    e.step(1,undefined,(parent,child)=>this.newborn(parent,child,h,e.tick));
    h.observe(e);
    const s=this.state;
    s.tick=e.tick;
    for(const dead of e.lastDeaths)this.markers.delete(dead.id);
    for(const {child} of e.lastBirths)if(h.founder(child.id)===s.founder) {
      s.windowBirths++;
      if(!s.achievement)s.achievement=TUNING.achievementEP;
      if(child.generation>s.generation) {
        s.generation=child.generation;
        if(s.renewal<TUNING.maxRenewals*TUNING.renewalEP)s.renewal+=TUNING.renewalEP;
      }
    }
    const line=h.summary(s.founder!);
    if(s.version>=3)s.birthEP=Math.min(RELEASE_BALANCE.birthEP,line.born-1);
    if(!line.living)s.lost=true;
    if(e.tick%TUNING.windowTicks===0) {
      if(!s.lost&&s.windowBirths>=2&&s.sustained<TUNING.maxWindows*TUNING.windowEP)s.sustained+=TUNING.windowEP;
      s.windowBirths=0;
    }
    const active=this.active;
    if(active) {
      const count=this.count(active.card);
      active.peak=Math.max(active.peak,count);
      if(s.lost||e.tick>=active.end) {
        active.endingCount=count;
        if(active.quote)active.finished=e.tick;
        active.established=count>=TUNING.establishedMinimum&&count/line.living>=TUNING.establishedFraction;
      }
    }
    if(e.tick%20===0||s.lost||active?.endingCount!=null)this.sample(e,h);
  }
  markLatestCarriers(ids:Uint32Array):Uint8Array|undefined {
    const latest=this.state.attempts.at(-1);
    if(!latest)return;
    return Uint8Array.from(ids,id=>this.markers.get(id)?.some(([card])=>card===latest.card)?1:0);
  }
  private count(key:Card) {
    let result=0;
    for(const tags of this.markers.values())if(tags.some(([card])=>card===key))result++;
    return result;
  }
  private sample(e:Engine,h:PopulationHistory) {
    const s=this.state, values:Genome={speed:0,sensor:0,efficiency:0,threshold:0};
    const traits:NonNullable<Sample['traits']>={};
    let population=0,energy=0,maintenance=0;
    for(const a of e.organisms)if(h.founder(a.id)===s.founder) {
      population++;energy+=a.energy;
      for(const gene of Object.keys(values) as (keyof Genome)[])values[gene]+=a.genome[gene];
      maintenance+=phenotype(a.genome,e.config.rule).maintenance;
      if(s.version>=2)for(const [key] of this.markers.get(a.id)??[]){
        const v=traits[key]??={count:0,energy:0,gene:0};
        const node=CARDS[key];
        v.count++;v.energy+=a.energy/1000;v.gene+=a.genome[node.gene];
        if(node.secondary)v.secondary=(v.secondary??0)+a.genome[node.secondary[0]];
      }
    }
    for(const gene of Object.keys(values) as (keyof Genome)[])values[gene]/=Math.max(1,population);
    for(const v of Object.values(traits)){
      v.energy/=v.count;v.gene/=v.count;
      if(v.secondary!==undefined)v.secondary/=v.count;
    }
    s.samples.push({tick:e.tick,population,energy:population?energy/population/1000:null,values:population?values:null,
      maintenance:population?maintenance/population/1000:null,carriers:this.markers.size,...(s.version>=2?{traits}:{})});
    if(s.samples.length>100)s.samples.shift();
  }
  view(h:PopulationHistory,e?:Engine) {
    const {samples,attempts,...state}=this.state;
    return {...state,...(state.version>=2&&e?{tree:this.options(e,h)}:{}),ep:this.ep,active:this.active?.card??null,
      line:state.founder===null?null:h.summary(state.founder),
      attempts:attempts.map(a=>({...a,carriers:this.count(a.card)})),samples};
  }
}
export type GameView=ReturnType<Game['view']>;

function shift(genome:Genome,gene:keyof Genome,delta:number) {
  const before=genome[gene],[min,max]=GENE_BOUNDS[gene];
  const value=Math.min(max,Math.max(min,before+delta));
  return Math.abs(value-before)>=Math.abs(delta)/2?{value,cutoff:before+(value-before)*.5}:null;
}

export function hasTrait([key,cutoff,other]:Marker,genome:Genome) {
  const node=CARDS[key];
  const passes=(gene:keyof Genome,delta:number,limit:number)=>delta>0?genome[gene]>=limit:genome[gene]<=limit;
  return passes(node.gene,node.delta,cutoff)&&(!node.secondary||(other!==undefined&&passes(...node.secondary,other)));
}

export function releaseWorld(seed:string,habitat:Habitat='garden',impact=false) {
  return gameWorld(seed,habitat,false,false,false,impact?IMPACT_GAME_VERSION:true);
}
