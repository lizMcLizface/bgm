import { planPerformance, gestureAt, performPhrase } from './performance';
import { performEnsemble } from './ensembleRhythm';
import { METERS } from '../meter';
import { DRUMS } from '../percussion';
const make=(role,midi,beat)=>({role,midi,beat,length:.7,velocity:.6,detune:0});

test('phrase gestures rise and release smoothly, retain identity and vary by seeded phrase',()=>{
    const p=planPerformance(42,{start:4,role:'statement'});
    expect(p).toEqual(planPerformance(42,{start:4,role:'statement'}));expect(JSON.parse(JSON.stringify(p))).toEqual(p);
    expect(p.peak).not.toBe(planPerformance(42,{start:8,role:'statement'}).peak);
    expect(gestureAt(p,0)).toBe(-.5);expect(gestureAt(p,1)).toBe(-.5);expect(gestureAt(p,p.peak)).toBe(.5);
    expect(Math.abs(gestureAt(p,.0001)-gestureAt(p,0))).toBeLessThan(.00001);
    const notes=[make('lead',72,0),make('lead',76,0),make('pad',60,0)];
    performPhrase(notes,{plan:p,bar:4,meter:METERS['4/4'],unitSeconds:.5,humanize:{velocity:.2,timing:0}});
    expect(notes[0].velocity).toBe(notes[1].velocity);
    expect(notes[0].velocity).toBeLessThan(notes[2].velocity); // supporting parts have shallower motion
});

test('all meters keep anchors, bass/kick alignment, bounded events, exact zero and independent layers',()=>{
    for(const meter of Object.values(METERS))for(let bar=0;bar<16;bar++){
        const plan=planPerformance(42,{start:bar-bar%4,role:'development'}),humanize={velocity:.25,timing:40,detune:15};
        const input=[make('lead',72,0),make('bass',36,meter.unitsPerBeat),make('perc',DRUMS.indexOf('kick'),meter.unitsPerBeat),make('perc',DRUMS.indexOf('snare'),0)];
        const full=structuredClone(input),music=structuredClone(input.filter(e=>e.role!=='perc'));
        const run=events=>{performEnsemble(events,{...humanize,velocity:humanize.velocity*.4},.5,42,bar,meter);performPhrase(events,{plan,bar,meter,unitSeconds:.5,humanize});};
        run(full);run(music);expect(full.filter(e=>e.role!=='perc')).toEqual(music);
        expect(full[1].beat).toBe(full[2].beat);expect(full[3].beat).toBe(0);
        full.forEach((e,i)=>{expect(e.velocity).toBeGreaterThanOrEqual(.05);expect(e.velocity).toBeLessThanOrEqual(1);expect(e.beat).toBeLessThan(meter.units);expect(e.length).toBe(input[i].length);expect(e.midi).toBe(input[i].midi);});
        const exact=structuredClone(input);performPhrase(exact,{plan,bar,meter,unitSeconds:.5,humanize:{velocity:0,timing:0}});expect(exact).toEqual(input);
        const reversed=structuredClone(input).reverse();run(reversed);expect(reversed.reverse()).toEqual(full);
    }
});
