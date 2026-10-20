// A DX7 voice (the 155 unpacked parameters of a cartridge voice) → engine values. The engine's
// parameter ids are the DX7's own byte offsets, so this is a straight copy by index; the
// additions (volume, mono, portamento, wheel and pressure routes, tune, operator switches)
// are left to the panel.
import {PARAMS} from './params';

const KEY_OF=new Map(PARAMS.filter(p=>p.id<145).map(p=>[p.id,p.key]));
export const voiceName=raw=>String.fromCharCode(...raw.subarray(145,155)).replace(/[^\x20-\x7e]/g,' ').trimEnd();

export function engineValues(raw){
 const out={};
 for(const [id,key] of KEY_OF)out[key]=raw[id];
 return out;
}
