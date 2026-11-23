import { PlanetGlobe, planetSeedHash } from './globe.ts';
import { generatePlanet, planetCell } from '../core/planet.ts';
import { TUNING } from '../core/game.ts';
import type { Habitat } from '../core/game.ts';

const get = <T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const number = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1});

export class WorldWelcome {
  private readonly dialog=get<HTMLDialogElement>('world-welcome');
  private readonly form=get<HTMLFormElement>('welcome-form');
  private readonly seed=get<HTMLInputElement>('welcome-seed');
  private readonly habitat=get<HTMLSelectElement>('welcome-difficulty');
  private readonly globe=new PlanetGlobe(get('welcome-visual'));

  private readonly enter:(seed:string,habitat:Habitat)=>boolean;
  private lastSeed?:string;
  private planet?:ReturnType<typeof generatePlanet>;
  constructor(enter:(seed:string,habitat:Habitat)=>boolean){
    this.enter=enter;
    this.form.oninput=()=>this.render();
    this.form.onsubmit=event=>{
      event.preventDefault();
      if(this.seed.value.trim()&&this.enter(this.seed.value.trim(),this.habitat.value as Habitat))this.dialog.close();
    };
    get('welcome-random').onclick=()=>{
      this.seed.value=Array.from(crypto.getRandomValues(new Uint32Array(2)),n=>n.toString(16).padStart(8,'0')).join('-');
      this.render();
    };
    get('welcome-close').onclick=()=>this.dialog.close();
    get('welcome-advanced').onclick=()=>{
      this.dialog.close();
      const advanced=get<HTMLDetailsElement>('evolution-game');
      advanced.open=true;
      advanced.querySelector('summary')?.focus();
    };
  }
  open(seed:string,habitat:Habitat){
    this.seed.value=seed;
    this.habitat.value=habitat==='scarce'?'scarce':'garden';
    this.dialog.showModal();
    this.render();
    this.globe.reset();
  }
  private render(){
    const seed=this.seed.value.trim();
    const submit=get<HTMLButtonElement>('welcome-create');
    submit.disabled=!seed;
    const changed=seed!==this.lastSeed;
    if(changed||!this.planet){
      this.lastSeed=seed;
      this.planet=generatePlanet(seed,TUNING.width,TUNING.height);
    }
    const planet=this.planet;
    const scale=this.habitat.value==='scarce'?.30:1;
    const stock=planet.layers.fertility.reduce((sum,f)=>sum+planetCell(f,scale).food,0)/1000;
    const hash=planetSeedHash(seed);
    const prefixes=['Астра','Веста','Нерея','Каллисто','Тея','Эос'];
    get('welcome-name').textContent=seed?`${prefixes[hash%prefixes.length]} ${(hash>>>8).toString(36).toUpperCase()}`:'Введите seed';
    const wet=planet.wetCells*100/(TUNING.width*TUNING.height);
    const garden=scale===1?stock:planet.layers.fertility.reduce((sum,f)=>sum+planetCell(f,1).food,0)/1000;
    const band=(value:number,low:number,high:number,labels:[string,string,string])=>labels[value<low?0:value<high?1:2];
    this.fact('light',planet.light*100,band(planet.light*100,70,85,['Мягкий','Умеренный','Яркий']));
    this.fact('heat',planet.temperature*100,band(planet.temperature*100,56,67,['Прохладно','Умеренно','Тепло']));
    this.fact('water',wet,band(wet,30,60,['Редкие','Местами','Обширные']),number.format(wet)+'%');
    this.fact('fertility',planet.meanFertility,band(planet.meanFertility,25,40,['Низкое','Среднее','Высокое']));
    this.fact('food',100*stock/garden,scale===1?'Обычный запас':'Скудный запас',number.format(stock)+' ед.');
    get('welcome-character').textContent=wet>50
      ?'Влажные клетки покрывают больше половины карты.'
      :'Большая часть карты вне влажных зон.';
    if(changed)this.globe.setTerrain(seed,TUNING.width,TUNING.height,planet.layers);
  }
  private fact(key:string,value:number,label:string,raw=number.format(value)){
    get('welcome-'+key).textContent=raw;
    get('welcome-'+key+'-band').textContent=label;
    const meter=get<HTMLMeterElement>('welcome-'+key+'-meter');
    meter.value=value;
    meter.setAttribute('aria-valuetext',label);
  }
}
