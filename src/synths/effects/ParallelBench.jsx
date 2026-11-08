import React,{useCallback,useMemo} from 'react';
import RackPanel from './RackPanel';
import EffectBox from './EffectBox';
import DrivePedal from './DrivePedal';
import BenchSurface from './BenchSurface';
import ChannelMixer from '../all/ChannelMixer';
import useFloating from '../ui/useFloating';
import {positions,positionKey} from './deskState';
import {DRIVE_PEDALS} from './driveModel';
import {BUS_IDS,BUS_NAMES,MIX_CHANNELS,MIX_COLOURS,busBinding,busPositionKey,viewKey,patchBus} from './parallelModel';
import {parallelBusModel} from './parallelBusModel';
import {INSTANCE_KINDS} from './instances';
import {cleanRack} from './params';

function BusPedals({bus,busId,views,onChange,objects,tempo,stats={},sampleRate}){
 const onValues=useCallback(changes=>onChange(p=>({...p,buses:{...p.buses,[busId]:patchBus(p.buses[busId],changes)}})),[onChange,busId]);
 const onBus=useCallback(next=>onChange(p=>({...p,buses:{...p.buses,[busId]:next}})),[onChange,busId]);
 const model=useMemo(()=>parallelBusModel(bus,busId,onValues,onBus,tempo),[bus,busId,onValues,onBus,tempo]);
 const close=id=>onChange(p=>({...p,views:{...p.views,[viewKey(busId,id)]:false}}));
 const editDrive=(id,changes)=>onChange(p=>({...p,buses:{...p.buses,[busId]:{...p.buses[busId],drives:{...p.buses[busId].drives,[id]:{...p.buses[busId].drives[id],...changes}}}}}));
 return model.blocks.filter(b=>INSTANCE_KINDS.includes(b.id)&&views[viewKey(busId,b.id)]).map(block=>{
  const id=block.id,name=`${BUS_NAMES[busId]} · ${block.name}`,shared={key:id,connected:bus.order.includes(id),model,floatingKey:busPositionKey(busId,id),instanceId:viewKey(busId,id),onClose:()=>close(id)};
  return DRIVE_PEDALS[id]?<DrivePedal {...shared} label={name} instance={{id,kind:id,...bus.drives[id]}} onEdit={editDrive} peak={stats.drivePeaks?.[id]??0} rackEnabled={!!bus.rack['master.enabled']}/>
   :<EffectBox {...shared} block={{...block,name}} values={bus.rack} onChange={onValues} reduction={stats.reduction??0} inputDb={stats.compressorInputDb??-100} limiterReduction={stats.limiterReduction??0} sampleRate={sampleRate}/>;
 });
}
function Mixer({parallel,onChange,host,tempo}){
 const floating=useFloating(positionKey('mixer'),positions.mixer,{spawnOnly:true,rotatable:true});
 const changed=useCallback(mixer=>onChange(p=>({...p,mixer})),[onChange]);
 return <ChannelMixer channels={MIX_CHANNELS} colours={MIX_COLOURS} host={host} auxiliary={false} channelRacks={false} initialState={parallel.mixer} tempo={tempo} onStateChange={changed}
  caseProps={{ref:floating.ref,style:floating.style,onPointerDownCapture:floating.raise,className:'effects-parallel-mixer'}} gripProps={floating.handle}/>;
}
export default function ParallelBench({parallel,onChange,objects,engine,audio,stats,tempo,showRack,showMixer,epoch}){
 const id=parallel.selected,bus=parallel.buses[id];
 const values=changes=>onChange(p=>({...p,buses:{...p.buses,[id]:patchBus(p.buses[id],changes)}}));
 const replace=next=>onChange(p=>({...p,buses:{...p.buses,[id]:next}}));
 const model=parallelBusModel(bus,id,values,replace,tempo);
 const route=order=>order.map(kind=>model.blocks.find(b=>b.id===kind)?.name??kind).join(' → ')||'No inserts';
 const open=kind=>{if(!INSTANCE_KINDS.includes(kind))return;onChange(p=>({...p,views:{...p.views,[viewKey(id,kind)]:true}}));objects.focus(busBinding(id,kind));};
 const host=useMemo(()=>({applyDesk:s=>engine.current?.applyDesk?.(s),openMeters:()=>engine.current?.openMeters?.()??{read:()=>({}),dispose:()=>{}}}),[engine,audio]);
 return <>
  {showRack&&<BenchSurface id="rack" title="Effects rack · parallel buses" className="effects-rack-box">
   <div className="parallel-routing" aria-label="Parallel signal routing"><span>DI-Poly splits to</span><b>Dry → Mixer 1</b><b>Drive → {route(parallel.buses.drive.order)} → Mixer 2</b><b>Wet → {route(parallel.buses.wet.order)} → Mixer 3</b><span>Mixer sum → {route(parallel.buses.master.order)} → Master limiter → Output → Scope / Spectrum</span></div>
   <div className="parallel-bus-select" role="radiogroup" aria-label="Edit effect bus">{BUS_IDS.map(key=><button type="button" key={key} role="radio" aria-checked={id===key} onClick={()=>onChange(p=>({...p,selected:key}))}>{BUS_NAMES[key]}</button>)}</div>
   <RackPanel key={id} initialSelection={bus.order[0]??'input'} values={bus.rack} onChange={values} instanceModel={model} independentSpace externalEditors onOpenEffect={open} connected tempo={tempo} peak={stats.busMeters?.[id]?.peak??0} reduction={stats.busMeters?.[id]?.reduction??0}
    onReset={()=>replace({...bus,order:[],rack:cleanRack(),drives:Object.fromEntries(Object.entries(DRIVE_PEDALS).map(([kind,s])=>[kind,{enabled:false,params:s.params.defaultValues()}]))})}
    tools={<button type="button" onClick={()=>engine.current?.clearRack()}>Clear all tails</button>}/>
  </BenchSurface>}
  {BUS_IDS.map(key=><BusPedals key={key} bus={parallel.buses[key]} busId={key} views={parallel.views} onChange={onChange} objects={objects} tempo={tempo} stats={stats.busMeters?.[key]} sampleRate={engine.current?.context.sampleRate??48000}/>)}
  {showMixer&&<Mixer key={epoch} parallel={parallel} onChange={onChange} host={host} tempo={tempo}/>}
 </>;
}
