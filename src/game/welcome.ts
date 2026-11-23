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
  private orientation=0;
  private zoom=1;
  private yaw=0;
  private redraw=0;
  private drag?:{id:number;x:number};

  constructor(enter:(seed:string,habitat:Habitat)=>boolean){
    this.enter=enter;
    this.globe.onpointerdown=event=>{
      if(this.drag||event.button!==0)return;
      this.globe.setPointerCapture(event.pointerId);
      this.drag={id:event.pointerId,x:event.clientX};
    };
    this.globe.onpointermove=event=>{
      if(this.drag?.id!==event.pointerId)return;
      this.rotate((event.clientX-this.drag.x)/this.globe.clientWidth*4);
      this.drag.x=event.clientX;
    };
    this.globe.onlostpointercapture=()=>{this.drag=undefined;};
    this.globe.addEventListener('wheel',event=>{
      event.preventDefault();
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?this.globe.clientHeight:1);
      if(delta)this.adjustZoom(Math.exp(-delta*.0015));
    },{passive:false});
    get('globe-left').onclick=()=>this.rotate(-.4);
    get('globe-right').onclick=()=>this.rotate(.4);
    get('globe-in').onclick=()=>this.adjustZoom(1.12);
    get('globe-out').onclick=()=>this.adjustZoom(1/1.12);
    get('globe-reset').onclick=()=>this.resetView();
    this.globe.onkeydown=event=>{
      const controls:Record<string,string>={ArrowLeft:'globe-left',ArrowRight:'globe-right','+':'globe-in','=':'globe-in','-':'globe-out',Home:'globe-reset'};
      if(!Object.hasOwn(controls,event.key))return;
      event.preventDefault();
      get(controls[event.key]).click();
    };
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
    this.resetView();
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
    if(changed){
      this.orientation=hash%TUNING.width;
      this.resetView();
    }
  }
  private fact(key:string,value:number,label:string,raw=number.format(value)){
    get('welcome-'+key).textContent=raw;
    get('welcome-'+key+'-band').textContent=label;
    const meter=get<HTMLMeterElement>('welcome-'+key+'-meter');
    meter.value=value;
    meter.setAttribute('aria-valuetext',label);
  }
  private rotate(delta:number){
    if(!delta)return;
    this.yaw=(this.yaw+delta)%(Math.PI*2);
    this.requestPaint();
  }
  private adjustZoom(factor:number){
    const next=Math.min(1.16,Math.max(.80,this.zoom*factor));
    if(next===this.zoom)return;
    this.zoom=next;
    this.requestPaint();
  }
  private resetView(){
    this.yaw=0;
    this.zoom=1;
    this.requestPaint();
  }
  private requestPaint(){
    if(this.redraw)return;
    this.redraw=requestAnimationFrame(()=>{
      this.redraw=0;
      if(this.dialog.open&&this.planet)this.paint(this.planet.layers);
    });
  }
  private paint(layers:ReturnType<typeof generatePlanet>['layers']){
    const size=this.globe.width, ctx=this.globe.getContext('2d')!;
    const pixels=ctx.createImageData(size,size);
    const radius=.84*this.zoom;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const u=((x+.5)/size*2-1)/radius,v=((y+.5)/size*2-1)/radius;
      const r=u*u+v*v;
      if(r>=1)continue;
      const z=Math.sqrt(1-r);
      const longitude=Math.floor(((Math.atan2(u,z)+this.yaw)/(Math.PI*2)+.5)*TUNING.width)+this.orientation;
      const col=(longitude%TUNING.width+TUNING.width)%TUNING.width;
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
