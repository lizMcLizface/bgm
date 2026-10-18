import {RECIPES,clonePatch,sanitizePatch,legacyPreset} from '../synth-lab/patch';
import {FM_RECIPES,cloneFM} from '../synth-lab/fmPatch';
import {findPreset} from '../app/editor/presetStore';
import {pianoPatch} from '../app/engine/pianoPatches';
import {sanitizeFM} from '../synth-lab/fmPatch';
import {FAMILIES} from './families';
import {PRESET_CATEGORIES} from '../app/presets';
import presetData from '../util/presetData';
import {stringPatch} from '../app/engine/stringPatches';
import {breathPatch} from '../app/engine/breathPatches';
import {translatedWasmVoice,needsNativeSource} from '../app/engine/wasmPreset';
import {PROCEDURAL_RECIPES} from '../synth-lab/proceduralPatch';
import {preparedPatch} from './preparedPatch';
export {FAMILIES} from './families';
const sub=(id,family,index,name,edit=()=>{})=>{const patch=clonePatch(RECIPES[index]);patch.name=name;patch.global.polyphony=12;edit(patch);return {id,family,name,kind:'subtractive',patch,sourceRecipe:RECIPES[index].name};};
const fm=(id,family,index,name,edit=()=>{})=>{const patch=cloneFM(FM_RECIPES[index]);patch.name=name;patch.global.polyphony=12;patch.global.quality=1;edit(patch);return {id,family,name,kind:'fm',patch,sourceRecipe:FM_RECIPES[index].name};};
export const LAB_VOICES=[
 fm('bowed-glass','strings',4,'Bowed glass'),sub('rosin-silk','strings',9,'Rosin silk'),sub('layered-strings','strings',2,'Layered strings'),sub('soft-strings','strings',1,'Soft ensemble'),
 fm('tine-keys','keys',0,'Tine keys'),fm('glass-bells','keys',1,'Glass bells'),fm('celeste','keys',0,'Celeste',p=>{p.global.index=.65;for(const o of p.operators){o.attack=.003;o.decay1=.35;o.decay2=1.4;o.sustain=0;o.release=.8;}}),
 {id:'felt-keys',family:'keys',name:'Felt piano · existing source',kind:'legacy',patch:pianoPatch('Felt Piano',findPreset('Felt Piano'))},
 fm('air-choir','choir',9,'Air choir'),fm('vowel-choir','choir',9,'Open vowel choir',p=>{p.global.breath=.12;p.global.formant=.7;p.global.vowel=.05;p.global.formantShift=0;}),fm('hollow-voices','choir',7,'Hollow voices',p=>{p.global.formant=.5;p.global.breath=.08;for(const o of p.operators){o.attack=.5;o.release=1.5;}}),
 fm('drawbars','organs',5,'Parallel drawbars'),fm('soft-pipes','organs',5,'Soft pipes',p=>{p.global.index=.25;p.global.formant=.2;p.global.breath=.04;for(const o of p.operators){o.attack=.08;o.release=.55;}}),fm('hollow-organ','organs',7,'Hollow reed organ',p=>{for(const o of p.operators){o.sustain=.8;o.release=.5;}}),
 sub('dco-drone','drones',3,'DCO foundation'),sub('noir-drone','drones',2,'Layered noir'),fm('living-glass','drones',8,'Living glass'),sub('slow-pressure','drones',5,'Slow pressure'),
];
for(const v of LAB_VOICES)if(v.kind!=='legacy'){v.patch.effects={...v.patch.effects,dry:1,reverb:.18,decay:v.family==='drones'?12:6,delay:v.family==='keys'?.14:.05,delayMs:375,feedback:.35};}
for(const v of LAB_VOICES)Object.assign(v,{availability:v.kind==='legacy'?'previous':'wasm',isNew:v.kind!=='legacy',origin:v.kind==='legacy'?'Existing instrument library':'New synth laboratory'});
Object.assign(LAB_VOICES.find(v=>v.id==='felt-keys'),{name:'Felt Piano',presetName:'Felt Piano'});
// Keep the original lab IDs, then expose every remaining standalone recipe.
for(const [i,family]of [[0,'winds'],[4,'leads'],[6,'leads'],[7,'pads'],[8,'strings'],[10,'plucks']]){const v=sub('core-'+i,family,i,RECIPES[i].name);Object.assign(v,{availability:'wasm',isNew:true,origin:'New subtractive laboratory'});LAB_VOICES.push(v);}
for(const [i,family]of [[2,'bass'],[3,'winds'],[6,'keys'],[10,'winds']]){const v=fm('fm-'+i,family,i,FM_RECIPES[i].name);Object.assign(v,{availability:'wasm',isNew:true,origin:'New FM laboratory'});LAB_VOICES.push(v);}
for(const [i,p]of PROCEDURAL_RECIPES.entries())if(p.family!=='drums')LAB_VOICES.push({id:'prepared-'+i,family:p.family==='piano'?'keys':p.string.bodyType==='bass'?'bass':'plucks',name:p.name,kind:'procedural',patch:preparedPatch(p),sourceRecipe:p.name,availability:'wasm',isNew:true,origin:'Prepared source · rounded contact · Wasm effects'});

