import {createDeskObjects} from '../ui/deskObjects';
import {load} from '../storage';
import {VISIBILITY_KEY,cleanVisibility} from './workbenchView';
import {SETUP_KEY} from '../ui/setup';

export const ALL_OBJECTS_KEY='synths:all:objects';
const roles=['lead','counter','rhythm','pad','bass','perc'];
export function createAllDeskObjects(){
 const view=cleanVisibility(load(VISIBILITY_KEY,{}));
 const definitions=[
  ...['generator','sequencer','mixer','voices','ambience'].map(name=>({binding:'surface:'+name,keys:['synths:all:'+name],kind:'surface',label:name[0].toUpperCase()+name.slice(1),visible:name==='generator'||name==='ambience'?view.panels[name]:true})),
  {binding:'keyboard',keys:['synths:all:keys-pos'],kind:'keyboard',label:'Keyboard',offset:true,visible:load(SETUP_KEY,{}).keys!=='hide'},
  {binding:'scope',keys:['synths:all:scope-pos'],kind:'scope',label:'Oscilloscope',visible:view.scope},
  {binding:'setup',keys:['synths:setup-pos'],kind:'utility',label:'Setup',visible:view.setup},
  ...roles.flatMap(role=>[
   {binding:'instrument:'+role,keys:['synths:all:win-'+role],kind:'instrument',label:role+' instrument',visible:!!view.wins['synth:'+role]},
   {binding:'effects:'+role,keys:['synths:all:rack-'+role],kind:'effects',label:role+' effects',visible:!!view.wins['fx:'+role]},
   ...(role==='perc'?[]:[{binding:'tuning:'+role,keys:['synths:diy:lab:all-tuning-'+role,'synths:diy:lab:all-piano-tuning-'+role],kind:'utility',label:role+' tuning',visible:!!view.wins['tuning:'+role]}]),
  ]),
 ];
 return createDeskObjects({storageKey:ALL_OBJECTS_KEY,definitions});
}
export function objectVisibility(store,fallback){
 const visible=(binding,defaultValue)=>store.get(binding)?.visible??defaultValue;
 return {...fallback,panels:{generator:visible('surface:generator',fallback.panels.generator),ambience:visible('surface:ambience',fallback.panels.ambience)},
  scope:visible('scope',fallback.scope),setup:visible('setup',fallback.setup),wins:Object.fromEntries(roles.flatMap(role=>[['synth:'+role,visible('instrument:'+role,false)],['fx:'+role,visible('effects:'+role,false)],['tuning:'+role,visible('tuning:'+role,false)] ]).filter(([,on])=>on))};
}
