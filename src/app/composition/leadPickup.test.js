import {pickupLead} from './leadPickup';
import {METERS} from '../meter';
const gesture={kind:'gather',step:1};
const source=()=>[{beat:0,length:.8,degree:0,accent:true},{beat:1,length:.8,degree:2,accent:false},{beat:3,length:.8,degree:0,accent:false}];
test('reuses the weak closing attack as an upbeat without changing its pitch degree or count',()=>{
    const notes=source(),saved=structuredClone(notes),out=pickupLead(notes,{gesture,meter:METERS['4/4']});
    expect(out).toHaveLength(notes.length);expect(out.slice(0,-1)).toEqual(notes.slice(0,-1));
    expect(out.at(-1)).toEqual({...notes.at(-1),beat:3.5,length:.5});expect(notes).toEqual(saved);
});
test('keeps accents, committed targets, sparse material, existing upbeats and release gestures',()=>{
    const notes=source(),options={gesture,meter:METERS['4/4']};
    expect(pickupLead(notes,{...options,protectedBeats:[3]})).toBe(notes);
    for(const g of [null,{kind:'release',step:1},{kind:'gather',step:0}])expect(pickupLead(notes,{...options,gesture:g})).toBe(notes);
    expect(pickupLead(notes.slice(1),options)).toHaveLength(2);
    for(const last of [{...notes.at(-1),accent:true},{...notes.at(-1),beat:3.5}]){
        const n=[...notes.slice(0,-1),last];expect(pickupLead(n,options)).toBe(n);
    }
});
test('simple and compound meters produce bounded late attacks',()=>{
    for(const meter of Object.values(METERS)){
        const notes=[{beat:0,length:.5,degree:0},{beat:1,length:.5,degree:2},{beat:meter.units-1.5,length:1,degree:0}];
        const out=pickupLead(notes,{gesture,meter});
        expect(out.every(n=>n.length>0&&n.beat+n.length<=meter.units)).toBe(true);
        expect(out.at(-1).degree).toBe(0);
    }
});
