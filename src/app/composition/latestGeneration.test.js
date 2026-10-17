import { arrangeBarLatest } from './arrangerLatest';
import { drumBarLatest, percussionGeometry, loosenDrumsLatest } from './percussionLatest';
import { DRUMS } from '../percussion';
import { METERS } from '../meter';
import { defaultSettings } from '../settings';
import { scaleById, scaleSemitones, diatonicChord } from '../theory';

const args = (patch = {}) => ({ bar: 0, meter: METERS['4/4'], drums: { style: 'lofi', activity: .6, variation: .5, sprinkle: .35 }, seed: 42, phraseStart: 0, ...patch });
const named = (events, name) => events.filter(e => DRUMS[e.midi] === name);

test('full-time and half-time backbeats are explicit, with distinct meter patterns', () => {
    const normal = drumBarLatest(args({ grooveIndex: 0, embellish: false }));
    expect(named(normal, 'brush').map(e => e.beat)).toEqual([1, 3]);
    const half = drumBarLatest(args({ drums: { style: 'downtempo' }, grooveIndex: 1, embellish: false }));
    expect(named(half, 'clap').map(e => e.beat)).toEqual([2]);
    expect(percussionGeometry(METERS['6/8']).backbeats).toEqual([3]);
    expect(percussionGeometry(METERS['5/4']).backbeats).toEqual([1, 4]);
    expect(percussionGeometry(METERS['7/4']).backbeats).toEqual([1, 3, 5]);
});

test('all groove variants preserve structural anchors and avoid duplicate attacks under fills and variation', () => {
    for (const style of ['heartbeat','brushes','shaker','lofi','downtempo','electro','drive']) for (const meter of Object.values(METERS)) for (let grooveIndex = 0; grooveIndex < 3; grooveIndex++) for (let bar = 0; bar < 32; bar++) {
        const setup = args({ bar, meter, grooveIndex, phraseStart: bar - bar % 4, drums: { style, activity: 1, variation: 1, sprinkle: 1 } });
        const reference = drumBarLatest({ ...setup, embellish: false });
        const actual = drumBarLatest(setup);
        expect(actual).toEqual(drumBarLatest(setup));
        for (const anchor of reference.filter(e=>e.anchor)) expect(actual.find(e=>e.midi===anchor.midi&&e.beat===anchor.beat)?.anchor).toBe(true);
        expect(new Set(actual.map(e=>`${e.midi}/${e.beat}`)).size).toBe(actual.length);
        actual.forEach(e=>{expect(e.beat).toBeGreaterThanOrEqual(0);expect(e.beat).toBeLessThan(meter.units);expect(e.velocity).toBeGreaterThan(0);expect(e.velocity).toBeLessThanOrEqual(1);});
    }
});

test('zero looseness is exact and nonzero looseness preserves the first downbeat', () => {
    const events = drumBarLatest(args()), original = structuredClone(events);
    loosenDrumsLatest(events,{timing:0,velocity:0},.5,42,0,METERS['4/4']);
    expect(events).toEqual(original);
    loosenDrumsLatest(events,{timing:40,velocity:.25},.5,42,0,METERS['4/4']);
    expect(events.filter(e=>e.anchor&&e.beat===0).length).toBeGreaterThan(0);
    events.forEach(e=>expect(e.beat).toBeLessThan(4));
});

test('percussion follows eight-bar phrase boundaries and suppresses fills for an ending',()=>{
    let found=false;
    for(let seed=0;seed<64;seed++){
        const opts=args({seed,bar:7,drums:{style:'electro',activity:1,variation:1},phraseStart:4,phraseBars:4,
            boundaries:{phrase:{start:0,bars:8,closing:true}}});
        const closing=drumBarLatest(opts);
        if(!named(closing,'tom').length)continue;found=true;
        expect(named(drumBarLatest({...opts,bar:3}),'tom')).toHaveLength(0);
        expect(named(drumBarLatest({...opts,boundaries:{...opts.boundaries,ending:{phase:'prepare'}}}),'tom')).toHaveLength(0);
        break;
    }expect(found).toBe(true);
});

function melodyRun({ tonic=0, mode='Major-1', leadScale='full', rest=false }={}) {
    const scale=scaleSemitones(scaleById(mode).intervals), scalePcs=scale.map(v=>(v+tonic)%12);
    const chord={pitchClasses:diatonicChord(scale,1,3).map(v=>(v+tonic)%12)};
    const settings={...defaultSettings(),leadActivity:1,leadRepeat:1,leadScale,sections:{mode:'off',phrases:4}};
    let prev=null;
    const out=[];
    for(let bar=0;bar<16;bar++) {
        const result=arrangeBarLatest({bar,meter:METERS['4/4'],seed:77,chord,nextChord:chord,scalePcs,chordStart:true,barsLeftInChord:1,prev,
            settings:{...settings,leadActivity:rest&&bar>=4&&bar<8?0:1}});
        out.push(result);prev=result.state;
    }
    return {out,scalePcs};
}

test('themes survive silent phrases and return with their rhythm and pitches', () => {
    const {out}=melodyRun({rest:true});
    expect(out.slice(4,8).flatMap(b=>b.events.filter(e=>e.role==='lead'))).toHaveLength(0);
    expect(out[12].state.composition.themes).toEqual(out[0].state.composition.themes);
    expect(out[12].state.composition.phrase.role).toBe('return');
    const line=b=>b.events.filter(e=>e.role==='lead').map(({midi,beat,length})=>({midi,beat,length}));
    expect(line(out[12])).toEqual(line(out[0]));
    expect(melodyRun({rest:true})).toEqual(melodyRun({rest:true}));
});

test('pitch planning respects strict pentatonic and every tonic without wrapped degree errors', () => {
    for(let tonic=0;tonic<12;tonic++) {
        const {out,scalePcs}=melodyRun({tonic,leadScale:'pentatonic'});
        const pent=scalePcs.filter((_,i)=>![3,6].includes(i));
        out.forEach(b=>b.events.filter(e=>e.role==='lead').forEach(e=>{
            expect(pent).toContain(e.midi%12);
            expect(e.midi).toBeGreaterThanOrEqual(b.state.ranges.lead[0]);
            expect(e.midi).toBeLessThanOrEqual(b.state.ranges.lead[1]);
        }));
        expect(JSON.parse(JSON.stringify(out[0].state.composition))).toEqual(out[0].state.composition);
    }
});
