import{StampedFloat64Words}from'./stampedWordTransport.js';
export const FDN_WORD_OPTIONS=Object.freeze({wordCount:10,slots:32,prefix:'fdn'});
export const FDN_PRESET_KEYS=Object.freeze(['reverbAmount','reverbType','reverbDecay','reverbDamping','reverbPredelay']);
export const FDN_ROOM_FRONTEND=Object.freeze([[113,2080],[96,1500],[259,8520],[167,5750],[113,2850],[179,9660]].map(Object.freeze));
const defaults={reverbAmount:0,reverbType:'reverb3',reverbDecay:8,reverbDamping:6000,reverbPredelay:.025};
export function fdnRoomKind(value){return typeof value==='string'&&/^reverb[1-6]$/.test(value)?Number(value.at(-1)):0;}
export function validateFdnRoomPreset(raw={}){if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid FDN preset');for(const k of FDN_PRESET_KEYS){const v=Object.hasOwn(raw,k)?raw[k]:defaults[k];if(k==='reverbType'?!fdnRoomKind(v):typeof v!=='number'||!Number.isFinite(v)||!Number.isFinite(Math.fround(v)))throw Error('Invalid FDN preset '+k);}return raw;}
export class FdnRoomWordCodec{
 constructor(){this.f64=new StampedFloat64Words();this.words=new Uint16Array(10);this.op=0;this.arg=0;this.value=0;this.seconds=0;}
 encode(op,arg,value,seconds){this.validate(op,arg,value,seconds);this.words[0]=op;this.words[1]=arg;this.f64.encode(value,this.words,2);this.f64.encode(seconds,this.words,6);return this.words;}
 decode(words,offset=0){if(!Number.isInteger(offset)||offset<0||offset+10>words.length)throw Error('Invalid FDN word offset');this.op=words[offset];this.arg=words[offset+1];this.value=this.f64.decode(words,offset+2);this.seconds=this.f64.decode(words,offset+6);this.validate(this.op,this.arg,this.value,this.seconds);return this;}
 validate(op,arg,value,seconds){if(!Number.isInteger(op)||!Number.isInteger(arg)||typeof value!=='number'||!Number.isFinite(value)||!Number.isFinite(Math.fround(value))||typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<0||!(op===0&&arg>=0&&arg<6||op===4&&arg>=0&&arg<2||(op===1||op===2)&&arg>=1&&arg<=6||op===3&&arg===0&&value===0))throw Error('Invalid FDN word command');}
 apply(core,author){if(this.seconds!==author/core.rate)throw Error('FDN authored seconds differ');if(this.op===4)core.amountLane(this.arg,this.value,author,this.seconds);else if(this.op===0)core.lane(this.arg,this.value,author,this.seconds);else if(this.op===3)core.clear();else core.room(this.arg,this.value,this.op===1);}
}
