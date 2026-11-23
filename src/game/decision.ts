import { CARDS, TUNING } from '../core/game.ts';
import type { Card } from '../core/game.ts';
import type { Frame } from '../protocol.ts';
import { LEGACY_CARDS } from '../core/tree.ts';

export class EvolutionDecision {
  private readonly dialog=document.querySelector<HTMLDialogElement>('#evolution-decision')!;
  private readonly trigger=document.querySelector<HTMLButtonElement>('#choose-adaptation')!;
  private readonly cards=document.getElementById('decision-cards')!;
  private frame?:Frame;
  private handled=-1;
  private pending=0;
  private serial=0;
  private buying=false;

  private readonly pause:(token:number,epoch:number)=>void;
  private readonly buy:(card:Card)=>void;
  constructor(pause:(token:number,epoch:number)=>void,buy:(card:Card)=>void){
    this.pause=pause;
    this.buy=buy;
    this.trigger.onclick=()=>this.request();
    document.getElementById('decision-later')!.onclick=()=>this.dialog.close();
    this.dialog.addEventListener('close',()=>{
      if(!this.trigger.hidden&&!this.frame?.game?.active)this.trigger.focus();
      else if(this.frame?.game?.active)document.getElementById('play')?.focus({preventScroll:true});
    });
  }
  private offers(frame:Frame){
    const game=frame.game;
    if(!game||game.lost||game.founder===null||game.active)return [];
    const rows=game.tree?game.tree.rows.filter(r=>game.tree!.offered.includes(r.card))
      :LEGACY_CARDS.filter(card=>!game.attempts.some(a=>a.card===card)).map(card=>({
        card:card as Card,quote:{price:TUNING.price,duration:TUNING.duration,prepared:0},reason:''
      }));
    return rows.filter(row=>!row.reason&&row.quote.price<=game.ep);
  }
  get locked(){return Boolean(this.pending||this.dialog.open);}
  update(frame:Frame, blocked:boolean){
    const reset=this.frame?.epoch!==frame.epoch;
    this.frame=frame;
    const offers=this.offers(frame), round=frame.game?.attempts.length??0;
    this.trigger.hidden=!offers.length;
    if(reset){
      this.pending=0; this.buying=false;
      this.handled=offers.length?round:-1;
      if(this.dialog.open)this.dialog.close();
    }
    if(!offers.length){
      this.pending=0; this.buying=false;
      if(this.dialog.open)this.dialog.close();
      return;
    }
    if(this.buying&&frame.game?.receipt&&!frame.game.receipt.accepted){
      this.buying=false;
      if(this.dialog.open)this.render(frame);
    }
    if(!blocked&&this.handled!==round&&!this.pending)this.request();
    if(!blocked&&this.pending===frame.pauseToken&&!frame.running)this.open(frame);
  }
  request(){
    const frame=this.frame;
    if(!frame||!this.offers(frame).length||this.dialog.open)return;
    this.handled=frame.game!.attempts.length;
    this.pending=++this.serial;
    this.pause(this.pending,frame.epoch);
  }
  private open(frame:Frame){
    this.pending=0;
    this.render(frame);
    this.dialog.showModal();
  }
  private render(frame:Frame){
    document.getElementById('decision-context')!.textContent=
      `${frame.game!.ep} EP · тик ${frame.metrics.tick} · ${Math.round(frame.metrics.food).toLocaleString('ru-RU')} ед. пищи в мире`;
    const rows=this.offers(frame).map(({card,quote})=>{
      const node=CARDS[card];
      const article=document.createElement('article');
      const title=document.createElement('h3');
      title.textContent=`${node.major?'◇':({efficiency:'◒',speed:'➜',sensor:'⊙',threshold:'✦'}[node.gene])}  ${node.title}`;
      const benefit=document.createElement('p');benefit.textContent=node.benefit;
      const cost=document.createElement('p');cost.className='decision-cost';cost.textContent=node.cost;
      const details=document.createElement('details'),summary=document.createElement('summary');
      summary.textContent='Как действует';
      details.append(summary,document.createTextNode('Изменение проявляется у части новорождённых. Живые носители могут исчезнуть.'));
      const button=document.createElement('button');
      button.className='primary';
      button.dataset.decisionCard=card;
      button.textContent=`Выбрать · ${quote.price} EP · ${quote.duration} тик.`;
      button.onclick=()=>{
        if(this.buying||!this.frame||this.frame.running||!this.offers(this.frame).some(row=>row.card===card))return;
        this.buying=true;
        this.cards.querySelectorAll('button').forEach(b=>b.disabled=true);
        this.buy(card);
      };
      article.append(title,benefit,cost,details,button);
      return article;
    });
    this.cards.replaceChildren(...rows);
  }
}
