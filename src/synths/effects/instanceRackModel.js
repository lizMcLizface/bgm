import {DRIVE_PEDALS} from './driveModel';
import {TAIL_UNITS} from './order';

/** The bench's stable chain overlays legacy processors without changing their
 * parameter IDs or factorial registry. One box per kind in this first adapter. */
export function instanceRackModel(base,graph,onGraph){
 const driveBlocks=graph.instances.filter(i=>DRIVE_PEDALS[i.kind]).map(i=>({id:i.id,name:DRIVE_PEDALS[i.kind].name,colour:DRIVE_PEDALS[i.kind].colour,on:i.enabled,toggle:'instance.'+i.id,graphic:'saturation'})),blocks=[...base.blocks,...driveBlocks],byId=Object.fromEntries(blocks.map(b=>[b.id,b]));
 const commit=chain=>onGraph({...graph,compatibility:'serial',chain}),movable=graph.chain.filter(id=>!TAIL_UNITS.includes(id)),idle=[...base.idle,...driveBlocks.filter(b=>graph.chain.includes(b.id)&&!b.on).map(b=>b.id)];
 const moveTo=(id,target)=>{if(graph.compatibility==='legacy')return base.moveTo(id,target);if(!movable.includes(id)||!movable.includes(target)||id===target)return;const chain=graph.chain.filter(k=>k!==id);chain.splice(graph.chain.indexOf(target),0,id);commit(chain);};
 const moveBy=(id,d)=>{const target=movable[movable.indexOf(id)+d];if(target)moveTo(id,target);};
 return {...base,blocks,idle,cleanUp:()=>{if(graph.compatibility==='legacy')base.cleanUp();else commit(graph.chain.filter(id=>!idle.includes(id)));},chain:graph.chain,tiles:[byId.input,...graph.chain.map(id=>byId[id]),byId.master],
  toggle:block=>onGraph({...graph,instances:graph.instances.map(i=>i.id===block.id?{...i,enabled:!i.enabled}:i)}),
  canMove:(id,d)=>{if(graph.compatibility==='legacy')return base.canMove(id,d);const i=movable.indexOf(id);return i>=0&&(d<0?i>0:i<movable.length-1);},moveTo,moveBy,
  available:[...base.available,...driveBlocks.filter(b=>!graph.chain.includes(b.id)).map(b=>({unit:b.id,tile:b.id,name:b.name,note:b.id==='boost'?'linear gain':'oversampled clipping'}))],
  addToChain:id=>{if(!DRIVE_PEDALS[id])return base.addToChain(id);if(!graph.chain.includes(id)){const chain=[...graph.chain],at=chain.findIndex(k=>k==='limiter'||TAIL_UNITS.includes(k));chain.splice(at<0?chain.length:at,0,id);commit(chain);}return id;},
  removeFromChain:id=>{if(!DRIVE_PEDALS[id])return base.removeFromChain(id);commit(graph.chain.filter(k=>k!==id));},
 };
}
