import fs from 'node:fs';import {INSERTS}from '../src/synth-lab/insertsConfig.js';import {EFFECTS}from '../src/synth-lab/effectsConfig.js';
import {NATIVE_COMPRESSOR_PARAMETERS}from '../src/modular-audio/ownedNativeCompressor.js';
import {TAPE_PARAMETERS}from '../src/modular-audio/ownedTape.js';
import {MOTION_PARAMETERS}from '../src/modular-audio/ownedMotion.js';
import {RACK_FX_PARAMETERS}from '../src/modular-audio/ownedRackFx.js';import {VOICE_FX_PARAMETERS}from '../src/modular-audio/ownedVoiceFx.js';
const file='synth-engine/graph/src/effect_parameters.rs',num=v=>Number.isInteger(v)?v+'.':String(v),unit=(id,label)=>id==='hold'?'boolean':label.includes('· dB')?'dB':label.includes('· Hz')?'Hz':label.includes('· ms')?'ms':label.includes('seconds')?'s':id.includes('Spread')?'cycles':label.includes('octaves')?'octaves':'native';
const rows=(name,items)=>`pub const ${name}: [Param; ${items.length}] = [\n`+items.map(([id,label,min,max,,value])=>`    Param{id:${JSON.stringify(id)},unit:${JSON.stringify(unit(id,label))},min:${num(min)},max:${num(max)},default:${num(value)},modulation:false},`).join('\n')+'\n];\n';
const simple=(name,items)=>rows(name,items.map(([id,min,max,value])=>[id,id,min,max,0,value]));
const source='// Generated from the existing append-only host effect contracts.\nuse super::Param;\n'+rows('INSERTS',INSERTS)+rows('SEND',EFFECTS)+Object.entries({...RACK_FX_PARAMETERS,...VOICE_FX_PARAMETERS,motion:MOTION_PARAMETERS,tape:TAPE_PARAMETERS}).map(([name,items])=>simple(name.toUpperCase(),items)).join('')+rows('NATIVE_COMPRESSOR',NATIVE_COMPRESSOR_PARAMETERS.map(([id,min,max,value],i)=>[id,['Threshold · dB','Knee · dB','Ratio','Attack · seconds','Release · seconds'][i],min,max,0,value]));
export function checkGraphEffectParameters(){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')!==source)throw Error('Graph effect descriptors stale; run node tools/buildGraphEffectParameters.mjs');}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/buildGraphEffectParameters.mjs')){if(process.argv.includes('--check'))checkGraphEffectParameters();else fs.writeFileSync(file,source);}
