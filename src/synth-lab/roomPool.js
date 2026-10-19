import {createEffectsBus} from './effects';
import {sanitizeEffects} from './effectsConfig';
// Send levels, dry gain and instrument delays do not define a room's response.
const ROOM_KEYS=['decay','size','damping','predelay','width','modulation','quality','reverbReturn'];
export function roomKey(raw){const p=sanitizeEffects(raw);return JSON.stringify(ROOM_KEYS.map(k=>p[k]));}
/** Owner-scoped wet returns. Clients supply post-fader room sends, not dry audio. */
export class WasmRoomPool {
 constructor(context,destination){this.context=context;this.destination=destination;this.rooms=new Map();this.disposed=false;}
 async acquire(raw,{onError=()=>{}}={}){
  if(this.disposed)throw Error('Room pool is disposed.');
  const key=roomKey(raw);let entry=this.rooms.get(key);
  if(!entry){
   const settings={...sanitizeEffects(raw),dry:0,reverb:.8,delay:0,delayToReverb:0,bypass:0};
   entry={refs:0,closed:false,listeners:new Set(),input:this.context.createGain(),bus:null};entry.input.gain.value=1/.8;
   this.rooms.set(key,entry);
   entry.ready=createEffectsBus(this.context,settings,{onError:e=>{for(const listener of entry.listeners)listener(e);}}).then(bus=>{
    entry.bus=bus;if(this.disposed){if(entry.closed)bus.dispose();else this.close(entry);throw Error('Room pool is disposed.');}
    entry.input.connect(bus.node,0,1);bus.connect(this.destination);return entry;
   }).catch(e=>{this.close(entry);if(this.rooms.get(key)===entry)this.rooms.delete(key);throw e;});
  }
  const listener=e=>onError(e);entry.refs++;entry.listeners.add(listener);
  try{await entry.ready;}catch(e){entry.refs--;entry.listeners.delete(listener);throw e;}
  let released=false;return {input:entry.input,release:()=>{
   if(released)return;released=true;entry.refs--;entry.listeners.delete(listener);
   if(entry.refs===0){this.close(entry);if(this.rooms.get(key)===entry)this.rooms.delete(key);}
  }};
 }
 close(entry){if(entry.closed)return;entry.closed=true;entry.input.disconnect();entry.bus?.dispose();}
 get diagnostics(){return Array.from(this.rooms.values(),r=>({clients:r.refs,ready:!!r.bus,settings:r.bus?.settings,stats:r.bus?.stats??null,error:r.bus?.error?.message}));}
 clear(){for(const room of this.rooms.values())room.bus?.clear();}
 dispose(){if(this.disposed)return;this.disposed=true;for(const room of this.rooms.values())this.close(room);this.rooms.clear();}
}
