// Wavetable synthesizer parameter table. Ids must match synth-engine/classics/src/wt.rs; the shared space effects
// (ids from 200) come from ../params. Row format: see defineParams.
import {defineParams,SPACE} from '../params';

export const LFO_SHAPES=['Sine','Tri','Saw ↑','Saw ↓','Square','S&H'];
export const FILTER_TYPES=['LP 24','LP 12','BP','HP'];
const WAVES=['A','B','C','D'];

const lfo=(n,base,rate)=>[
 [`lfo${n}Rate`,base,'Rate',.02,60,rate,'Hz','log'],
 [`lfo${n}Shape`,base+1,'Shape',0,5,0,'','step',LFO_SHAPES],
 [`lfo${n}Pitch`,base+2,'Pitch',0,200,0,'ct','sq'],
 [`lfo${n}Cut`,base+3,'Filter',0,1,0,'%','lin'],
 [`lfo${n}X`,base+4,'Joy X',0,1,0,'%','lin'],
 [`lfo${n}Y`,base+5,'Joy Y',0,1,0,'%','lin'],
 [`lfo${n}Amp`,base+6,'Amp',0,1,0,'%','lin'],
];

export const {PARAMS,BY_KEY,defaultValues,clampValue,sanitize,toPairs}=defineParams([
 // joystick: x left/right, y down/up; (−1,0) is wave A, (0,1) B, (1,0) C, (0,−1) D
 ['joyX',0,'X',-1,1,1,'','lin'],
 ['joyY',1,'Y',-1,1,0,'','lin'],
 ...WAVES.map((w,i)=>[`coarse${i+1}`,2+i,`${w} coarse`,-48,48,0,'st','step']),
 ...WAVES.map((w,i)=>[`fine${i+1}`,6+i,`${w} fine`,-100,100,0,'ct','lin']),
 // oscillator
 ['uniVoices',10,'Unison',1,7,1,'n','step'],
 ['uniDetune',11,'Detune',0,100,20,'ct','lin'],
 ['uniSpread',12,'Spread',0,1,.5,'%','lin'],
 ['glide',13,'Glide',0,5,0,'s','sq'],
 // filter
 ['filterType',14,'Type',0,3,0,'','step',FILTER_TYPES],
 ['cutoff',15,'Cutoff',20,20000,12000,'Hz','log'],
 ['res',16,'Res',0,1,.1,'%','lin'],
 ['filterEnv',17,'Env',-1,1,0,'bi','lin'],
 ['keyFollow',18,'Key',0,1,.5,'%','lin'],
 ['drive',19,'Drive',0,1,0,'%','lin'],
 ['fAttack',20,'A',.001,30,.005,'s','log'],
 ['fDecay',21,'D',.002,60,.5,'s','log'],
 ['fSustain',22,'S',0,1,.5,'%','lin'],
 ['fRelease',23,'R',.002,60,.3,'s','log'],
 // amplifier
 ['aAttack',24,'A',.001,30,.005,'s','log'],
 ['aDecay',25,'D',.002,60,.3,'s','log'],
 ['aSustain',26,'S',0,1,.8,'%','lin'],
 ['aRelease',27,'R',.002,60,.3,'s','log'],
 // vector envelope: moves the joystick
 ['vAttack',28,'A',.001,30,.1,'s','log'],
 ['vDecay',29,'D',.002,60,.5,'s','log'],
 ['vSustain',30,'S',0,1,.5,'%','lin'],
 ['vRelease',31,'R',.002,60,.3,'s','log'],
 ['vecX',32,'→ X',-1,1,0,'bi','lin'],
 ['vecY',33,'→ Y',-1,1,0,'bi','lin'],
 ...lfo(1,34,5),
 ...lfo(2,41,.5),
 ['velAmp',48,'Vel → amp',0,1,.4,'%','lin'],
 ['velFilter',49,'Vel → filter',0,1,.2,'%','lin'],
 ['volume',50,'Volume',0,1,.6,'%','lin'],
 ...SPACE,
]);
