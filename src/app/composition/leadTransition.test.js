import {fragmentLead} from './leadTransition';
import {METERS} from '../meter';
const notes=()=>Array.from({length:8},(_,i)=>({beat:i*.5,length:.45,degree:i%4,accent:i===0||i===4}));
test('fragments one interior attack, retaining endpoints, accents and the original idea',()=>{
    const source=notes(),saved=structuredClone(source),out=fragmentLead(source,{gesture:{kind:'gather'},meter:METERS['4/4']});
    expect(out).toHaveLength(7);expect(out[0]).toEqual(source[0]);expect(out.at(-1)).toEqual(source.at(-1));
    expect(out.filter(n=>n.accent)).toEqual(source.filter(n=>n.accent));expect(source).toEqual(saved);
});
test('committed resolutions and ties protect both attack and gate',()=>{
    const source=notes(),out=fragmentLead(source,{gesture:{kind:'release'},meter:METERS['4/4'],protectedBeats:[2.5,3]});
    expect(out.find(n=>n.beat===2.5)).toEqual(source[5]);expect(out.find(n=>n.beat===3)).toEqual(source[6]);
    expect(out).toHaveLength(7);
});
test('sparse, disabled and completely protected material stays intact; all meters remain bounded',()=>{
    const source=notes();
    expect(fragmentLead(source.slice(0,3),{gesture:{},meter:METERS['4/4']})).toHaveLength(3);
    expect(fragmentLead(source,{gesture:null,meter:METERS['4/4']})).toBe(source);
    expect(fragmentLead(source,{gesture:{},meter:METERS['4/4'],protectedBeats:source.map(n=>n.beat)})).toBe(source);
    for(const meter of Object.values(METERS))for(const n of fragmentLead(source.filter(n=>n.beat+n.length<=meter.units),{gesture:{},meter})){
        expect(n.length).toBeGreaterThan(0);expect(n.beat+n.length).toBeLessThanOrEqual(meter.units);
    }
});
