import { grooveProfile, instrumentGroovePlan } from './instrumentGroove';
import { performEnsemble } from './ensembleRhythm';
import { performPhrase, planPerformance } from './performance';
import { METERS } from '../meter';
import { DRUMS } from '../percussion';
const note=(role,midi,beat=1)=>({role,midi,beat,length:.7,velocity:.65,detune:0});
test('profiles use actual instrument sources and named classic/chip identity with plain-data plans',()=>{
    const voices={lead:{name:'Flute'},counter:{preset:{stringModel:'plucked'}},pad:{preset:{stringModel:'piano'}}};
    expect(instrumentGroovePlan(4,voices)).toEqual({start:4,profiles:{lead:'breath',counter:'plucked',pad:'keys'}});
    expect(grooveProfile({name:'Felt Piano (classic)',preset:{stringModel:'piano'}})).toBe('tight');
    expect(grooveProfile({name:'Custom',preset:{gainAttack:.5}})).toBe('swell');expect(grooveProfile()).toBe('neutral');
    expect(JSON.parse(JSON.stringify(instrumentGroovePlan(4,voices)))).toEqual(instrumentGroovePlan(4,voices));
});
test('zero timing is exact; changing groove changes neither pitch, gate nor independent velocity/detune streams',()=>{
    const events=[note('pad',60),note('pad',64),note('lead',76)],groove={profiles:{pad:'keys',lead:'plucked'}};
    const zero=structuredClone(events);performEnsemble(zero,{timing:0,velocity:0,detune:0},.5,42,2,METERS['4/4'],groove);expect(zero).toEqual(events);
    const a=structuredClone(events),b=structuredClone(events),h={timing:30,velocity:.1,detune:3};
    performEnsemble(a,h,.5,42,2,METERS['4/4']);performEnsemble(b,h,.5,42,2,METERS['4/4'],groove);
    const withoutTime=events=>events.map(({beat,...e})=>e);expect(withoutTime(a)).toEqual(withoutTime(b));
    expect(b[0].beat).toBe(b[1].beat);expect(b.map(e=>e.beat)).not.toEqual(a.map(e=>e.beat));
});
test('keys lean behind plucked voices and tight voices have less residual timing scatter',()=>{
    const samples=profile=>Array.from({length:160},(_,bar)=>{
        const events=[note('lead',72,1.5)];performEnsemble(events,{timing:30},.5,42,bar,METERS['4/4'],{profiles:{lead:profile}});return(events[0].beat-1.5)*500;
    });
    const mean=a=>a.reduce((s,x)=>s+x,0)/a.length,spread=a=>Math.sqrt(mean(a.map(x=>(x-mean(a))**2)));
    expect(mean(samples('keys'))-mean(samples('plucked'))).toBeGreaterThan(7);
    expect(spread(samples('tight'))).toBeLessThan(spread(samples('neutral'))*.3);
});
test('bass and kick keep identical time through instrument feel and phrase warp in every meter, even chip bass',()=>{
    for(const meter of Object.values(METERS))for(let bar=0;bar<20;bar++){
        const events=[note('bass',36,1),note('perc',DRUMS.indexOf('kick'),1)],groove={profiles:{bass:'tight'}};
        performEnsemble(events,{timing:40,velocity:.1},.3,42,bar,meter,groove);
        performPhrase(events,{plan:planPerformance(42,{start:0,bars:4}),bar,meter,unitSeconds:.3,humanize:{timing:40,velocity:.1},groove});
        expect(events[0].beat).toBe(events[1].beat);
    }
});
