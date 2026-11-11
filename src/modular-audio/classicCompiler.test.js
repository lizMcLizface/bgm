import {it,expect} from 'vitest';
import {compileClassicNotes} from './classicCompiler';
import {CLASSIC_MODELS,validateClassicConfig,saveClassicConfig,loadClassicConfig} from './classicConfig';
import {SYNTHS} from '../synths/models';
import {builtinWaves} from '../synths/vs/waves';
import {packWaves,DEFAULT_WAVES} from '../synths/wt/waves';
const config=model=>({version:1,model,parameters:[[0,1],[200,.25]],polyphony:8,...(model===7?{waves:Array(16384).fill(.25)}:model===12?{waves:Array(8192).fill(.125)}:{})});
it.each(CLASSIC_MODELS)('round-trips actual model %i config and complete private waves',model=>{const c=config(model),copy=loadClassicConfig(saveClassicConfig(c));expect(copy).toEqual(c);copy.parameters[0][1]=5;expect(c.parameters[0][1]).toBe(1);if(copy.waves){copy.waves[0]=5;expect(c.waves[0]).not.toBe(5);}});
it('accepts every actual classic factory patch without reconstructing parameter identities',()=>{for(const s of Object.values(SYNTHS).filter(s=>s.model!==undefined))for(const p of s.presets){const c={version:1,model:s.model,parameters:(s.params.toEnginePairs??s.params.toPairs)(p.values),polyphony:8,...(s.model===7?{waves:builtinWaves()}:s.model===12?{waves:packWaves(p.waves??DEFAULT_WAVES)}:{})};expect(()=>validateClassicConfig(c),s.id+':'+p.name).not.toThrow();}});
it('keeps exact sample timing, fractional tuning, pressure, receive order and original input',()=>{
 const source={patch:{...config(1),controls:[[0,.1]],tailSeconds:3}},notes=[{midi:60.25,velocity:.72,time:37/48000,duration:1000/48000,detune:25,expression:{bend:.5,gateScale:.5,pressure:.3}}],before=JSON.stringify({source,notes});
 const c=compileClassicNotes(source,notes);expect(c.tail).toBe(3);expect(c.events.map(e=>[e.event,e.frame,e.a])).toEqual([[2,0,.1],[0,37,61],[3,37,.3],[1,537,0]]);expect(c.config.controls).toBeUndefined();expect(JSON.stringify({source,notes})).toBe(before);
});
it('rejects malformed model contracts, missing VS resources, sustain, nonfinite values and queue overflow',()=>{
 for(const edit of [c=>c.model=14,c=>c.parameters.push([0,2]),c=>c.parameters=[[179,1]],c=>c.parameters=[[0,Infinity]],c=>c.polyphony=0,c=>c.waves=[1]]){const c=config(1);edit(c);expect(()=>validateClassicConfig(c)).toThrow();}
 expect(()=>validateClassicConfig({...config(7),waves:undefined})).toThrow();
 expect(()=>compileClassicNotes({patch:{...config(0),controls:[[5,1]]}},[])).toThrow('sustain');
 expect(()=>compileClassicNotes({patch:config(0)},Array.from({length:1500},()=>({midi:60,time:0,duration:1,velocity:.5,expression:{pressure:.5}})))).toThrow('queue');
});
