import { runSeries } from './runner.ts';
import type { Progress, Series } from './runner.ts';
export type LabCommand={kind:'run';definition:unknown}|{kind:'cancel'};
export type LabEvent={kind:'progress';progress:Progress}|{kind:'result';series:Series}|{kind:'error';message:string};
declare const self:{onmessage:(e:MessageEvent<LabCommand>)=>void;postMessage:(e:LabEvent)=>void};
let busy=false,cancelled=false;
self.onmessage=({data})=>{
  if(data.kind==='cancel'){cancelled=true;return;}
  if(busy)return;
  busy=true;
  cancelled=false;
  void runSeries(data.definition,{
    environment:navigator.userAgent,cancelled:()=>cancelled,
    yieldControl:()=>new Promise(resolve=>setTimeout(resolve,0)),
    progress:progress=>self.postMessage({kind:'progress',progress})
  }).then(series=>self.postMessage({kind:'result',series})).catch(error=>
    self.postMessage({kind:'error',message:String(error)})).finally(()=>{busy=false;});
};
