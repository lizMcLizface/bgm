import { duetPlan, duetMotif, duetCounter, duetClash } from './duet';
import { METERS } from '../meter';
const note=(midi,beat,length=1)=>({role:'counter',midi,beat,length,velocity:.6});
const setup={scalePcs:[0,2,4,5,7,9,11],settings:{leadScale:'full'},range:[60,79],previousMidi:67,chord:{pitchClasses:[0,4,7]}};
test('duet roles give oblique, inverse, contrary and returning repeat plans, respecting repeat preference',()=>{
    for(const [role,mode] of Object.entries({statement:'establish',answer:'lead moves',development:'counter moves',contrast:'contrary motion',return:'together'})){
        const phrase={start:8,ordinal:2,role,bars:4},plan=duetPlan({phrase,seed:42});
        expect(plan.mode).toBe(mode);expect(plan).toEqual(duetPlan({phrase,seed:42}));
        expect(duetPlan({phrase,seed:42,repeat:1}).direction).toBe(0);
    }
});
test('lead motif stays fixed for inverse repeats and moves only in the second half for oblique repeats',()=>{
    const notes=Object.freeze([Object.freeze({degree:2,beat:0,length:1})]);
    for(const bars of [4,8])for(const mode of ['lead moves','counter moves','contrary motion','together']){
        const plan={bars,mode,direction:-1};
        expect(duetMotif(notes,{plan,offset:0})).toEqual(notes);
        expect(duetMotif(notes,{plan,offset:bars/2})[0].degree).toBe(['lead moves','contrary motion'].includes(mode)?1:2);
    }
    expect(notes[0].degree).toBe(2);
});
test('a counter note is scored against later foreground attacks across its whole sustain',()=>{
    const event=note(67,0,3),lead=[note(72,0,1),note(68,1,2)];
    expect(duetClash(67,event,lead,setup.chord)).toBeGreaterThan(duetClash(64,event,lead,setup.chord));
    const result=duetCounter([event],{...setup,lead,plan:{bars:4,mode:'together'},offset:0});
    expect(result[0].midi).not.toBe(67);
});
test('remembered counter rhythm repeats without adding attacks, adapts to harmony, and preserves memory',()=>{
    const memory=[[note(64,.5,.75),note(67,2,.8)],null],original=JSON.stringify(memory);
    const events=[note(71,0),note(74,1)],plan={bars:4,mode:'lead moves',direction:1};
    const result=duetCounter(events,{...setup,memory,plan,offset:2,lead:[]});
    expect(result).toEqual(memory[0]);expect(JSON.stringify(memory)).toBe(original);
    expect(duetCounter([],{...setup,memory,plan,offset:2,lead:[]})).toEqual([]);
    expect(duetCounter(events.slice(0,1),{...setup,memory,plan,offset:2,lead:[]})).toHaveLength(1);
    const shifted=duetCounter(events,{...setup,memory,plan:{...plan,mode:'counter moves'},offset:2,lead:[]});
    expect(shifted.map(e=>e.midi)).toEqual([65,69]);
});
test('duet search retains strict pentatonic membership, range and valid gates in all meters',()=>{
    for(const meter of Object.values(METERS))for(let tonic=0;tonic<12;tonic++){
        const scalePcs=[0,2,4,7,9].map(p=>(p+tonic)%12),events=[note(64,0,.8),note(67,meter.units/2,.7)];
        const out=duetCounter(events,{...setup,scalePcs,plan:{bars:8,mode:'contrary motion',direction:1},offset:4,lead:[note(72,0,meter.units)]});
        expect(out).toHaveLength(events.length);
        out.forEach(e=>{expect(scalePcs).toContain(e.midi%12);expect(e.midi).toBeGreaterThanOrEqual(60);expect(e.midi).toBeLessThanOrEqual(79);expect(e.beat+e.length).toBeLessThanOrEqual(meter.units);});
    }
});
