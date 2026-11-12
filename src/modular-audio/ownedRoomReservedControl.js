import{OwnedRoomControlLive,validateRoomAmount}from'./ownedRoomControlLive.js';
export const ROOM_RESERVED_CONTROL_PROFILE='original-room-output-clock-reserved-gains-v2';
export class OwnedRoomReservedControl extends OwnedRoomControlLive{
 constructor(module,configuration){super(module,configuration);try{if(this.e.room_control_ready_api?.()!==1||['room_control_reserve_ready','room_control_cancel_ready','room_control_ready_credit','room_control_ready_stat'].some(k=>typeof this.e[k]!=='function'))throw Error('Prepared Room ABI missing');}catch(e){this.dispose();throw e;}}
 reserveReady(id,value){this.alive();validateRoomAmount(value);this.check(this.e.room_control_reserve_ready(this.handle,id,value),'prepared pair capacity');}
 cancelReady(id){this.alive();this.check(this.e.room_control_cancel_ready(this.handle,id),'unused prepared pair cancellation');}
 credits(){if(!this.handle)throw Error('Prepared Room controller disposed');return{dry:this.e.room_control_ready_credit(this.handle,0),wet:this.e.room_control_ready_credit(this.handle,1)};}
 stats(){return{...super.stats(),credits:this.credits(),prepared:{reserved:this.e.room_control_ready_stat(this.handle,0),cancelled:this.e.room_control_ready_stat(this.handle,1),ready:this.e.room_control_ready_stat(this.handle,2),started:this.e.room_control_ready_stat(this.handle,3)}};}
}
let loading;
export function loadRoomReservedControlAssets(){return loading??=(async()=>{const base=(import.meta.env?.BASE_URL??'/')+'room-control-reserved/',get=async p=>{const r=await fetch(base+p,{cache:'no-store'});if(!r.ok)throw Error('Missing reserved Room controller asset');return r;},manifest=await(await get('build.json')).json(),bytes=await(await get('control.wasm?v='+manifest.version)).arrayBuffer(),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');if(manifest.api!==1||manifest.profile!==ROOM_RESERVED_CONTROL_PROFILE||manifest.audited!==false||manifest.wasm!==sha||manifest.bytes!==bytes.byteLength)throw Error('Reserved Room controller identity differs');return{manifest,module:await WebAssembly.compile(bytes)};})().catch(e=>{loading=null;throw e;});}
