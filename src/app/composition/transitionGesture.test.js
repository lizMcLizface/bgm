import {transitionGesture,gesturePart} from './transitionGesture';
import {METERS} from '../meter';
test('gestures prepare only real arrivals or breakdowns during the last two bars',()=>{
    const section={start:0,bars:8,type:'build',nextType:'full'};
    expect(transitionGesture(section,5)).toBeNull();
    expect(transitionGesture(section,6)).toMatchObject({kind:'gather',step:0,end:8});
    expect(transitionGesture(section,7)).toMatchObject({kind:'gather',step:1});
    expect(transitionGesture(section,8)).toBeNull();
    expect(transitionGesture({...section,type:'full'},7)).toBeNull();
    expect(transitionGesture({...section,type:'full',nextType:'breakdown'},7).kind).toBe('release');
});
test('grouped chords keep entrances, final notes and metrical anchors in every meter',()=>{
    for(const meter of Object.values(METERS)){
        const events=Array.from({length:meter.units*2},(_,i)=>[60,64,67].map(midi=>({role:'pad',midi,beat:i*.5,length:.45,velocity:.6}))).flat();
        const saved=structuredClone(events),gesture={kind:'release',step:1};
        const out=gesturePart(events,{gesture,meter,style:'pulse'});
        expect(out.length).toBeLessThan(events.length);
        expect(out.filter(e=>e.beat===0)).toHaveLength(3);
        expect(out.filter(e=>e.beat===events.at(-1).beat)).toHaveLength(3);
        for(const at of new Set(out.map(e=>e.beat)))expect(out.filter(e=>e.beat===at)).toHaveLength(3);
        for(const e of out){expect(e.length).toBeGreaterThan(0);expect(e.beat+e.length).toBeLessThanOrEqual(meter.units);}
        expect(events).toEqual(saved);
    }
});
test('held textures, explicit bypass and silence remain intact',()=>{
    const events=[{beat:0,midi:60,length:16,velocity:.6}],options={gesture:{kind:'gather',step:1},meter:METERS['4/4']};
    for(const style of ['sustain','rolled','stacked','harmony'])expect(gesturePart(events,{...options,style})).toBe(events);
    expect(gesturePart(events,{...options,style:'pulse',enabled:false})).toBe(events);
    expect(gesturePart([],{...options,style:'line'})).toEqual([]);
});
