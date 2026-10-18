import {FM_RECIPES,cloneFM} from './fmPatch';
import {GLOBAL,LAYER,MODELS,RECIPES,clonePatch,sanitizePatch,parameterTriples,legacyPreset} from './patch';
import {sanitizePreset} from '../app/editor/presetStore';
test('patch ABI IDs are unique and every recipe round-trips without losing a parameter',()=>{
 expect(GLOBAL).toHaveLength(12);expect(LAYER).toHaveLength(100);
 for(const defs of [GLOBAL,LAYER])expect(new Set(defs.map(d=>d[0])).size).toBe(defs.length);
 for(const p of RECIPES){expect(clonePatch(p)).toEqual(p);expect(MODELS[p.global.model]).toBeTruthy();expect(parameterTriples(p)).toHaveLength(212);const legacy=legacyPreset(p);expect(sanitizePreset(legacy)).toEqual(legacy);}
});
test('untrusted patch input cannot inject unknown controls, invalid enums, excessive voices or nonfinite DSP values',()=>{
 const p=sanitizePatch({version:1,name:'x'.repeat(200),global:{polyphony:10000,model:2.7,gain:NaN},layers:[{cutoff:Infinity,pulse:-3,waveA:2.9,noise:900},{}],unknown:'no'});
 expect(p.name).toHaveLength(80);expect(p.global.polyphony).toBe(32);expect(p.global.model).toBe(3);expect(p.layers[0].pulse).toBe(.05);expect(p.layers[0].noise).toBe(1);expect(p.unknown).toBeUndefined();expect(()=>sanitizePatch({version:99})).toThrow();
});

test('sound preset room requests survive import without changing the synth parameter ABI',()=>{
 for(const source of [RECIPES[1],FM_RECIPES[4]]){
  const copy=source.kind==='fm'?cloneFM:clonePatch,patch=copy(source);patch.routing={room:'private',roomDecay:20,send:.24,delayMs:409,pingPong:1,roomSend:.3};
  expect(copy(patch).routing).toEqual(patch.routing);expect(copy({...patch,routing:undefined}).routing).toEqual({});
  expect(copy({...patch,routing:{room:'invalid',send:0,feedback:999,roomDecay:Infinity}}).routing).toEqual({send:0,feedback:.85});
 }
});
