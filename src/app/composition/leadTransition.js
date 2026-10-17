/** Condense an existing idea before a section boundary, ahead of pitch search.
 * Preserve its endpoints, accents and any already committed tie/resolution.
 */
export function fragmentLead(notes,{gesture,meter,protectedBeats=[]}) {
    if(!gesture||notes.length<4)return notes;
    const index=notes.findLastIndex((n,i)=>i>0&&i<notes.length-1&&!n.accent&&!protectedBeats.includes(n.beat));
    if(index<0)return notes;
    const removed=notes[index],before=notes[index-1];
    return notes.filter((_,i)=>i!==index).map(n=>({...n,length:n===before&&!protectedBeats.includes(n.beat)
        ?Math.min(n.length,Math.max(.04,removed.beat-n.beat-meter.unitsPerBeat*.2)):n.length}));
}
