import { EVENT_LABELS } from '../history-panel.ts';
import { PLANET_MAX_CAPACITY } from '../core/planet.ts';
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
    const seedInput=$<HTMLInputElement>('game-seed');
    const habitat=$<HTMLSelectElement>('game-habitat');
    const randomSeed=()=>Array.from(crypto.getRandomValues(new Uint32Array(2)),n=>n.toString(16).padStart(8,'0')).join('-');
    const start=(release:boolean,seed=seedInput.value.trim(),retry=false)=>{
      const frame=this.frame;
      if(!retry&&!$<HTMLFormElement>('game-form').reportValidity())return;
      if(!seed){seedInput.setCustomValidity('Введите seed мира');seedInput.reportValidity();return;}
      if(!confirmNew())return;
      send({kind:'new-game',seed,habitat:retry?frame!.game!.habitat:habitat.value as Habitat,release,
        planet:retry?Boolean(frame?.planet):$<HTMLInputElement>('game-planet').checked,
        tree:retry?frame?.game?.version===2:$<HTMLInputElement>('game-tree-mode').checked,
        ecology:retry?Boolean(frame?.ecology):$<HTMLInputElement>('game-ecology').checked});
    };
    seedInput.oninput=()=>seedInput.setCustomValidity('');
    $('random-seed').onclick=()=>{seedInput.value=randomSeed();seedInput.setCustomValidity('');};
    $('game-form').onsubmit=e=>{e.preventDefault();start(false);};
    $('quick-game').onclick=()=>start(true);
    $('game-release-start').onclick=()=>start(true);
    $('retry-seed').onclick=()=>{if(this.frame?.game)start(this.frame.game.version===3,this.frame.seed,true);};
    $('retry-random').onclick=()=>{if(this.frame?.game)start(this.frame.game.version===3,randomSeed(),true);};
    this.founder.onchange=()=>this.previewFounder();
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
  private previewFounder(){
    const f=this.frame;
    $('founder-preview').hidden=!f?.game||f.game.founder!==null;
    if(!f?.game||f.game.founder!==null)return;
    const index=f.ids.indexOf(Number(this.founder.value));
    if(index<0)return;
    const x=Math.floor(f.positions[index*4]),y=Math.floor(f.positions[index*4+1]);
    const food=f.food[y*f.width+x]*(f.planet?PLANET_MAX_CAPACITY/255:28)/1000;
    $('founder-preview').textContent=`Клетка ${x}, ${y} · около ${fmt(food)} ед. пищи сейчас. Выбор линии сохраняется до конца игры.`;
    this.highlight(Number(this.founder.value));
  }
  private debrief(frame:Frame){
    const game=frame.game!;
    const node=$('game-debrief');
    node.hidden=!game.lost;
    if(!game.lost)return;
    const observations=game.samples.filter(s=>s.energy!==null);
    const first=observations[0],last=observations.at(-1);
    const worldStart=frame.history[0], eco=frame.ecology;
    const line=game.line!;
    const rows=[
      ['Мир',`${frame.seed} · линия #${line.founder}`],
      ['Длительность',`${frame.metrics.tick} тик. · поколение ${line.maxGeneration}`],
      ['Линия',`${line.born-1} рождений · ${line.deaths} смертей · живых ${line.living}`],
      ['Адаптации',`${game.attempts.length} попыток · ${game.attempts.filter(a=>a.established).length} закрепились к концу программ · 0 живых носителей`],
      ['Баланс EP',`${game.ep} осталось · ${game.spent} потрачено`],
      ['Энергия линии',last?`${fmt(first.energy)} → ${fmt(last.energy)} ед. (живые, тики ${first.tick}–${last.tick})`:'Нет двух живых отсчётов'],
      ['Пища мира',`${fmt(worldStart.food)} → ${fmt(frame.metrics.food)} ед. (тики ${worldStart.tick}–${frame.metrics.tick})`]
    ];
    const event=frame.recentEvents[0];
    if(event)rows.push(['Последнее событие мира',`Тик ${event.tick} · ${EVENT_LABELS[event.kind]}`]);
    if(eco)rows.push(['Давление',`${eco.collapses-eco.recoveries} клеток в кризисе · ${eco.recoveries} выходов за прохождение`]);
    const children=rows.flatMap(([name,value])=>{
      const dt=document.createElement('dt'),dd=document.createElement('dd');
      dt.textContent=name;dd.textContent=value;return [dt,dd];
    });
    $('debrief-results').replaceChildren(...children);

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
    if(reset){ $('game-debrief').hidden=true; this.id=game?.receipt?.id??0; }
    $('game-panel').hidden=!game;
    $('observer-note').hidden=Boolean(game);
    $('launch-row').hidden=Boolean(game);
    $('game-analysis').hidden=game?.founder==null;
    $('game-ep').textContent=game?.founder==null?'—':`${game.ep} EP`;
    if(!game)return;
    if(reset||previous?.game?.founder!==game.founder)this.highlight(game.founder);
    if(reset){
      $<HTMLDetailsElement>('evolution-game').open=false;
      $<HTMLInputElement>('game-seed').value=frame.seed;
      $<HTMLInputElement>('game-ecology').checked=Boolean(frame.ecology);
      $<HTMLInputElement>('game-tree-mode').checked=game.version>=2;
      $<HTMLInputElement>('game-planet').checked=Boolean(frame.planet);
      $<HTMLSelectElement>('game-habitat').value=game.habitat;
    }
    $('game-choice').hidden=game.founder!==null;
    if(reset||previous?.game?.founder!==game.founder)this.previewFounder();
    if(reset||!previous?.game?.lost)this.debrief(frame);
    $('game-dashboard').hidden=game.founder===null;
    const line=game.line,sample=game.samples.at(-1);
    $('game-status').textContent=game.lost?'Линия вымерла. Начните новую игру.':line
      ?`Линия #${line.founder} · поколение ${line.maxGeneration}`:'Выберите основателя, затем запустите время.';
    $('game-pop').textContent=line?`живых ${line.living} · рождений ${line.born-1}`:'';
    $('game-energy').textContent=sample?.energy==null?'Энергия и поддержание · нет отсчёта':`Энергия ${fmt(sample?.energy)} ед. · поддержание ${fmt(sample?.maintenance,3)} ед./тик (последний отсчёт)`;
    $('game-ledger').textContent=`Поколения +${game.renewal} · устойчивые рождения +${game.sustained} · первые потомки +${game.achievement}${game.birthEP===undefined?'':` · ранние рождения +${game.birthEP}`} · потрачено ${game.spent}`;
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
      $('tree-progress').textContent=`${Math.min(10,game.tree.completed)}/10 завершённых программ. Развилка требует 800 тиков и ${game.tree.requiredBirths??10} потомков.`;
      if(tree.open)this.renderTree(game);
    }
    const active=game.attempts.find(a=>a.card===game.active);
    const eligible=game.tree?.rows.filter(r=>game.tree!.offered.includes(r.card))??[];
    $('game-next').textContent=game.lost?'':active?'Следующий выбор откроется после завершения программы.'
      :eligible.length?(eligible.some(r=>r.quote.price<=game.ep)?'Можно выбрать адаптацию.':'Недостаточно EP. Рождения и поколения пополняют баланс.')
      :game.tree?.completed===10&&!game.attempts.some(a=>CARDS[a.card].major)?'Малые программы закончены. Для развилки нужны новые потомки.'
      :game.tree&&game.attempts.some(a=>CARDS[a.card].major)?'Направление выбрано. Наблюдайте за живыми носителями.':'';
    const progress=$<HTMLProgressElement>('game-progress');
    progress.hidden=!active;
    progress.max=active?active.end-active.start:TUNING.duration;
    progress.value=active?frame.metrics.tick-active.start:0;
    $('game-programme').textContent=active?`${CARDS[active.card].title} · ${progress.value}/${progress.max} тиков · носители ${active.carriers}/${line?.living??0}`
      :game.lost?'Программы остановлены':game.attempts.length?'Можно выбрать следующую карту при наличии EP':'Программа пока не начата';
    const attempts=game.attempts.map(a=>{
      const li=document.createElement('li');
      const share=line?.living?a.carriers/line.living*100:0;
      const result=a.established===null?'идёт':a.established?'закрепилась':a.peak&&!a.carriers?'утрачена':!a.introduced?'завершилась без внедрений':a.carriers?'частично сохранилась':'не закрепилась';
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
