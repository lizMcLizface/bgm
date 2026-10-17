import {sectionShape,shapeSectionSettings,shapeSectionNotes} from './sectionShape';
import {planForm,formEnvelope} from './formLatest';
test('build has separate activity, gate and register motion while breakdown favours held fullness',()=>{
    const start=sectionShape({type:'build',strategy:'thematic',progress:0}),end=sectionShape({type:'build',strategy:'thematic',progress:1});
    expect(end.activity).toBeGreaterThan(start.activity);expect(end.gate).toBeLessThan(start.gate);expect(end.register).toBeGreaterThan(start.register);
    const down=sectionShape({type:'breakdown',strategy:'gradual',progress:.5});expect(down.gate).toBeGreaterThan(1);expect(down.sustain).toBeGreaterThan(down.rhythmic);
});
test('weights preserve disabled styles and explicit lead silence, with independent copies',()=>{
    const settings={leadActivity:0,padWeights:{sustain:1,pulse:0},bassWeights:{whole:1,drive:0}},copy=structuredClone(settings);
    const changed=shapeSectionSettings(settings,sectionShape({type:'breakdown',strategy:'gradual',progress:.5}));
    expect(changed.leadActivity).toBe(0);expect(changed.padWeights.pulse).toBe(0);expect(changed.bassWeights.drive).toBe(0);expect(settings).toEqual(copy);
});
test('notes retain motif boundaries, no added attacks or cross-boundary gates; slow forms prepare eight bars ahead',()=>{
    const notes=[0,1,2,3].map((beat,i)=>({beat,length:1,degree:i,accent:i===0}));
    for(const type of ['intro','build','full','breakdown'])for(const progress of [0,.5,1]){
        const out=shapeSectionNotes(notes,sectionShape({type,strategy:'gradual',progress}),0);
        expect(out.length).toBeLessThanOrEqual(notes.length);expect(out[0].beat).toBe(0);expect(out.at(-1).beat).toBe(3);
        out.forEach(n=>{expect(n.length).toBeGreaterThan(0);expect(n.beat+n.length).toBeLessThanOrEqual(4);});
    }
    let previous;for(let bar=0;bar<100;bar+=4){previous=planForm({bar,seed:42,sections:{mode:'gentle',phrases:4},previous,settings:{leadDensity:0,bassWeights:{whole:1},padWeights:{sustain:1}},developSections:true});
        if(previous.section.bars>=16){expect(previous.section.prepareBars).toBe(8);const e=formEnvelope(previous,previous.section.start+previous.section.bars-8,'gentle');expect(e.transition).not.toBeNull();expect(e.motion).toBeTruthy();}}
});
