// Jupiter-8 parameter table. Ids must match synth-engine/classics/src/jupiter.rs; the
// shared space effects (ids from 200) come from ../params. Append-only: saved
// patches use keys. Row format: see defineParams.
// Two layers: the upper layer uses the plain keys (ids 0–63), the lower layer the same
// keys with a "lo." prefix (ids 64–127); key mode, split point and balance follow.
import {defineParams,SPACE} from '../params';
import {shapeRows} from '../ui/envShape';

const ON=['Off','On'];

const LAYER=[
 // LFO (one, with delayed onset)
 ['lfoRate',0,'Rate',.05,40,5,'Hz','log'],
 ['lfoDelay',1,'Delay',0,4,0,'s','sq'],
 ['lfoWave',2,'Wave',0,3,0,'','step',['Sine','Saw','Square','Random']],
 // VCO modulation: LFO and ENV-1 into the pitch of VCO-1, both or VCO-2
 ['vcoModLfo',3,'LFO',0,1,0,'%','lin'],
 ['vcoModEnv',4,'Env-1',0,1,0,'%','lin'],
 ['vcoModDest',5,'To',0,2,1,'','step',['VCO-1','Both','VCO-2']],
 // pulse width (both VCOs' pulse waves)
 ['pw',6,'PW',0,1,0,'%','lin'],
 ['pwSource',7,'By',0,2,1,'','step',['LFO','Man','Env-1']],
 // VCO-1
 ['crossMod',8,'Cross mod',0,1,0,'%','lin'],
 ['vco1Range',9,'Range',0,3,1,'','step',["16'","8'","4'","2'"]],
 ['vco1Wave',10,'Wave',0,3,1,'','step',['Tri','Saw','Pulse','Square']],
 // VCO-2
 ['sync',11,'Sync',0,1,0,'','step',ON],
 ['vco2Range',12,'Range',-24,36,0,'st','lin'],
 ['vco2Fine',13,'Fine',-50,50,6,'ct','lin'],
 ['vco2Wave',14,'Wave',0,3,1,'','step',['Sine','Saw','Pulse','Noise']],
 ['vco2Low',15,'Low freq',0,1,0,'','step',ON],
 ['sourceMix',16,'VCO-1 ↔ 2',0,1,.5,'%','lin'],
 // filters
 ['hpf',17,'HPF',10,2000,10,'Hz','log'],
 ['cutoff',18,'Cutoff',20,20000,700,'Hz','log'],
 ['res',19,'Res',0,1,.1,'%','lin'],
 ['slope',20,'Slope',0,1,1,'','step',['−12','−24']],
 ['envMod',21,'Env mod',0,1,.35,'%','lin'],
 ['envSource',22,'Env',0,1,0,'','step',['Env-1','Env-2']],
 ['vcfLfo',23,'LFO',0,1,0,'%','sq'],
 ['keyFollow',24,'Key follow',0,1.2,.5,'%','lin'],
 // VCA
 ['vcaLfo',25,'LFO',0,3,0,'','step',['0','1','2','3']],
 ['level',26,'Level',0,1,.8,'%','lin'],
 // ENV-1
 ['e1Attack',27,'A',.001,5,.005,'s','log'],
 ['e1Decay',28,'D',.001,10,.6,'s','log'],
 ['e1Sustain',29,'S',0,1,.4,'%','lin'],
 ['e1Release',30,'R',.001,10,.4,'s','log'],
 ['e1Key',31,'Key follow',0,1,0,'','step',ON],
 ['e1Invert',32,'Polarity',0,1,0,'','step',['Norm','Inv']],
 // ENV-2 (always the VCA)
 ['e2Attack',33,'A',.001,5,.003,'s','log'],
 ['e2Decay',34,'D',.001,10,.8,'s','log'],
 ['e2Sustain',35,'S',0,1,.9,'%','lin'],
 ['e2Release',36,'R',.001,10,.35,'s','log'],
 ['e2Key',37,'Key follow',0,1,0,'','step',ON],
 // assign, portamento, arpeggio
 ['assign',38,'Assign',0,3,2,'','step',['Solo','Unison','Poly 1','Poly 2']],
 ['portamento',39,'Porta',0,5,0,'s','sq'],
 ['unisonDetune',40,'Detune',0,1,.3,'%','lin'],
 ['arp',41,'Arpeggio',0,1,0,'','step',ON],
 ['arpMode',42,'Mode',0,3,0,'','step',['Up','Down','U/D','Rand']],
 ['arpRange',43,'Range',1,4,1,'n','step'],
 ['arpRate',44,'Rate',1,20,8,'Hz','log'],
 ['arpHold',45,'Hold',0,1,0,'','step',ON],
 // performance (velocity and pressure are additions: the original has neither)
 ['bendRange',46,'Bend',0,12,2,'n','step'],
 ['bendVcf',47,'Bend → VCF',0,1,0,'%','lin'],
 ['modDepth',48,'Mod → vib',0,3,.5,'st','sq'],
 ['velVcf',49,'Vel → VCF',0,1,.3,'%','lin'],
 ['velVca',50,'Vel → VCA',0,1,.4,'%','lin'],
 ['afterVcf',51,'Touch → VCF',0,1,0,'%','lin'],
 // character
 ['volume',52,'Volume',0,1,.55,'%','lin'],
 ['voices',53,'Voices',1,16,8,'n','step'],
 ['width',54,'Width',0,1,.3,'%','lin'],
 ['spread',55,'Voice spread',0,1,.3,'%','lin'],
 ['oversample',56,'2× rate',0,2,1,'','step',['Off','Auto','On']],
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
 // key mode: Whole plays the upper layer; Dual both on every key; Split lower below the split point
 ['keyMode',128,'Key mode',0,2,0,'','step',['Whole','Dual','Split']],
 ['splitPoint',129,'Split',24,108,60,'note','step'],
 ['balance',130,'Balance',0,1,.5,'bal-ul','lin'],
 // envelope shapes (ids 180–195, one set for the whole patch)
 ...shapeRows('amp'),
 ...shapeRows('filter'),
 ...SPACE,
]);
