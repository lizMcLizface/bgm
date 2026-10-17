/** Audio, percussion, timeline and offline consumers share actual plan spans. */
export function planBoundaries(state,bar,endBar=null) {
    const phrase=state.composition?.phrase??state.phrase,section=state.phrase?.section;
    const span=s=>s?{start:s.start,end:s.start+(s.bars??4),bars:s.bars??4,
        opening:bar===s.start,closing:bar===s.start+(s.bars??4)-1}:null;
    return {phrase:span(phrase),section:span(section),
        ...(endBar!==null&&bar>=endBar-1?{ending:{start:endBar-1,arrival:endBar,phase:bar<endBar?'prepare':bar===endBar?'tonic':'tail'}}:{})};
}

/** Leave room for the final tonic rather than preparing an unheard section. */
export function prepareEnding(events,meter) {
    return events.filter(e=>e.beat<meter.units&&(e.role!=='perc'||e.anchor||e.beat===0)).map(e=>({...e,
        length:Math.min(e.length,meter.units-e.beat),velocity:e.velocity*(e.role==='lead'?.94:.88)}));
}
