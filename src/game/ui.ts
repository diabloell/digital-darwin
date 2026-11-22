import { CARDS,TUNING } from '../core/game.ts';
import type { Card,Habitat } from '../core/game.ts';
import type { Command,Frame } from '../protocol.ts';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const fmt=(v:number|null|undefined,n=2)=>v==null?'—':v.toLocaleString('ru-RU',{maximumFractionDigits:n});

function table(target:HTMLElement,labels:string[],rows:string[][]){
  const el=document.createElement('table'), header=el.createTHead().insertRow(),body=el.createTBody();
  for(const label of labels){const th=document.createElement('th');th.scope='col';th.textContent=label;header.append(th);}
  for(const row of rows){const tr=body.insertRow();for(const value of row)tr.insertCell().textContent=value;}
  target.replaceChildren(el);
}
export class GamePanel {
  private frame:Frame|undefined;
  private id=0;
  private readonly buttons=new Map<Card,HTMLButtonElement>();
  private readonly founder=$<HTMLSelectElement>('game-founder');
  private readonly highlight:(founder:number|null)=>void;
  constructor(send:(c:Command)=>void,confirmNew:()=>boolean,highlight:(founder:number|null)=>void){
    this.highlight=highlight;
    for(let i=1;i<=TUNING.founders;i++)this.founder.add(new Option('Основатель #'+i,String(i)));
    const dispatch=(action:Omit<Extract<Command,{kind:'game-action'}>['action'],'id'> & {card?:Card;founder?:number})=>{
      if(!this.frame?.game)return;
      const epoch=this.frame.epoch,id=++this.id;
      if(action.kind==='choose')send({kind:'game-action',epoch,action:{id,kind:'choose',founder:action.founder!}});
      else send({kind:'game-action',epoch,action:{id,kind:'buy',card:action.card!}});
    };
    $('game-form').onsubmit=e=>{
      e.preventDefault();
      if(confirmNew())send({kind:'new-game',seed:$<HTMLInputElement>('game-seed').value.trim(),habitat:$<HTMLSelectElement>('game-habitat').value as Habitat});
    };
    $('game-choose').onclick=()=>dispatch({kind:'choose',founder:Number(this.founder.value)});
    for(const [key,c] of Object.entries(CARDS) as [Card,typeof CARDS[Card]][]){
      const panel=document.createElement('section'),title=document.createElement('h3'),text=document.createElement('p'),button=document.createElement('button');
      title.textContent=c.title;
      text.textContent=`${c.benefit}. ${c.cost}.`;
      button.textContent=`${TUNING.price} EP · начать`;
      button.dataset.card=key;
      button.onclick=()=>dispatch({kind:'buy',card:key});
      panel.append(title,text,button);
      $('game-cards').append(panel);
      this.buttons.set(key,button);
    }
  }
  update(frame:Frame){
    const previous=this.frame;
    const reset=frame.epoch!==this.frame?.epoch;
    this.frame=frame;
    const game=frame.game;
    if(reset)this.id=game?.receipt?.id??0;
    $('game-panel').hidden=!game;
    if(!game)return;
    if(reset||previous?.game?.founder!==game.founder)this.highlight(game.founder);
    if(reset){
      $<HTMLDetailsElement>('evolution-game').open=true;
      $<HTMLInputElement>('game-seed').value=frame.seed;
      $<HTMLSelectElement>('game-habitat').value=game.habitat;
    }
    $('game-choice').hidden=game.founder!==null;
    $('game-dashboard').hidden=game.founder===null;
    const line=game.line,sample=game.samples.at(-1);
    $('game-status').textContent=game.lost?'Линия вымерла. Начните новую игру.':line
      ?`Линия #${line.founder} · поколение ${line.maxGeneration}`:'Выберите основателя, затем запустите время.';
    $('game-ep').textContent=`${game.ep} EP`;
    $('game-pop').textContent=line?`живых ${line.living} · рождений ${line.born-1}`:'';
    $('game-energy').textContent=`Энергия ${fmt(sample?.energy)} ед. · поддержание ${fmt(sample?.maintenance,3)} ед./тик (последний отсчёт)`;
    $('game-ledger').textContent=`Поколения +${game.renewal} · устойчивые рождения +${game.sustained} · первые потомки +${game.achievement} · потрачено ${game.spent}`;
    $('game-receipt').textContent=game.receipt&&!game.receipt.accepted?game.receipt.reason:'';
    for(const [key,button] of this.buttons){
      const used=game.attempts.some(a=>a.card===key);
      button.disabled=game.lost||game.founder===null||game.active!==null||game.ep<TUNING.price||used;
      button.textContent=used?'Использована':`${TUNING.price} EP · начать`;
    }
    const active=game.attempts.find(a=>a.card===game.active);
    $('game-programme').textContent=active?`${CARDS[active.card].title} · ${frame.metrics.tick-active.start}/${TUNING.duration} тиков · новых носителей ${active.introduced}`
      :game.attempts.length?'Программа завершена. Следующая карта доступна при наличии EP.':'Программа пока не начата.';
    table($('game-attempts'),['Карта','Носители сейчас','Пик','После программы'],game.attempts.map(a=>[
      CARDS[a.card].title,`${a.carriers}/${line?.living??0} (${fmt(line?.living?a.carriers/line.living*100:0)}%)`,String(a.peak),
      a.established===null?'Идёт':a.established?`Закрепилась при завершении${a.carriers?'':' · утрачена'}`
        :a.peak&&!a.carriers?'Не закрепилась · утрачена':'Не закрепилась'
    ]));
    table($('game-samples'),['Тик','Энергия','Усвоение','Скорость','Порог','Носителей'],game.samples.slice(-10).reverse().map(s=>[
      String(s.tick),fmt(s.energy),fmt(s.values?.efficiency,3),fmt(s.values?.speed,3),fmt(s.values?.threshold),String(s.carriers)
    ]));
  }
}
