import { planRhythmDevelopment, developBarRhythm, shapeRhythmicPart } from './rhythmDevelopment';
import { phraseRhythm, barRhythm } from './ensembleRhythm';
import { drumBarLatest } from './percussionLatest';
import { METERS } from '../meter';
const note=(role,midi,beat,length=1)=>({role,midi,beat,length,velocity:.7});
const phrase=(ordinal,bars=4)=>({start:ordinal*bars,ordinal,bars});
const plan=(ordinal,meter,previous)=>planRhythmDevelopment({seed:42,phrase:phrase(ordinal),meter,previous});
test('rhythm cells persist four phrases, mutate at most one weak slot and restore their opening',()=>{
    for(const meter of Object.values(METERS)){
        let previous;const plans=Array.from({length:5},(_,i)=>previous=plan(i,meter,previous));
        expect(plans.slice(0,4).map(p=>p.cells)).toEqual(Array(4).fill(plans[0].cells));
        expect(plans.slice(0,4).map(p=>p.grooveStart)).toEqual([0,0,0,0]);expect(plans[4].grooveStart).toBe(16);
        const rhythms=plans.map(p=>developBarRhythm({answers:[],leadAttacks:[]},p,p.start,meter));
        expect(rhythms[3].preferred).toEqual(rhythms[0].preferred);
        for(const p of plans){for(let i=0;i<2;i++){
            const r=developBarRhythm({answers:[],leadAttacks:[]},p,p.start+i,meter);
            expect(r.preferred.filter(at=>!p.cells[i].includes(at)).length).toBeLessThanOrEqual(1);
            r.preferred.forEach(at=>{expect(at).toBeGreaterThan(0);expect(at).toBeLessThan(meter.units);});
        }}
        expect(plan(2,meter,JSON.parse(JSON.stringify(plans[1])))).toEqual(plans[2]);
    }
});
test('preferred answers remain clear of lead attacks and do not alter kick/bass anchors',()=>{
    const meter=METERS['4/4'],p=plan(1,meter),base=phraseRhythm({seed:42,start:4,meter,bassStyle:'half',role:'answer'});
    const before=barRhythm({phrase:base,bar:4,meter,lead:[note('lead',76,0),note('lead',79,2)]});
    const after=developBarRhythm(before,p,4,meter);
    expect([...after.answers].sort()).toEqual([...before.answers].sort());expect(after.kicks).toEqual(before.kicks);
    after.answers.forEach(at=>expect(after.leadAttacks.every(t=>Math.abs(at-t)>=after.guard)).toBe(true));
    expect(after.roles).toEqual({pad:'answer',counter:'support'});
});
test('one rhythmic attack group moves together, preserving count, silence, chord entrances and held textures',()=>{
    const meter=METERS['4/4'],events=[note('pad',60,0),note('pad',64,1),note('pad',67,1),note('pad',64,2)];
    const rhythm={roles:{pad:'answer'},preferred:[1.5,2.5],accents:[0,2],leadAttacks:[0,1,2],guard:.3};
    const out=shapeRhythmicPart(events,{role:'pad',style:'pulse',rhythm,meter});
    expect(out.map(e=>e.beat)).toEqual([0,1.5,1.5,2]);expect(out).toHaveLength(events.length);
    expect(out[0].midi).toBe(60);expect(events[1].beat).toBe(1);
    for(const style of ['sustain','rolled','stacked'])expect(shapeRhythmicPart(events,{role:'pad',style,rhythm,meter})).toBe(events);
    expect(shapeRhythmicPart(events,{role:'pad',style:'pulse',rhythm,meter,enabled:false})).toBe(events);
    expect(shapeRhythmicPart([],{role:'pad',style:'pulse',rhythm,meter})).toEqual([]);
    out.forEach(e=>{expect(e.length).toBeGreaterThan(0);expect(e.beat+e.length).toBeLessThanOrEqual(4);});
});
test('non-closing percussion cells repeat and one optional ornament changes without losing anchors',()=>{
    for(const meter of Object.values(METERS))for(const style of ['heartbeat','brushes','shaker','lofi','downtempo','electro','drive']){
        const get=(ordinal,offset)=>{
            const p=plan(ordinal,meter,{...plan(0,meter),key:plan(ordinal,meter).key}),bar=p.start+offset;
            const base=phraseRhythm({seed:42,start:p.start,meter,bassStyle:'whole',role:'statement'});
            const rhythm=developBarRhythm(barRhythm({phrase:base,bar,meter,lead:[]}),p,bar,meter);
            return drumBarLatest({seed:42,bar,meter,drums:{style,activity:1,variation:1,sprinkle:1},rhythm,phraseStart:p.start});
        };
        const positions=events=>events.map(e=>[e.midi,e.beat,e.anchor]);
        expect(positions(get(0,0))).toEqual(positions(get(0,2)));
        expect(positions(get(0,0))).toEqual(positions(get(3,0)));
        const anchors=events=>positions(events.filter(e=>e.anchor));
        expect(anchors(get(0,0))).toEqual(anchors(get(1,0)));
        for(const e of get(2,0)){expect(e.beat).toBeGreaterThanOrEqual(0);expect(e.beat).toBeLessThan(meter.units);}
    }
});
