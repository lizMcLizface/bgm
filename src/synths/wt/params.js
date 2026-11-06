// Wavetable synthesizer parameter table. Ids must match synth-engine/classics/src/wt.rs; the shared space effects
// (ids from 200) come from ../params. Row format: see defineParams.
import {defineParams,SPACE} from '../params';
import {shapeRows} from '../ui/envShape';

export const LFO_SHAPES=['Sine','Tri','Saw ↑','Saw ↓','Square','S&H'];
export const FILTER_TYPES=['LP 24','LP 12','BP','HP','Notch'];
export const WARP_MODES=['Off','Bend','Sync','Mirror','Fold','FM'];
export const SUB_WAVES=['Sine','Tri','Pulse'];
export const VOICE_MODES=['Poly','Mono','Legato'];
const WAVES=['A','B','C','D'];
export const ROUTE_SOURCES=['—','LFO 1','LFO 2','Vector env','Velocity','Key','Mod wheel','Pressure','Mod env','Filter env','Amp env','Random','Pitch wheel'];
export const ROUTE_TARGETS=['—','Pitch','Filter','Joy X','Joy Y','Amp','Warp','Res','Drive','Detune','Angle','Radius'];
// four free routes: a source to a destination at a depth (pitch: an octave, filter: four octaves, joystick: the full travel)
const ROUTES=[0,1,2,3].flatMap(n=>[
 [`routeSource${n+1}`,61+3*n,`Route ${n+1} source`,0,12,0,'','step',ROUTE_SOURCES],
 [`routeTarget${n+1}`,62+3*n,`Route ${n+1} to`,0,11,0,'','step',ROUTE_TARGETS],
 [`routeDepth${n+1}`,63+3*n,`Route ${n+1} depth`,-1,1,0,'bi','lin'],
]);

const lfo=(n,base,rate)=>[
 [`lfo${n}Rate`,base,'Rate',.02,60,rate,'Hz','log'],
 [`lfo${n}Shape`,base+1,'Shape',0,5,0,'','step',LFO_SHAPES],
 [`lfo${n}Pitch`,base+2,'Pitch',0,200,0,'ct','sq'],
 [`lfo${n}Cut`,base+3,'Filter',0,1,0,'%','lin'],
 [`lfo${n}X`,base+4,'Joy X',0,1,0,'%','lin'],
 [`lfo${n}Y`,base+5,'Joy Y',0,1,0,'%','lin'],
 [`lfo${n}Amp`,base+6,'Amp',0,1,0,'%','lin'],
];

