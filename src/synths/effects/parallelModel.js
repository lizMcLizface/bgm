import {RACK_PARAMS,cleanRack} from './params';
import {INSTANCE_KINDS,migrateInstances} from './instances';
import {DRIVE_PEDALS} from './driveModel';
import {cleanDesk,stripDefaults,masterDefaults} from '../all/mixerAudio';
import {logicalChain,logicalOrder,boxMask} from './routing';
import {ZPLANE_SHAPE_NAMES} from './zplaneShapes';

export const BUS_IDS=['drive','wet','master'];
export const BUS_NAMES={drive:'Drive',wet:'Wet',master:'Master insert'};
export const MIX_CHANNELS=[{role:'dry',label:'Dry',short:'DR'},{role:'drive',label:'Drive',short:'OD'},{role:'wet',label:'Wet',short:'FX'},...Array.from({length:5},(_,i)=>({role:`spare${i+4}`,label:`Input ${i+4}`,short:String(i+4),unpatched:true}))];
export const MIX_COLOURS={dry:'#d6c99d',drive:'#8db174',wet:'#87bfc8',...Object.fromEntries(Array.from({length:5},(_,i)=>[`spare${i+4}`,'#707c86']))};
export const busBinding=(bus,id)=>`patch:${bus}:${id}`;
export const busPositionKey=(bus,id)=>`synths:effects:patch:${bus}:${id}-pos`;
export const viewKey=(bus,id)=>`${bus}:${id}`;
const record=x=>x&&typeof x==='object'&&!Array.isArray(x);
const vibratoKeys=['vibrato.rate','vibrato.depth','switch.vibrato'];
const valuesValid=(v,schema)=>{
 if(!record(v))return false;
 const older=schema===RACK_PARAMS&&vibratoKeys.every(k=>!(k in v));
 return Object.keys(v).length===schema.PARAMS.length-(older?3:0)&&schema.PARAMS.every(p=>older&&vibratoKeys.includes(p.key)||typeof v[p.key]==='number'&&Number.isFinite(v[p.key])&&schema.clampValue(p.key,v[p.key])===v[p.key]);
};
const blankBus=()=>({order:[],rack:{...cleanRack(),'master.routing':1},drives:Object.fromEntries(Object.entries(DRIVE_PEDALS).map(([id,s])=>[id,{enabled:false,params:s.params.defaultValues()}]))});
export function parallelPreset(){
 const buses=Object.fromEntries(BUS_IDS.map(id=>[id,blankBus()]));
 buses.drive.order=['overdrive'];buses.drive.drives.overdrive={enabled:true,params:{drive:9,tone:.45,level:-18}};
 buses.wet.order=['zplane','chorus','vibrato','delay'];Object.assign(buses.wet.rack,{'switch.zplane':1,'zplane.a':ZPLANE_SHAPE_NAMES.indexOf('Dark'),'zplane.morph':.32,'zplane.q':.25,'zplane.mix':1,'inserts.chorus':.8,'inserts.chorusDepth':2.5,'inserts.chorusRate':.28,'switch.vibrato':1,'vibrato.rate':4.5,'vibrato.depth':12,'effects.delay':.28,'effects.delayMs':375,'effects.feedback':.28,'effects.tone':4200});
 buses.master.order=['delay','reverb'];Object.assign(buses.master.rack,{'effects.delay':.08,'effects.delayMs':125,'effects.feedback':.15,'effects.reverb':.16,'effects.decay':2.5,'effects.size':.45,'effects.damping':5500,'effects.predelay':18});
 const strips=Object.fromEntries(MIX_CHANNELS.map(c=>[c.role,{...stripDefaults(),mute:c.role==='dry',vol:c.role==='dry'?.75:c.role==='drive'?.65:c.role==='wet'?.64:.75}]));
 const views=Object.fromEntries(BUS_IDS.flatMap(bus=>buses[bus].order.map(id=>[viewKey(bus,id),true])));
 return {version:1,selected:'wet',buses,mixer:{strips,master:{...masterDefaults(),vol:.7},selected:'dry',property:0},views};
}
export function validParallel(p){
 if(!record(p)||p.version!==1||!BUS_IDS.includes(p.selected)||!record(p.buses)||Object.keys(p.buses).length!==3||!record(p.views))return false;
 for(const id of BUS_IDS){const b=p.buses[id];if(!record(b)||!Array.isArray(b.order)||b.order.length>INSTANCE_KINDS.length||new Set(b.order).size!==b.order.length||b.order.some(k=>!INSTANCE_KINDS.includes(k))||!valuesValid(b.rack,RACK_PARAMS)||!record(b.drives)||Object.keys(b.drives).length!==3)return false;
  for(const [kind,spec] of Object.entries(DRIVE_PEDALS)){const d=b.drives[kind];if(!record(d)||typeof d.enabled!=='boolean'||!valuesValid(d.params,spec.params))return false;}
 }
 if(Object.entries(p.views).some(([key,on])=>typeof on!=='boolean'||!BUS_IDS.some(bus=>INSTANCE_KINDS.some(id=>key===viewKey(bus,id)))))return false;
 const m=p.mixer;if(!record(m)||!record(m.strips)||![3,8].includes(Object.keys(m.strips).length)||!MIX_CHANNELS.some(c=>c.role===m.selected)||!Number.isInteger(m.property)||m.property<0||m.property>64||!record(m.master))return false;
 const valid=(v,defaults)=>record(v)&&Object.keys(v).length===Object.keys(defaults).length&&Object.entries(defaults).every(([k,home])=>typeof home==='boolean'?typeof v[k]==='boolean':typeof v[k]==='number'&&Number.isFinite(v[k])&&v[k]>=0&&v[k]<=1);
 const roles=Object.keys(m.strips).length===3?MIX_CHANNELS.slice(0,3):MIX_CHANNELS;
 return roles.every(c=>valid(m.strips[c.role],stripDefaults()))&&valid(m.master,masterDefaults());
}
export function cleanParallel(raw){
 if(!validParallel(raw))return null;
 return {...raw,buses:Object.fromEntries(BUS_IDS.map(id=>[id,{...raw.buses[id],rack:RACK_PARAMS.sanitize(raw.buses[id].rack)}])),mixer:{...raw.mixer,...cleanDesk(raw.mixer,MIX_CHANNELS.map(c=>c.role))}};
}
// The bus graph owns order directly, independently of legacy fixed-tail codes.
// Each runtime rack is isolated; IDs are qualified by bus in UI/persistence.
export function busInstances(bus){
 const graph=migrateInstances(busRack(bus));
 return {...graph,compatibility:'serial',chain:bus.order,instances:graph.instances.map(i=>DRIVE_PEDALS[i.kind]?{...i,...bus.drives[i.kind]}:i)};
}
export const busRack=bus=>({...bus.rack,'master.routing':1,'master.boxChain':boxMask(bus.order)});
export function patchBus(bus,changes){
 const rack=RACK_PARAMS.sanitize({...bus.rack,...changes});let order=bus.order;
 if('master.chain' in changes||'master.boxChain' in changes){const active=logicalChain(rack);order=[...order.filter(id=>DRIVE_PEDALS[id]||active.includes(id)),...logicalOrder(rack).filter(id=>active.includes(id)&&!order.includes(id))];}
 return {...bus,rack,order};
}
