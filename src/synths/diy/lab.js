import {defineParams} from '../params';

// Effects and filters being tried out on the DI-Poly page before they are merged into the rack: tape, shimmer and freeze (the
// calmbgm synth's own Web Audio stages, src/app/engine/voiceFx.js) and a master filter after the rack. Their values live on the page and
// are not part of a sound; this table gives the faders their ranges, labels and defaults.
const INTERVALS=['fifth','octave','twelfth','twoOctaves'];
export const MASTER_TYPES=['lowpass','highpass','bandpass','notch','lowshelf','highshelf'];
// [key, id, label, min, max, default, unit, curve, options?]
const ROWS=[
 ['tapeWow',0,'Wow',0,1,0,'%','lin'],['tapeWowRate',1,'Wow rate',.1,3,.6,'Hz','log'],['tapeFlutter',2,'Flutter',0,1,0,'%','lin'],['tapeDrive',3,'Saturation',0,1,0,'%','lin'],['tapeTone',4,'Tone',2000,16000,9000,'Hz','log'],
 ['shimmerMix',5,'Mix',0,1,0,'%','lin'],['shimmerDecay',6,'Decay',1,20,6,'s','log'],['shimmerInterval',7,'Interval',0,3,1,'choice','step',['Fifth','Octave','12th','2 oct']],['shimmerClimb',8,'Climb',0,.9,.5,'%','lin'],['shimmerTone',9,'Tone',2000,16000,7000,'Hz','log'],
 ['freezeMix',10,'Mix',0,1,0,'%','lin'],['freezeLength',11,'Length',.25,4,2,'s','lin'],['freezeFade',12,'Fade',.05,4,1,'s','log'],['freezeHold',13,'Hold',0,1,0,'choice','step',['Off','On']],
 ['masterOn',14,'Filter',0,1,0,'choice','step',['Off','On']],['masterType',15,'Type',0,5,0,'choice','step',['Low-pass','High-pass','Band-pass','Notch','Low shelf','High shelf']],
 ['masterFreq',16,'Cutoff',20,18000,8000,'Hz','log'],['masterQ',17,'Q',0,20,.7,'decimal','lin'],['masterGain',18,'Gain',-24,24,0,'dB','lin'],
 ['tapeOn',19,'Tape',0,1,1,'choice','step',['Off','On']],['shimmerOn',20,'Shimmer',0,1,1,'choice','step',['Off','On']],['freezeOn',21,'Freeze',0,1,1,'choice','step',['Off','On']],
];
export const LAB=defineParams(ROWS);

/** The preset VoiceFx reads (tape, shimmer, freeze) from the lab's values; an effect switched off is a silent one. */
export function labFx(v){
 const tape=v.tapeOn>=.5,shimmer=v.shimmerOn>=.5,freeze=v.freezeOn>=.5;
 return {
  tapeWow:tape?v.tapeWow:0,tapeWowRate:v.tapeWowRate,tapeFlutter:tape?v.tapeFlutter:0,tapeDrive:tape?v.tapeDrive:0,tapeTone:v.tapeTone,
  shimmerMix:shimmer?v.shimmerMix:0,shimmerDecay:v.shimmerDecay,shimmerInterval:INTERVALS[Math.round(v.shimmerInterval)]??'octave',shimmerClimb:v.shimmerClimb,shimmerTone:v.shimmerTone,
  freezeMix:freeze?v.freezeMix:0,freezeLength:v.freezeLength,freezeFade:v.freezeFade,freezeHold:v.freezeHold>=.5,
 };
}
/** The master filter's settings as a Web Audio biquad takes them. */
export function masterSettings(v){
 return {on:v.masterOn>=.5,type:MASTER_TYPES[Math.round(v.masterType)]??'lowpass',freq:v.masterFreq,q:v.masterQ,gain:v.masterGain};
}
