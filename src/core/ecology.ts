import type { Phenotype } from './genetics.ts';

export const ECOLOGY_VERSION = 1;
export const PRESSURE_MAX = 16;
export const COLLAPSE = 8;
export const RECOVER = 2;
export const ECO_LAYERS = { pressure: 'Давление', crisis: 'Кризис', demand: 'Заявки на пищу' } as const;
export type EcoLayer = keyof typeof ECO_LAYERS;
export type Niche = { actions:number; moved:number; food:number; upkeep:number };
export type EcologyState = {
  pressure:number[]; collapsed:number[]; strained:number[]; demand:number[]; harvest:number[];
  collapses:number; recoveries:number; contested:number; withheld:number; niches:[Niche,Niche];
};

export function niche(traits:Phenotype):0|1 {
  return traits.speed + .12 * traits.radius - traits.assimilation >= .38 ? 1 : 0;
}

function emptyNiche():Niche { return {actions:0,moved:0,food:0,upkeep:0}; }

export class Ecology {
  readonly pressure:Uint8Array;
  readonly collapsed:Uint8Array;
  readonly strained:Uint8Array;
  readonly demand:Uint16Array;
  readonly harvest:Uint32Array;
  collapses=0;
  recoveries=0;
  contested=0;
  withheld=0;
  niches:[Niche,Niche]=[emptyNiche(),emptyNiche()];
  constructor(cells:number,state?:EcologyState){
    this.pressure=new Uint8Array(cells);
    this.collapsed=new Uint8Array(cells);
    this.strained=new Uint8Array(cells);
    this.demand=new Uint16Array(cells);
    this.harvest=new Uint32Array(cells);
    if(state){
      this.pressure.set(state.pressure);
      this.collapsed.set(state.collapsed);
      this.strained.set(state.strained);
      this.demand.set(state.demand);
      this.harvest.set(state.harvest);
      this.collapses=state.collapses;
      this.recoveries=state.recoveries;
      this.contested=state.contested;
      this.withheld=state.withheld;
      this.niches=state.niches.map(row=>({...row})) as [Niche,Niche];
    }
  }
  start(){
    this.niches=[emptyNiche(),emptyNiche()];
    this.contested=0;
    this.withheld=0;
  }
  renew(cell:number,growth:number,space:number):number {
    if(!this.strained[cell]&&this.pressure[cell])this.pressure[cell]--;
    this.strained[cell]=0;
    this.demand[cell]=0;
    this.harvest[cell]=0;
    if(this.collapsed[cell]&&this.pressure[cell]<=RECOVER){
      this.collapsed[cell]=0;
      this.recoveries++;
    }
    const possible=Math.min(growth,space);
    const actual=this.collapsed[cell]?Math.min(Math.floor(growth/5),space):possible;
    this.withheld+=possible-actual;
    return actual;
  }
  claim(cell:number,count:number,portion:number){
    this.demand[cell]=Math.min(65535,count);
    this.harvest[cell]=count*portion;
    if(count<2||portion>=650)return;
    this.contested++;
    if(portion>=325)return;
    this.strained[cell]=1;
    const pressure=Math.min(PRESSURE_MAX,this.pressure[cell]+2);
    this.pressure[cell]=pressure;
    if(pressure>=COLLAPSE&&!this.collapsed[cell]){
      this.collapsed[cell]=1;
      this.collapses++;
    }
  }
  feed(traits:Phenotype,velocity:number,portion:number,cost:number){
    const row=this.niches[niche(traits)];
    row.actions++;
    if(velocity>0)row.moved++;
    row.food+=portion;
    row.upkeep+=cost;
  }
  snapshot():EcologyState {
    return {pressure:[...this.pressure],collapsed:[...this.collapsed],strained:[...this.strained],demand:[...this.demand],harvest:[...this.harvest],
      collapses:this.collapses,recoveries:this.recoveries,contested:this.contested,withheld:this.withheld,
      niches:this.niches.map(row=>({...row})) as [Niche,Niche]};
  }
  view(){
    return {pressure:this.pressure,collapsed:this.collapsed,demand:this.demand,harvest:this.harvest,collapses:this.collapses,recoveries:this.recoveries,
      contested:this.contested,withheld:this.withheld,niches:this.niches};
  }
}
export type EcologyView=ReturnType<Ecology['view']>;
