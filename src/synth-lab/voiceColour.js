// Append-only per-note colour parameters, shared by both source ABIs.
export const VOICE_COLOUR=[
 ['breath','Breath / air',0,1,.01,0],['bow','Bow / friction texture',0,1,.01,0],['airBrightness','Excitation brightness · Hz',500,10000,10,4500],['noiseMotion','Friction roughness',0,1,.01,.25],
 ['formant','Vowel presence',0,1,.01,0],['vowel','Vowel · ah → oo → ee',0,2,.01,0],['formantShift','Vowel size · semitones',-12,12,.1,0],
 ['body','Body resonance',0,1,.01,0],['bodyType','Body material',0,4,1,0],['bodyTune','Body tuning · semitones',-12,12,.1,0],['bodyDecay','Body decay multiplier',.3,3,.05,1],['noisePressure','Pressure → excitation',0,1,.01,0],['noiseAttack','Excitation attack emphasis',0,1,.01,.25],
];
export const BODY_TYPES=['Wood','Low strings','High strings','Hollow pipe','Metallic'];
export const COLOUR_NOTE='Per-note textures follow the voice envelope and pressure. Vowels and four-mode bodies colour the oscillator/FM source; they are software approximations, not physical bow or air-column models. Body modes stay fixed as notes glide, and may ring after the source releases. Higher body decay increases release overlap.';
export function voiceColourTail(p={}){const body=Number.isFinite(p.body)?Math.max(0,Math.min(1,p.body)):0,decay=Number.isFinite(p.bodyDecay)?Math.max(.3,Math.min(3,p.bodyDecay)):1;return (p.formant>0?.5:0)+(body>0?.2*decay*17+.2:0);}
export function patchColourTail(p){return p.kind==='fm'?voiceColourTail(p.global):Math.max(...p.layers.slice(0,p.global.model===2?2:1).map(voiceColourTail));}
