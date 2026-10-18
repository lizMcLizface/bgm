import {sceneBySlug} from '../app/scenes';
import {ROLE_PRESETS} from '../app/presets';
import {libraryVoice} from './catalog';
export const LAB_ROLES=['pad','lead','counter','bass'];
export const RUNNERS=[
 {id:'held',name:'Long chords · sustain & transitions',scene:'deep-night',bpm:64,held:true},
 {id:'sparse',name:'Sparse phrases · attack & breathing',scene:'fireside-folk',bpm:84},
 {id:'keys',name:'Café ensemble · keys & bells',scene:'rainy-cafe',bpm:88},
 {id:'organ',name:'Chapel · harmony & voice leading',scene:'chapel-organ',bpm:72},
 {id:'motion',name:'Pulse · articulation & rhythm',scene:'zero-fun-zone',bpm:112},
];
export const runnerDefinition=id=>RUNNERS.find(r=>r.id===id)||RUNNERS[0];
export const runnerScene=id=>sceneBySlug(runnerDefinition(id).scene);
export function runnerVoiceIds(id){
 const scene=runnerScene(id);
 return Object.fromEntries(LAB_ROLES.map(role=>{const v=scene.voices?.[role],name=(typeof v==='string'?v:v?.name)??ROLE_PRESETS[role],entry=libraryVoice(name);if(!entry)throw Error(`Missing context instrument: ${name}`);return [role,entry.id];}));
}
export function roleSources(config){
 const backing=runnerVoiceIds(config.runner);
 return Object.fromEntries(LAB_ROLES.map(role=>[role,{id:role===config.armed?config.voices[role]:backing[role],engine:role===config.armed?config.engines?.[role]??'previous':'previous',test:role===config.armed}]));
}
