import{RACK_NATIVE_FIELDS,rackNativeSpec}from'./ownedNativeRack.js';
/** Authored native Float32 TARGETS, never evaluated AudioParam/DSP curves.
 * The eighth lane packs the per-call setter mask and native Biquad type.
 * Raw f64 GUI settings remain a separate immutable host snapshot. */
export const NATIVE_RACK_METADATA_RANGES=Object.freeze([[0,96000],[-.5,96000],[0,96000],[0,96000],[0,96000],[0,20],[-24,24],[0,1023]].map(Object.freeze));
export const NATIVE_RACK_METADATA_DEFAULTS=Object.freeze([350,350,350,350,350,Math.fround(.707),0,0]);
const modes=[4,0,1,2,3,5,6];
export function nativeRackTargetPacket(kind,rate,raw,{previous}={}){
 const fields=RACK_NATIVE_FIELDS[kind];if(!fields||!raw||Object.keys(raw).length!==fields.length)throw Error('Complete native rack GUI settings required');const settings=rackNativeSpec(kind,rate,{initial:raw}).initial;
 if(previous){if(!Object.isFrozen(previous)||previous.kind!==kind||previous.rate!==rate||!Array.isArray(previous.targets)||previous.targets.length!==7||!Object.isFrozen(previous.targets))throw Error('Invalid preceding native rack target state');const checked=unpackNativeRackTargetPacket(kind,previous.lanes);if(checked.mask!==previous.mask||checked.mode!==previous.mode||checked.targets.some((v,i)=>v!==previous.targets[i]))throw Error('Inconsistent preceding native rack target state');}
 const targets=previous?previous.targets.slice():kind==='filter'?[350,350,350,350,350,Math.fround(.707),0]:kind==='ring'?[300,1,1,0,0,0,0]:[1,1,0,0,0,0,0];let mask=0,mode=4;const set=(i,v)=>{targets[i]=Math.fround(v);mask|=1<<i;};
 if(kind==='width'){set(0,(1+settings.amount)/2);set(1,(1-settings.amount)/2);}
 else if(kind==='ring'){set(0,settings.freq);set(1,settings.mix);set(2,1-settings.mix);}
 else{mode=modes[settings.type];const open=rate*.45,hz=v=>Math.max(10,Math.min(open,v));if(settings.type===0){set(0,hz(settings.low));set(1,settings.slope>=.5?hz(settings.low):10);set(2,hz(settings.high));set(3,settings.slope>=.5?hz(settings.high):open);set(6,0);}else{set(0,10);set(1,10);set(2,open);set(3,open);set(4,hz(settings.cutoff));set(5,settings.q);set(6,mode>=5?settings.gain:0);}}
 const lanes=Object.freeze([...targets,mask+128*mode]);return Object.freeze({kind,rate,settings:Object.freeze(settings),targets:Object.freeze(targets),mask,mode,lanes});
}
/** Validate received target metadata before any native timeline mutation. */
export function unpackNativeRackTargetPacket(kind,values){if(!RACK_NATIVE_FIELDS[kind]||!values||values.length!==8)throw Error('Invalid native rack target metadata');for(let i=0;i<8;i++)if(typeof values[i]!=='number'||!Number.isFinite(values[i])||Math.fround(values[i])!==values[i]||values[i]<NATIVE_RACK_METADATA_RANGES[i][0]||values[i]>NATIVE_RACK_METADATA_RANGES[i][1])throw Error('Invalid native rack target lane');if(kind==='width'&&(values[0]<.5||values[0]>1.5||values[1]<-.5||values[1]>.5)||kind==='ring'&&(values[0]<20||values[0]>2000||values[1]<0||values[1]>1||values[2]<0||values[2]>1))throw Error('Native rack target range mismatch');const code=values[7];if(!Number.isInteger(code))throw Error('Invalid native rack target tags');const mode=Math.floor(code/128),mask=code%128;if(kind==='width'&&(mode!==4||mask!==3)||kind==='ring'&&(mode!==4||mask!==7)||kind==='filter'&&(mode>6||mask!==(mode===4?79:127)))throw Error('Native rack setter ownership mismatch');return{targets:Array.from(values).slice(0,7),mask,mode};}
