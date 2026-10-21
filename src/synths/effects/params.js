import {defineParams,SPACE} from '../params';
import {EFFECTS} from '../../synth-lab/effectsConfig';
import {INSERTS} from '../../synth-lab/insertsConfig';

const definitions=[
 ...INSERTS.map(d=>['inserts',d]),...EFFECTS.map(d=>['effects',d]),
 ...[
  ['enabled','Compressor',0,1,1,0],['threshold','Threshold · dB',-100,0,.5,-24],['ratio','Ratio',1,20,.1,4],['knee','Knee · dB',0,40,.5,12],
  ['attack','Attack · s',.001,1,.001,.005],['release','Release · s',.01,1,.01,.1],['makeup','Output trim · dB',-18,18,.5,0],
 ].map(d=>['compressor',d]),
 ...['saturation','eq','phaser','flanger','chorus','delay','reverb'].map(k=>['switch',[k,k,0,1,1,1]]),
 ...[['enabled','Rack',0,1,1,1],['input','Input trim · dB',-24,12,.5,0],['output','Output trim · dB',-24,12,.5,0]].map(d=>['master',d]),
];
export const RACK_PARAMS=defineParams(definitions.map(([prefix,[key,label,min,max,step,value]],id)=>{
 const unit=/· Hz/.test(label)?'Hz':/· s$|seconds$/.test(label)?'s':/· ms/.test(label)?'ms':/· dB/.test(label)?'dB':/· octaves/.test(label)?'oct':max<=1&&step!==1?'%':'decimal';
 return [`${prefix}.${key}`,id,label,min,max,value,unit,step===1?'step':min>0&&max/min>=100?'log':'lin'];
}));
export const SPACE_KEYS=SPACE.map(([key])=>key);
export const instrumentSpaceKeys=synth=>synth.id==='poly'?['global.chorus','global.chorusRate','global.chorusDepth']:synth.id==='fm'?[]:SPACE_KEYS.filter(k=>synth.params.BY_KEY[k]);
export const isDiy=synth=>synth.id==='poly'||synth.id==='fm';
export function cleanRack(){return {...RACK_PARAMS.defaultValues(),'effects.reverb':0,'effects.delay':0};}
export function rackForPatch(synth,values,stored){
 const rack=RACK_PARAMS.sanitize({...cleanRack(),...stored});
 if(isDiy(synth)){
  for(const key of Object.keys(rack))if(key.startsWith('inserts.')||key.startsWith('effects.'))rack[key]=values[key]??rack[key];
 }
 for(const key of instrumentSpaceKeys(synth))rack['instrument.'+key]=values[key];
 return rack;
}
export function splitRackEdits(synth,changes){
 const native={},extra={};
 for(const [key,value]of Object.entries(changes)){
  if(typeof value!=='number'||!Number.isFinite(value))continue;
  if(RACK_PARAMS.BY_KEY[key]){
   const v=RACK_PARAMS.clampValue(key,value);
   if(isDiy(synth)&&synth.params.BY_KEY[key])native[key]=v;else extra[key]=v;
  }else if(key.startsWith('instrument.')&&instrumentSpaceKeys(synth).includes(key.slice(11)))native[key.slice(11)]=synth.params.clampValue(key.slice(11),value);
 }
 return {native,extra};
}
export function rackPackets(raw){
 const p=RACK_PARAMS.sanitize(raw),inserts={},effects={},compressor={},master={};
 for(const [key,v]of Object.entries(p)){const [scope,k]=key.split('.');if(scope==='inserts')inserts[k]=v;else if(scope==='effects')effects[k]=v;else if(scope==='compressor')compressor[k]=v;else if(scope==='master')master[k]=v;}
 if(!p['switch.saturation'])inserts.saturation=0;
 if(!p['switch.eq'])inserts.lowGain=inserts.midGain=inserts.highGain=0;
 for(const k of ['phaser','flanger','chorus'])if(!p['switch.'+k])inserts[k]=0;
 if(!p['switch.delay'])effects.delay=0;
 if(!p['switch.reverb'])effects.reverb=effects.delayToReverb=0;
 return {inserts,effects,compressor,master};
}
export const RACK_PRESETS=[
 {name:'Clean',values:cleanRack()},
 {name:'Little room',values:{...cleanRack(),'effects.reverb':.22,'effects.decay':1.4,'effects.size':.4,'effects.predelay':8}},
 {name:'Ping-pong sky',values:{...cleanRack(),'effects.delay':.26,'effects.delayMs':375,'effects.feedback':.45,'effects.pingPong':1,'effects.reverb':.16,'effects.decay':5}},
 {name:'Soft orbit',values:{...cleanRack(),'inserts.phaser':.25,'inserts.chorus':.25,'effects.reverb':.2,'effects.decay':4}},
 {name:'Drum glue',values:{...cleanRack(),'inserts.saturation':.12,'inserts.drive':4,'compressor.enabled':1,'compressor.threshold':-18,'compressor.ratio':2,'compressor.attack':.02,'compressor.release':.14,'compressor.makeup':-3,'effects.reverb':.08,'effects.decay':.6,'effects.predelay':4}},
 {name:'Warm tape',values:{...cleanRack(),'inserts.saturation':.3,'inserts.drive':7,'inserts.highGain':-3,'inserts.highFreq':5500,'inserts.chorus':.1,'inserts.chorusRate':.18,'inserts.chorusDepth':1.5,'master.output':-2}},
 {name:'Slapback',values:{...cleanRack(),'effects.delay':.22,'effects.delayMs':95,'effects.feedback':.12,'effects.pingPong':0,'effects.delayToReverb':0,'effects.tone':5200}},
 {name:'Dub echoes',values:{...cleanRack(),'inserts.lowGain':-2,'inserts.phaser':.12,'inserts.phaserRate':.07,'effects.delay':.3,'effects.delayMs':500,'effects.feedback':.65,'effects.tone':2200,'effects.reverb':.12,'effects.decay':3,'effects.delayToReverb':.35,'master.output':-2}},
 {name:'Wide chorus',values:{...cleanRack(),'inserts.chorus':.38,'inserts.chorusRate':.28,'inserts.chorusDepth':5,'effects.reverb':.12,'effects.decay':2,'effects.predelay':18}},
 {name:'Slow flange',values:{...cleanRack(),'inserts.flanger':.32,'inserts.flangerRate':.06,'inserts.flangerDepth':2.5,'inserts.flangerDelay':3.2,'inserts.flangerFeedback':.48,'effects.reverb':.1,'effects.decay':2.5}},
 {name:'Bright plate',values:{...cleanRack(),'effects.reverb':.26,'effects.decay':2.4,'effects.size':.48,'effects.damping':10000,'effects.predelay':18,'effects.modulation':.12}},
 {name:'Dark hall',values:{...cleanRack(),'effects.reverb':.3,'effects.decay':7,'effects.size':.9,'effects.damping':2400,'effects.predelay':35,'effects.modulation':.2}},
 {name:'Ambient bloom',values:{...cleanRack(),'inserts.chorus':.2,'inserts.chorusRate':.12,'effects.delay':.18,'effects.delayMs':750,'effects.feedback':.5,'effects.reverb':.38,'effects.decay':14,'effects.size':1,'effects.damping':4200,'effects.predelay':60,'effects.delayToReverb':.5,'master.output':-3}},
 {name:'Telephone',values:{...cleanRack(),'inserts.lowGain':-12,'inserts.lowFreq':600,'inserts.highGain':-12,'inserts.highFreq':1800,'inserts.midGain':3,'inserts.midFreq':1600,'inserts.midQ':1.4,'inserts.saturation':.18,'inserts.drive':5,'master.output':-3}},
];
