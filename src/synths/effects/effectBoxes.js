import {BLOCKS} from './rackParts';
import {logicalChain,logicalOrder} from './routing';
import {DRIVE_PEDALS} from './driveModel';
export const EFFECT_FACES=[...BLOCKS.filter(b=>!['input','master'].includes(b.id)),...Object.entries(DRIVE_PEDALS).map(([id,p])=>({id,name:p.name,colour:p.colour,keys:[]}))];
export const effectBinding=id=>'effect:'+id;
export const effectPositionKey=id=>'synths:effects:box-'+id;
export function rackFaceIds(values){
 const chain=logicalChain(values);
 return logicalOrder(values).filter(id=>chain.includes(id));
}
export const validEffectFlags=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([id,on])=>EFFECT_FACES.some(f=>f.id===id)&&typeof on==='boolean');
export const cleanEffectFlags=value=>Object.fromEntries(EFFECT_FACES.filter(f=>typeof value?.[f.id]==='boolean').map(f=>[f.id,value[f.id]]));
