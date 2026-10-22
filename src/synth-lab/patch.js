import {defaultEffects,sanitizeEffects} from './effectsConfig';
import {sanitizeInstrumentEffects} from './instrumentEffectsConfig';
import {defaultInserts,sanitizeInserts} from './insertsConfig';
import {VOICE_COLOUR} from './voiceColour';
import {sanitizeNoteBehavior} from './noteBehavior';
// Append-only ABI parameter IDs shared with synth-engine/src/lib.rs.
export const GLOBAL=[
 ['model','Architecture',0,3,1,0],['polyphony','Note voices',1,32,1,8],['unison','Unison per note',1,4,1,1],['spread','Unison detune · cents',0,40,.5,8],
 ['gain','Output gain',0,.8,.01,.28],['bend','Pitch bend · semitones',-12,12,.1,0],['wheel','Mod wheel',0,1,.01,0],['pressure','Channel pressure',0,1,.01,0],
 ['chorus','Stereo chorus',0,.8,.01,0],['chorusRate','Chorus rate · Hz',.05,2,.01,.3],['chorusDepth','Chorus depth · ms',0,8,.1,3],['width','Unison width',0,1,.01,.65]
];
export const LAYER=[
 ['waveA','Oscillator A',0,10,1,3],['waveB','Oscillator B',0,10,1,4],['levelA','Oscillator A level',0,1,.01,.65],['levelB','Oscillator B level',0,1,.01,.35],
 ['coarseB','B relative tuning · semitones',-24,24,1,0],['fineB','B fine tune · cents',-50,50,.5,0],['pulse','Pulse width',.05,.95,.01,.5],['sub','Sub oscillator',0,1,.01,0],['noise','Noise',0,1,.01,0],
 ['cutoff','Low-pass cutoff · Hz',20,18000,1,1800],['resonance','Resonance',0,1,.01,.2],['filter','Filter response',0,3,1,1],['highpass','High-pass cutoff · Hz',10,5000,1,20],['highResonance','High-pass resonance',0,1,.01,0],
 ['filterAmount','Filter envelope · octaves',-6,6,.05,2],['keytrack','Filter key tracking',0,1,.01,.5],['velocityTone','Velocity → filter · octaves',0,4,.05,1],
 ['attack','Amp attack · s',0,8,.001,.03],['decay','Amp decay · s',0,8,.01,.3],['sustain','Amp sustain',0,1,.01,.65],['release','Amp release · s',0,8,.01,.7],
 ['filterAttack','Filter attack · s',.002,8,.001,.03],['filterDecay','Filter decay · s',.002,8,.01,.4],['filterSustain','Filter sustain',0,1,.01,.2],['filterRelease','Filter release · s',.002,8,.01,.7],
 ['lfoRate','LFO 1 rate · Hz',.01,20,.01,4.5],['lfoPitch','LFO 1 → pitch · cents',0,100,.5,0],['lfoFilter','LFO 1 → filter · octaves',0,4,.01,0],['lfoPwm','LFO 1 → pulse width',0,.4,.005,0],['drift','Voice pitch variation · cents',0,20,.5,3],
 ['mix','Layer level',0,1,.01,1],['pan','Layer pan',-.9,.9,.01,0],['polyPitch','Osc B → A frequency',0,1,.01,0],['polyPwm','Osc B → A pulse width',0,.4,.005,0],['envelopePitch','Filter envelope → A/B pitch · semitones',-12,12,.1,0],
 ['lfo2Rate','LFO 2 rate · Hz',.01,20,.01,.15],['lfo2Pitch','LFO 2 → pitch · cents',0,100,.5,0],['lfo2Filter','LFO 2 → filter · octaves',0,4,.01,0],['lfo2Amp','LFO 2 → amplitude',0,1,.01,0],['drive','Filter input saturation',0,3,.01,.2],
 ['envPwm','Filter envelope → pulse width',-.4,.4,.005,0],['pressureTone','Pressure → filter · octaves',0,4,.05,2],['velocityAmp','Velocity → amplitude',0,1,.01,1],['coarseA','Layer tuning · semitones',-24,24,1,0],['lfoShape','LFO 1 shape',0,4,1,0],['lfoDelay','LFO 1 fade-in · s',0,5,.01,0],['velocityAttack','Velocity → softer attack',0,1,.01,0],['reservedB','Reserved',0,1,.01,0],
 ['hardSync','Hard sync · B resets A',0,1,1,0],['polyFilter','Osc B → filter · octaves',0,3,.01,0],['pulseA','A pulse width offset',-.4,.4,.005,0],['pulseB','B pulse width offset',-.4,.4,.005,0],['bLow','B low-frequency mode',0,1,1,0],['bKeytrack','B follows keyboard',0,1,1,1],['envelopeTarget','Envelope pitch routing',0,1,1,0],['pressureAmp','Pressure → amplitude',0,1,.01,0],['pressurePitch','Pressure → pitch · cents',0,100,.5,0],['ring','Oscillator ring mix',0,1,.01,0],['filterFamily','Low-pass topology',0,1,1,0],
 ['ampAttackCurve','Amp attack curve',.25,4,.05,1],['ampDecayCurve','Amp decay curve',.25,4,.05,1],['ampReleaseCurve','Amp release curve',.25,4,.05,2],
 ['filterAttackCurve','Filter attack curve',.25,4,.05,1],['filterDecayCurve','Filter decay curve',.25,4,.05,1],['filterReleaseCurve','Filter release curve',.25,4,.05,2],
 ['modAttack','Mod envelope attack · s',.002,12,.01,1.5],['modDecay','Mod envelope decay · s',.002,12,.01,2],['modSustain','Mod envelope sustain',0,1,.01,.5],['modRelease','Mod envelope release · s',.002,12,.01,2],
 ['modAttackCurve','Mod attack curve',.25,4,.05,1],['modDecayCurve','Mod decay curve',.25,4,.05,1],['modReleaseCurve','Mod release curve',.25,4,.05,2],
 ['wanderRate','Smooth random rate · Hz',.01,2,.01,.15],['wanderCents','Moving pitch drift · cents',0,20,.1,0],
 ...Array.from({length:4},(_,slot)=>[
  [`modSource${slot+1}`,`Route ${slot+1} source`,0,10,1,0],
  [`modTarget${slot+1}`,`Route ${slot+1} destination`,0,5,1,0],
  [`modDepth${slot+1}`,`Route ${slot+1} depth`,-1,1,.01,0],
 ]).flat(),
 ...VOICE_COLOUR,
 ['legacyAmp','Legacy envelope timing',0,1,1,0],
];
export const MOD_SOURCES=['Off','LFO 1','LFO 2','Mod envelope','Amp envelope','Filter envelope','Velocity','Keyboard · centred on C4','Pressure','Mod wheel','Smooth random · per voice'];
export const MOD_TARGETS=['Off','Pitch · ±100 cents','Cutoff · ±4 octaves','Pulse width · ±0.4','Amplitude · ±100%','Pan · ±full width'];
export const MODELS=[
 {name:'Dual VCO · Prophet-inspired',description:'Two oscillators, B-master hard sync, per-voice B/filter-envelope modulation and an optional four-pole feedback ladder approximation. B can run as an independent low-frequency source. Circuit calibration and the original Poly-Mod circuit are not emulated.'},
 {name:'Dual VCO · Jupiter-inspired',description:'Two oscillators, a separate high-pass and selectable low-pass slope. More flexible than the historical instrument; no claim of matching its filters or calibration.'},
 {name:'Dual layer · CS-inspired',description:'Two complete independent channels per note, each with high-pass then 12 dB low-pass, amp/filter envelopes and expression. A layered architecture, not a CS-80 circuit model.'},
 {name:'DCO + sub · Juno-inspired',description:'A and B share one pitch/phase clock, plus sub/noise. The amp envelope also controls the filter. Drift and B tuning are ignored. Chorus is a modulated delay, not a BBD emulation.'}
];
const defaults=defs=>Object.fromEntries(defs.map(([id,,,,,value])=>[id,value]));
export const initialPatch=()=>({version:1,name:'Init',global:defaults(GLOBAL),layers:[defaults(LAYER),defaults(LAYER)],effects:defaultEffects(),inserts:defaultInserts(),routing:{},performance:sanitizeNoteBehavior()});
const clean=(raw,defs)=>Object.fromEntries(defs.map(([id,,min,max,step,value])=>{const n=raw?.[id];return [id,typeof n==='number'&&Number.isFinite(n)?Math.min(max,Math.max(min,step===1?Math.round(n):n)):value];}));
export function sanitizePatch(raw){if(raw?.version!==1)throw Error('Unsupported synth-lab patch version.');return {version:1,name:typeof raw.name==='string'?raw.name.slice(0,80):'Imported',global:clean(raw.global,GLOBAL),layers:[clean(raw.layers?.[0],LAYER),clean(raw.layers?.[1],LAYER)],effects:sanitizeEffects(raw.effects??{bypass:1}),inserts:sanitizeInserts(raw.inserts),routing:sanitizeInstrumentEffects(raw.routing),performance:sanitizeNoteBehavior(raw.performance)};}
const recipe=(name,model,global,a,b={})=>{const p=initialPatch();p.name=name;Object.assign(p.global,{model},global);Object.assign(p.layers[0],a);Object.assign(p.layers[1],b);return p;};
export const RECIPES=[
 recipe('Five-voice brass',0,{polyphony:5},{waveA:3,waveB:3,fineB:7,cutoff:750,filterAmount:2.8,attack:.04,decay:.4,sustain:.7,release:.6,filterAttack:.05,filterDecay:.8,filterSustain:.25,lfoPitch:4,lfoDelay:.5}),
 recipe('Eight-voice silk',1,{polyphony:8,chorus:.18},{waveA:3,waveB:4,fineB:-6,cutoff:1200,filter:0,filterAmount:1.8,attack:.7,decay:1,sustain:.75,release:1.7,lfoPwm:.08,lfoRate:.35}),
 recipe('Layered noir',2,{polyphony:8,gain:.23},{waveA:3,waveB:0,levelA:.8,levelB:0,highpass:120,cutoff:850,filterAmount:2.1,attack:.23,decay:1,sustain:.85,release:1.8,filterAttack:.7,filterDecay:1.8,filterSustain:.4,lfoPitch:5,lfoDelay:1.2,pan:-.2,mix:.8},{waveA:4,waveB:0,levelA:.7,levelB:0,coarseA:0,highpass:220,cutoff:1900,filterAmount:1,attack:.5,decay:1.4,sustain:.55,release:2.3,lfoRate:.7,lfoPwm:.06,pan:.2,mix:.55}),
 recipe('DCO chorus pad',3,{polyphony:6,chorus:.65,chorusRate:.4,chorusDepth:3.8},{waveA:3,waveB:4,levelA:.55,levelB:.4,sub:.25,drift:0,cutoff:950,filterAmount:2,attack:.6,decay:1.4,sustain:.75,release:2,lfoRate:.4,lfoPwm:.12}),
 recipe('Resonant sequence',0,{polyphony:8},{waveA:3,waveB:4,levelA:.7,levelB:.2,sub:.15,cutoff:320,resonance:.65,filterAmount:4,attack:.005,decay:.3,sustain:.1,release:.15,filterAttack:.002,filterDecay:.22,filterSustain:0,lfoRate:.25,lfoFilter:.25}),
 recipe('Slow pressure lead',2,{polyphony:8},{waveA:3,waveB:0,levelA:.75,cutoff:650,filterAmount:2,attack:.25,decay:1,sustain:.8,release:1.6,filterAttack:.6,filterDecay:2,filterSustain:.4,lfoPitch:5,lfoDelay:1,pressureTone:3,mix:.85},{waveA:2,waveB:0,levelA:.6,levelB:0,cutoff:1800,filterAmount:.5,attack:.3,decay:1,sustain:.6,release:1.8,mix:.35})
 ,recipe('Sync sweep',0,{polyphony:8},{waveA:3,waveB:3,levelA:.75,levelB:.08,coarseB:-12,hardSync:1,envelopePitch:12,envelopeTarget:1,cutoff:2200,filterFamily:1,filterAmount:1,attack:.015,decay:.8,sustain:.45,release:.65,filterAttack:.01,filterDecay:1,filterSustain:0})
 ,recipe('Independent poly motion',0,{polyphony:8,chorus:.15},{waveA:4,waveB:2,levelA:.75,levelB:0,bLow:1,bKeytrack:0,polyPwm:.12,polyFilter:.8,filterFamily:1,cutoff:1400,filterAmount:.5,attack:.6,decay:1,sustain:.8,release:2,pulseA:-.08})
 ,recipe('Living silk',1,{polyphony:8,gain:.2,chorus:.25},{waveA:4,waveB:3,levelA:.6,levelB:.25,fineB:-5,cutoff:1050,filter:0,filterAmount:.5,resonance:.12,attack:1.1,decay:1.5,sustain:.8,release:2.5,ampAttackCurve:1.6,wanderCents:4,wanderRate:.18,modAttack:2.5,modDecay:3,modSustain:.45,modRelease:2,lfo2Rate:.13,modSource1:10,modTarget1:2,modDepth1:.16,modSource2:3,modTarget2:3,modDepth2:.22,modSource3:2,modTarget3:5,modDepth3:.2})
];
const rosin=JSON.parse(JSON.stringify(RECIPES[8]));rosin.name='Rosin silk';Object.assign(rosin.global,{polyphony:16,chorus:0});Object.assign(rosin.layers[0],{waveA:3,waveB:3,attack:.45,release:1.1,cutoff:2400,filterAmount:.3,bow:.4,airBrightness:2500,noiseMotion:.35,body:.65,bodyType:2,bodyDecay:1,noisePressure:.3,noiseAttack:.15,pressureTone:.4});RECIPES.push(rosin);
const wood=JSON.parse(JSON.stringify(RECIPES[4]));wood.name='Wooden pulse';Object.assign(wood.global,{polyphony:16,gain:.2});Object.assign(wood.layers[0],{waveA:2,waveB:0,levelB:0,sub:0,cutoff:2600,resonance:.1,filterAmount:.5,attack:.003,decay:.18,sustain:0,release:.12,bow:.12,body:.85,bodyType:0,bodyDecay:1.2,noiseAttack:.65});RECIPES.push(wood);
export const clonePatch=p=>sanitizePatch(JSON.parse(JSON.stringify(p)));
export function parameterTriples(patch){return [patch.global,...patch.layers].flatMap((values,scope)=>(scope===0?GLOBAL:LAYER).map(([key],index)=>[scope,index,values[key]]));}

