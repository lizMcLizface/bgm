import { notesInRange, pentatonicOf } from '../arranger';
import { seeded } from '../random';

/** Introduce only prepared or step-resolving tensions; no new note attacks. */
export function resolveMelody(plan,{bars,meter,range,settings,seed,chance=.6,pending=[],previousMidi}) {
    const result={...plan,bars:plan.bars.map(b=>({...b,events:b.events.map(e=>({...e}))})),resolutions:[]};
    const rng=seeded(seed^Math.imul(bars[0].bar+1,0x5be0cd19)),used=new Set();
    const group=bar=>Math.floor(bar/2),allowed=b=>notesInRange(settings.leadScale==='pentatonic'?pentatonicOf(b.scalePcs):b.scalePcs,...range);
    const chordTone=(m,b)=>b.chord.pitchClasses.includes(m%12);
    const step=(a,b,scale)=>Math.abs(scale.indexOf(a)-scale.indexOf(b))===1&&scale.includes(a)&&scale.includes(b)&&Math.abs(a-b)<=3;
    const at=(bar,event)=>({bar,beat:event.beat,midi:event.midi});
    const add=(kind,source,from,target,to)=>{
        result.resolutions.push({kind,from:at(source,from),to:at(target,to)});
        used.add(group(source));used.add(group(target));
    };
    // A held preparation already emitted in an earlier bar must survive a
    // longer forecast becoming available. Reconcile its landing with edits.
    const incoming=pending.find(r=>r.kind==='suspension'&&r.to.bar===bars[0].bar&&r.from.bar<bars[0].bar&&r.from.midi===previousMidi);
    if(incoming){
        const b=bars[0],scale=allowed(b),events=result.bars[0].events,target=events.find(e=>e.beat===incoming.to.beat);
        const choices=scale.filter(m=>chordTone(m,b)&&step(incoming.from.midi,m,scale)).sort((a,b)=>Math.abs(a-incoming.to.midi)-Math.abs(b-incoming.to.midi)||a-b);
        if(target&&choices.length){target.midi=choices[0];result.bars[0].events=events.filter(e=>e.beat>=target.beat);
            add('suspension',incoming.from.bar,incoming.from,b.bar,target);}
    }
    // Across-bar gestures require both sides of a known change in the same phrase.
    for(let i=0;i+1<bars.length;i++){
        const a=bars[i],b=bars[i+1],left=result.bars[i].events,right=result.bars[i+1].events,last=left.at(-1);
        if(!last||!right.length||right[0].beat!==0||used.has(group(a.bar))||used.has(group(b.bar))||rng()>=chance
            ||JSON.stringify(a.chord.pitchClasses)===JSON.stringify(b.chord.pitchClasses))continue;
        const scale=allowed(b),endGap=meter.units-last.beat-last.length;
        const protectedLast=b.midpoint||plan.destination?.closing&&plan.destination.bar===b.bar;
        if(right.length>=2&&!(protectedLast&&right.length===2)&&endGap<meter.unitsPerBeat*.25
            &&chordTone(last.midi,a)&&!chordTone(last.midi,b)&&scale.includes(last.midi)
            &&right[1].beat>0&&right[1].beat<=meter.unitsPerBeat*1.5){
            const targets=scale.filter(m=>chordTone(m,b)&&step(last.midi,m,scale)).sort((x,y)=>Math.abs(x-right[1].midi)-Math.abs(y-right[1].midi)||x-y);
            if(targets.length){
                const tempoRatio=a.bpm&&b.bpm?a.bpm/b.bpm:1;
                right[1].midi=targets[0];last.length=meter.units-last.beat+(right[1].beat-meter.unitsPerBeat*.03)*tempoRatio;
                add('suspension',a.bar,last,b.bar,right[1]);right.shift();continue;
            }
        }
        const before=left.at(-2),landing=right[0],currentScale=allowed(a);
        if(before&&last.length<=meter.unitsPerBeat*.75&&endGap<meter.unitsPerBeat*.2
            &&!chordTone(landing.midi,a)&&chordTone(landing.midi,b)&&currentScale.includes(landing.midi)
            &&step(before.midi,landing.midi,currentScale)&&last.midi!==landing.midi){
            last.midi=landing.midi;add('anticipation',a.bar,last,b.bar,landing);
        }
    }
    // Passing and neighbour tones occupy existing weak, short attacks only.
    for(let bi=0;bi<bars.length;bi++){
        const b=bars[bi],events=result.bars[bi].events,scale=allowed(b);
        if(used.has(group(b.bar))||rng()>=chance)continue;
        for(let i=1;i+1<events.length;i++){
            const before=events[i-1],note=events[i],after=events[i+1],source=b.notes.find(n=>n.beat===note.beat);
            if(source?.accent||note.length>meter.unitsPerBeat*.75||!chordTone(before.midi,b)||!chordTone(after.midi,b))continue;
            const ai=scale.indexOf(before.midi),zi=scale.indexOf(after.midi);let midi,kind;
            if(ai>=0&&zi>=0&&Math.abs(ai-zi)===2){midi=scale[(ai+zi)/2];kind='passing';}
            else if(ai>=0&&before.midi===after.midi){
                const choices=[scale[ai-1],scale[ai+1]].filter(m=>m!==undefined&&!chordTone(m,b)&&Math.abs(m-before.midi)<=3);
                midi=choices[Math.floor(rng()*choices.length)];kind='neighbour';
            }
            if(midi===undefined||midi===note.midi||chordTone(midi,b)||!step(before.midi,midi,scale)||!step(midi,after.midi,scale))continue;
            note.midi=midi;add(kind,b.bar,note,b.bar,after);break;
        }
    }
    // Tendency tones (leadTendency): a leading tone that is held or accented goes up to the tonic, a fourth degree steps down to the
    // third (a half or whole step, whichever the scale has). One per bar at most; never an accent that would lose its chord tone,
    // and never the closing note of a phrase.
    const tendency=settings.leadTendency??0;
    if(tendency>0)for(let bi=0;bi<bars.length;bi++){
        const b=bars[bi],events=result.bars[bi].events,scale=allowed(b),tonic=b.scalePcs[0],closing=plan.destination?.closing&&plan.destination.bar===b.bar;
        for(let i=0;i+1<events.length;i++){
            const note=events[i],next=events[i+1],degreePc=((note.midi-tonic)%12+12)%12;
            if(degreePc!==11&&degreePc!==5)continue;
            const source=b.notes.find(n=>n.beat===note.beat);
            if(!(source?.accent||note.length>=meter.unitsPerBeat*.75)||(closing&&i+1===events.length-1)||rng()>=tendency)continue;
            const want=degreePc===11?note.midi+1:scale.filter(m=>m<note.midi&&note.midi-m<=2).at(-1);
            const landing=b.notes.find(n=>n.beat===next.beat);
            if(want===undefined||next.midi===want||!scale.includes(want)||!scale.includes(note.midi)||(landing?.accent&&!chordTone(want,b)))continue;
            next.midi=want;add('tendency',b.bar,note,b.bar,next);break;
        }
    }
    return result;
}
