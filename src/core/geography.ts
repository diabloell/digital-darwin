import type { Planet } from './planet.ts';

export const REGIONS = [
  { name: 'Скудные земли', symbol: '··', color: [169,116,85], detail: 'Мало влаги или низкое плодородие' },
  { name: 'Переходные земли', symbol: '—', color: [110,157,103], detail: 'Условия между скудными и влажными плодородными клетками' },
  { name: 'Влажные плодородные земли', symbol: '≈', color: [81,164,170], detail: 'Много влаги, высокая вместимость пищи, умеренный индекс тепла' }
] as const;

export function categorize(layers:Planet['layers']):Uint8Array {
  const {water,fertility,temperature}=layers;
  return Uint8Array.from(water,(wet,i)=>{
    if(wet<40||fertility[i]<28)return 0;
    if(wet>=60&&fertility[i]>=38&&Math.abs(temperature[i]-60)<=12)return 2;
    return 1;
  });
}
