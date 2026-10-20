// TB-303-style bass line parameter table. Ids must match synth-engine/classics/src/tb303.rs;
// the shared space effects (ids from 200) come from ../params.
import {defineParams,SPACE} from '../params';

export const {PARAMS,BY_KEY,defaultValues,clampValue,sanitize,toPairs}=defineParams([
 ['tune',0,'Tune',-100,100,0,'ct','lin'],
 ['cutoff',1,'Cut off',80,6000,600,'Hz','log'],
 ['resonance',2,'Resonance',0,1,.5,'%','lin'],
 ['envMod',3,'Env mod',0,1,.6,'%','lin'],
 ['decay',4,'Decay',.08,2.5,.45,'s','log'],
 ['accent',5,'Accent',0,1,.5,'%','lin'],
 ['wave',6,'Wave',0,1,0,'','step',['Saw','Square']],
 ['volume',7,'Volume',0,1,.7,'%','lin'],
 ['drive',8,'Drive',0,1,.2,'%','lin'],
 ['slide',9,'Slide',.004,.1,.012,'s','log'],
 ['tempo',10,'Tempo',40,220,120,'bpm','lin'],
 ['swing',11,'Swing',.5,.75,.5,'swing','lin'],
 ['voices',12,'Voices',1,1,1,'n','lin'],
 ...SPACE,
]);
