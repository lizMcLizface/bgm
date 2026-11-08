import {BLOCKS} from './rackParts';
import {DRIVE_PEDALS} from './driveModel';
import {INSTANCE_KINDS} from './instances';
import {BUS_NAMES} from './parallelModel';
export function parallelBusModel(bus,busId,onValues,onBus,tempo){
 const blocks=[...BLOCKS,...Object.entries(DRIVE_PEDALS).map(([id,s])=>({id,name:s.name,colour:s.colour,graphic:'saturation'}))].map(b=>{
  const toggle=DRIVE_PEDALS[b.id]?'instance.'+b.id:['input','master'].includes(b.id)?null:b.id==='compressor'?'compressor.enabled':'switch.'+b.id;
  return {...b,toggle,on:DRIVE_PEDALS[b.id]?bus.drives[b.id].enabled:toggle?bus.rack[toggle]===1:true};
 });
 const byId=Object.fromEntries(blocks.map(b=>[b.id,b])),commit=order=>onBus({...bus,order});
 const moveTo=(id,target)=>{if(id===target||!bus.order.includes(id)||!bus.order.includes(target))return;const order=bus.order.filter(k=>k!==id);order.splice(bus.order.indexOf(target),0,id);commit(order);};
 return {blocks,chain:bus.order,tempo,tiles:[{...byId.input,name:busId==='master'?'Mixer sum':`Split · ${BUS_NAMES[busId]}`},...bus.order.map(id=>byId[id]),{...byId.master,name:busId==='master'?'Master limiter':`Mixer · ${BUS_NAMES[busId]}`}],
  canMove:(id,d)=>{const i=bus.order.indexOf(id);return i>=0&&(d<0?i>0:i<bus.order.length-1);},moveTo,moveBy:(id,d)=>{const target=bus.order[bus.order.indexOf(id)+d];if(target)moveTo(id,target);},
  toggle:b=>onBus({...bus,drives:{...bus.drives,[b.id]:{...bus.drives[b.id],enabled:!bus.drives[b.id].enabled}}}),
  available:blocks.filter(b=>INSTANCE_KINDS.includes(b.id)&&!bus.order.includes(b.id)).map(b=>({unit:b.id,tile:b.id,name:b.name,note:''})),
  addToChain:id=>{if(!bus.order.includes(id))commit([...bus.order,id]);return id;},removeFromChain:id=>commit(bus.order.filter(k=>k!==id)),idle:[],cleanUp:()=>{},
 };
}
