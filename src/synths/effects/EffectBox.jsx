import React from 'react';
import useFloating from '../ui/useFloating';
import {RackEffect} from './rackParts';
import {effectPositionKey} from './effectBoxes';
import CompactEffectFace,{EqualizerFace,hasCompactFace,hasPedalFace,TimeEffectFace,SaturationFace,ZPlaneFace} from './EffectControls';
import EffectFootswitches from './EffectFootswitches';
import {pedalEngaged} from './pedalModel';

const spawn=id=>(size,el,desk)=>{
 if(id==='saturation')return {x:1900,y:600};
 const view=desk.el?.closest('.desk-view')?.getBoundingClientRect(),origin=desk.origin();
 return view?{x:(view.left+view.width/2-origin.left)/desk.zoom-(el?.offsetWidth??480)/2,y:(view.top+view.height/2-origin.top)/desk.zoom-(el?.offsetHeight??320)/2}:{x:1900,y:600};
};
function EffectBox({block,connected=true,values,onChange,model,reduction,inputDb=-100,limiterReduction=0,sampleRate=48000,onClose,floatingKey,instanceId}){
 const floating=useFloating(floatingKey??effectPositionKey(block.id),spawn(block.id),{spawnOnly:true,rotatable:true});
 const index=model.tiles.findIndex(t=>t.id===block.id),before=model.tiles[index-1]?.name??'DI-Poly',after=model.tiles[index+1]?.name??'Output',engaged=connected&&pedalEngaged(block,values);
 const medium=['eq','phaser','flanger','chorus','tape','shimmer','filter'].includes(block.id),large=['compressor','delay','reverb'].includes(block.id),light=['eq','chorus'].includes(block.id);
 return <section className={'effect-box physical-effect'+(hasPedalFace(block.id)?' effect-pedal':'')+(['saturation','eq'].includes(block.id)?' effect-standard':'')+(medium?' effect-medium':'')+(large?' effect-large':'')+(block.id==='compressor'?' effect-analysis':'')+(light?' effect-light':'')+(engaged?'':' is-bypassed')+(values['master.enabled']?'':' rack-off')} data-effect-id={block.id} data-effect-instance={instanceId} aria-label={`${block.name} effect box`} ref={floating.ref} style={{...floating.style,'--effect-colour':block.colour}} onPointerDownCapture={floating.raise}>
  <header className="effects-box-grip effect-box-grip" {...floating.handle}>
   <strong>{block.name}</strong><span className="effect-header-state" role="status" aria-label={`${block.name} ${engaged?'on':'off'}`} title={!values['master.enabled']?'Rack bypassed':engaged?'On':'Off'}><i className={engaged&&values['master.enabled']?'lit':''}/></span>
   <div className="effect-box-route" aria-label={`${block.name} chain neighbours`} title={connected?`From ${before} → To ${after}`:'Not in chain'}>{connected?<><span><b>{before}</b></span><em aria-hidden="true">→</em><span><b>{after}</b></span></>:<span>Not in chain</span>}</div>
   <button type="button" className="effect-box-close" aria-label={`Close ${block.name} editor`} onClick={onClose}>×</button>
  </header>
  <div className="effect-control-body">
   {block.id==='zplane'?<ZPlaneFace values={values} onChange={onChange}/>:block.id==='saturation'?<SaturationFace values={values} onChange={onChange}/>:['delay','reverb'].includes(block.id)?<TimeEffectFace block={block} values={values} onChange={onChange}/>:block.id==='eq'?<EqualizerFace values={values} onChange={onChange}/>:hasCompactFace(block.id)?<CompactEffectFace block={block} values={values} onChange={onChange} sampleRate={sampleRate} reduction={engaged&&values['master.enabled']?reduction:0} inputDb={engaged&&values['master.enabled']?inputDb:-100} limiterReduction={engaged&&values['master.enabled']?limiterReduction:0}/>:<div className="effect-existing-controls"><RackEffect block={block} values={values} onChange={onChange} reduction={reduction} model={model} movable={false} controlsOnly/></div>}
  </div>
  <EffectFootswitches block={block} values={values} onChange={onChange} connected={connected} model={model}/>
 </section>;
}
export default React.memo(EffectBox,(a,b)=>a.connected===b.connected&&a.values===b.values&&a.onChange===b.onChange&&a.block.name===b.block.name&&a.floatingKey===b.floatingKey&&a.model.tempo===b.model.tempo&&a.sampleRate===b.sampleRate&&(a.block.id!=='compressor'||a.reduction===b.reduction&&a.inputDb===b.inputDb)&&(a.block.id!=='limiter'||a.limiterReduction===b.limiterReduction));
