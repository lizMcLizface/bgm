// This is note preparation, outside the audio callback. Existing native voices
// still own envelopes, filters, stereo placement, effects and scheduling.
const TYPES={felt:0,electric:1,grand:2,felted:3,upright:4,ambient:5,glass:6,drama:7,soft:8,subdued:9,concert:10,measured:11,measuredAmbient:12,measuredDrama:13,measuredGlass:14,measuredHouse:15,measuredRavel:16,measuredSoft:17,measuredSubdued:18};
export const supportsRustPiano=({type='felt'}={})=>Object.hasOwn(TYPES,type);
export const supportsRustPianoBody=({type='felt'}={})=>type==='felt'||type==='electric';
export function createRustPiano(module){
 const e=new WebAssembly.Instance(module,{}).exports;if(e.piano_api_version?.()!==1)throw Error('Unsupported piano preparation ABI.');
 let closed=false;const handles=new Set();
 const check=()=>{if(closed)throw Error('Piano renderer disposed.');};
 function own(ptr){if(!ptr)throw Error('Invalid piano preparation configuration.');let freed=false;const note={samples(){check();if(freed)throw Error('Piano note disposed.');return new Float32Array(e.memory.buffer,e.piano_note_ptr(ptr),e.piano_note_len(ptr)).slice();},dispose(){if(freed)return;freed=true;handles.delete(note);e.piano_note_free(ptr);}};handles.add(note);return note;}
 function createNote(sr,freq,{type='felt',decay=2.5,brightness=.45,hammer=.3,unison=.25,velocity=.8,seed=1,resonance=0,softness=0,wear=0}={}){check();if(!supportsRustPiano({type}))throw Error(`Piano type ${type} requires its original renderer.`);return own(e.piano_note_new(sr,freq,TYPES[type],decay,brightness,hammer,unison,velocity,seed>>>0,resonance,softness,wear));}
 function createBody(sr,freq,{type='felt',brightness=.45,velocity=.8,sustain=0,resonance=0}={}){check();if(!supportsRustPianoBody({type}))throw Error(`Piano type ${type} requires its original renderer.`);return own(e.piano_body_new(sr,freq,type==='electric'?1:0,brightness,velocity,sustain,resonance));}
 const render=(create,args)=>{const note=create(...args);try{return note.samples();}finally{note.dispose();}};
 return {createNote,createBody,renderNote:(...args)=>render(createNote,args),renderBody:(...args)=>render(createBody,args),dispose(){if(closed)return;for(const n of [...handles])n.dispose();closed=true;},get activeHandles(){return handles.size;},get memoryBytes(){return e.memory.buffer.byteLength;}};
}
let prepared;
export async function loadRustPiano(){
 if(!prepared)prepared=(async()=>{const base=import.meta.env.BASE_URL+'piano-preparation/',r=await fetch(base+'build.json',{cache:'no-cache'});if(!r.ok)throw Error(`Piano manifest HTTP ${r.status}`);const m=await r.json();if(m.api!==1||!/^[a-f0-9]{16}$/.test(m.version))throw Error('Invalid piano preparation manifest.');const response=await fetch(base+'piano.wasm?v='+m.version);if(!response.ok)throw Error(`Piano Wasm HTTP ${response.status}`);return {renderer:createRustPiano(await WebAssembly.compile(await response.arrayBuffer())),version:m.version};})().catch(error=>{prepared=null;throw error;});
 return prepared;
}