export function instrumentFamily(name,category=''){
 if(category==='Bass'||/bass/i.test(name))return 'bass';
 if(/choir|voices/i.test(name))return 'choir';
 if(/organ|drawbar/i.test(name))return 'organs';
 if(/strings|viola|silk/i.test(name))return 'strings';
 if(/guitar|harp|kalimba|pluck|marimba|mallet|music box/i.test(name))return 'plucks';
 if(/piano|keys|rhodes|celest|bell|chime|rain drops/i.test(name))return 'keys';
 if(/flute|ocarina|clarinet|reed|whistle|brass|squeezebox/i.test(name))return 'winds';
 if(/drone|haze|void|underwater|pitched rain|wind pad|lofi space/i.test(name))return 'drones';
 if(category==='Leads'||/lead|squares|toy/i.test(name))return 'leads';
 return 'pads';
}
const libraryNames=new Set(['Felt Piano']);
const stringNames=new Set(['Nylon Guitar','Soft Harp','Harp Pluck','Kalimba Pluck','Upright Pluck']);
for(const [category,presets]of [...Object.entries(PRESET_CATEGORIES),['unCAGED',presetData]])for(const [name,raw]of Object.entries(presets)){
 if(name==='- INIT -'||libraryNames.has(name))continue;libraryNames.add(name);
 const patch=breathPatch(name,pianoPatch(name,stringPatch(name,raw))),family=instrumentFamily(name,category);
 LAB_VOICES.push({id:'library-'+encodeURIComponent(name),name,presetName:name,family,kind:'legacy',patch,availability:needsNativeSource(patch)?'previous':'both',isNew:false,origin:category==='unCAGED'?'Existing unCAGED library':'Existing calmbgm library'});
 if(stringNames.has(name)){const classic=name+' (classic)';LAB_VOICES.push({id:'library-'+encodeURIComponent(classic),name:classic,presetName:classic,family,kind:'legacy',patch:{...raw,stringModel:'oscillator'},availability:'both',isNew:false,origin:'Original oscillator library · before prepared-string adaptation'});}
}
export const voiceById=id=>LAB_VOICES.find(v=>v.id===id);
export const voicesFor=family=>LAB_VOICES.filter(v=>v.family===family);
export const libraryVoice=name=>LAB_VOICES.find(v=>v.presetName===name);
export const availabilityLabel=v=>v.kind==='procedural'?'Prepared · new engine':({wasm:'Wasm only',previous:'Previous only',both:'Both engines'}[v.availability]??(v.kind==='legacy'?'Previous only':'Wasm only'));
export const voiceLabel=v=>`${v.name}${v.isNew?' · NEW':''} · ${availabilityLabel(v)}`;
export const newEngineLabel=v=>v.kind==='procedural'?'Prepared source + Wasm effects':v.availability==='both'?'Wasm · translated':'Wasm engine';
export function voiceEngine(v,preferred='previous'){return v.availability==='wasm'?'wasm':v.availability==='both'&&preferred==='wasm'?'wasm':'previous';}
export function voiceSpec(v,preferred='previous',polyphony=12){
 const engine=voiceEngine(v,preferred),source=engine==='wasm'&&v.availability==='both'?translatedWasmVoice(v.patch,polyphony):{kind:v.kind,patch:v.patch};
 const patch=structuredClone(source.patch);if(source.kind!=='legacy')patch.global.polyphony=polyphony;
 return {...v,...source,patch,polyphony,engine};
}
export function voiceMetadata(spec){
 if(spec.kind==='legacy')return spec.patch;
 if(spec.kind==='procedural')return {masterVolume:spec.patch.global.gain,gainAttack:spec.patch.envelope.attack,gainDecay:spec.patch.envelope.decay,gainSustain:spec.patch.envelope.sustain,gainRelease:spec.patch.envelope.release,filterFreq:18000};
 if(spec.kind==='subtractive')return legacyPreset(spec.patch);
 const p=spec.patch,carriers=p.operators.filter((_,i)=>p.carriers[i]>0);return {masterVolume:p.global.gain,gainAttack:Math.min(...carriers.map(o=>o.attack)),gainDecay:Math.max(...carriers.map(o=>o.decay1+o.decay2)),gainSustain:Math.max(...carriers.map(o=>o.sustain)),gainRelease:Math.max(...carriers.map(o=>o.release)),vibratoDepth:p.global.vibrato,vibratoRate:p.global.lfoRate,filterFreq:10000};
}
export function addLabVoice(raw,family){if(!FAMILIES.some(f=>f[0]===family))throw Error('Unknown family');const kind=raw.kind==='fm'?'fm':raw.kind==='procedural'?'procedural':raw.layers?'subtractive':null;if(!kind)throw Error('Import a complete FM, subtractive or prepared-source patch JSON.');const patch=kind==='fm'?sanitizeFM(raw):kind==='procedural'?preparedPatch(raw):sanitizePatch(raw),id='mine-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6),entry={id,family,name:patch.name+' · mine',kind,patch,availability:'wasm',isNew:true,origin:'Custom lab variant'};LAB_VOICES.push(entry);try{localStorage.setItem('bgm-lab-voices',JSON.stringify(LAB_VOICES.filter(v=>v.id.startsWith('mine-')).slice(-32)));}catch{}return entry;}
try{const entries=JSON.parse(localStorage.getItem('bgm-lab-voices')||'[]');for(const e of Array.isArray(entries)?entries.slice(-32):[]){if(!FAMILIES.some(f=>f[0]===e.family)||!String(e.id).startsWith('mine-'))continue;const kind=e.kind==='fm'?'fm':e.kind==='procedural'?'procedural':'subtractive';LAB_VOICES.push({...e,kind,availability:'wasm',isNew:true,origin:'Custom lab variant',patch:kind==='fm'?sanitizeFM(e.patch):kind==='procedural'?preparedPatch(e.patch):sanitizePatch(e.patch)});}}catch{}
