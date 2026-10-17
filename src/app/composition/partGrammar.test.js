import { planPartGrammar, partGrammar } from './partGrammar';
import { METERS } from '../meter';
const n=(midi,beat,length=.9,role='counter')=>({midi,beat,length,role,velocity:.6});
const planned=operation=>({pad:Array(4).fill(operation),counter:Array(4).fill(operation),counterRest:2});
test('part gestures and an interior counter rest are seeded, serialisable and role-sensitive',()=>{
    for(const bars of [4,8]){
        const args={seed:42,phrase:{start:8,bars},roles:{pad:'answer',counter:'support'}};
        const plan=planPartGrammar(args);expect(plan).toEqual(planPartGrammar(args));expect(plan).toEqual(JSON.parse(JSON.stringify(plan)));
        expect(plan.pad).toHaveLength(bars);expect(plan.counter).toHaveLength(bars);
        expect(plan.counterRest).toBeGreaterThan(0);expect(plan.counterRest).toBeLessThan(bars-1);
    }
});
test('an active counter can rest during the lead, but an inactive lead and explicit silence remain respected',()=>{
    const events=[n(67,0,3.8)],options={plan:planned('hold'),role:'counter',index:2,meter:METERS['4/4'],style:'line'};
    expect(partGrammar(events,{...options,lead:[n(76,0)]})).toEqual([]);
    expect(partGrammar(events,{...options,lead:[]})).toEqual(events);
    expect(partGrammar([],{...options,lead:[n(76,0)]})).toEqual([]);
    expect(partGrammar(events,{...options,enabled:false,lead:[n(76,0)]})).toBe(events);
});
test('breaths remove a grouped attack without erasing chord entrances or refilling the gap',()=>{
    const events=[0,1,2,3].flatMap(beat=>[n(60,beat,.95,'pad'),n(64,beat,.95,'pad')]),copy=structuredClone(events);
    const out=partGrammar(events,{plan:planned('breathe'),role:'pad',index:0,meter:METERS['4/4'],style:'pulse'});
    expect(out.map(e=>e.beat)).toEqual([0,0,1,1,3,3]);expect(out.filter(e=>e.beat===0)).toEqual(events.slice(0,2));
    expect(out.find(e=>e.beat===1).beat+out.find(e=>e.beat===1).length).toBeLessThan(2);
    expect(out.filter(e=>e.beat===3).every(e=>e.length===.45)).toBe(true);expect(events).toEqual(copy);
});
test('repeated chord groups can hold instead of reattacking, and pickups keep the chord grouped',()=>{
    const events=[0,1,2].flatMap(beat=>[n(60,beat,.95,'pad'),n(64,beat,.95,'pad')]);
    const options={role:'pad',index:0,meter:METERS['4/4'],style:'pulse'};
    const held=partGrammar(events,{...options,plan:planned('hold')});expect(held.map(e=>e.beat)).toEqual([0,0,2,2]);expect(held[0].length).toBeCloseTo(1.95);
    const pickup=partGrammar(events,{...options,plan:planned('pickup')});expect(pickup.map(e=>e.beat)).toEqual([0,0,1,1,1.5,1.5]);
});
test('all meters retain finite bounded events and density budgets, while held pad textures bypass grammar',()=>{
    for(const meter of Object.values(METERS))for(const operation of ['breathe','short','pickup','hold']){
        const step=meter.unitsPerBeat===3?1:.5,events=Array.from({length:meter.units/step},(_,i)=>n(i%2?64:60,i*step,step*.94,'pad'));
        const options={plan:planned(operation),role:'pad',index:0,meter,style:'arpeggio'};
        const out=partGrammar(events,options);expect(out.length).toBeLessThanOrEqual(events.length);
        out.forEach(e=>{expect(e.beat).toBeGreaterThanOrEqual(0);expect(e.length).toBeGreaterThan(0);expect(e.beat+e.length).toBeLessThanOrEqual(meter.units);});
        for(const style of ['sustain','rolled','stacked'])expect(partGrammar(events,{...options,style})).toBe(events);
    }
});
