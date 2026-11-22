import { Engine } from './engine.ts';
import type { Organism } from './engine.ts';
import { phenotype, GENE_BOUNDS } from './genetics.ts';
import type { Genome } from './genetics.ts';
import { PopulationHistory } from './history.ts';

export const GAME_VERSION = 1;
export const TUNING = { founders:80,width:40,height:40,duration:240,gap:18,introductions:8,windowTicks:80,maxRenewals:6,maxWindows:12,
  renewalEP:2,windowEP:2,achievementEP:3,price:5,establishedFraction:.10,establishedMinimum:2 };
export const CARDS = {
  nutrition:{title:'Усвоение',gene:'efficiency',delta:.06,benefit:'Больше энергии из каждой порции',cost:'Дороже поддерживать усвоение'},
  mobility:{title:'Подвижность',gene:'speed',delta:.13,benefit:'Больше клеток за шаг',cost:'Движение расходует больше энергии'},
  fertility:{title:'Раннее размножение',gene:'threshold',delta:-3,benefit:'Рождение при меньшем запасе',cost:'При раннем рождении меньше запас родителя и вклад в потомка'}
} as const;
export type Card=keyof typeof CARDS;
export type Habitat='garden'|'scarce'|'empty';
export type Action={id:number;kind:'choose';founder:number}|{id:number;kind:'buy';card:Card};
export type Receipt={id:number;tick:number;accepted:boolean;reason:string};
type Marker=[Card,number];
export type Attempt={card:Card;start:number;end:number;introduced:number;lastIntroduction:number;endingCount:number|null;established:boolean|null;peak:number};
type Sample={tick:number;population:number;energy:number|null;values:Genome|null;maintenance:number|null;carriers:number};
export type GameState={version:1;habitat:Habitat;founder:number|null;tick:number;lost:boolean;receipt:Receipt|null;
  renewal:number;sustained:number;achievement:number;spent:number;generation:number;windowBirths:number;
  attempts:Attempt[];markers:[number,Marker[]][];samples:Sample[]};

export function gameWorld(seed:string,habitat:Habitat) {
  if (!['garden','scarce','empty'].includes(habitat)) throw Error('Неизвестная игровая среда');
  const e=new Engine({seed,width:TUNING.width,height:TUNING.height,population:TUNING.founders,resourceScale:habitat==='garden'?1:habitat==='scarce'?.30:0});
  for(const a of e.organisms) {
    const g=a.genome;
    a.genome={speed:.8+(g.speed-.8)*.12,sensor:3.5+(g.sensor-3.5)*.12,
      efficiency:.85+(g.efficiency-.85)*.12,threshold:44+(g.threshold-44)*.12};
  }
  return {engine:e,genealogy:new PopulationHistory(e),game:new Game(habitat)};
}

export class Game {
  private state: Omit<GameState,'markers'>;
  private readonly markers:Map<number,Marker[]>;
  constructor(habitat:Habitat,snapshot?:GameState) {
    if(snapshot) {
      const {markers,...state}=structuredClone(snapshot);
      this.state=state;this.markers=new Map(markers);
    } else {
      this.state={version:1,habitat,founder:null,tick:0,lost:false,receipt:null,renewal:0,sustained:0,achievement:0,spent:0,
        generation:0,windowBirths:0,attempts:[],samples:[]};
      this.markers=new Map();
    }
  }
  get active(){const attempt=this.state.attempts.at(-1);return attempt?.established===null?attempt:undefined;}
  get ep(){const s=this.state;return s.renewal+s.sustained+s.achievement-s.spent;}
  get ready(){return this.state.founder!==null&&!this.state.lost;}
  snapshot():GameState{return structuredClone({...this.state,markers:[...this.markers]});}
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
      if(!this.ready)reason='Выберите живую линию';
      else if(this.active)reason='Дождитесь окончания программы';
      else if(!Object.hasOwn(CARDS,action.card)||s.attempts.some(a=>a.card===action.card))reason='Карта недоступна';
      else if(this.ep<TUNING.price)reason='Недостаточно EP';
      else {
        s.spent+=TUNING.price;
        s.attempts.push({card:action.card,start:e.tick,end:e.tick+TUNING.duration,introduced:0,lastIntroduction:-TUNING.gap,
          endingCount:null,established:null,peak:0});
        this.sample(e,h);
      }
    } else reason='Неизвестная команда';
    return s.receipt={id:action.id,tick:e.tick,accepted:!reason,reason};
  }
  private newborn(parent:Readonly<Organism>,child:Organism,h:PopulationHistory,tick:number) {
    if(h.founder(parent.id)!==this.state.founder)return;
    const markers=(this.markers.get(parent.id)??[]).filter(([key,cutoff])=>{
      const c=CARDS[key];return c.delta>0?child.genome[c.gene]>=cutoff:child.genome[c.gene]<=cutoff;
    });
    const a=this.active;
    if(a&&a.introduced<TUNING.introductions&&tick-a.lastIntroduction>=TUNING.gap&&!markers.some(([key])=>key===a.card)) {
      const card=CARDS[a.card],before=child.genome[card.gene],[min,max]=GENE_BOUNDS[card.gene];
      const changed=Math.min(max,Math.max(min,before+card.delta));
      if(Math.abs(changed-before)>=Math.abs(card.delta)/2) {
        child.genome[card.gene]=changed;
        markers.push([a.card,before+(changed-before)*.5]);
        a.introduced++;a.lastIntroduction=tick;
      }
    }
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
        active.established=count>=TUNING.establishedMinimum&&count/line.living>=TUNING.establishedFraction;
      }
    }
    if(e.tick%20===0||s.lost||active?.endingCount!=null)this.sample(e,h);
  }
  private count(key:Card) {
    let result=0;
    for(const tags of this.markers.values())if(tags.some(([card])=>card===key))result++;
    return result;
  }
  private sample(e:Engine,h:PopulationHistory) {
    const s=this.state, values:Genome={speed:0,sensor:0,efficiency:0,threshold:0};
    let population=0,energy=0,maintenance=0;
    for(const a of e.organisms)if(h.founder(a.id)===s.founder) {
      population++;energy+=a.energy;
      for(const gene of Object.keys(values) as (keyof Genome)[])values[gene]+=a.genome[gene];
      maintenance+=phenotype(a.genome,e.config.rule).maintenance;
    }
    for(const gene of Object.keys(values) as (keyof Genome)[])values[gene]/=Math.max(1,population);
    s.samples.push({tick:e.tick,population,energy:population?energy/population/1000:null,values:population?values:null,
      maintenance:population?maintenance/population/1000:null,carriers:this.markers.size});
    if(s.samples.length>100)s.samples.shift();
  }
  view(h:PopulationHistory) {
    const {samples,attempts,...state}=this.state;
    return {...state,ep:this.ep,active:this.active?.card??null,
      line:state.founder===null?null:h.summary(state.founder),
      attempts:attempts.map(a=>({...a,carriers:this.count(a.card)})),samples};
  }
}
export type GameView=ReturnType<Game['view']>;
