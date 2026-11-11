import fs from'node:fs';import vm from'node:vm';import{fft}from'../src/app/engine/pianoModel/dsp.js';import{BAND_EDGES,SKIRT_TIMES}from'../src/app/engine/stringModel/analysis.js';
import{renderDecay}from'../src/app/engine/stringModel/synth.js';
import StringPlayer,{tunedModel}from'../src/app/engine/stringModel/player.js';
const source=fs.readFileSync('src/app/engine/stringModel/synth.js','utf8');
// Only module import/export glue is removed. Every original DSP function body,
// including the original random closure, remains unchanged. The observation
// wrapper calls that closure once and returns its exact value unchanged.
const executable=source.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'');
export function createStringDecayTrace(){const sandbox={fft,BAND_EDGES,SKIRT_TIMES,Float64Array,Float32Array,Int32Array,trace:{calls:0,final:0,initial:0}};vm.runInNewContext(executable+`\nconst originalStringRandom=random;random=seed=>{const draw=originalStringRandom(seed);trace.calls=0;trace.initial=(seed>>>0)||1;trace.final=trace.initial;return()=>{const value=draw();trace.calls++;trace.final=value*4294967296;return value;};};globalThis.runDecay=(model,rate,options)=>{const result=renderDecay(model,rate,options);return{buffer:result.buffer,trace:{...trace}};};`,sandbox);return(model,rate,options)=>sandbox.runDecay(model,rate,options);}
export const actualStringDecay=(model,rate,options)=>renderDecay(model,rate,options).buffer;
export function actualStringDecayCapture(spec,patch){const player=Object.create(StringPlayer.prototype);player.tuning=spec.tuning;player.levels=new Map();const key=player.keyOf(patch,spec.midi,spec.requestedVelocity*127,{without:spec.without,exact:spec.exact});return{model:tunedModel(patch,spec.midi,key.v,spec.tuning,spec.without),gain:player.level(patch),cacheVelocity:key.v,seedInput:spec.midi*7+key.v};}
