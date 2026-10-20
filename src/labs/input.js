// Home row naturals, row above accidentals. Z/X change the playing octave.
export const KEY_OFFSETS={KeyA:0,KeyW:1,KeyS:2,KeyE:3,KeyD:4,KeyF:5,KeyT:6,KeyG:7,KeyY:8,KeyH:9,KeyU:10,KeyJ:11,KeyK:12,KeyO:13,KeyL:14,KeyP:15,Semicolon:16,Quote:17,BracketRight:18};
export function mapVelocity(value,{curve=1,floor=.12,ceiling=1,gain=1,fixed=false,keyboard=.7}={}){const v=Math.min(1,Math.max(0,value));if(v===0)return 0;return fixed?keyboard:Math.min(1,Math.max(0,(floor+(ceiling-floor)*v**curve)*gain));}
export function bindLabKeyboard(target,{on,off,panic,octave=()=>4,shift=()=>{},velocity=()=>.7,switchEngine=()=>{},enabled=()=>true}){
 const held=new Map();const down=e=>{if(!enabled()||e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.target?.closest?.('input,select,textarea,[contenteditable=true]'))return;if(e.code==='Escape'){panic();return;}if(e.code==='KeyB'){e.preventDefault();switchEngine();return;}if(e.code==='KeyZ'||e.code==='KeyX'){e.preventDefault();shift(e.code==='KeyZ'?-1:1);return;}if(KEY_OFFSETS[e.code]!==undefined){e.preventDefault();const key='key:'+e.code;held.set(e.code,key);on(key,(octave()+1)*12+KEY_OFFSETS[e.code],velocity());}};
 const up=e=>{const key=held.get(e.code);if(key){e.preventDefault();held.delete(e.code);off(key);}};const clear=()=>{for(const key of held.values())off(key);held.clear();};target.addEventListener('keydown',down);target.addEventListener('keyup',up);target.addEventListener('blur',clear);
 return ()=>{clear();target.removeEventListener('keydown',down);target.removeEventListener('keyup',up);target.removeEventListener('blur',clear);};
}
export class LabMidi {
 // polyPressure (poly aftertouch) and soft (CC67) are optional; pages without them ignore those messages.
 constructor({on,off,sustain,control,panic,polyPressure,soft,realtime,onStatus=()=>{}}){Object.assign(this,{on,off,sustain,control,panic,polyPressure,soft,realtime,onStatus});this.bound=new Map();this.selected='all';this.channel='all';}
 async connect(){if(!navigator.requestMIDIAccess)throw Error('Web MIDI is unavailable in this browser. Use a supported browser over HTTPS, or the on-screen keyboard.');this.access=await navigator.requestMIDIAccess({sysex:false});this.access.onstatechange=()=>this.refresh();this.refresh();return this.inputs();}
 inputs(){return [...(this.access?.inputs.values()??[])].map(i=>({id:i.id,name:i.name||i.id}));}
 refresh(){for(const input of this.bound.values())input.onmidimessage=null;this.bound.clear();for(const input of this.access?.inputs.values()??[]){if(input.state==='disconnected')continue;input.onmidimessage=e=>{if(this.selected==='all'||this.selected===input.id)this.message(e.data,input.id);};this.bound.set(input.id,input);}this.panic();this.onStatus(this.inputs());}
 message(data,device='test'){if(data[0]>=248){this.realtime?.(data[0]);return;}const [status,a,b=0]=data,kind=status&240,ch=status&15;if(this.channel!=='all'&&Number(this.channel)!==ch+1)return;const key=`midi:${device}:${ch}:${a}`;
  if(kind===144&&b>0)this.on(key,a,b/127);else if(kind===128||kind===144)this.off(key);else if(kind===176){if(a===64)this.sustain(b>=64);else if(a===123||a===120)this.panic();else if(a===1)this.control('motion',b/127);else if(a===11)this.control('level',b/127);else if(a===74)this.control('brightness',b/127*2-1);else if(a===67)this.soft?.(b/127);}else if(kind===160)this.polyPressure?.(key,b/127);else if(kind===224)this.control('bend',((a+b*128)-8192)/8192*2);else if(kind===208)this.control('pressure',a/127);
 }
 dispose(){for(const input of this.bound.values())input.onmidimessage=null;this.bound.clear();if(this.access)this.access.onstatechange=null;this.panic();}
}
