import {PHYSICAL_CLOCKED_PROFILE} from './physicalClockedProfile.js';
let compiled;
export function loadPhysicalClockedAssets(){
    return compiled??=(async()=>{const base=import.meta.env?.BASE_URL??'/',read=async path=>{const response=await fetch(base+path,{cache:'no-store'});if(!response.ok)throw Error('Missing clocked physical asset '+path);return response;},manifest=await(await read('physical-buffer-clocked/build.json')).json(),kernel=await(await read('physical-buffer-live/build.json')).json();
        if(manifest.api!==1||manifest.profile!==PHYSICAL_CLOCKED_PROFILE||manifest.clockVersion!=='7a0838a735108706'||!/^[a-f0-9]{16}$/.test(manifest.version)||manifest.baseVersion!==kernel.version||manifest.wasm!==kernel.wasm||manifest.bytes!==kernel.bytes||manifest.bytes!==253652||manifest.wasm!=='809dc82c710d67635002ec8145f6870da4ddbb89e229d0ca2a2b570744fcf308')throw Error('Clocked physical immutable dependencies differ');
        const bytes=await(await read('physical-buffer-live/buffer.wasm?v='+kernel.version)).arrayBuffer(),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(bytes.byteLength!==manifest.bytes||sha!==manifest.wasm)throw Error('Clocked physical numerical bytes differ');return{module:await WebAssembly.compile(bytes),version:manifest.version,manifest};
    })().catch(error=>{compiled=null;throw error;});
}
