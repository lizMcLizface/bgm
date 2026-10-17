import { planDevelopment, developTheme } from './themeDevelopment';
import { arrangeBarLatest } from './arrangerLatest';
import { defaultSettings } from '../settings';
import { METERS } from '../meter';
const motif=()=>[0,1,2,3].map((beat,i)=>({beat,length:1,degree:[0,2,1,0][i],accent:i===0}));
const apply=operation=>developTheme(motif(),{operation,meter:METERS['4/4'],density:.75,interval:1});

test('transform vocabulary retains ordered fragments, contour and intended rhythm',()=>{
    expect(apply('identity')).toEqual(motif());
    expect(apply('fragment')).toEqual(motif().slice(0,2));
    expect(apply('sequence').map(n=>n.degree)).toEqual([1,3,2,1]);
    expect(apply('augment').map(n=>[n.beat,n.length])).toEqual([[0,2],[2,2]]);
    expect(apply('diminish').map(n=>n.beat)).toEqual([0,.5,1,1.5]);
    expect(apply('displace').map(n=>n.beat)).toEqual([.5,1.5,2.5,3.5]);
    expect(apply('displace').at(-1).length).toBe(.5);
    expect(apply('extend').at(-1)).toMatchObject({beat:2,length:2,degree:1});
    expect(apply('ornament')).toHaveLength(5);
    expect(apply('ornament')[2]).toMatchObject({beat:1.5,degree:3,accent:false});
});

test('plans preserve statements/returns and transforms cannot mutate memory or overcrowd a meter',()=>{
    const operations=['identity','fragment','sequence','augment','diminish','displace','extend','ornament'];
    for(const role of ['statement','return','recollection'])expect(planDevelopment({seed:42,phrase:{start:12,role},density:1}).operations).toEqual(['identity','identity','identity','identity']);
    for(const meter of Object.values(METERS))for(const density of [0,.25,.5,1]){
        const source=Array.from({length:meter.units*2},(_,i)=>Object.freeze({beat:i*.5,length:.5,degree:i%5,accent:i%2===0}));Object.freeze(source);
        for(const operation of operations){const args={operation,meter,density,interval:-1},out=developTheme(source,args);
            expect(out).toEqual(developTheme(source,args));expect(out.length).toBeLessThanOrEqual(source.length+(density>.45?1:0));
            out.forEach((note,i)=>{expect(note.beat).toBeGreaterThanOrEqual(0);expect(note.beat+note.length).toBeLessThanOrEqual(meter.units);expect(note.length).toBeGreaterThan(0);if(i)expect(note.beat).toBeGreaterThanOrEqual(out[i-1].beat+out[i-1].length);});
            if(density<=.45&&['ornament','diminish'].includes(operation))expect(out).toEqual(source);
        }
    }
    const phrase={start:8,role:'development'},a=planDevelopment({seed:42,phrase,density:.75});
    expect(a).toEqual(planDevelopment({seed:42,phrase,density:.75}));expect(JSON.parse(JSON.stringify(a))).toEqual(a);
});

test('development changes answers, retains memory through rests and recalls the opening on return',()=>{
    const run=developThemes=>{let prev=null;return Array.from({length:16},(_,bar)=>{
        const result=arrangeBarLatest({bar,seed:42,meter:METERS['4/4'],chord:{pitchClasses:[0,4,7]},nextChord:{pitchClasses:[0,4,7]},scalePcs:[0,2,4,5,7,9,11],chordStart:true,barsLeftInChord:1,
            prev,developThemes,settings:{...defaultSettings(),leadActivity:bar>=8&&bar<12?0:1,leadDensity:.75,leadRepeat:1,sections:{mode:'off',phrases:4}}});
        prev=JSON.parse(JSON.stringify(result.state));return result;
    });};
    const a=run(true),b=run(false),line=bar=>bar.events.filter(e=>e.role==='lead');
    expect(a).toEqual(run(true));expect(a[15].state.composition.themes).toEqual(a[0].state.composition.themes);
    expect(a.slice(8,12).flatMap(line)).toEqual([]);expect(line(a[12])).toEqual(line(a[0]));
    expect(a.slice(0,4).map(line)).toEqual(b.slice(0,4).map(line));expect(a.slice(4,8).map(line)).not.toEqual(b.slice(4,8).map(line));
    expect(a[6].state.composition.development.operations[2]).not.toBe('identity');
});
