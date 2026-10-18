// Native Wasm voices shared by main-page presets and the audition labs.
// Flat metadata keeps existing composition/editor/serialization contracts;
// wasmVoice selects the full patch rather than translating that metadata.
import {RECIPES,clonePatch,legacyPreset} from './patch';
import {FM_RECIPES,cloneFM} from './fmPatch';
const definitions=[
 ['bowed-glass','Wasm Bowed Glass','strings','fm',4],
 ['rosin-silk','Wasm Rosin Silk','strings','subtractive',9],
 ['tine-keys','Wasm Tine Keys','keys','fm',0],
 ['glass-bells','Wasm Glass Bells','keys','fm',1],
 ['air-choir','Wasm Air Choir','choir','fm',9],
 ['drawbars','Wasm Drawbars','organs','fm',5],
 ['soft-pipes','Wasm Soft Pipes','organs','fm',5],
 ['dco-drone','Wasm DCO Foundation','drones','subtractive',3],
 ['fm-2','Wasm Round FM Bass','bass','fm',2],
];
export const WASM_VOICES=definitions.map(([id,name,family,kind,index])=>{
 const patch=kind==='fm'?cloneFM(FM_RECIPES[index]):clonePatch(RECIPES[index]);patch.name=name;patch.global.polyphony=12;if(kind==='fm')patch.global.quality=1;
 if(id==='soft-pipes'){patch.global.index=.25;patch.global.formant=.2;patch.global.breath=.04;for(const o of patch.operators){o.attack=.08;o.release=.55;}}
 patch.effects={...patch.effects,dry:1,reverb:.18,decay:family==='drones'?12:6,delay:family==='keys'?.14:.05,delayMs:375,feedback:.35};
 const carriers=kind==='fm'?patch.operators.filter((_,i)=>patch.carriers[i]>0):[];
 const metadata=kind==='fm'?{masterVolume:patch.global.gain,gainAttack:Math.min(...carriers.map(o=>o.attack)),gainDecay:Math.max(...carriers.map(o=>o.decay1+o.decay2)),gainSustain:Math.max(...carriers.map(o=>o.sustain)),gainRelease:Math.max(...carriers.map(o=>o.release)),filterFreq:10000}:legacyPreset(patch);
 return {id,name,family,kind,patch,metadata};
});
export const WASM_PRESETS=Object.fromEntries(WASM_VOICES.map(v=>[v.name,{...v.metadata,wasmVoice:v.id}]));
export const wasmVoiceById=id=>WASM_VOICES.find(v=>v.id===id);
export function nativeWasmVoice(preset,polyphony=8){
 const v=wasmVoiceById(preset?.wasmVoice);if(!v)return null;
 const patch=structuredClone(v.patch),base=v.metadata;
 patch.global.polyphony=polyphony;
 patch.global.gain*=preset.masterVolume/base.masterVolume;
 // Apply the flat editor's common envelope controls to the actual carriers.
 const lanes=v.kind==='fm'?patch.operators.filter((_,i)=>patch.carriers[i]>0):patch.layers;
 for(const l of lanes){
  for(const [field,key]of [['attack','gainAttack'],['release','gainRelease'],['sustain','gainSustain']]){
   if(preset[key]!==base[key])l[field]=base[key]>0?l[field]*preset[key]/base[key]:preset[key];
  }
  if(preset.gainDecay!==base.gainDecay){const ratio=base.gainDecay>0?preset.gainDecay/base.gainDecay:1;if(v.kind==='fm'){l.decay1*=ratio;l.decay2*=ratio;}else l.decay*=ratio;}
  if(v.kind==='subtractive'&&preset.filterFreq!==base.filterFreq)l.cutoff*=preset.filterFreq/base.filterFreq;
 }
 return {kind:v.kind,patch};
}
