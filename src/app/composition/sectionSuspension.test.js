import {prepareSectionSuspension,landSectionSuspension,commitSectionSuspension} from './sectionSuspension';
import {METERS} from '../meter';
const scale=[0,2,4,5,7,9,11],note=(midi,beat,length=.47)=>({role:'lead',midi,beat,length,velocity:.6});
const setup=()=>({bar:7,events:[note(79,3.5)],chord:{pitchClasses:[7,11,2,5],scalePcs:scale},
    arrival:{bpm:120,chord:{pitchClasses:[0,4,7],scalePcs:scale},events:[note(84,0),note(84,1)]},
    meter:METERS['4/4'],bpm:120,range:[69,91],settings:{leadScale:'full'}});
test('prepares a chord tone and a downward step across the boundary, with tempo-correct duration',()=>{
    const s=setup(),result=prepareSectionSuspension({...s,arrival:{...s.arrival,bpm:60}});
    expect(result.from).toEqual({bar:7,beat:3.5,midi:77});expect(result.to).toEqual({bar:8,beat:1,midi:76});
    expect(result.length).toBeCloseTo(.5+.97*2);expect(result.motion).toBe('down');
    const landed=landSectionSuspension(s.arrival.events,{pending:result,bar:8,chord:s.arrival.chord,
        range:s.range,settings:s.settings,meter:s.meter,previousMidi:77});
    expect(landed.events).toEqual([note(76,1)]);
});
test('single-note entrances are delayed rather than adding attacks, and invalid handoffs cancel',()=>{
    const s=setup();s.arrival.events=[note(84,0,3.5)];const pending=prepareSectionSuspension(s);
    expect(pending.mode).toBe('delay');expect(pending.to.beat).toBe(.5);
    const opts={pending,bar:8,chord:s.arrival.chord,range:s.range,settings:s.settings,meter:s.meter,previousMidi:pending.from.midi};
    const landed=landSectionSuspension(s.arrival.events,opts);expect(landed.events).toHaveLength(1);expect(landed.events[0].beat).toBe(.5);
    expect(landSectionSuspension([],opts)).toBeNull();expect(landSectionSuspension(s.arrival.events,{...opts,previousMidi:60})).toBeNull();
});
test('gaps, protected preparations, silent arrivals and strict pentatonic limits take precedence',()=>{
    const s=setup();
    expect(prepareSectionSuspension({...s,events:[note(79,2,.5)]})).toBeNull();
    expect(prepareSectionSuspension({...s,protectedBeats:[3.5]})).toBeNull();
    expect(prepareSectionSuspension({...s,arrival:{...s.arrival,events:[]}})).toBeNull();
    expect(prepareSectionSuspension({...s,settings:{leadScale:'pentatonic'}})).toBeNull();
});
test('commit updates the actual event and both pitch-plan caches before booking',()=>{
    const s=setup(),pending=prepareSectionSuspension(s),events=structuredClone(s.events);
    const state={leadMidi:79,composition:{melody:{resolutions:[],bars:[{bar:7,events:structuredClone(events)}],destination:{bar:7,midi:79}},joint:{bars:[{bar:7,lead:structuredClone(events)}]}}};
    commitSectionSuspension(events,state,pending,7);
    expect(events[0].midi).toBe(77);expect(state.leadMidi).toBe(77);
    expect(state.composition.melody.bars[0].events).toEqual(events);expect(state.composition.joint.bars[0].lead).toEqual(events);
    expect(state.composition.sectionSuspension).toEqual(pending);expect(s.events[0].midi).toBe(79);
});
