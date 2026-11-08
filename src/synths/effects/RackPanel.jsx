import React,{useState} from 'react';
import {cleanRack,RACK_PRESETS} from './params';
import {useRackModel,RackChain,RackLevels,RackEffect,RackControl,RackAdd,RackCleanUp,presetValues} from './rackParts';
import './rack.css';

export {RackControl};

// The full-page rack: the signal chain and the levels on the left, the selected effect on the right.
export default function RackPanel({values,onChange,instrumentSpecs=[],peak=0,reduction=0,tools=null,connected=true,emptyMessage,reorderable=true,tempo=0,externalEditors=false,onOpenEffect,independentSpace=false,resetValues,instanceModel,onReset,initialSelection='saturation'}){
 const [selected,setSelected]=useState(initialSelection);
 const legacyModel=useRackModel({values,onChange,instrumentSpecs,tempo,independentSpace}),model=instanceModel??legacyModel;
 const shown=model.tiles.some(t=>t.id===selected)?selected:model.tiles[0].id;
 const selectedBlock=model.tiles.find(t=>t.id===shown);
 const selectedIndex=model.tiles.findIndex(t=>t.id===shown);
 const select=id=>{setSelected(id);onOpenEffect?.(id);};
 const toggle=t=>t.toggle?.startsWith('instance.')?model.toggle(t):onChange({[t.toggle]:t.on?0:1});
 // a preset keeps the chain order the player chose, and brings in any effect it uses
 const applyPreset=name=>{const p=RACK_PRESETS.find(r=>r.name===name);if(p)onChange(presetValues(p,values));};
 return <div className={'rack-content'+(externalEditors?' rack-has-boxes':'')}>
  <div className="rack-toolbar">
   <div><h2>{externalEditors?'Signal chain':'Effects rack'}</h2></div>
   <label className="rack-preset"><span>Preset</span><select aria-label="Rack presets" value="" onChange={e=>applyPreset(e.target.value)}><option value="" disabled>Select preset</option>{RACK_PRESETS.map(p=><option key={p.name} value={p.name}>{p.name}</option>)}</select></label>
   <RackAdd model={model} onAdded={select}/>
   <RackCleanUp model={model}/>
   <div className="rack-toolbar-actions">
    <button type="button" aria-label="Bypass effects rack" aria-pressed={!values['master.enabled']} onClick={()=>onChange({'master.enabled':values['master.enabled']?0:1})}>{values['master.enabled']?'Rack on':'Rack bypassed'}</button>
    <button type="button" onClick={()=>onReset?onReset():onChange(resetValues?resetValues():cleanRack())}>Reset rack</button>{tools}
   </div>
   <div className="rack-signal" aria-label="Rack output level"><span style={{width:Math.min(100,peak*100)+'%'}}/></div>
  </div>
  {!connected&&<p className="rack-empty">{emptyMessage??'Open a synth in another tab, start its audio, then connect it here. The rack controls that synth while you play.'}</p>}
  <div className="rack-layout">
   <div className="rack-left">
    <nav className="rack-chain" aria-label="Signal path: tap an effect to edit it, double-tap to switch it on or off, drag to reorder">
     <span className="rack-chain-end rack-chain-start">Synth →</span>
     <RackChain tiles={model.tiles} selected={shown} onSelect={select} onToggle={toggle} onMoveTo={model.moveTo} movable={reorderable}/>
     <span className="rack-chain-end rack-chain-finish">← Out</span>
    </nav>
    <RackLevels values={values} onChange={onChange}/>
   </div>
   <div className="rack-right">
    <div className="rack-grid">
     {externalEditors&&!['input','master','instrument'].includes(shown)?<div className="rack-external-editor" style={{'--rack-colour':selectedBlock.colour}}>
      <div className="rack-selection-heading"><span>Selected effect</span><span className={selectedBlock.on?'is-on':''}>{selectedBlock.on?'Engaged':'Bypassed'}</span></div>
      <b>{selectedBlock.name}</b>
      <div className="rack-neighbours"><span>From <b>{model.tiles[selectedIndex-1]?.name??'Input'}</b></span><i aria-hidden="true">→</i><span>To <b>{model.tiles[selectedIndex+1]?.name??'Output'}</b></span></div>
      <button type="button" onClick={()=>onOpenEffect?.(shown)}>Open {selectedBlock.name}</button>
      <span className="rack-move"><span>Chain position</span>
       <button type="button" aria-label={'Move '+selectedBlock.name+' earlier'} disabled={!model.canMove(shown,-1)} onClick={()=>model.moveBy(shown,-1)}>◀</button>
       <button type="button" aria-label={'Move '+selectedBlock.name+' later'} disabled={!model.canMove(shown,1)} onClick={()=>model.moveBy(shown,1)}>▶</button>
      </span>
      <button type="button" onClick={()=>model.removeFromChain(shown)}>Remove {selectedBlock.name} from chain</button>
     </div>
      :model.tiles.map(block=><RackEffect key={block.id} block={block} values={values} onChange={onChange} hidden={block.id!==shown} reduction={reduction} instrumentSpecs={instrumentSpecs} model={model} movable={reorderable}/>)}
    </div>
   </div>
  </div>
 </div>;
}
