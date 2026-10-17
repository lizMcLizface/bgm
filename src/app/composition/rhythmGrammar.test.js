import { planRhythmGrammar, grammarMotif, tieMelody } from './rhythmGrammar';
import { METERS } from '../meter';
const n=(midi,beat,length)=>({role:'lead',midi,beat,length,velocity:.65});
const chord={pitchClasses:[0,4,7]},scalePcs=[0,2,4,5,7,9,11];
const context=(bar,bpm=120)=>({bar,bpm,chord,scalePcs});
test('grammar decisions retain opening identities, reproduce and offer different endings',()=>{
    const endings=new Set();for(let seed=0;seed<20;seed++)for(const bars of [4,8]){
        const args={seed,phrase:{start:0,bars,role:'statement'},ending:'settled'},p=planRhythmGrammar(args);
        expect(p).toEqual(planRhythmGrammar(args));expect(p.operations.slice(0,2)).toEqual(['identity','identity']);
        endings.add(p.operations.at(-1));expect(p.operations).toHaveLength(bars);
    }
    expect(endings.size).toBeGreaterThan(1);
});
test('all grammar gestures preserve final degree, density budget and valid bounds in every meter',()=>{
    for(const meter of Object.values(METERS))for(const operation of ['identity','hold','short','pickup','syncopate','breathe']){
        const step=meter.unitsPerBeat===3?1:.5;
        const notes=Array.from({length:meter.units/step},(_,i)=>({beat:i*step,length:step,degree:i%3,accent:i===0}));
        const copy=structuredClone(notes),out=grammarMotif(notes,{plan:{operations:[operation]},offset:0,meter});
        expect(notes).toEqual(copy);expect(out.length).toBeLessThanOrEqual(notes.length);expect(out.at(-1).degree).toBe(notes.at(-1).degree);
        out.forEach((e,i)=>{expect(e.beat).toBeGreaterThanOrEqual(0);expect(e.length).toBeGreaterThan(0);expect(e.beat+e.length).toBeLessThanOrEqual(meter.units);if(i)expect(e.beat).toBeGreaterThan(out[i-1].beat);});
        expect(grammarMotif([],{plan:{operations:[operation]},offset:0,meter})).toEqual([]);
    }
});
test('ties merge equal repeated attacks without mutation, and preserve cadence and resolution targets',()=>{
    const plan={bars:[{bar:0,events:[n(72,0,.94),n(72,1,.94),n(76,2,.94)]}],destination:{bar:0,closing:true}},copy=structuredClone(plan);
    const options={bars:[context(0)],meter:METERS['4/4'],seed:42,chance:1};
    const tied=tieMelody(plan,options);expect(tied.bars[0].events).toHaveLength(2);expect(tied.bars[0].events[0].length).toBeCloseTo(1.94);expect(tied.bars[0].events.at(-1)).toEqual(plan.bars[0].events.at(-1));expect(plan).toEqual(copy);
    const protectedPlan={...plan,resolutions:[{from:{bar:0,beat:0},to:{bar:0,beat:1}}]};
    expect(tieMelody(protectedPlan,options).ties).toEqual([]);
    const final={bars:[{bar:0,events:[n(72,0,.94),n(72,1,.94)]}],destination:{bar:0,closing:true}};
    expect(tieMelody(final,options).ties).toEqual([]);
});
test('across-bar ties use both tempos, retain a later attack and reconcile an already emitted hold',()=>{
    const plan={bars:[{bar:0,events:[n(72,3,.94)]},{bar:1,events:[n(72,0,.94),n(76,1,.94)]}],destination:{bar:1,closing:true}};
    const options={bars:[context(0,120),context(1,60)],meter:METERS['4/4'],seed:42,chance:1};
    const tied=tieMelody(plan,options);expect(tied.ties).toHaveLength(1);expect(tied.bars[0].events[0].length).toBeCloseTo(2.88);expect(tied.bars[1].events.map(e=>e.beat)).toEqual([1]);
    const restored=tieMelody({...plan,bars:[plan.bars[1]]},{...options,bars:[context(1,60)],previousMidi:72,pending:JSON.parse(JSON.stringify(tied.ties))});
    expect(restored.bars[0].events.map(e=>e.beat)).toEqual([1]);
    const edited=tieMelody({...plan,bars:[{bar:1,events:[n(74,0,.94),n(76,1,.94)]}]},{...options,bars:[context(1)],previousMidi:72,pending:tied.ties});
    expect(edited.bars[0].events).toHaveLength(2);
    const changed=tieMelody(plan,{...options,bars:[context(0),{...context(1),chord:{pitchClasses:[5,9,0]}}]});expect(changed.ties).toEqual([]);
});