// the mod wheel's and the channel pressure's depths: pitch (vibrato from LFO 1), filter, joystick X and Y, amplitude
const DEPTHS=(pre,base,pitch,name,filter=0)=>[
 [`${pre}Pitch`,base,`${name} → pitch`,0,200,pitch,'ct','sq'],
 [`${pre}Filter`,base+1,`${name} → filter`,0,1,filter,'%','lin'],
 [`${pre}X`,base+2,`${name} → X`,-1,1,0,'bi','lin'],
 [`${pre}Y`,base+3,`${name} → Y`,-1,1,0,'bi','lin'],
 [`${pre}Amp`,base+4,`${name} → amp`,0,1,0,'%','lin'],
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
 ['filterType',14,'Type',0,4,0,'','step',FILTER_TYPES],
 ['cutoff',15,'Cutoff',20,20000,12000,'Hz','log'],
 ['res',16,'Res',0,1,.1,'%','lin'],
 ['filterEnv',17,'Env',-1,1,0,'bi','lin'],
 ['keyFollow',18,'Key',0,1,.5,'%','lin'],
 ['drive',19,'Drive',0,1,0,'%','lin'],
 ['fAttack',20,'A',.001,10,.005,'s','log'],
 ['fDecay',21,'D',.002,20,.5,'s','log'],
 ['fSustain',22,'S',0,1,.5,'%','lin'],
 ['fRelease',23,'R',.002,20,.3,'s','log'],
 // amplifier
 ['aAttack',24,'A',.001,10,.005,'s','log'],
 ['aDecay',25,'D',.002,20,.3,'s','log'],
 ['aSustain',26,'S',0,1,.8,'%','lin'],
 ['aRelease',27,'R',.002,20,.3,'s','log'],
 // vector envelope: moves the joystick
 ['vAttack',28,'A',.001,10,.1,'s','log'],
 ['vDecay',29,'D',.002,20,.5,'s','log'],
 ['vSustain',30,'S',0,1,.5,'%','lin'],
 ['vRelease',31,'R',.002,20,.3,'s','log'],
 ['vecX',32,'→ X',-1,1,0,'bi','lin'],
 ['vecY',33,'→ Y',-1,1,0,'bi','lin'],
 ...lfo(1,34,5),
 ...lfo(2,41,.5),
 ['velAmp',48,'Vel → amp',0,1,.4,'%','lin'],
 ['velFilter',49,'Vel → filter',0,1,.2,'%','lin'],
 ['volume',50,'Volume',0,1,.6,'%','lin'],
 ...DEPTHS('mod',51,50,'Mod wheel'),
 ...DEPTHS('prs',56,0,'Pressure',.5),
 ...ROUTES,
 // per wave: warp, level and pan
 ...WAVES.map((w,i)=>[`warpMode${i+1}`,73+i,`${w} warp`,0,5,0,'','step',WARP_MODES]),
 ...WAVES.map((w,i)=>[`warpAmt${i+1}`,77+i,`${w} warp amount`,0,1,0,'%','lin']),
 ...WAVES.map((w,i)=>[`level${i+1}`,81+i,`${w} level`,0,1,1,'%','lin']),
 ...WAVES.map((w,i)=>[`pan${i+1}`,85+i,`${w} pan`,-1,1,0,'bi','lin']),
 // sub oscillator and noise
 ['subLevel',89,'Sub',0,1,0,'%','lin'],
 ['subWave',90,'Sub wave',0,2,0,'','step',SUB_WAVES],
 ['noiseLevel',91,'Noise',0,1,0,'%','lin'],
 ['noiseColor',92,'Colour',0,1,0,'%','lin'],
 // LFO fade-in and tempo sync, the tempo, the modulation envelope
 ['lfo1Fade',93,'Fade',0,5,0,'s','sq'],['lfo1Sync',94,'Sync',0,1,0,'','step',['Free','Sync']],['lfo1Beats',95,'Beats',.0625,32,1,'decimal','log'],
 ['lfo2Fade',96,'Fade',0,5,0,'s','sq'],['lfo2Sync',97,'Sync',0,1,0,'','step',['Free','Sync']],['lfo2Beats',98,'Beats',.0625,32,1,'decimal','log'],
 ['tempo',99,'Tempo',20,300,120,'bpm','lin'],
 ['mAttack',100,'A',.001,10,.1,'s','log'],['mDecay',101,'D',.002,20,.5,'s','log'],['mSustain',102,'S',0,1,.5,'%','lin'],['mRelease',103,'R',.002,20,.3,'s','log'],
 ['voiceMode',104,'Mode',0,2,0,'','step',VOICE_MODES],
 ['bendRange',105,'Bend',0,24,2,'st','step'],
 ['joySpin',106,'Spin',-4,4,0,'decimal','lin'],
 // the joystick's own modulation: each source's depth to the pad's radius and angle, key and velocity to x and y
 ...[['lfo1R','lfo1T','LFO 1'],['lfo2R','lfo2T','LFO 2'],['vecR','vecT','Vector env']].flatMap(([r,t,n],i)=>[[r,107+2*i,`${n} → radius`,-1,1,0,'bi','lin'],[t,108+2*i,`${n} → angle`,-1,1,0,'bi','lin']]),
 ...[['key','Key',113],['vel','Velocity',117]].flatMap(([k,n,id])=>[[k+'X',id,`${n} → X`,-1,1,0,'bi','lin'],[k+'Y',id+1,`${n} → Y`,-1,1,0,'bi','lin'],[k+'R',id+2,`${n} → radius`,-1,1,0,'bi','lin'],[k+'T',id+3,`${n} → angle`,-1,1,0,'bi','lin']]),
 ['prsR',121,'Pressure → radius',-1,1,0,'bi','lin'],['prsT',122,'Pressure → angle',-1,1,0,'bi','lin'],
 ['joyRadius',123,'Radius',-1,1,0,'bi','lin'],['joyAngle',124,'Angle',-180,180,0,'deg','lin'],
 ...shapeRows('amp'),
 ...shapeRows('filter'),
 ...SPACE,
]);
// The reverb and the chorus are the rack's (effects/params.js moves them): the engine's own stay at nothing
const SILENT=[BY_KEY.reverbMix.id,BY_KEY.chorusMix.id];
export const toEnginePairs=values=>toPairs(values).map(([id,v])=>SILENT.includes(id)?[id,0]:[id,v]);
