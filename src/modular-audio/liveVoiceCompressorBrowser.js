const prepared=new WeakMap();
const base=`${import.meta.env?.BASE_URL??'/'}voice-compressor-live/`;
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
export function prepareLiveVoiceCompressor(context){
 if(prepared.has(context))return prepared.get(context);
 const promise=(async()=>{if(!context.audioWorklet||typeof AudioWorkletNode!=='function')throw Error('Rust VoiceCompressor requires AudioWorklet');if(!Number.isInteger(context.sampleRate)||context.sampleRate<8000||context.sampleRate>192000)throw Error('Unsupported live compressor sample rate');const response=await fetch(base+'build.json',{cache:'no-store'});if(!response.ok)throw Error('Live VoiceCompressor manifest unavailable');const manifest=await response.json();if(manifest.api!==1||manifest.audited||!manifest.processorName||manifest.profile?.profile!=='legacy-voice-compressor-live-e14de735-v1')throw Error('Live VoiceCompressor manifest/profile differs');const r=await fetch(base+`engine.wasm?v=${manifest.version}`,{cache:'no-store'});if(!r.ok)throw Error('Live VoiceCompressor Wasm unavailable');const bytes=await r.arrayBuffer();if(await digest(bytes)!==manifest.wasm)throw Error('Live VoiceCompressor fingerprint differs');const module=await WebAssembly.compile(bytes);await context.audioWorklet.addModule(base+`processor.js?v=${manifest.version}`);return{manifest,module};})();
 prepared.set(context,promise);promise.catch(()=>{if(prepared.get(context)===promise)prepared.delete(context);});return promise;
}
