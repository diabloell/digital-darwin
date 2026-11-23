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
  private readonly globe=get<HTMLCanvasElement>('welcome-globe');

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
    this.render();
    this.dialog.showModal();
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
    let hash=2166136261;
    for(let i=0;i<seed.length;i++)hash=Math.imul(hash^seed.charCodeAt(i),16777619)>>>0;
    const prefixes=['Астра','Веста','Нерея','Каллисто','Тея','Эос'];
    get('welcome-name').textContent=seed?`${prefixes[hash%prefixes.length]} ${(hash>>>8).toString(36).toUpperCase()}`:'Введите seed';
    const pct=(v:number)=>number.format(v);
    get('welcome-light').textContent=pct(planet.light*100);
    get('welcome-heat').textContent=pct(planet.temperature*100);
    get('welcome-water').textContent=pct(planet.wetCells*100/(TUNING.width*TUNING.height))+'%';
    get('welcome-fertility').textContent=pct(planet.meanFertility);
    get('welcome-food').textContent=pct(stock)+' ед.';
    get('welcome-character').textContent=planet.wetCells>TUNING.width*TUNING.height/2
      ?'Влажные зоны занимают больше половины карты. Во влажных клетках рост еды сильнее реагирует на свет.'
      :'Влажные зоны занимают не больше половины карты. Ищите продуктивные пятна на слое плодородия.';
    if(changed)this.paint(planet.layers,hash);
  }
  private paint(layers:ReturnType<typeof generatePlanet>['layers'],hash:number){
    const size=this.globe.width, ctx=this.globe.getContext('2d')!;
    const pixels=ctx.createImageData(size,size);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1;
      const r=u*u+v*v;
      if(r>=1)continue;
      const z=Math.sqrt(1-r);
      const col=Math.floor((Math.atan2(u,z)/(Math.PI*2)+.5)*TUNING.width+hash%TUNING.width)%TUNING.width;
      const row=Math.floor((Math.asin(v)/Math.PI+.5)*TUNING.height);
      const cell=row*TUNING.width+col;
      const wet=layers.water[cell]/100, fertile=layers.fertility[cell]/100, heat=layers.temperature[cell]/100;
      const shade=Math.max(.19,.40+.63*(-.47*u-.32*v+.82*z));
      const edge=(1-z)**3;
      const i=(y*size+x)*4;
      pixels.data[i]=(46+135*heat-98*wet)*shade+28*edge;
      pixels.data[i+1]=(57+125*fertile+57*wet)*shade+49*edge;
      pixels.data[i+2]=(44+145*wet)*shade+61*edge;
      pixels.data[i+3]=255;
    }
    ctx.putImageData(pixels,0,0);
  }
}
