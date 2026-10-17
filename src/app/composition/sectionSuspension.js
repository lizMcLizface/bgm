import { notesInRange, pentatonicOf } from '../arranger';

/** Extend an eligible closing chord tone, with a bounded pitch adjustment,
 * to prepare a stepwise resolution in the next section before booking it.
 * The arrival is previewed without consuming the live conductor's random stream.
 */
export function prepareSectionSuspension({bar,events,chord,arrival,meter,bpm,range,settings,protectedBeats=[]}) {
    const lead=events.filter(e=>e.role==='lead'),last=lead.at(-1);
    const next=arrival.events.filter(e=>e.role==='lead');
    const mode=next[1]&&next[1].beat<=meter.unitsPerBeat*1.5?'existing':'delay';
    const landing=mode==='existing'?next[1]:next[0]?{...next[0],beat:meter.unitsPerBeat*.5}:null;
    if(!last||!next.length||next[0].beat!==0||!landing||landing.beat<=0||landing.beat>meter.unitsPerBeat*1.5
        ||protectedBeats.includes(last.beat)||meter.units-last.beat-last.length>meter.unitsPerBeat*.25
        ||last.length>meter.units-last.beat+.001||!chord.pitchClasses.includes(last.midi%12))return null;
    const pcs=settings.leadScale==='pentatonic'?pentatonicOf(arrival.chord.scalePcs):arrival.chord.scalePcs;
    const oldPcs=settings.leadScale==='pentatonic'?pentatonicOf(chord.scalePcs):chord.scalePcs;
    const allowed=notesInRange(pcs,...range);
    const candidates=allowed.filter(m=>Math.abs(m-last.midi)<=4&&oldPcs.includes(m%12)&&chord.pitchClasses.includes(m%12)
        &&!arrival.chord.pitchClasses.includes(m%12)).sort((a,b)=>Math.abs(a-last.midi)-Math.abs(b-last.midi)||a-b);
    let held,midi;
    for(const candidate of candidates){
        const at=allowed.indexOf(candidate),target=[allowed[at-1],allowed[at+1]].find(m=>m!==undefined
            &&Math.abs(candidate-m)<=2&&arrival.chord.pitchClasses.includes(m%12));
        if(target!==undefined){held=candidate;midi=target;break;}
    }
    if(midi===undefined)return null;
    const length=meter.units-last.beat+(landing.beat-meter.unitsPerBeat*.03)*bpm/arrival.bpm;
    return {kind:'section-suspension',section:true,mode,originalMidi:last.midi,motion:midi<held?'down':'up',from:{bar,beat:last.beat,midi:held},
        to:{bar:bar+1,beat:landing.beat,midi},length};
}

/** Consume the explicit handoff before ensemble rhythm/joint pitch planning. */
export function landSectionSuspension(events,{pending,bar,chord,range,settings,meter,previousMidi}) {
    if(!pending||pending.to.bar!==bar||previousMidi!==pending.from.midi||!events.length)return null;
    const pcs=settings.leadScale==='pentatonic'?pentatonicOf(chord.scalePcs):chord.scalePcs;
    const allowed=notesInRange(pcs,...range),at=allowed.indexOf(pending.from.midi);
    if(at<0)return null;
    const choices=[allowed[at-1],allowed[at+1]].filter(m=>m!==undefined&&Math.abs(m-pending.from.midi)<=2&&chord.pitchClasses.includes(m%12));
    choices.sort((a,b)=>Math.abs(a-pending.to.midi)-Math.abs(b-pending.to.midi)||a-b);
    const midi=choices[0];if(midi===undefined)return null;
    const beat=pending.to.beat;
    let target=events.find(e=>e.beat===beat);
    if(!target&&events[0].beat===0&&(events[1]?.beat??meter.units)>beat)target=events[0];
    if(!target)return null;
    const next=events.find(e=>e.beat>beat),end=Math.min(meter.units,next?.beat??Infinity);
    const changed={...target,beat,midi,length:Math.min(target.length,end-beat)};
    if(changed.length<=0)return null;
    return {events:[changed,...events.filter(e=>e.beat>beat)],resolution:{...pending,to:{bar,beat,midi}}};
}

/** Update the current bar and its pitch-plan caches before notes are booked. */
export function commitSectionSuspension(events,state,suspension,bar) {
    const matches=e=>e.role==='lead'&&e.beat===suspension.from.beat&&e.midi===suspension.originalMidi;
    const change=e=>({...e,midi:suspension.from.midi,length:suspension.length});
    for(const e of events)if(matches(e)){e.length=suspension.length;e.midi=suspension.from.midi;}
    state.leadMidi=suspension.from.midi;
    const c=state.composition;
    c.sectionSuspension=suspension;
    c.melody={...c.melody,resolutions:[...(c.melody.resolutions??[]),suspension],bars:c.melody.bars.map(b=>b.bar===bar
        ?{...b,events:b.events.map(e=>matches(e)?change(e):e)}:b),
        destination:c.melody.destination?.bar===bar?{...c.melody.destination,midi:suspension.from.midi}:c.melody.destination};
    if(c.joint)c.joint={...c.joint,bars:c.joint.bars.map(b=>b.bar===bar
        ?{...b,lead:b.lead.map(e=>matches(e)?change(e):e)}:b)};
}
