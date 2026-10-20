// Juno-106 parameter table. Ids must match synth-engine/classics/src/juno.rs; the
// shared space effects (ids from 200) come from ../params. Append-only: saved
// patches use keys. Row format: see defineParams.
import {defineParams,SPACE} from '../params';

export const {PARAMS,BY_KEY,defaultValues,clampValue,sanitize,toPairs}=defineParams([
 // LFO (one, global, with delayed onset)
 ['lfoRate',21,'Rate',.1,30,3,'Hz','log'],
 ['lfoDelay',22,'Delay',0,3,0,'s','sq'],
 // DCO
 ['range',0,'Range',0,2,1,'','step',["16'","8'","4'"]],
 ['lfoDco',1,'LFO',0,12,0,'st','sq'],
 ['pwm',2,'PWM',0,1,0,'%','lin'],
 ['pwmSource',3,'PWM by',0,1,1,'','step',['LFO','Man']],
 ['pulse',4,'Pulse',0,1,0,'','step',['Off','On']],
 ['saw',5,'Saw',0,1,1,'','step',['Off','On']],
 ['sub',6,'Sub',0,1,0,'%','lin'],
 ['noise',7,'Noise',0,1,0,'%','lin'],
 // HPF: 0 boosts the bass, 1 is flat, 2 and 3 cut
 ['hpf',8,'HPF',0,3,1,'','step',['Boost','Flat','2','3']],
 // VCF
 ['cutoff',9,'Freq',10,40000,3000,'Hz','log'],
 ['res',10,'Res',0,1,.1,'%','lin'],
 ['envPolarity',11,'Env',0,1,0,'','step',['+','−']],
 ['env',12,'Env',0,1,.21,'%','lin'],
 ['lfoVcf',13,'LFO',0,1,0,'%','sq'],
 ['kybd',14,'Kybd',0,1.2,.6,'%','lin'],
 // VCA
 ['vcaMode',15,'Mode',0,1,0,'','step',['Env','Gate']],
 ['level',16,'Level',0,1,.8,'%','lin'],
 // ENV
 ['attack',17,'A',.0015,3,.005,'s','log'],
 ['decay',18,'D',.0015,12,.8,'s','log'],
 ['sustain',19,'S',0,1,.7,'%','lin'],
 ['release',20,'R',.0015,12,.4,'s','log'],
 // chorus (BBD)
 ['chorus',23,'Chorus',0,3,1,'','step',['Off','I','II','I+II']],
 ['chorusNoise',24,'Hiss',0,1,.3,'%','lin'],
 // performance additions (the original has no velocity or aftertouch)
 ['bendDco',34,'Bend DCO',0,1,1,'%','lin'],
 ['bendVcf',25,'Bend VCF',0,1,0,'%','lin'],
 ['modDepth',29,'Mod → vib',0,3,.5,'st','sq'],
 ['velVcf',26,'Vel → VCF',0,1,.3,'%','lin'],
 ['velVca',27,'Vel → VCA',0,1,.4,'%','lin'],
 ['afterVcf',28,'Touch → VCF',0,1,0,'%','lin'],
 // character
 ['volume',30,'Volume',0,1,.68,'%','lin'],
 ['voices',31,'Voices',1,16,6,'n','step'],
 ['spread',32,'Voice spread',0,1,.3,'%','lin'],
 ['width',33,'Width',0,1,0,'%','lin'],
 ...SPACE,
]);
