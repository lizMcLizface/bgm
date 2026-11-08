import {POLY} from '../diy/patches';
import {RACK_PARAMS,cleanRack} from './params';
import {SETUP} from '../ui/setup';
import {DEFAULT_HARMONY,buildContext} from '../../app/harmonyContext';
import {SCALE_FAMILIES} from '../../app/theory';
import PROGRESSIONS from '../../app/progressions';
import {createDeskObjects,validObjectLayout} from '../ui/deskObjects';
import {EFFECT_FACES,effectBinding,effectPositionKey,validEffectFlags,cleanEffectFlags,rackFaceIds} from './effectBoxes';
import {migrateInstances,validInstances,upgradeInstances} from './instances';
import {cleanMonitors,validMonitorConfig} from './monitorModel';
import {BUS_IDS,viewKey,busBinding,busPositionKey,cleanParallel,validParallel,parallelPreset} from './parallelModel';
import {BENCH_SOUNDS} from './benchSounds';

export const DESK_STATE_KEY='synths:effects:local';
export const DESK_OBJECTS_KEY='synths:effects:objects';
export const DESK_CAMERA_KEY='synths:effects:desk';
export const EFFECTS_SETUP_FORMAT='calmbgm-effects-desk',MAX_SETUP_BYTES=2*1024*1024;
export const positions={source:{x:0,y:0},rack:{x:1900,y:0},keyboard:{x:0,y:940},output:{x:1440,y:940},scope:{x:2240,y:940},spectrum:{x:2750,y:940},setup:{x:2280,y:48},mixer:{x:1900,y:900},sounds:{x:1900,y:1650}};
export const positionKey=id=>'synths:effects:'+id+'-pos';
// The local reference stays dry, but the saturation pedal is ready at full
// blend when engaged. Global rack/native-patch defaults remain compatible.
export const cleanDeskRack=()=>({...cleanRack(),'inserts.saturation':1,'switch.saturation':0});
/** Voice patches provide a dry reference; outboard belongs to the desk. */
export function drySourceValues(raw){
 const values=POLY.params.sanitize(raw),rack=cleanRack();
 for(const key of Object.keys(values))if(key.startsWith('inserts.')||key.startsWith('effects.'))values[key]=rack[key]??values[key];
 values['global.chorus']=0;
 return values;
}
export function cleanEffectsState(raw={}){
 if(!raw||typeof raw!=='object')raw={};
 const first=POLY.presets[0],setup={...SETUP,...raw.setup};
 if(!['auto','show','hide'].includes(setup.keys))setup.keys='show';
 if(!['fit',49,61,76,88].includes(setup.keysSize))setup.keysSize=88;
 setup.keysLow=Number.isInteger(setup.keysLow)?Math.max(24,Math.min(84,setup.keysLow)):48;
 const audition={...DEFAULT_HARMONY,follow:false,...raw.audition};
 try{buildContext(audition);}catch{Object.assign(audition,DEFAULT_HARMONY,{follow:false});}
 const rack=RACK_PARAMS.sanitize({...cleanDeskRack(),...raw.rack}),instances=validInstances(raw.instances,rack)?upgradeInstances(raw.instances,rack):migrateInstances(rack);
 return {patch:{name:typeof raw.patch?.name==='string'?raw.patch.name:first.name,values:drySourceValues(raw.patch?.values??first.values),...(typeof raw.patch?.category==='string'?{category:raw.patch.category}:{})},rack,instances,parallel:cleanParallel(raw.parallel),monitors:cleanMonitors(raw.monitors),setup,audition,tempo:Number.isFinite(raw.tempo)?Math.max(40,Math.min(240,raw.tempo)):100,effectAdvanced:cleanEffectFlags(raw.effectAdvanced),panels:{rack:raw.panels?.rack!==false,mixer:raw.panels?.mixer!==false,output:raw.panels?.output!==false,scope:raw.panels?.scope!==false,spectrum:typeof raw.panels?.spectrum==='boolean'?raw.panels.spectrum:raw.panels?.scope!==false,setup:raw.panels?.setup===true,catalog:raw.panels?.catalog===true,effects:raw.panels?.effects?cleanEffectFlags(raw.panels.effects):{saturation:true}}};
}
export const defaultEffectsState=()=>cleanEffectsState({patch:BENCH_SOUNDS[0],parallel:parallelPreset(),setup:{keys:'show',keysSize:88},panels:{rack:false,output:false}});
export function createEffectsObjects(state){
 const active=state.instances.chain;
 return createDeskObjects({storageKey:DESK_OBJECTS_KEY,definitions:[...Object.keys(positions).map(id=>({binding:id,keys:[positionKey(id)],label:{source:'DI-Poly',rack:'Effects rack',keyboard:'Keyboard',output:'Output',scope:'Output scope',spectrum:'Output spectrum',setup:'Setup',mixer:'Mixing desk',sounds:'Quick synth presets'}[id],kind:id==='source'?'instrument':id==='rack'?'effects':id==='keyboard'?'keyboard':['scope','spectrum'].includes(id)?'scope':id==='setup'?'utility':'surface',visible:['scope','spectrum','rack','output'].includes(id)?state.panels[id]:id==='mixer'?!!state.parallel&&state.panels.mixer:id==='setup'?false:id==='keyboard'?state.setup.keys!=='hide':true})),...EFFECT_FACES.map(f=>({binding:effectBinding(f.id),keys:[effectPositionKey(f.id)],label:f.name,kind:'effects',visible:!state.parallel&&(active.includes(f.id)||state.panels.catalog)&&state.panels.effects[f.id]===true})),...BUS_IDS.flatMap(bus=>EFFECT_FACES.map(f=>({binding:busBinding(bus,f.id),keys:[busPositionKey(bus,f.id)],label:`${bus} · ${f.name}`,kind:'effects',visible:!!state.parallel?.views[viewKey(bus,f.id)]})))]});
}
const record=x=>x&&typeof x==='object'&&!Array.isArray(x);
const validValues=(values,params)=>record(values)&&Object.keys(values).length>0&&Object.entries(values).every(([key,value])=>params.BY_KEY[key]&&typeof value==='number'&&Number.isFinite(value)&&params.clampValue(key,value)===value);
export function encodeEffectsSetup(state,workbench){return JSON.stringify({format:EFFECTS_SETUP_FORMAT,version:4,...state,workbench});}
export function decodeEffectsSetup(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_SETUP_BYTES)throw new Error('Effects desk file is too large');
 let data;try{data=JSON.parse(text);}catch{throw new Error('This is not valid JSON');}
 if(data?.format!==EFFECTS_SETUP_FORMAT||![1,2,3,4].includes(data.version))throw new Error('This is not a supported effects desk file');
 if((data.version===4&&data.parallel===undefined)||(data.parallel!=null&&!validParallel(data.parallel))||['rack','mixer','output'].some(id=>data.panels?.[id]!==undefined&&typeof data.panels[id]!=='boolean'))throw new Error('The effects desk file contains invalid parallel routing');
 if(data.version>=2&&!validInstances(data.instances,data.rack))throw new Error('The effects desk file contains an invalid processor chain');
 if(data.version>=3&&data.monitors===undefined||data.monitors!==undefined&&(!record(data.monitors)||Object.keys(data.monitors).length!==2||!['scope','spectrum'].every(k=>validMonitorConfig(k,data.monitors[k])))||data.panels?.spectrum!==undefined&&typeof data.panels.spectrum!=='boolean')throw new Error('The effects desk file contains invalid monitor settings');
 if(!record(data.patch)||typeof data.patch.name!=='string'||!validValues(data.patch.values,POLY.params)||!validValues(data.rack,RACK_PARAMS)||!validObjectLayout(data.workbench)||!record(data.setup)||!record(data.audition)||!record(data.panels)||typeof data.panels.scope!=='boolean'||typeof data.panels.setup!=='boolean')throw new Error('The effects desk file contains invalid settings');
 const setup=data.setup;
 if(data.panels.catalog!==undefined&&typeof data.panels.catalog!=='boolean'||data.tempo!==undefined&&(!Number.isFinite(data.tempo)||data.tempo<40||data.tempo>240)||data.effectAdvanced!==undefined&&!validEffectFlags(data.effectAdvanced)||data.panels.effects!==undefined&&!validEffectFlags(data.panels.effects))throw new Error('The effects desk file contains invalid effect views');
 if(typeof setup.midiDevice!=='string'||!['all',...Array.from({length:16},(_,i)=>String(i+1))].includes(setup.midiChannel)||typeof setup.keysControls!=='boolean'||!Number.isInteger(setup.keyVelocity)||setup.keyVelocity<1||setup.keyVelocity>127||!Number.isInteger(setup.keyVariation)||setup.keyVariation<0||setup.keyVariation>40)throw new Error('The effects desk file contains invalid MIDI settings');
 if(!['auto','show','hide'].includes(setup.keys)||!['fit',49,61,76,88].includes(setup.keysSize)||!Number.isInteger(setup.keysLow)||setup.keysLow<24||setup.keysLow>84||!['light','normal','firm'].includes(setup.velocity)||!['interactive','balanced','playback'].includes(setup.latency)||!Number.isFinite(setup.ribbonRange)||setup.ribbonRange<0||setup.ribbonRange>48||!Number.isFinite(setup.wheelRange)||setup.wheelRange<0||setup.wheelRange>48)throw new Error('The effects desk file contains invalid keyboard settings');
 const audition=data.audition;
 if(typeof audition.follow!=='boolean'||!Number.isInteger(audition.tonic)||audition.tonic<0||audition.tonic>11||!Number.isInteger(audition.progression)||!PROGRESSIONS[audition.progression]||!SCALE_FAMILIES.some(f=>f.modes.some(m=>m.id===audition.mode)))throw new Error('The effects desk file contains invalid harmony settings');
 return {...cleanEffectsState(data),workbench:data.workbench};
}
