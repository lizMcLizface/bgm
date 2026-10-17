import { seeded } from '../random';
export function phraseLength({choice=4,seed,bar,settings,form}) {
    const remaining=form?form.section.start+form.section.bars-bar:Infinity;
    if(remaining<8||choice===4)return 4;
    if(choice===8)return 8;
    const driving=(settings.bassWeights?.drive??0)>(settings.bassWeights?.whole??0)&&(settings.leadDensity??0)>.5;
    return !driving&&seeded(seed^Math.imul(bar+1,0x6a09e667))()<.65?8:4;
}
