// Original RoomColour constructor/control law, now owned by a portable Rust state.
export const ROOM_COLOUR_PROFILE='chromium-room-colour-f32-128-target-v1';
const ranges={predelay:[0,.225],damping:[200,20000]},keys=['predelay','damping'];
const valid=(key,v)=>typeof v==='number'&&Number.isFinite(v)&&v>=ranges[key][0]&&v<=ranges[key][1];
export function validateRoomColourSpec(raw){
 if(!raw||Object.keys(raw).some(k=>!['version','profile','sampleRate','channels','initial','events'].includes(k))||raw.version!==1||raw.profile!==ROOM_COLOUR_PROFILE||!Number.isInteger(raw.sampleRate)||raw.sampleRate<8000||raw.sampleRate>192000||![1,2].includes(raw.channels)||!raw.initial||Object.keys(raw.initial).length!==2||keys.some(k=>!valid(k,raw.initial[k]))||!Array.isArray(raw.events)||raw.events.length>512)throw Error('Invalid RoomColour contract');
 let previous=-1;const counts=[0,0],times=[-1,-1];for(const e of raw.events){const i=keys.indexOf(e?.parameter);if(i<0||Object.keys(e).length!==3||typeof e.seconds!=='number'||!Number.isFinite(e.seconds)||e.seconds<previous||e.seconds<0||e.seconds*raw.sampleRate>9007199254740864||!valid(e.parameter,e.value)||times[i]>=e.seconds&&e.seconds!==0||++counts[i]>255)throw Error('Invalid RoomColour captured control');previous=e.seconds;times[i]=e.seconds;}
 return raw;
}
export function roomColourSpec(sampleRate,{channels=2,predelay=.025,damping=6000,events=[]}={}){return validateRoomColourSpec({version:1,profile:ROOM_COLOUR_PROFILE,sampleRate,channels,initial:{predelay,damping},events:events.map(e=>({...e}))});}
export const saveRoomColourSpec=spec=>JSON.stringify(validateRoomColourSpec(spec))+'\n';
export const loadRoomColourSpec=text=>validateRoomColourSpec(JSON.parse(text));
export class OwnedRoomColour{
 constructor(engine,spec){this.e=engine;const c=loadRoomColourSpec(saveRoomColourSpec(spec));for(const e of c.events)Object.freeze(e);Object.freeze(c.initial);Object.freeze(c.events);this.spec=Object.freeze(c);this.currentTargets={...c.initial};if(engine.room_colour_api()!==1)throw Error('RoomColour ABI mismatch');this.handle=engine.room_colour_new(c.sampleRate,c.channels);if(!this.handle)throw Error('RoomColour preparation failed');try{keys.forEach((k,i)=>this.check(engine.room_colour_initial(this.handle,i,c.initial[k])));for(const e of c.events)this.check(engine.room_colour_event(this.handle,keys.indexOf(e.parameter),e.seconds,e.value));this.check(engine.room_colour_prepare(this.handle));this.refresh();}catch(e){this.dispose();throw e;}}
 check(ok){if(!ok)throw Error('RoomColour operation rejected');}
 alive(){if(!this.handle)throw Error('RoomColour disposed');}
 refresh(){this.alive();this.memory=this.e.memory.buffer;this.input=Array.from({length:this.spec.channels},(_,c)=>new Float32Array(this.memory,this.e.room_colour_input(this.handle,c),2048));this.output=Array.from({length:this.spec.channels},(_,c)=>new Float32Array(this.memory,this.e.room_colour_output(this.handle,c),2048));this.controls=[0,1].map(c=>new Float32Array(this.memory,this.e.room_colour_controls(this.handle,c),128));}
 render(n){this.alive();if(!Number.isInteger(n)||n<0||n>2048)throw Error('RoomColour render bounds');if(this.memory!==this.e.memory.buffer)throw Error('RoomColour memory changed; refresh outside render');this.check(this.e.room_colour_render(this.handle,n));}
 schedule(parameter,seconds,value){this.alive();const i=keys.indexOf(parameter);if(i<0||typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<0||seconds*this.spec.sampleRate>9007199254740864||!valid(parameter,value))throw Error('Invalid RoomColour live control');this.check(this.e.room_colour_schedule(this.handle,i,seconds,value));this.currentTargets[parameter]=value;}
 reset(){this.alive();this.e.room_colour_reset(this.handle);}
 stats(){this.alive();return Object.fromEntries(['frame','peak','channels','rejected','generatedUntil','prepared'].map((key,i)=>[key,this.e.room_colour_stat(this.handle,i)]));}
 // Captured-spec replay and saved current UI targets are intentionally distinct.
 capturedSnapshot(){this.alive();return loadRoomColourSpec(saveRoomColourSpec(this.spec));}
 settingsSnapshot(){this.alive();return roomColourSpec(this.spec.sampleRate,{channels:this.spec.channels,...this.currentTargets});}
 dispose(){if(this.handle){this.e.room_colour_free(this.handle);this.handle=0;this.input=this.output=this.controls=this.memory=null;}}
}
let pending;
export function loadRoomColourAssets(){return pending??=(async()=>{const base=(import.meta.env?.BASE_URL??'/')+'room-colour/',get=async p=>{const r=await fetch(base+p);if(!r.ok)throw Error('Missing RoomColour asset');return r;},manifest=await(await get('build.json')).json(),bytes=await(await get('colour.wasm?v='+manifest.version)).arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');if(manifest.api!==1||manifest.profile!==ROOM_COLOUR_PROFILE||manifest.audited||manifest.wasm!==hash)throw Error('RoomColour integrity mismatch');return{manifest,module:await WebAssembly.compile(bytes)};})().catch(e=>{pending=null;throw e;});}
