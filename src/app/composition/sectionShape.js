const smooth=x=>x*x*(3-2*x);
export function sectionShape(section) {
    const t=smooth(section.progress),arch=Math.sin(Math.PI*section.progress);
    const gradual=['gradual','speech'].includes(section.strategy),ostinato=section.strategy==='ostinato';
    const type=section.type;
    const activity=type==='intro'?.65+.35*t:type==='build'?.72+.28*t:type==='breakdown'?.86-.12*t:.94+.06*arch;
    const gate=type==='breakdown'?1.2:type==='intro'?1.08:type==='build'?1.04-.2*t:ostinato?.84:1;
    const register=type==='build'?(t>.65?1:0):type==='full'&&!gradual&&arch>.7?1:0;
    return {activity,gate,register,weakKeep:type==='intro'?.65:type==='breakdown'?.7:gradual?.82:1,
        rhythmic:type==='breakdown'?.55:type==='build'?.65+.7*t:ostinato?1.3:1,
        sustain:type==='breakdown'?1.5:type==='intro'?1.25:1,
        prepareBars:section.prepareBars??4};
}

export function shapeSectionSettings(settings, motion) {
    const weights=(values,held)=>Object.fromEntries(Object.entries(values??{}).map(([key,value])=>[key,value*(held.includes(key)?motion.sustain:motion.rhythmic)]));
    return {...settings,leadActivity:settings.leadActivity*motion.activity,
        padWeights:weights(settings.padWeights,['sustain','rolled','stacked']),bassWeights:weights(settings.bassWeights,['whole','half'])};
}

export function shapeSectionNotes(notes,motion,index,protectedBeats=[]) {
    if(!notes.length)return notes;
    const selected=notes.filter((n,i)=>i===0||i===notes.length-1||n.accent||protectedBeats.includes(n.beat)||motion.weakKeep>=1||(i+index)%3!==1);
    const boundary=Math.max(...notes.map(n=>n.beat+n.length));
    return selected.map((n,i)=>({...n,degree:n.degree+motion.register,
        length:Math.min(n.length*motion.gate,boundary-n.beat,selected[i+1]?selected[i+1].beat-n.beat:Infinity)}));
}
