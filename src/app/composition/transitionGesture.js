import { groupStarts } from '../meter';

export function transitionGesture(section, bar) {
    if (!section) return null;
    const end=section.start+section.bars;
    const kind=section.nextType==='breakdown'?'release':section.nextType==='full'&&section.type!=='full'?'gather':null;
    if(!kind||bar<end-2||bar>=end)return null;
    return {kind,start:end-2,end,destination:section.nextType,step:bar-(end-2)};
}

/** Thin one weak attack group, then lighten the final tail. Preserve the
 * entrance, final idea and metrical anchors; never add attacks or touch held pads.
 */
export function gesturePart(events,{gesture,meter,style,enabled=true}) {
    if(!gesture||!enabled||!events.length||['sustain','rolled','stacked','harmony'].includes(style))return events;
    const groups=[...new Set(events.map(e=>e.beat))].sort((a,b)=>a-b),anchors=groupStarts(meter);
    const weak=groups.slice(1,-1).filter(at=>!anchors.includes(at));
    const removed=weak.at(-1),previous=groups[groups.indexOf(removed)-1];
    const beat=meter.unitsPerBeat,tail=(gesture.kind==='release'?.3:.55)*beat;
    return events.filter(e=>e.beat!==removed).map(e=>({...e,
        length:Math.min(e.length,e.beat===previous?Math.max(.04,removed-e.beat-beat*.15):Infinity,
            gesture.step===1&&e.beat===groups.at(-1)?tail:Infinity),
        velocity:e.velocity*(gesture.step===1?.86:.94)}));
}
