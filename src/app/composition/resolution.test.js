import { resolveMelody } from './resolution';
import { METERS } from '../meter';
const scale=[0,2,4,5,7,9,11],C={pitchClasses:[0,4,7]},F={pitchClasses:[5,9,0]};
const event=(midi,beat,length=.47)=>({role:'lead',midi,beat,length,velocity:.6});
const fixture=(events,chords=events.map(()=>C))=>({bars:events.map((es,i)=>({bar:i,scalePcs:scale,chord:chords[i],notes:es.map(e=>({beat:e.beat,accent:e.beat%1===0}))})),plan:{bars:events.map((es,i)=>({bar:i,events:es})),destination:{bar:events.length-1,closing:false}}});
const run=(f,extra={})=>resolveMelody(f.plan,{bars:f.bars,meter:METERS['4/4'],range:[48,84],settings:{leadScale:'full'},seed:42,chance:1,...extra});

test('passing and neighbour tensions use existing weak attacks and land on a chord tone',()=>{
    const passing=fixture([[event(60,0),event(60,.5),event(64,1)]]),p=run(passing);
    expect(p.bars[0].events.map(e=>e.midi)).toEqual([60,62,64]);expect(p.resolutions[0].kind).toBe('passing');
    const neighbour=fixture([[event(60,0),event(67,.5),event(60,1)]]),n=run(neighbour);
    expect(n.resolutions[0].kind).toBe('neighbour');expect([59,62]).toContain(n.bars[0].events[1].midi);
    expect(passing.plan.bars[0].events[1].midi).toBe(60);expect(p).toEqual(run(passing));
});

test('anticipation resolves at a known change and suspension really holds across its boundary',()=>{
    const anticipation=fixture([[event(64,3),event(62,3.5)],[event(65,0),event(69,1)]],[C,F]);
    const a=run(anticipation);expect(a.resolutions[0].kind).toBe('anticipation');expect(a.bars[0].events.at(-1).midi).toBe(65);
    const suspension=fixture([[event(67,3,.94)],[event(69,0,.94),event(65,1,.94)]],[C,F]);
    const s=run(suspension);expect(s.resolutions[0].kind).toBe('suspension');
    expect(s.bars[0].events[0].length).toBeCloseTo(1.97);expect(s.bars[1].events).toHaveLength(1);expect(s.bars[1].events[0]).toMatchObject({midi:65,beat:1});
    expect(s.bars[0].events[0].beat+s.bars[0].events[0].length).toBeLessThan(4+s.bars[1].events[0].beat);
});

test('strict pentatonic, final targets and density budgets constrain introduced notes',()=>{
    const f=fixture([[event(60,0),event(67,.5),event(60,1)],[event(60,0),event(67,.5),event(60,1)]]);
    const result=run(f,{settings:{leadScale:'pentatonic'}});expect(result.resolutions).toHaveLength(1);
    result.bars.flatMap(b=>b.events).forEach(e=>expect([0,2,4,7,9]).toContain(e.midi%12));
    const closed=fixture([[event(67,3,.94)],[event(69,0,.94),event(65,1,.94)]],[C,F]);closed.plan.destination.closing=true;
    expect(run(closed).resolutions.filter(r=>r.kind==='suspension')).toEqual([]);
    expect(run(f,{chance:0}).resolutions).toEqual([]);
});

test('prepared holds survive forecast growth and their duration follows the next bar tempo',()=>{
    const f=fixture([[event(67,3,.94)],[event(69,0,.94),event(65,1,.94)]],[C,F]);
    f.bars[0].bpm=60;f.bars[1].bpm=120;
    const prepared=run(f);expect(prepared.bars[0].events[0].length).toBeCloseTo(1.485);
    const next={bars:[f.bars[1]],plan:{bars:[{bar:1,events:[event(69,0),event(69,1)]}],destination:{bar:1,closing:false}}};
    const carried=run(next,{previousMidi:67,pending:prepared.resolutions});
    expect(carried.bars[0].events).toHaveLength(1);expect(carried.bars[0].events[0]).toMatchObject({midi:65,beat:1});
    expect(carried.resolutions[0]).toEqual(prepared.resolutions[0]);
});
