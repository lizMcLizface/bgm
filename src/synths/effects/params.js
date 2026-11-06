import {defineParams,SPACE} from '../params';
import {ZPLANE_SHAPE_NAMES} from './zplaneShapes';
import {EFFECTS} from '../../synth-lab/effectsConfig';
import {INSERTS} from '../../synth-lab/insertsConfig';
import {ORDER_COUNT,CHAIN_MAX,DEFAULT_CHAIN,chainUnits} from './order';

const definitions=[
 ...INSERTS.map(d=>['inserts',d]),...EFFECTS.map(d=>['effects',d]),
 ...[
  ['enabled','Compressor',0,1,1,0],['threshold','Threshold · dB',-100,0,.5,-24],['ratio','Ratio',1,20,.1,4],['knee','Knee · dB',0,40,.5,12],
  ['attack','Attack · s',.001,1,.001,.005],['release','Release · s',.01,1,.01,.1],['makeup','Output trim · dB',-18,18,.5,0],['mix','Mix',0,1,.01,1],
 ].map(d=>['compressor',d]),
 ...['saturation','eq','phaser','flanger','chorus','delay','reverb'].map(k=>['switch',[k,k,0,1,1,1]]),
 ...[['enabled','Rack',0,1,1,1],['input','Input trim · dB',-24,12,.5,0],['output','Output trim · dB',-24,12,.5,0],['order','Chain order',0,ORDER_COUNT-1,1,0],['chain','Chain units',0,CHAIN_MAX,1,DEFAULT_CHAIN],['sync','Delay sync',0,6,1,0]].map(d=>['master',d]),
 // units added to the chain from the menu: plain Web Audio stages (extras.js)
 ...[['low','Low cut · Hz',20,600,1,90],['high','High cut · Hz',1000,20000,10,14000],['slope','Slope',0,1,1,0]].map(d=>['filter',d]),
 ...[['rate','Rate · Hz',.1,14,.01,4],['depth','Depth',0,1,.01,.5],['spread','Stereo spread',0,1,.01,0]].map(d=>['tremolo',d]),
 ...[['bits','Bits',2,16,1,8],['divide','Sample divide',1,32,1,1],['mix','Mix',0,1,.01,1]].map(d=>['crusher',d]),
 ...[['freq','Frequency · Hz',20,2000,1,300],['mix','Mix',0,1,.01,.5]].map(d=>['ring',d]),
 ...[['semi','Shift · semitones',-24,24,1,-12],['fine','Fine · cents',-50,50,1,0],['mix','Mix',0,1,.01,.5]].map(d=>['pitch',d]),
 ...[['amount','Width',0,2,.01,1.4]].map(d=>['width',d]),
 ...[['ceiling','Ceiling · dB',-18,0,.5,-1]].map(d=>['limiter',d]),
 ...['filter','tremolo','crusher','ring','pitch','width','limiter'].map(k=>['switch',[k,k,0,1,1,1]]),
 // appended last so the ids of the parameters above stay put
 ...[['mix','Mix',0,1,.01,1]].map(d=>['tremolo',d]),
 // tape, shimmer and freeze: the calmbgm synth's own stages (app/engine/voiceFx.js), appended last as well
 ...[['wow','Wow',0,1,.01,.25],['wowRate','Wow rate · Hz',.1,3,.01,.6],['flutter','Flutter',0,1,.01,.15],['drive','Saturation',0,1,.01,.2],['tone','Tone · Hz',2000,16000,10,9000]].map(d=>['tape',d]),
 ...[['mix','Mix',0,1,.01,.35],['decay','Decay · s',1,20,.1,6],['interval','Interval',0,3,1,1],['climb','Climb',0,.9,.01,.5],['tone','Tone · Hz',2000,16000,10,7000]].map(d=>['shimmer',d]),
 ...[['mix','Mix',0,1,.01,.5],['length','Length · s',.25,4,.01,2],['fade','Fade · s',.05,4,.01,1],['hold','Hold',0,1,1,0]].map(d=>['freeze',d]),
 ...['tape','shimmer','freeze'].map(k=>['switch',[k,k,0,1,1,1]]),
 // how much of the sound goes through the chain: 0 is the sound as it came in, 1 is all of it through the effects
 ...[['mix','Wet / dry mix',0,1,.01,1]].map(d=>['master',d]),
 // the space unit's two halves in the other order: reverb first, then the delay
 ...[['reverbFirst','Reverb before delay',0,1,1,0]].map(d=>['master',d]),
 // the filter unit's single-filter modes (type 0 is its original low cut and high cut pair): low-pass, high-pass, band-pass, notch and the two shelves
 ...[['type','Type',0,6,1,0],['cutoff','Cutoff · Hz',20,18000,1,8000],['q','Q',.1,20,.01,.707],['gain','Gain · dB',-24,24,.5,0]].map(d=>['filter',d]),

 // the z-plane filter (zplaneShapes.js), appended last: two shapes and the morph between them
 ...[['a','Shape A',0,ZPLANE_SHAPE_NAMES.length-1,1,0],['b','Shape B',0,ZPLANE_SHAPE_NAMES.length-1,1,2],['morph','Morph',0,1,.01,0],['shift','Shift · octaves',-1,1,.01,0],['q','Resonance',0,1,.01,.5],['mix','Mix',0,1,.01,1]].map(d=>['zplane',d]),
 ...['zplane'].map(k=>['switch',[k,k,0,1,1,1]]),
];
export const RACK_PARAMS=defineParams(definitions.map(([prefix,[key,label,min,max,step,value]],id)=>{
 const unit=/· cents/.test(label)?'decimal':/· semitones/.test(label)?'decimal':/· Hz/.test(label)?'Hz':/· s$|seconds$/.test(label)?'s':/· ms/.test(label)?'ms':/· dB/.test(label)?'dB':/· octaves/.test(label)?'oct':max<=1&&step!==1?'%':'decimal';
 return [`${prefix}.${key}`,id,label,min,max,value,unit,step===1?'step':min>0&&max/min>=100?'log':'lin'];
}));
export const SPACE_KEYS=SPACE.map(([key])=>key);
export const instrumentSpaceKeys=synth=>synth.id==='poly'?['global.chorus','global.chorusRate','global.chorusDepth']:synth.id==='fm'?[]:SPACE_KEYS.filter(k=>synth.params.BY_KEY[k]);
export const isDiy=synth=>synth.id==='poly'||synth.id==='fm';
export function cleanRack(){return {...RACK_PARAMS.defaultValues(),'effects.reverb':0,'effects.delay':0};}
// Synths whose own reverb lives in the rack's Reverb instead: the sound keeps its reverb settings (so presets and saved patches carry
// on), and the rack shows and edits them as its reverb. The synth's own reverb is silent (its toPairs, see cs80/params.js).
const REVERB_MAP={reverbMix:['effects.reverb',1],reverbDecay:['effects.decay',1],reverbTone:['effects.damping',1],reverbSize:['effects.size',1],reverbPredelay:['effects.predelay',1000]};
// all of them keep their chorus on the panel (the FM7 and Mercury D have no delay of their own, only a reverb)
// The wavetable synthesizer has no space of its own left: its reverb is the rack's Reverb, and its chorus (when a sound uses one) is the rack's Chorus.
const CHORUS_MAP={chorusMix:['inserts.chorus',.8],chorusRate:['inserts.chorusRate',1],chorusDepth:['inserts.chorusDepth',8]};
const MOVED_MAPS={cs80:REVERB_MAP,juno:REVERB_MAP,dx7:REVERB_MAP,minimoog:REVERB_MAP,prophet5:REVERB_MAP,jupiter8:REVERB_MAP,obxa:REVERB_MAP,wt:{...REVERB_MAP,...CHORUS_MAP}};
export const movesSpace=synth=>!!MOVED_MAPS[synth.id];
/** The rack units a sound's own space settings call for, so choosing the sound brings them into the chain. */
export const spaceUnitsUsed=(synth,values)=>movesSpace(synth)?[...(values.reverbMix>0?['space']:[]),...(synth.id==='wt'&&values.chorusMix>0?['chorus']:[])]:[];
/** Space settings the engine must not play itself (the rack plays them). */
export const rackPlayedKeys=synth=>movesSpace(synth)?synth.id==='wt'?['reverbMix','chorusMix']:['reverbMix']:[];
export const instrumentSpecKeys=synth=>movesSpace(synth)?[]:instrumentSpaceKeys(synth);
export function rackForPatch(synth,values,stored,{moved=false}={}){
 const rack=RACK_PARAMS.sanitize({...cleanRack(),...stored});
 if(moved&&movesSpace(synth)){
  for(const [k,[key,scale]]of Object.entries(MOVED_MAPS[synth.id]))if(values[k]!==undefined)rack[key]=values[k]*scale;
  return RACK_PARAMS.sanitize(rack);
 }
 if(isDiy(synth)){
  for(const key of Object.keys(rack))if(key.startsWith('inserts.')||key.startsWith('effects.'))rack[key]=values[key]??rack[key];
 }
 for(const key of instrumentSpaceKeys(synth))rack['instrument.'+key]=values[key];
 return rack;
}
export function splitRackEdits(synth,changes,{moved=false}={}){
 const native={},extra={},back=moved&&movesSpace(synth)?Object.fromEntries(Object.entries(MOVED_MAPS[synth.id]).map(([k,[key,scale]])=>[key,[k,scale]])):{};
 for(const [key,value]of Object.entries(changes)){
  if(typeof value!=='number'||!Number.isFinite(value))continue;
  if(back[key]){const [k,scale]=back[key];native[k]=synth.params.clampValue(k,RACK_PARAMS.clampValue(key,value)/scale);continue;}
  if(RACK_PARAMS.BY_KEY[key]){
   const v=RACK_PARAMS.clampValue(key,value);
   if(isDiy(synth)&&synth.params.BY_KEY[key])native[key]=v;else extra[key]=v;
  }else if(key.startsWith('instrument.')&&instrumentSpaceKeys(synth).includes(key.slice(11)))native[key.slice(11)]=synth.params.clampValue(key.slice(11),value);
 }
 return {native,extra};
}
export function rackPackets(raw){
 const p=RACK_PARAMS.sanitize(raw),inserts={},effects={},compressor={},master={},extras={};
 const EXTRA=['filter','tremolo','crusher','ring','pitch','width','limiter','tape','shimmer','freeze','zplane'];
 for(const [key,v]of Object.entries(p)){const [scope,k]=key.split('.');if(scope==='inserts')inserts[k]=v;else if(scope==='effects')effects[k]=v;else if(scope==='compressor')compressor[k]=v;else if(scope==='master')master[k]=v;else if(EXTRA.includes(scope))(extras[scope]??={})[k]=v;}
 // a unit that is not in the chain does not run, whatever its settings; one that is in it can still be switched off
 const inChain=chainUnits(master.chain),on=unit=>inChain.includes(unit);
 if(!on('saturation')||!p['switch.saturation'])inserts.saturation=0;
 if(!on('eq')||!p['switch.eq'])inserts.lowGain=inserts.midGain=inserts.highGain=0;
 for(const k of ['phaser','flanger','chorus'])if(!on(k)||!p['switch.'+k])inserts[k]=0;
 if(!on('compressor'))compressor.enabled=0;
 if(!on('space')||!p['switch.delay'])effects.delay=0;
 if(!on('space')||!p['switch.reverb'])effects.reverb=effects.delayToReverb=0;
 for(const k of EXTRA)extras[k].on=on(k)&&!!p['switch.'+k];
 return {inserts,effects,compressor,master,extras};
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
 {name:'Talking pad',values:{...cleanRack(),'zplane.a':0,'zplane.b':4,'zplane.morph':.5,'zplane.q':.6,'zplane.mix':1,'inserts.chorus':.2,'effects.reverb':.25,'effects.decay':3.5,'effects.predelay':20}},
 {name:'Vowel choir',values:{...cleanRack(),'zplane.a':2,'zplane.b':3,'zplane.morph':.4,'zplane.q':.7,'zplane.mix':.85,'inserts.chorus':.3,'inserts.chorusRate':.2,'inserts.chorusDepth':3,'effects.reverb':.3,'effects.decay':5,'effects.size':.8}},
 {name:'Wah sweep',values:{...cleanRack(),'zplane.a':10,'zplane.b':11,'zplane.morph':.3,'zplane.q':.65,'zplane.mix':1,'inserts.saturation':.15,'inserts.drive':3}},
 {name:'Hollow room',values:{...cleanRack(),'zplane.a':6,'zplane.b':5,'zplane.morph':.25,'zplane.q':.5,'zplane.mix':.7,'effects.reverb':.2,'effects.decay':2}},
 {name:'Telephone',values:{...cleanRack(),'inserts.lowGain':-12,'inserts.lowFreq':600,'inserts.highGain':-12,'inserts.highFreq':1800,'inserts.midGain':3,'inserts.midFreq':1600,'inserts.midQ':1.4,'inserts.saturation':.18,'inserts.drive':5,'master.output':-3}},
];
