import {compressSync,decompressSync,strToU8,strFromU8} from 'fflate';
import {SYNTHS} from '../models';
import {cleanRack,RACK_PARAMS} from '../effects/params';
import {defaultSettings,sanitizeSettings} from '../../app/settings';
import {findPreset,sanitizePreset} from '../../app/editor/presetStore';
import {ROLE_PRESETS} from '../../app/presets';

export const ROLES=['lead','counter','pad','bass'];
export const CLASSICS=['cs80','juno','prophet5','jupiter8','minimoog','dx7','obxa','vs'];
export const DRUM_MACHINES=['tr808','tr909'];
// Each classic's sound for each line, so one synth can play the whole ensemble: a sustained
// sound for the pad (chords), single lines for the leads and the bass. Names are its own sounds.
export const ROLE_PICKS={
 cs80:{lead:'Replicant Lead',counter:'Silk Flute',pad:'Velvet Strings',bass:'Deep Bass'},
 juno:{lead:'Hollow Lead',counter:'Breath Flute',pad:'Warm Ensemble',bass:'Bass 106'},
 prophet5:{lead:'Sync Lead',counter:'Airy Flutes',pad:'Soft Strings',bass:'Fifths Bass'},
 jupiter8:{lead:'Velvet Lead',counter:'Breath Flute',pad:'Wide Strings',bass:'Upright'},
 minimoog:{lead:'Classic Lead',counter:'Vibrato Lead',pad:'Organ Stack',bass:'Fat Bass'},
 dx7:{lead:'Soft Lead',counter:'Round Flute',pad:'Glass Tines',bass:'Soft Bass'},
 obxa:{lead:'Smoky Solo',counter:'Wood Flutes',pad:'Ensemble One',bass:'Round Bass'},
 vs:{lead:'Soft Lead',counter:'Glass Flute',pad:'Drift Field',bass:'Round Bass'},
};
const picked=(synth,role)=>SYNTHS[synth].presets.find(p=>p.name===ROLE_PICKS[synth]?.[role])??SYNTHS[synth].presets[0];
export function roleSound(synth='calmbgm',role='lead',sound){
 if(synth==='calmbgm')return {synth,name:ROLE_PRESETS[role],values:{...findPreset(ROLE_PRESETS[role])},rack:cleanRack()};
 const patch=sound??picked(synth,role);
 return {synth,name:patch.name,category:patch.category,values:SYNTHS[synth].params.sanitize(patch.values),rack:cleanRack()};
}
/** The percussion source: the generator's own kit ('calmbgm') or a drum machine and one of its kits. */
export function percussionSound(synth='calmbgm',name){
 if(!DRUM_MACHINES.includes(synth))return {synth:'calmbgm',name:'calmbgm kit'};
 const kit=SYNTHS[synth].presets.find(p=>p.name===name)??SYNTHS[synth].presets.find(p=>p.name==='Room')??SYNTHS[synth].presets[0];
 return {synth,name:kit.name,values:SYNTHS[synth].params.sanitize(kit.values)};
}
const cleanPercussion=raw=>{const p=percussionSound(raw?.synth,raw?.name);return p.synth==='calmbgm'?p:{...p,values:SYNTHS[p.synth].params.sanitize({...p.values,...raw?.values})};};
export function cleanEnsemble(raw={}){
 const roles=Object.fromEntries(ROLES.map(role=>{
  const r=raw.roles?.[role],id=CLASSICS.includes(r?.synth)?r.synth:'calmbgm';
  const fallback=roleSound(id,role);
  return [role,{...fallback,name:typeof r?.name==='string'?r.name.slice(0,60):fallback.name,category:typeof r?.category==='string'?r.category.slice(0,40):fallback.category,
   values:id==='calmbgm'?(sanitizePreset(r?.values)??fallback.values):SYNTHS[id].params.sanitize(r?.values??fallback.values),rack:RACK_PARAMS.sanitize({...cleanRack(),...r?.rack}),level:Number.isFinite(r?.level)?Math.max(.01,Math.min(4,r.level)):1,matched:r?.matched===true}];
 }));
 return {format:'bgm-ensemble',version:1,name:typeof raw.name==='string'?raw.name.slice(0,60):'My ensemble',settings:sanitizeSettings({...defaultSettings(),...raw.settings}),roles,percussion:cleanPercussion(raw.percussion),percussionRack:RACK_PARAMS.sanitize({...cleanRack(),...raw.percussionRack}),light:raw.light===true};
}
const patchBy=(id,words)=>SYNTHS[id].presets.find(p=>words.test(p.name))??SYNTHS[id].presets[0];
const make=(name,settings,roles,percussion)=>cleanEnsemble({name,settings:{counter:{mode:'answer',activity:.6},...settings},roles:Object.fromEntries(Object.entries(roles).map(([role,[id,match]])=>[role,roleSound(id,role,patchBy(id,match))])),percussion});
/** Every line on one synth. */
export const engineRoles=synth=>Object.fromEntries(ROLES.map(role=>[role,roleSound(synth,role)]));
// One shared piece for the single-synth ensembles: switching between them changes only the sounds.
export const ENGINE_MUSIC={bpm:82,tonic:9,mode:'Major-6',counter:{mode:'answer',activity:.6},drums:{style:'lofi',activity:.5,variation:.5,sprinkle:.35,kit:'felt'}};
export const ENGINE_ENSEMBLES=CLASSICS.map((id,i)=>cleanEnsemble({name:'All '+SYNTHS[id].name,settings:ENGINE_MUSIC,roles:engineRoles(id),percussion:percussionSound(i%2?'tr909':'tr808')}));
export const ENSEMBLES=[
 ...ENGINE_ENSEMBLES,
 make('Oracle lead',{bpm:76},{lead:['prophet5',/sync edge/i]}),
 make('FM keys',{bpm:84,tonic:2,mode:'Major-2'},{pad:['dx7',/glass tines/i],bass:['jupiter8',/upright/i]}),
 make('Vector night',{bpm:68,tonic:9,mode:'Major-6'},{pad:['vs',/drift field/i],lead:['obxa',/lead/i]}),
 make('Four classics',{bpm:80,sections:{mode:'off'},leadActivity:1,counter:{mode:'line',activity:1}},{lead:['prophet5',/lead/i],counter:['dx7',/bell/i],pad:['juno',/pad/i],bass:['minimoog',/bass/i]}),
];
export function encodeEnsemble(state){const bytes=compressSync(strToU8(JSON.stringify(cleanEnsemble(state))));return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function decodeEnsemble(text){
 if(typeof text!=='string'||text.length>100000)throw Error('This ensemble link is too large.');
 const bytes=Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
 const raw=JSON.parse(strFromU8(decompressSync(bytes)));
 if(raw.format!=='bgm-ensemble'||raw.version!==1)throw Error('This is not a supported ensemble setup.');
 return cleanEnsemble(raw);
}
