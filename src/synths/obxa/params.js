// OB-Xa parameter table. Ids must match synth-engine/classics/src/obxa.rs; the shared space
// effects (ids from 200) come from ../params. Append-only: saved patches use keys.
// Row format: see defineParams.
// Two layers: the upper layer uses the plain keys (ids 0–63), the lower layer the same keys
// with a "lo." prefix (ids 64–127); key mode, split point and balance follow.
import {defineParams,SPACE} from '../params';
import {shapeRows} from '../ui/envShape';

const ON=['Off','On'];

const LAYER=[
 // oscillator 1 (pitch in semitones above the keyboard pitch: the panel's printed footage notes)
 ['osc1Pitch',0,'Pitch',-24,72,0,'st','lin'],
 ['osc1Saw',1,'Saw',0,1,1,'','step',ON],
 ['osc1Pulse',2,'Pulse',0,1,0,'','step',ON],
 ['osc1On',3,'Mix',0,1,1,'','step',ON],
 // oscillator 2
 ['osc2Pitch',4,'Pitch',-24,72,0,'st','lin'],
 ['osc2Saw',5,'Saw',0,1,1,'','step',ON],
 ['osc2Pulse',6,'Pulse',0,1,0,'','step',ON],
 ['osc2Mix',7,'Mix',0,2,2,'','step',['Off','Half','Full']],
 ['osc2Detune',8,'Detune',-100,100,6,'ct','lin'],
 ['pw',9,'PW',0,1,0,'%','lin'],
 ['sync',10,'Sync',0,1,0,'','step',ON],
 ['fenvOsc2',11,'Env → osc 2',0,1,0,'','step',ON],
 ['noiseOn',12,'Noise',0,1,0,'','step',ON],
 // filter
 ['cutoff',13,'Cutoff',20,20000,1200,'Hz','log'],
 ['res',14,'Res',0,1,.1,'%','lin'],
 ['envAmount',15,'Env',0,1,.35,'%','lin'],
 ['poles',16,'Poles',0,1,1,'','step',['2','4']],
 ['track',17,'Track',0,1.2,0,'%','lin'],
 ['fAttack',18,'A',.001,10,.005,'s','log'],
 ['fDecay',19,'D',.002,15,.6,'s','log'],
 ['fSustain',20,'S',0,1,.4,'%','lin'],
 ['fRelease',21,'R',.002,15,.4,'s','log'],
 ['aAttack',22,'A',.001,10,.003,'s','log'],
 ['aDecay',23,'D',.002,15,.8,'s','log'],
 ['aSustain',24,'S',0,1,.9,'%','lin'],
 ['aRelease',25,'R',.002,15,.35,'s','log'],
 // LFO
 ['lfoRate',26,'Rate',.05,30,5,'Hz','log'],
 ['lfoSine',27,'Sine',0,1,1,'','step',ON],
 ['lfoSquare',28,'Square',0,1,0,'','step',ON],
 ['lfoSh',29,'S&H',0,1,0,'','step',ON],
 ['lfoFreqDepth',30,'Freq mod',0,1,0,'%','sq'],
 ['lfoToOsc1',31,'→ Osc 1',0,1,0,'','step',ON],
 ['lfoToOsc2',32,'→ Osc 2',0,1,0,'','step',ON],
 ['lfoToFilter',33,'→ Filter',0,1,0,'','step',ON],
 ['lfoPwDepth',34,'PW mod',0,1,0,'%','sq'],
 ['lfoPwOsc1',35,'→ Osc 1',0,1,0,'','step',ON],
 ['lfoPwOsc2',36,'→ Osc 2',0,1,0,'','step',ON],
 // voice control
 ['portamento',37,'Porta',0,5,0,'s','sq'],
 ['unison',38,'Unison',0,1,0,'','step',ON],
 ['unisonDetune',39,'Detune',0,1,.3,'%','lin'],
 // wheel
 ['wheelRate',40,'Wheel rate',.5,12,5,'Hz','log'],
 ['wheelDepth',41,'Wheel depth',0,1,0,'%','sq'],
 ['wheelOsc1',42,'→ Osc 1',0,1,1,'','step',ON],
 ['wheelOsc2',43,'→ Osc 2',0,1,1,'','step',ON],
 ['bendOsc2Only',44,'Bend osc 2 only',0,1,0,'','step',ON],
 ['transpose',45,'Transpose',-12,12,0,'st','step'],
 ['tune',46,'Tune',-100,100,0,'ct','lin'],
 // additions for piano playing (the original has neither velocity nor aftertouch)
 ['velFilter',47,'Vel → filter',0,1,.4,'%','lin'],
 ['velAmp',48,'Vel → amp',0,1,.5,'%','lin'],
 ['afterFilter',49,'Touch → filter',0,1,0,'%','lin'],
 // character
 ['volume',50,'Volume',0,1,.57,'%','lin'],
 ['voices',51,'Voices',1,8,8,'n','step'],
 ['width',52,'Width',0,1,.3,'%','lin'],
 ['spread',53,'Voice spread',0,1,.3,'%','lin'],
 ['oversample',54,'2× rate',0,2,1,'','step',['Off','Auto','On']],
];
export const LAYER_KEYS=LAYER.map(r=>r[0]);
export const LOWER='lo.';
/** Key of a layer parameter in the given layer ('upper' or 'lower'). */
export const layerKey=(key,layer)=>layer==='lower'?LOWER+key:key;
/** One layer's values (plain keys) → keys of the chosen layer; non-layer keys pass through. */
export function intoLayer(values,layer){
 const set=new Set(LAYER_KEYS);
 return Object.fromEntries(Object.entries(values).map(([k,v])=>[set.has(k)?layerKey(k,layer):k,v]));
}

export const {PARAMS,BY_KEY,defaultValues,clampValue,sanitize,toPairs}=defineParams([
 ...LAYER,
 ...LAYER.map(([key,id,...rest])=>[LOWER+key,id+64,...rest]),
 // key mode: Whole plays the upper layer; Double both on every key; Split lower below the split point
 ['keyMode',128,'Key mode',0,2,0,'','step',['Whole','Double','Split']],
 ['splitPoint',129,'Split',24,108,60,'note','step'],
 ['balance',130,'Balance',0,1,.5,'bal-ul','lin'],
 // envelope shapes (ids 180–195, one set for the whole patch)
 ...shapeRows('amp'),
 ...shapeRows('filter'),
 ...SPACE,
]);
