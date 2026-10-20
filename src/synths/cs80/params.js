// CS-80 parameter table. Ids must match synth-engine/classics/src/cs80.rs; the
// shared space effects (ids from 200) come from ../params. Append-only: saved
// patches use keys. Row format: see defineParams.
import {defineParams,SPACE,toPosition,fromPosition,formatValue} from '../params';

export const FEET=["16'","8'","4'","2'"];
export const LFO_FUNCTIONS=['Sine','Tri','Saw ↑','Saw ↓','Square','S&H','Drift'];

const CHANNEL=[
 ['feet',0,'Feet',0,3,1,'','step',FEET],
 ['pw',1,'Width',.05,.95,.5,'%','lin'],
 ['pwm',2,'PWM',0,1,0,'%','lin'],
 ['pwmRate',3,'PWM speed',.05,12,.8,'Hz','log'],
 ['saw',4,'Saw',0,1,1,'%','lin'],
 ['square',5,'Square',0,1,0,'%','lin'],
 ['noise',6,'Noise',0,1,0,'%','lin'],
 ['sine',7,'Sine',0,1,0,'%','lin'],
 ['hpf',8,'High-pass',16,8000,20,'Hz','log'],
 ['hpRes',9,'HP res',0,1,0,'%','lin'],
 ['lpf',10,'Low-pass',40,18000,2000,'Hz','log'],
 ['lpRes',11,'LP res',0,1,.15,'%','lin'],
 ['il',12,'IL',-1,1,0,'bi','lin'],
 ['al',13,'AL',-1,1,.4,'bi','lin'],
 ['fa',14,'Attack',.001,10,.05,'s','log'],
 ['fd',15,'Decay',.005,20,.8,'s','log'],
 ['fr',16,'Release',.005,20,.5,'s','log'],
 ['hpEg',17,'EG → HP',0,1,0,'%','lin'],
 ['a',18,'Attack',.001,10,.01,'s','log'],
 ['d',19,'Decay',.005,20,1,'s','log'],
 ['s',20,'Sustain',0,1,.8,'%','lin'],
 ['r',21,'Release',.005,20,.6,'s','log'],
 ['level',22,'Level',0,1,.8,'%','lin'],
 ['initBrill',23,'Brilliance',-1,1,.3,'bi','lin'],
 ['initLevel',24,'Level',0,1,.5,'%','lin'],
 ['afterBrill',25,'Brilliance',-1,1,.4,'bi','lin'],
 ['afterLevel',26,'Level',0,1,.3,'%','lin'],
 ['keytrack',27,'Key track',0,1.2,.8,'%','lin'],
];
const GLOBAL=[
 ['volume',64,'Volume',0,1,.68,'%','lin'],
 ['balance',65,'I ↔ II',0,1,.5,'bal','lin'],
 ['detune',66,'Detune II',-50,50,6,'ct','lin'],
 ['brilliance',67,'Brilliance',-1,1,0,'bi','lin'],
 ['resonance',68,'Resonance',-1,1,0,'bi','lin'],
 ['subFunction',69,'Function',0,6,0,'','step',LFO_FUNCTIONS],
 ['subRate',70,'Speed',.05,40,5.5,'Hz','log'],
 ['subVco',71,'VCO',0,3,0,'st','sq'],
 ['subVcf',72,'VCF',0,3,0,'oct','sq'],
 ['subVca',73,'VCA',0,1,0,'%','lin'],
 ['subDelay',74,'Delay',0,6,0,'s','sq'],
 ['atPitch',75,'Pitch',-2,2,0,'st','lin'],
 ['atVibrato',76,'Vibrato',0,2,0,'st','sq'],
 ['portamento',77,'Portamento',0,3,0,'s','sq'],
 ['glissando',78,'Glissando',0,1,0,'','step',['Off','On']],
 ['ringSpeed',79,'Speed',.5,2000,30,'Hz','log'],
 ['ringDepth',80,'Depth',0,1,0,'%','lin'],
 ['ringAttack',81,'Attack',.001,10,.01,'s','log'],
 ['ringDecay',82,'Decay',.005,20,1,'s','log'],
 ['ringSweep',83,'Env → speed',-1,1,0,'bi','lin'],
 ['brillLow',84,'Bright low',-1,1,0,'bi','lin'],
 ['brillHigh',85,'Bright high',-1,1,0,'bi','lin'],
 ['levelLow',86,'Level low',-1,1,0,'bi','lin'],
 ['levelHigh',87,'Level high',-1,1,0,'bi','lin'],
 ['drift',88,'Drift',0,1,.4,'%','lin'],
 ['width',89,'Width',0,1,.5,'%','lin'],
 ['autoTouch',90,'Auto touch',0,1,0,'%','lin'],
 ['autoTime',91,'Touch time',.05,6,1.5,'s','log'],
 ['voices',92,'Voices',1,16,8,'n','step'],
];

export const CHANNEL_KEYS=CHANNEL.map(p=>p[0]);
export const {PARAMS,BY_KEY,defaultValues,clampValue,sanitize,toPairs}=defineParams([
 ...CHANNEL.map(([key,id,...rest])=>['i.'+key,id,...rest]),
 ...CHANNEL.map(([key,id,...rest])=>['ii.'+key,id+32,...rest]),
 ...GLOBAL,
 ...SPACE,
]);
export {toPosition,fromPosition,formatValue};
