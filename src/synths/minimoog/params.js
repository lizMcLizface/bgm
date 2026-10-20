// Minimoog parameter table. Ids must match synth-engine/classics/src/minimoog.rs; the
// shared space effects (ids from 200) come from ../params. Append-only: saved
// patches use keys. Row format: see defineParams.
import {defineParams,SPACE} from '../params';

const ON=['Off','On'];
const RANGES=['LO',"32'","16'","8'","4'","2'"];
const WAVES=['Tri','Shark','Saw','Square','Wide','Narrow'];

export const {PARAMS,BY_KEY,defaultValues,clampValue,sanitize,toPairs}=defineParams([
 // controllers
 ['tune',38,'Tune',-100,100,0,'ct','lin'],
 ['glide',36,'Glide',0,5,0,'s','sq'],
 ['glideOn',37,'Glide',0,1,0,'','step',ON],
 ['modMix',32,'Osc 3 ↔ noise',0,1,0,'%','lin'],
 ['modAmount',33,'Mod',0,1,0,'%','sq'],
 ['modOsc',34,'→ Osc',0,1,1,'','step',ON],
 ['modFilter',35,'→ Filter',0,1,0,'','step',ON],
 ['priority',40,'Priority',0,2,0,'','step',['Low','Last','High']],
 ['trigger',39,'Trigger',0,1,0,'','step',['Single','Multi']],
 // oscillator bank
 ['osc1Range',0,'Range',0,5,3,'','step',RANGES],
 ['osc1Wave',1,'Wave',0,5,2,'','step',WAVES],
 ['osc2Range',2,'Range',0,5,3,'','step',RANGES],
 ['osc2Wave',3,'Wave',0,5,2,'','step',WAVES],
 ['osc2Tune',4,'Tune',-7,7,0,'st','lin'],
 ['osc3Range',5,'Range',0,5,3,'','step',RANGES],
 ['osc3Wave',6,'Wave',0,5,2,'','step',['Tri','Shark','Rev saw','Square','Wide','Narrow']],
 ['osc3Tune',7,'Tune',-7,7,0,'st','lin'],
 ['osc3Kbd',8,'Keyboard',0,1,1,'','step',ON],
 // mixer
 ['mix1',9,'Osc 1',0,1,.6,'%','lin'],
 ['mix1On',10,'On',0,1,1,'','step',ON],
 ['mix2',11,'Osc 2',0,1,.5,'%','lin'],
 ['mix2On',12,'On',0,1,1,'','step',ON],
 ['mix3',13,'Osc 3',0,1,.5,'%','lin'],
 ['mix3On',14,'On',0,1,0,'','step',ON],
 ['noise',15,'Noise',0,1,.3,'%','lin'],
 ['noiseOn',16,'On',0,1,0,'','step',ON],
 ['noisePink',17,'Colour',0,1,0,'','step',['White','Pink']],
 ['feedback',18,'Feedback',0,1,0,'%','lin'],
 ['drive',19,'Drive',0,1,.3,'%','lin'],
 // filter
 ['cutoff',20,'Cutoff',40,20000,900,'Hz','log'],
 ['emphasis',21,'Emphasis',0,1,.2,'%','lin'],
 ['contour',22,'Contour',0,1,.4,'%','lin'],
 ['kbdThird',23,'Kbd ⅓',0,1,1,'','step',ON],
 ['kbdTwoThirds',24,'Kbd ⅔',0,1,0,'','step',ON],
 ['fAttack',25,'A',.01,10,.01,'s','log'],
 ['fDecay',26,'D',.01,10,.5,'s','log'],
 ['fSustain',27,'S',0,1,.3,'%','lin'],
 // loudness contour
 ['aAttack',28,'A',.01,10,.01,'s','log'],
 ['aDecay',29,'D',.01,10,.5,'s','log'],
 ['aSustain',30,'S',0,1,.8,'%','lin'],
 ['decayOn',31,'Decay',0,1,0,'','step',['Off','On']],
 // additions for piano playing (the original has neither velocity nor pressure)
 ['velContour',42,'Vel → contour',0,1,.3,'%','lin'],
 ['velLevel',43,'Vel → level',0,1,.4,'%','lin'],
 ['afterFilter',44,'Touch → filter',0,1,0,'%','lin'],
 ['volume',45,'Volume',0,1,.75,'%','lin'],
 ['oversample',46,'2× rate',0,1,1,'','step',['Off','On']],
 ...SPACE,
]);