/** Deliberately a subset translation, so the baseline remains the existing Instrument. */
export function legacyPreset(patch,{dry=false}={}){
 const p=patch.layers[0],wave=['off','sine','triangle','sawtooth','square_dc','organ','hollow','choir','glass','reed','triangle'];
 return {masterVolume:patch.global.gain,vcoType:wave[p.waveA],vcoDutyCycle:p.pulse,voiceCount:patch.global.unison,detuneSpread:patch.global.spread,stereoSpread:patch.global.width*100,
 osc2Type:wave[p.waveB],osc2Amount:p.levelB,osc2OctaveOffset:0,osc2Detune:p.fineB+p.coarseB*100,allThemPitches:2**(p.coarseA/12),subOscType:p.sub>0?'square':'off',subOscOctaveOffset:-1,
 gainAttack:p.attack,gainDecay:p.decay,gainSustain:p.sustain,gainRelease:p.release,filterType:['lowpass','lowpass','bandpass','highpass'][p.filter],filterFreq:p.cutoff,filterQ:.1+p.resonance*8,filterEnvAmount:p.filterAmount*1200,filterAttack:p.filterAttack,filterDecay:p.filterDecay,filterRelease:p.filterRelease,filterKeyTrack:p.keytrack,filterVelocity:p.velocityTone*1200,
 vibratoDepth:p.lfoPitch,vibratoRate:p.lfoRate,filterLfoDepth:p.lfoFilter*1200,filterLfoRate:p.lfoRate,chorusAmount:dry?0:patch.global.chorus,chorusRate:patch.global.chorusRate,chorusDepth:patch.global.chorusDepth/1000,noiseMix:p.noise,noiseType:'white',reverbAmount:0,delayAmount:0,pingPongAmount:0,eqLowGain:0,eqHighGain:0};
}
