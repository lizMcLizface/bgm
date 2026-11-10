// Owned Iowa measurement + FFT preparation. This runs before realtime playback.
// Host upload is numeric serialization; settling, interpolation and signal
// preparation are performed by Rust. No original model.js function is called.
import {PATCHES} from '../app/engine/iowaModel/patches';
const LAYERS=['pp','mf','ff'],HELD=['h','s','e','r','n','b','v'];
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const checked=code=>{if(code)throw Error('Invalid Iowa preparation data');};
export function createRustIowaPreparation(module){
 const e=new WebAssembly.Instance(module,{}).exports;if(e.iowa_prep_api?.()!==1)throw Error('Unsupported Iowa preparation ABI');
 let closed=false;const tables=new Set(),notes=new Set();
 const alive=()=>{if(closed)throw Error('Iowa preparation renderer disposed');};
 function createTable(table,{settled=false}={}){
  alive();if(!table||typeof table.id!=='string'||!table.layers||typeof table.layers!=='object'||typeof settled!=='boolean')throw Error('Invalid Iowa measurement table');
  const patch=PATCHES.find(p=>p.id===table.id);if(!patch)throw Error('Unknown Iowa measurement table');
  const handle=e.iowa_prep_table_new(Number(!!table.decay),Number(!!patch.even),patch.soften?.from??0,patch.soften?.perOctave??0,Number(settled));if(!handle)throw Error('Invalid Iowa measurement configuration');
  let freed=false;
  try{
   for(const [layer,list]of Object.entries(table.layers)){
    const layerCode=LAYERS.indexOf(layer);if(layerCode<0||!Array.isArray(list)||list.length>128)throw Error('Invalid Iowa measurement layer');
    for(const note of list){if(!note||![note.m,note.l,note.d??0,...(settled?[note.level]:[])].every(finite))throw Error('Invalid Iowa measurement take');
     const take=e.iowa_prep_take(handle,layerCode,note.m,note.l,note.d??0,note.level??note.l);if(!take)throw Error('Iowa measurement take capacity exceeded');
     const fields=table.decay?[[5,note.b],[7,note.p?.flat()]]:HELD.map((key,i)=>[i,key==='s'?note.s?.flat():note[key]]);
     for(const [field,data]of fields){if(!Array.isArray(data)||data.length>262144||!data.every(finite))throw Error('Invalid Iowa measurement field');const scratch=e.iowa_prep_buffer_new(data.length);if(!scratch)throw Error('Iowa preparation scratch bound exceeded');try{new Float64Array(e.memory.buffer,e.iowa_prep_buffer_ptr(scratch),data.length).set(data);checked(e.iowa_prep_data(handle,take,field,scratch));}finally{e.iowa_prep_buffer_free(scratch);}}
    }
   }
   checked(e.iowa_prep_settle(handle));
  }catch(error){e.iowa_prep_table_free(handle);throw error;}
  const preparedTable={prepare(midi,strength,sampleRate,{vibrato=1,seed=1,id=1}={}){
   alive();if(freed)throw Error('Iowa measurement table disposed');if(!Number.isInteger(id)||id<1||id>0xffffffff||![midi,strength,sampleRate,vibrato,seed].every(finite)||!Number.isInteger(sampleRate)||!Number.isInteger(seed))throw Error('Invalid Iowa preparation request');
   const ptr=e.iowa_prep_note(handle,midi,strength,sampleRate,vibrato,seed);if(!ptr)throw Error('Iowa note outside measured range or preparation bounds');
   let disposed=false;
   const note={read(){alive();if(disposed)throw Error('Iowa prepared note disposed');const read=field=>Array.from(new Float64Array(e.memory.buffer,e.iowa_prep_note_ptr(ptr,field),e.iowa_prep_note_len(ptr,field))),meta=i=>e.iowa_prep_note_meta(ptr,i);let bank;
    if(meta(0)===0){const tables=read(1);bank={id,kind:'held',f0:meta(1),rate:meta(3),depth:meta(4),tremolo:meta(5),pitchWander:meta(6),levelWander:meta(7),times:read(0),tables:Array.from({length:tables.length/2048},(_,i)=>tables.slice(i*2048,(i+1)*2048)),envTimes:read(2),envDb:read(3),relTimes:read(4),relDb:read(5),noise:read(6),burst:read(7)};
    }else{const rows=read(8),keys=['frequency','amplitude','phase','rise','early','late'];bank={id,kind:'decay',seconds:meta(2),burst:read(7),...Object.fromEntries(keys.map((key,i)=>[key,Array.from({length:rows.length/6},(_,j)=>rows[j*6+i])]))};}
    return {bank,level:meta(8)};
   },dispose(){if(disposed)return;disposed=true;notes.delete(note);e.iowa_prep_note_free(ptr);}};notes.add(note);return note;
  },prepareBank(...args){const note=this.prepare(...args);try{return note.read();}finally{note.dispose();}},dispose(){if(freed)return;freed=true;tables.delete(preparedTable);e.iowa_prep_table_free(handle);}};
  tables.add(preparedTable);return preparedTable;
 }
 return {createTable,prepareBank(table,midi,velocity,sampleRate,{vibrato=1,seed=midi*31+Math.max(1,Math.round(Math.round(velocity*12)/12*127)),id=1,settled=false}={}){alive();if(!finite(velocity)||velocity<0||velocity>1)throw Error('Invalid Iowa note velocity');const t=createTable(table,{settled});try{return t.prepareBank(midi,Math.max(1,Math.round(Math.round(velocity*12)/12*127)),sampleRate,{vibrato,seed,id});}finally{t.dispose();}},dispose(){if(closed)return;for(const n of [...notes])n.dispose();for(const t of [...tables])t.dispose();closed=true;},get activeTables(){return tables.size;},get activeNotes(){return notes.size;},get memoryBytes(){return e.memory.buffer.byteLength;}};
}
// Cache only immutable compiled code. Every caller receives its own Wasm memory,
// owned tables and lifetime; disposing one renderer cannot invalidate another.
let compiled;
export async function loadRustIowaPreparation(){
 if(!compiled)compiled=(async()=>{const base=(import.meta.env?.BASE_URL??'/')+'iowa-preparation/',response=await fetch(base+'build.json',{cache:'no-cache'});if(!response.ok)throw Error(`Iowa preparation manifest HTTP ${response.status}`);const manifest=await response.json();if(manifest.api!==1||!/^[a-f0-9]{16}$/.test(manifest.version))throw Error('Invalid Iowa preparation manifest');const wasm=await fetch(base+'iowa.wasm?v='+manifest.version);if(!wasm.ok)throw Error(`Iowa preparation Wasm HTTP ${wasm.status}`);return {module:await WebAssembly.compile(await wasm.arrayBuffer()),version:manifest.version};})().catch(error=>{compiled=null;throw error;});
 const {module,version}=await compiled;return {renderer:createRustIowaPreparation(module),version};
}
