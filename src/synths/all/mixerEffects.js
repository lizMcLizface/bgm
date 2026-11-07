import {cleanRack} from '../effects/params';
import {chainUnits,maskFromUnits} from '../effects/order';
import {syncedDelayMs} from '../effects/rackParts';

export const isMixerSpaceKey=key=>key.startsWith('effects.')||['switch.delay','switch.reverb','master.reverbFirst','master.sync'].includes(key);
export const mixerSpace=values=>Object.fromEntries(Object.entries(values).filter(([key])=>isMixerSpaceKey(key)));

export function instrumentRack(values) {
 return {...values,'master.output':0,'master.chain':maskFromUnits(chainUnits(values['master.chain']).filter(unit=>unit!=='space'))};
}

export function mixerRack(values,tempo) {
 const rack=cleanRack();
 for(const [key,value] of Object.entries(values)) {
  if(isMixerSpaceKey(key)||['master.mix','master.output'].includes(key))rack[key]=value;
 }
 rack['master.chain']=maskFromUnits(values['master.enabled']?chainUnits(values['master.chain']).filter(unit=>unit==='space'):[]);
 if(!values['master.enabled'])rack['master.mix']=1;
 const ms=syncedDelayMs(rack['master.sync'],tempo);
 if(ms)rack['effects.delayMs']=ms;
 return rack;
}

export function mixerEdits(values,changes) {
 const edits={...changes};
 if(Object.keys(changes).some(key=>key.startsWith('effects.')||key==='switch.delay'||key==='switch.reverb'||key==='master.sync'||key==='master.reverbFirst'))
  edits['master.chain']=maskFromUnits([...new Set([...chainUnits(values['master.chain']),'space'])]);
 return edits;
}
