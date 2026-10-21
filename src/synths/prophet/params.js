// Prophet-5 parameter table. Ids must match synth-engine/classics/src/prophet.rs; the
// shared space effects (ids from 200) come from ../params. Append-only: saved
// patches use keys. Row format: see defineParams.
import {defineParams,SPACE} from '../params';
import {shapeRows} from '../ui/envShape';

const ON=['Off','On'];
export const CHORD_KEYS=Array.from({length:10},(_,i)=>`chord${i+1}`);

export const {PARAMS,BY_KEY,defaultValues,clampValue,sanitize,toPairs}=defineParams([
 // Poly-Mod: filter envelope and Osc B into Osc A frequency, Osc A pulse width and the cutoff
 ['pmEnv',31,'Filt env',0,1,0,'%','lin'],
 ['pmOscB',32,'Osc B',0,1,0,'%','lin'],
 ['pmFreqA',33,'Freq A',0,1,0,'','step',ON],
 ['pmPwA',34,'PW A',0,1,0,'','step',ON],
 ['pmFilter',35,'Filter',0,1,0,'','step',ON],
 // LFO and wheel-mod (LFO ↔ noise, initial amount plus the mod wheel)
 ['lfoRate',36,'Freq',.05,25,5,'Hz','log'],
 ['lfoSaw',38,'Saw',0,1,0,'','step',ON],
 ['lfoTri',39,'Tri',0,1,1,'','step',ON],
 ['lfoSquare',40,'Square',0,1,0,'','step',ON],
 ['lfoAmount',37,'Initial',0,1,0,'%','sq'],
 ['wheelMix',41,'Mix',0,1,0,'%','lin'],
 ['wmFreqA',42,'Freq A',0,1,0,'','step',ON],
 ['wmFreqB',43,'Freq B',0,1,0,'','step',ON],
 ['wmPwA',44,'PW A',0,1,0,'','step',ON],
 ['wmPwB',45,'PW B',0,1,0,'','step',ON],
 ['wmFilter',46,'Filter',0,1,0,'','step',ON],
 // Oscillator A
 ['aFreq',0,'Freq',-24,24,0,'st','lin'],
 ['aSaw',1,'Saw',0,1,1,'','step',ON],
 ['aPulse',2,'Pulse',0,1,0,'','step',ON],
 ['aPw',3,'PW',0,1,.5,'%','lin'],
 ['sync',4,'Sync',0,1,0,'','step',ON],
 // Oscillator B (above +24 the frequency knob only moves the low-frequency rate)
 ['bFreq',5,'Freq',-24,36,0,'st','lin'],
 ['bFine',6,'Fine',0,105,7,'ct','lin'],
 ['bSaw',7,'Saw',0,1,1,'','step',ON],
 ['bTri',8,'Tri',0,1,0,'','step',ON],
 ['bPulse',9,'Pulse',0,1,0,'','step',ON],
 ['bPw',10,'PW',0,1,.5,'%','lin'],
 ['bLow',11,'Lo freq',0,1,0,'','step',ON],
 ['bKybd',12,'Kybd',0,1,1,'','step',ON],
 // Mixer
 ['mixA',14,'Osc A',0,1,1,'%','lin'],
 ['mixB',15,'Osc B',0,1,.8,'%','lin'],
 ['mixNoise',16,'Noise',0,1,0,'%','lin'],
 // Filter
 ['cutoff',17,'Cutoff',20,20000,750,'Hz','log'],
 ['res',18,'Res',0,1,.1,'%','lin'],
 ['fEnv',21,'Env amt',0,1,.35,'%','lin'],
 ['track',19,'Kybd',0,2,1,'','step',['Off','Half','Full']],
 ['filterRev',20,'Rev',0,1,1,'','step',['1/2','3']],
 ['fAttack',22,'A',.001,30,.005,'s','log'],
 ['fDecay',23,'D',.002,100,.6,'s','log'],
 ['fSustain',24,'S',0,1,.4,'%','lin'],
 ['fRelease',25,'R',.002,100,.4,'s','log'],
 // Amplifier
 ['aAttack',26,'A',.001,30,.003,'s','log'],
 ['aDecay',27,'D',.002,100,.8,'s','log'],
 ['aSustain',28,'S',0,1,.9,'%','lin'],
 ['aRelease',29,'R',.002,100,.35,'s','log'],
 ['release',30,'Release',0,1,1,'','step',ON],
 // Glide, unison, touch (Rev 4)
 ['glide',13,'Glide',0,5,0,'s','sq'],
 ['unison',52,'Unison',0,1,0,'','step',ON],
 ['unisonVoices',53,'Uni voices',1,10,5,'n','step'],
 ['unisonDetune',54,'Detune',0,1,.3,'%','lin'],
 ['priority',55,'Priority',0,5,1,'','step',['Low','Last','Low ⟳','Last ⟳','High','High ⟳']],
 ['chord',61,'Chord',0,1,0,'','step',ON],
 ['velFilter',48,'Vel → filt',0,1,.4,'%','lin'],
 ['velAmp',49,'Vel → amp',0,1,.5,'%','lin'],
 ['afterFilter',50,'Touch → filt',0,1,0,'%','lin'],
 ['afterAmp',51,'Touch → amp',0,1,0,'%','lin'],
 ['bendRange',56,'Bend',0,12,2,'n','step'],
 ['vintage',47,'Vintage',0,1,.25,'%','lin'],
 // character
 ['volume',57,'Volume',0,1,.55,'%','lin'],
 ['voices',58,'Voices',1,16,5,'n','step'],
 ['width',59,'Width',0,1,.3,'%','lin'],
 ['oversample',60,'2× rate',0,2,1,'','step',['Off','Auto','On']],
 // chord memory: semitones above the key, −1 = empty (not on the panel)
 ...CHORD_KEYS.map((key,i)=>[key,62+i,`Chord ${i+1}`,-1,60,-1,'n','step']),
 // envelope shapes (ids 180–195, one set for the whole patch)
 ...shapeRows('amp'),
 ...shapeRows('filter'),
 ...SPACE,
]);
