import { seeded } from '../random';

const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const weights={lead:1,counter:.8,pad:.45,bass:.5,perc:.4};

/** A seeded phrase gesture, carried as plain data for inspection/restore. */
export function planPerformance(seed,phrase) {
    const start=phrase?.start??0,role=phrase?.role??'statement';
    const rng=seeded(seed^Math.imul(start+1,0x3c6ef372));
    return {start,bars:phrase?.bars??4,role,peak:(role==='answer'?.4:role==='contrast'?.65:role==='development'?.62:.52)+(rng()-.5)*.12,
        depth:role==='contrast'?.8:role==='recollection'?.7:role==='return'?.85:1};
}

export function gestureAt(plan,position) {
    const t=clamp(position,0,1),u=t<=plan.peak?t/plan.peak:(1-t)/(1-plan.peak);
    return (.5-.5*Math.cos(Math.PI*u)-.5)*plan.depth;
}

/** Shape existing notes; never add attacks, alter pitches, or change gates. */
export function performPhrase(events,{plan,bar,meter,unitSeconds,humanize,groove}) {
    const dynamics=clamp(humanize.velocity??0,0,.25)*3;
    const timing=clamp(humanize.timing??0,0,40)*.18/1000/unitSeconds;
    for(const event of events) {
        const position=((bar-plan.start)+event.beat/meter.units)/plan.bars;
        const gesture=gestureAt(plan,position),weight=weights[event.role]??.5;
        if(dynamics)event.velocity=clamp(event.velocity*(1+gesture*dynamics*weight),.05,1);
        // Exact bar entrances remain anchors. Bass/kick share this warp.
        const warp = event.role !== 'bass' && groove?.profiles[event.role] === 'tight' ? .12 : 1;
        if(timing&&event.beat!==0)event.beat=clamp(event.beat+gesture*timing*warp,
            bar===0||event.role==='perc'?0:-.5,meter.units-.001);
    }
}
