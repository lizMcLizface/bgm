// DX7 parameter table. Ids 0–155 are the DX7's own voice layout (the unpacked VCED order,
// operator 6 first, 21 values each) and must match synth-engine/classics/src/dx7.rs, so a
// voice from a cartridge loads by index; 160+ are additions. Keys: "op1.r1"… per operator
// (OP1…OP6), plain keys for the voice. Row format: see defineParams.
import {defineParams,SPACE} from '../params';

const ON=['Off','On'];
export const CURVES=['−lin','−exp','+exp','+lin'];
export const LFO_WAVES=['Tri','Saw ↓','Saw ↑','Square','Sine','S&H'];

/** One operator's 21 values; `base` is the id of its first value. */
const operator=(op,base)=>{
 const k=n=>`op${op}.${n}`;
 return [
  [k('r1'),base,'R1',0,99,99,'n','step'],[k('r2'),base+1,'R2',0,99,99,'n','step'],[k('r3'),base+2,'R3',0,99,99,'n','step'],[k('r4'),base+3,'R4',0,99,99,'n','step'],
  [k('l1'),base+4,'L1',0,99,99,'n','step'],[k('l2'),base+5,'L2',0,99,99,'n','step'],[k('l3'),base+6,'L3',0,99,99,'n','step'],[k('l4'),base+7,'L4',0,99,0,'n','step'],
  [k('breakPoint'),base+8,'Break',0,99,39,'bp','step'],
  [k('leftDepth'),base+9,'L depth',0,99,0,'n','step'],[k('rightDepth'),base+10,'R depth',0,99,0,'n','step'],
  [k('leftCurve'),base+11,'L curve',0,3,0,'','step',CURVES],[k('rightCurve'),base+12,'R curve',0,3,0,'','step',CURVES],
  [k('rateScale'),base+13,'Rate sc',0,7,0,'n','step'],
  [k('ams'),base+14,'Amp mod',0,3,0,'n','step'],[k('velocity'),base+15,'Velocity',0,7,0,'n','step'],
  [k('level'),base+16,'Level',0,99,op===1?99:0,'n','step'],
  [k('mode'),base+17,'Mode',0,1,0,'','step',['Ratio','Fixed']],
  [k('coarse'),base+18,'Coarse',0,31,1,'n','step'],[k('fine'),base+19,'Fine',0,99,0,'n','step'],
  [k('detune'),base+20,'Detune',0,14,7,'n','step'],
 ];
};
/** Operator n (1–6) is stored sixth-from-first: OP6 at id 0 … OP1 at id 105. */
export const operatorBase=op=>(6-op)*21;
export const OPERATOR_FIELDS=['r1','r2','r3','r4','l1','l2','l3','l4','breakPoint','leftDepth','rightDepth','leftCurve','rightCurve','rateScale','ams','velocity','level','mode','coarse','fine','detune'];

export const {PARAMS,BY_KEY,defaultValues,clampValue,sanitize,toPairs}=defineParams([
 ...[1,2,3,4,5,6].flatMap(op=>operator(op,operatorBase(op))),
 // pitch envelope
 ['pitchR1',126,'R1',0,99,99,'n','step'],['pitchR2',127,'R2',0,99,99,'n','step'],['pitchR3',128,'R3',0,99,99,'n','step'],['pitchR4',129,'R4',0,99,99,'n','step'],
 ['pitchL1',130,'L1',0,99,50,'n','step'],['pitchL2',131,'L2',0,99,50,'n','step'],['pitchL3',132,'L3',0,99,50,'n','step'],['pitchL4',133,'L4',0,99,50,'n','step'],
 ['algorithm',134,'Algorithm',0,31,31,'alg','step'],
 ['feedback',135,'Feedback',0,7,0,'n','step'],
 ['oscKeySync',136,'Key sync',0,1,1,'','step',ON],
 // LFO
 ['lfoSpeed',137,'Speed',0,99,35,'n','step'],['lfoDelay',138,'Delay',0,99,0,'n','step'],
 ['pitchModDepth',139,'Pitch depth',0,99,0,'n','step'],['ampModDepth',140,'Amp depth',0,99,0,'n','step'],
 ['lfoSync',141,'Sync',0,1,0,'','step',ON],['lfoWave',142,'Wave',0,5,0,'','step',LFO_WAVES],
 ['pitchModSens',143,'Pitch sens',0,7,3,'n','step'],
 ['transpose',144,'Transpose',0,48,24,'tr','step'],
 // additions
 ['volume',160,'Volume',0,1,.6,'%','lin'],
 ['mono',161,'Mono',0,1,0,'','step',ON],
 ['portamento',162,'Porta',0,99,0,'n','step'],
 ['modWheel',163,'Wheel → pitch',0,99,50,'n','step'],
 ['pressure',164,'Touch → pitch',0,99,0,'n','step'],
 ['tune',165,'Tune',-100,100,0,'ct','lin'],
 ...[1,2,3,4,5,6].map(op=>[`op${op}.on`,166+op-1,`OP${op}`,0,1,1,'','step',ON]),
 ...SPACE,
]);
export const VOICE_KEYS=PARAMS.filter(p=>p.id<156).map(p=>p.key);
