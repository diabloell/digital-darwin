import type { Genome } from './genetics.ts';

type Node = {
  title:string; gene:keyof Genome; delta:number; benefit:string; cost:string;
  requires?:string; track?:'local'|'explorer'; secondary?:readonly [keyof Genome,number]; major?:true;
};
const legacy = {
  nutrition:{title:'Усвоение',gene:'efficiency',delta:.06,benefit:'Больше энергии из каждой порции',cost:'Дороже поддерживать усвоение',track:'local'},
  mobility:{title:'Подвижность',gene:'speed',delta:.13,benefit:'Больше клеток за шаг',cost:'Движение расходует больше энергии',track:'explorer'},
  fertility:{title:'Раннее размножение',gene:'threshold',delta:-3,benefit:'Рождение при меньшем запасе',cost:'Меньше запас родителя и вклад в потомка',track:'local'}
} as const;
const additions = {
  perception:{title:'Широкий обзор',gene:'sensor',delta:.65,benefit:'Пища видна дальше',cost:'Дороже поддерживать сенсоры',track:'explorer'},
  thrift:{title:'Экономный обмен',gene:'efficiency',delta:-.045,benefit:'Дешевле поддержание',cost:'Меньше энергии из порции',requires:'nutrition',track:'explorer'},
  retention:{title:'Высокий резерв',gene:'threshold',delta:3,benefit:'Больше резерва к моменту рождения',cost:'Рождение откладывается',requires:'fertility'},
  patrol:{title:'Размеренный ход',gene:'speed',delta:-.12,benefit:'Ниже затраты движения',cost:'Меньше клеток за тик',requires:'mobility',track:'local'},
  patches:{title:'Ближний обзор',gene:'sensor',delta:-.65,benefit:'Дешевле поддержание сенсоров',cost:'Меньше радиус поиска',requires:'perception',track:'local'},
  scavenging:{title:'Интенсивное усвоение',gene:'efficiency',delta:.045,benefit:'Выше отдача от еды',cost:'Растёт метаболическая цена',requires:'thrift',track:'local'},
  sprint:{title:'Быстрый переход',gene:'speed',delta:.16,benefit:'Быстрее переход между пятнами',cost:'Растут квадратичные затраты движения',requires:'patrol',track:'explorer'},
  survey:{title:'Дальний поиск',gene:'sensor',delta:.8,benefit:'Больше радиус проб пищи',cost:'Дороже сенсорное поддержание',requires:'patches',track:'explorer'},
  brood:{title:'Малый порог рождения',gene:'threshold',delta:-3.5,benefit:'Рождение при меньшей энергии',cost:'Меньше запас на рождение',requires:'retention',track:'local'},
  local:{title:'Хранители пятен',gene:'efficiency',delta:.085,secondary:['threshold',-4.5],major:true,track:'local',
    benefit:'Выше отдача от порции и раньше рождение',cost:'Выше поддержание и меньше резерв при раннем рождении'},
  explorer:{title:'Дальние разведчики',gene:'speed',delta:.24,secondary:['sensor',1.25],major:true,track:'explorer',
    benefit:'Дальше поиск и быстрее переходы',cost:'Дороже движение и сенсоры, меньше энергии остаётся на рождение'}
} as const;
export const LEGACY_CARDS = Object.keys(legacy);
export const CARDS:Record<keyof typeof legacy|keyof typeof additions,Node> = {...legacy,...additions};
export type Card=keyof typeof CARDS;
export const FORK_AFTER = 10;
export const MINOR_TICKS = 80;
export const MINOR_PRICE = 1;
export type Quote = {price:number;duration:number;prepared:number};
