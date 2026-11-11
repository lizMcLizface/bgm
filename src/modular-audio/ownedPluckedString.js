// Pure numeric preparation and bounded copy playback of the actual generator KS
// source. AudioBuffer resampling/envelopes/filter/colour/racks remain host work.
export const STRING_BODIES=Object.freeze(['guitar','harp','bass','kalimba']);
const defaults={decay:2,damping:.5,position:.2,body:.25,resonance:0,bodyType:'guitar',seed:1,softness:0};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
const range=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
export function pluckedStringSpec(sampleRate,frequency,options={}){const p=Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,options[key]===undefined?value:options[key]])),rate=clamp(sampleRate,8000,192000);return validatePluckedStringSpec({version:1,sampleRate:rate,frequency:clamp(frequency,10,rate/6),decay:clamp(p.decay,.15,5),damping:clamp(p.damping,0,1),position:clamp(p.position,.05,.45),body:clamp(p.body,0,1),resonance:clamp(p.resonance,0,1),bodyType:STRING_BODIES.includes(p.bodyType)?p.bodyType:'guitar',seed:(p.seed>>>0)||1,softness:clamp(p.softness,0,1)});}
// Match stringBuffer's cache pitch key before preparing its material.
export const pluckedStringBufferSpec=(rate,frequency,options)=>pluckedStringSpec(rate,Math.round(frequency*100)/100,options);
export function validatePluckedStringSpec(p){if(p?.version!==1||!range(p.sampleRate,8000,192000)||!range(p.frequency,10,p.sampleRate/6)||!range(p.decay,.15,5)||!range(p.damping,0,1)||!range(p.position,.05,.45)||!range(p.body,0,1)||!range(p.resonance,0,1)||!STRING_BODIES.includes(p.bodyType)||!Number.isInteger(p.seed)||p.seed<1||p.seed>0xffffffff||!range(p.softness,0,1))throw Error('Invalid owned plucked-string configuration');return p;}
export const savePluckedStringSpec=p=>JSON.stringify(validatePluckedStringSpec(p),null,2)+'\n';
export const loadPluckedStringSpec=text=>validatePluckedStringSpec(JSON.parse(text));
export class OwnedPluckedString {
 constructor(engine,spec){this.engine=engine;this.spec=loadPluckedStringSpec(savePluckedStringSpec(spec));if(engine.string_owned_api()!==1)throw Error('Owned plucked-string ABI mismatch');const p=this.spec;this.handle=engine.string_owned_new(p.sampleRate,p.frequency,p.decay,p.damping,p.position,p.body,p.resonance,STRING_BODIES.indexOf(p.bodyType),p.seed,p.softness);if(!this.handle)throw Error('Plucked-string preparation failed');this.length=engine.string_owned_len(this.handle);this.refresh();}
 alive(){if(!this.handle)throw Error('Disposed plucked string');}
 refresh(){this.alive();this.memory=this.engine.memory.buffer;this.samples=new Float32Array(this.memory,this.engine.string_owned_samples(this.handle),this.length);[this.left,this.right]=[0,1].map(ch=>new Float32Array(this.memory,this.engine.string_owned_output(this.handle,ch),2048));}
 render(frames){this.alive();if(!Number.isInteger(frames)||frames<0||frames>2048)throw Error('Invalid plucked-string render bounds');if(this.memory!==this.engine.memory.buffer)throw Error('Plucked-string memory grew; refresh outside render');if(!this.engine.string_owned_render(this.handle,frames))throw Error('Plucked-string render failed');}
 reset(){this.alive();this.engine.string_owned_reset(this.handle);}
 get frame(){this.alive();return this.engine.string_owned_frame(this.handle);}
 dispose(){if(this.handle){this.engine.string_owned_free(this.handle);this.handle=0;this.samples=this.left=this.right=this.memory=null;}}
}
let code;
export async function loadOwnedPluckedString(){
 code??=(async()=>{const base=`${import.meta.env.BASE_URL}plucked-string/`,get=async file=>{const r=await fetch(base+file);if(!r.ok)throw Error('Missing plucked-string asset');return r;},manifest=await(await get('build.json')).json(),bytes=await(await get(`string.wasm?v=${manifest.version}`)).arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes),hash=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==manifest.wasm)throw Error('Stale plucked-string Wasm');return {module:await WebAssembly.compile(bytes),version:manifest.version};})().catch(e=>{code=null;throw e;});
 const {module,version}=await code,engine=new WebAssembly.Instance(module,{}).exports;return {engine,version,prepare:spec=>new OwnedPluckedString(engine,spec)};
}
