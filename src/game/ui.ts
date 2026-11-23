import { LEGACY_CARDS } from '../core/tree.ts';
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
    $('evolution-tree').addEventListener('toggle',()=>{
      if(this.frame?.game?.tree && $<HTMLDetailsElement>('evolution-tree').open)this.renderTree(this.frame.game);
    });
    $('game-analysis').addEventListener('toggle',()=>{
      if(this.frame && $<HTMLDetailsElement>('game-analysis').open)this.update(this.frame);
    });
    $('game-form').onsubmit=e=>{
      e.preventDefault();
      if(confirmNew())send({kind:'new-game',seed:$<HTMLInputElement>('game-seed').value.trim(),habitat:$<HTMLSelectElement>('game-habitat').value as Habitat,planet:$<HTMLInputElement>('game-planet').checked,tree:$<HTMLInputElement>('game-tree-mode').checked,ecology:$<HTMLInputElement>('game-ecology').checked});
    };
    $('quick-game').onclick=()=>$<HTMLFormElement>('game-form').requestSubmit();
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
  private renderTree(game:NonNullable<Frame['game']>){
    const rows=game.tree!.rows.map(({card,quote,reason})=>{
      const attempt=game.attempts.find(a=>a.card===card);
      const node=CARDS[card];
      const li=document.createElement('li');
      const title=document.createElement('strong');
      title.textContent=node.title;
      const status=document.createElement('p');
      const observed=attempt
        ?attempt.established===null?'Активна':attempt.carriers?`Присутствует · ${attempt.carriers} нос.`:attempt.peak?'Утрачена':'Попытка без живых носителей'
        :reason?reason:game.tree!.offered.includes(card)?'Доступна':'Вне текущего предложения';
      const terms=attempt?.quote??quote;
      status.textContent=`${observed} · ${terms.price} EP · ${terms.duration} тик.${node.major?` · подготовка ${fmt(100*terms.prepared,0)}%`:''}`;
      const detail=document.createElement('small');
      const sample=game.samples.at(-1)?.traits?.[card];
      const direction=(value:number)=>value>0?'+ '+fmt(value):'− '+fmt(-value);
      detail.textContent=`${node.benefit} (${direction(node.delta)}${node.secondary?', '+direction(node.secondary[1]):''}). ${node.cost}.${sample?` Последний отсчёт носителей: энергия ${fmt(sample.energy)} ед., средний целевой ген ${fmt(sample.gene,3)}${sample.secondary!==undefined?' / '+fmt(sample.secondary,3):''}.`:''}`;
      li.append(title,status,detail);
      return li;
    });
    $('tree-nodes').replaceChildren(...rows);
  }
  update(frame:Frame){
    const previous=this.frame;
    const reset=frame.epoch!==this.frame?.epoch;
    this.frame=frame;
    const game=frame.game;
    if(reset)this.id=game?.receipt?.id??0;
    $('game-panel').hidden=!game;
    $('observer-note').hidden=Boolean(game);
    $('quick-game').hidden=Boolean(game && !game.lost);
    $('quick-game').textContent=game?.lost?'Новая попытка':'Начать игру';
    $('game-analysis').hidden=game?.founder==null;
    $('game-ep').textContent=game?.founder==null?'—':`${game.ep} EP`;
    if(!game)return;
    if(reset||previous?.game?.founder!==game.founder)this.highlight(game.founder);
    if(reset){
      $<HTMLDetailsElement>('evolution-game').open=false;
      $<HTMLInputElement>('game-seed').value=frame.seed;
      $<HTMLInputElement>('game-ecology').checked=Boolean(frame.ecology);
      $<HTMLInputElement>('game-tree-mode').checked=game.version===2;
      $<HTMLInputElement>('game-planet').checked=Boolean(frame.planet);
      $<HTMLSelectElement>('game-habitat').value=game.habitat;
    }
    $('game-choice').hidden=game.founder!==null;
    $('game-dashboard').hidden=game.founder===null;
    const line=game.line,sample=game.samples.at(-1);
    $('game-status').textContent=game.lost?'Линия вымерла. Начните новую игру.':line
      ?`Линия #${line.founder} · поколение ${line.maxGeneration}`:'Выберите основателя, затем запустите время.';
    $('game-pop').textContent=line?`живых ${line.living} · рождений ${line.born-1}`:'';
    $('game-energy').textContent=sample?.energy==null?'Энергия и поддержание · нет отсчёта':`Энергия ${fmt(sample?.energy)} ед. · поддержание ${fmt(sample?.maintenance,3)} ед./тик (последний отсчёт)`;
    $('game-ledger').textContent=`Поколения +${game.renewal} · устойчивые рождения +${game.sustained} · первые потомки +${game.achievement} · потрачено ${game.spent}`;
    $('game-receipt').textContent=game.receipt&&!game.receipt.accepted?game.receipt.reason:'';
    for(const [key,button] of this.buttons){
      const used=game.attempts.some(a=>a.card===key);
      const option=game.tree?.rows.find(row=>row.card===key);
      const price=option?.quote.price??TUNING.price;
      const visible=game.tree?game.tree.offered.includes(key):LEGACY_CARDS.includes(key);
      button.closest('section')!.hidden=!visible;
      button.disabled=game.lost||game.founder===null||game.active!==null||game.ep<price||used;
      button.textContent=used?'Использована':`${price} EP · начать`;
      button.title=option&&CARDS[key].major?`${option.quote.duration} тик. · подготовка ${fmt(100*option.quote.prepared,0)}%`:'';
    }
    const tree=$<HTMLDetailsElement>('evolution-tree');
    tree.hidden=!game.tree;
    if(game.tree){
      $('tree-progress').textContent=`${Math.min(10,game.tree.completed)}/10 завершённых программ. Развилка требует 800 тиков и 10 потомков.`;
      if(tree.open)this.renderTree(game);
    }
    const active=game.attempts.find(a=>a.card===game.active);
    const progress=$<HTMLProgressElement>('game-progress');
    progress.hidden=!active;
    progress.max=active?active.end-active.start:TUNING.duration;
    progress.value=active?frame.metrics.tick-active.start:0;
    $('game-programme').textContent=active?`${CARDS[active.card].title} · ${progress.value}/${progress.max} тиков · носители ${active.carriers}/${line?.living??0}`
      :game.lost?'Программы остановлены':game.attempts.length?'Можно выбрать следующую карту при наличии EP':'Программа пока не начата';
    const attempts=game.attempts.map(a=>{
      const li=document.createElement('li');
      const share=line?.living?a.carriers/line.living*100:0;
      const result=a.established===null?'идёт':a.established?'закрепилась':a.peak&&!a.carriers?'утрачена':'не закрепилась';
      li.textContent=`${a.quote?`Тики ${a.start}–${a.finished??a.end} · ${a.quote.price} EP · `:''}${CARDS[a.card].title} · ${a.carriers}/${line?.living??0} (${fmt(share)}%) · ${result}${a.established&&!a.carriers?' при завершении, затем утрачена':''}`;
      return li;
    });
    $('game-attempts').replaceChildren(...attempts);
    if (!$<HTMLDetailsElement>('game-analysis').open) return;
    table($('game-samples'),['Тик','Энергия','Усвоение','Скорость','Порог','Носителей'],game.samples.slice(-10).reverse().map(s=>[
      String(s.tick),fmt(s.energy),fmt(s.values?.efficiency,3),fmt(s.values?.speed,3),fmt(s.values?.threshold),String(s.carriers)
    ]));
  }
}
