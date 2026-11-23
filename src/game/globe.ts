import type { Planet } from '../core/planet.ts';

export function planetSeedHash(seed:string){
  let hash=2166136261;
  for(let i=0;i<seed.length;i++)hash=Math.imul(hash^seed.charCodeAt(i),16777619)>>>0;
  return hash;
}

const pitchLimit=55*Math.PI/180;
const keys:Record<string,string>={
  ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',
  '+':'in','=':'in','-':'out',Home:'reset'
};

export class PlanetGlobe {
  private readonly canvas:HTMLCanvasElement;
  private terrain?:{layers:Planet['layers'];width:number;height:number};
  private orientation=0;
  private yaw=0;
  private pitch=0;
  private zoom=1;
  private redraw=0;
  private drag?:{id:number;x:number;y:number};

  constructor(root:HTMLElement){
    this.canvas=root.querySelector('canvas')!;
    const canvas=this.canvas;
    const controls:Record<string,()=>void>={
      left:()=>this.rotate(.4,0),right:()=>this.rotate(-.4,0),
      up:()=>this.rotate(0,.32),down:()=>this.rotate(0,-.32),
      in:()=>this.adjustZoom(1.12),out:()=>this.adjustZoom(1/1.12),reset:()=>this.reset()
    };
    root.querySelectorAll<HTMLButtonElement>('button[data-globe-action]').forEach(button=>{
      button.onclick=controls[button.dataset.globeAction!];
    });
    canvas.onkeydown=event=>{
      if(!Object.hasOwn(keys,event.key))return;
      event.preventDefault();
      controls[keys[event.key]]();
    };
    canvas.onpointerdown=event=>{
      if(this.drag||event.button!==0)return;
      canvas.setPointerCapture(event.pointerId);
      this.drag={id:event.pointerId,x:event.clientX,y:event.clientY};
    };
    canvas.onpointermove=event=>{
      if(this.drag?.id!==event.pointerId)return;
      this.rotate(-4*(event.clientX-this.drag.x)/canvas.clientWidth,-4*(event.clientY-this.drag.y)/canvas.clientHeight);
      this.drag.x=event.clientX;
      this.drag.y=event.clientY;
    };
    canvas.onlostpointercapture=()=>{this.drag=undefined;};
    canvas.addEventListener('wheel',event=>{
      event.preventDefault();
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?canvas.clientHeight:1);
      if(delta)this.adjustZoom(Math.exp(-delta*.0015));
    },{passive:false});
  }

  setTerrain(seed:string,width:number,height:number,layers:Planet['layers']){
    this.terrain={layers,width,height};
    this.orientation=planetSeedHash(seed)%width;
    this.reset();
    this.requestPaint();
  }

  reset(){
    if(!this.yaw&&!this.pitch&&this.zoom===1)return;
    this.yaw=0;
    this.pitch=0;
    this.zoom=1;
    this.requestPaint();
  }

  private rotate(dx:number,dy:number){
    const pitch=Math.min(pitchLimit,Math.max(-pitchLimit,this.pitch+dy));
    if(!dx&&pitch===this.pitch)return;
    this.yaw=(this.yaw+dx)%(2*Math.PI);
    this.pitch=pitch;
    this.requestPaint();
  }

  private adjustZoom(factor:number){
    const zoom=Math.min(1.16,Math.max(.80,this.zoom*factor));
    if(zoom===this.zoom)return;
    this.zoom=zoom;
    this.requestPaint();
  }

  private requestPaint(){
    if(this.redraw)return;
    this.redraw=requestAnimationFrame(()=>{
      this.redraw=0;
      if(this.terrain){
        const {layers,width,height}=this.terrain;
        this.paint(layers,width,height);
      }
    });
  }

  private paint(layers:Planet['layers'], width:number, height:number){
    const size=this.canvas.width, ctx=this.canvas.getContext('2d')!;
    const pixels=ctx.createImageData(size,size);
    const radius=.84*this.zoom;
    const sin=Math.sin(this.pitch), cos=Math.cos(this.pitch);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const u=((x+.5)/size*2-1)/radius,v=((y+.5)/size*2-1)/radius;
      const r=u*u+v*v;
      if(r>=1)continue;
      const z=Math.sqrt(1-r);
      const vertical=v*cos+z*sin, depth=z*cos-v*sin;
      const longitude=Math.floor(((Math.atan2(u,depth)+this.yaw)/(Math.PI*2)+.5)*width)+this.orientation;
      const col=(longitude%width+width)%width;
      const row=Math.min(height-1,Math.floor((Math.asin(Math.max(-1,Math.min(1,vertical)))/Math.PI+.5)*height));
      const cell=row*width+col;
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
