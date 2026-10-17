import { planJointCounterpoint, JOINT_BEAM } from './jointCounterpoint';
import { METERS } from '../meter';
const note=(role,midi,beat,length=1)=>({role,midi,beat,length,velocity:.6});
const bar=(at,lead,counter)=>({bar:at,bpm:120,chord:{pitchClasses:[0,4,7]},scalePcs:[0,2,4,5,7,9,11],lead,counter});
const options={meter:METERS['4/4'],ranges:{lead:[60,84],counter:[60,79]},settings:{leadScale:'full'},previousMidi:{lead:72,counter:67},key:'test'};
test('a constrained counter can change a foreground choice while a freer counter adapts instead',()=>{
    const bars=[bar(0,[note('lead',72,0,3)],[note('counter',71,0,3)])];
    const narrow=planJointCounterpoint({...options,bars,ranges:{lead:[72,76],counter:[71,71]}});
    expect(narrow.bars[0].lead[0].midi).not.toBe(72);expect(narrow.bars[0].counter[0].midi).toBe(71);
    const free=planJointCounterpoint({...options,bars});expect(free.bars[0].counter[0].midi).not.toBe(71);
    expect(free.beamWidth).toBe(JOINT_BEAM);expect(bars[0].lead[0].midi).toBe(72);
});
test('later foreground attacks and future bars affect the chosen held counter pitch',()=>{
    const input=[bar(0,[note('lead',72,0,1),note('lead',68,1,2)],[note('counter',67,0,3)])];
    const out=planJointCounterpoint({...options,bars:input,protectedNotes:[{bar:0,beat:0},{bar:0,beat:1}]});
    expect(out.bars[0].counter[0].midi).not.toBe(67);
    const cross=[bar(0,[],[note('counter',67,3,3)]),bar(1,[note('lead',68,0,2)],[])];
    const future=planJointCounterpoint({...options,bars:cross,protectedNotes:[{bar:1,beat:0}]});
    expect(future.bars[0].counter[0].midi).not.toBe(67);
});
test('protected targets and cross-bar held lead notes retain pitches, with all rhythms/gates untouched',()=>{
    const bars=[bar(0,[note('lead',72,0,5),note('lead',76,3,.8)],[note('counter',71,1)])];
    const out=planJointCounterpoint({...options,bars,protectedNotes:[{bar:0,beat:3}]});
    expect(out.bars[0].lead).toEqual(bars[0].lead);
    for(const role of ['lead','counter'])expect(out.bars[0][role].map(({midi,...e})=>e)).toEqual(bars[0][role].map(({midi,...e})=>e));
});
test('joint plans reuse compatible remaining contexts and invalidate harmony, rhythm or range edits',()=>{
    const bars=[bar(0,[note('lead',72,0)],[note('counter',67,0)]),bar(1,[note('lead',76,0)],[note('counter',69,0)])];
    const result=planJointCounterpoint({...options,bars}),saved=JSON.parse(JSON.stringify(result));
    expect(planJointCounterpoint({...options,bars:bars.slice(1)},saved)).toBe(saved);
    expect(planJointCounterpoint({...options,bars:bars.slice(1).map(b=>({...b,chord:{pitchClasses:[5,9,0]}}))},saved)).not.toBe(saved);
    expect(planJointCounterpoint({...options,bars,key:'edited range'},saved)).not.toBe(saved);
});
test('both voices stay in strict pentatonic sets/ranges in every key and meter, without filling rests',()=>{
    for(const meter of Object.values(METERS))for(let tonic=0;tonic<12;tonic++){
        const pcs=[0,2,4,7,9].map(n=>(n+tonic)%12),b={...bar(0,[note('lead',72,0)],[note('counter',71,meter.units/2,.4)]),scalePcs:pcs};
        const out=planJointCounterpoint({...options,meter,bars:[b]});
        for(const role of ['lead','counter'])for(const e of out.bars[0][role]){expect(pcs).toContain(e.midi%12);expect(e.midi).toBeGreaterThanOrEqual(options.ranges[role][0]);expect(e.midi).toBeLessThanOrEqual(options.ranges[role][1]);}
        const empty=planJointCounterpoint({...options,meter,bars:[{...b,counter:[]}]});expect(empty.bars[0].counter).toEqual([]);
    }
});
