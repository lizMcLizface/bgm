import {sanitizeNoteBehavior} from './noteBehavior';
import {defaultEffects,sanitizeEffects} from './effectsConfig';
import {sanitizeInstrumentEffects} from './instrumentEffectsConfig';
import {defaultInserts,sanitizeInserts} from './insertsConfig';
import {VOICE_COLOUR} from './voiceColour';
export const FM_GLOBAL=[
 ['operators','Operator count',4,6,2,6],['algorithm','Starting topology',0,5,1,2],['polyphony','Note voices',1,32,1,16],['gain','Output gain',0,2,.01,.22],['quality','Oversampling',0,2,1,1],['feedback','Feedback depth',0,1,.01,.1],['feedbackOp','Feedback operator',0,5,1,0],['index','Global modulation index',0,3,.01,1],['bend','Pitch bend · semitones',-12,12,.1,0],['wheel','Mod wheel',0,1,.01,0],['lfoRate','LFO rate · Hz',.01,10,.01,5],['vibrato','LFO → pitch · cents',0,100,.5,0],['pressure','Channel pressure',0,1,.01,0],['keySync','Operator phase reset',0,1,1,1],['width','Carrier stereo width',0,1,.01,.7],['pitchStart','Pitch envelope start · semitones',-24,24,.1,0],['pitchTime','Pitch envelope time · s',.002,8,.001,.15],['tremolo','LFO → amplitude',0,1,.01,0],['lfoIndex','LFO → modulation index',0,1,.01,0],
 ['modAttack','Mod envelope attack · s',.002,12,.01,1.5],['modDecay','Mod envelope decay · s',.002,12,.01,2],['modSustain','Mod envelope sustain',0,1,.01,.5],['modRelease','Mod envelope release · s',.002,12,.01,2],['modAttackCurve','Mod attack curve',.25,4,.05,1],['modDecayCurve','Mod decay curve',.25,4,.05,1],['modReleaseCurve','Mod release curve',.25,4,.05,2],['wanderRate','Smooth random rate · Hz',.01,2,.01,.15],['wanderCents','Moving pitch drift · cents',0,20,.1,0],['lfo2Rate','LFO 2 rate · Hz',.01,10,.01,.15],
 ...Array.from({length:4},(_,i)=>[[`modSource${i+1}`,`Route ${i+1} source`,0,8,1,0],[`modTarget${i+1}`,`Route ${i+1} destination`,0,11,1,0],[`modDepth${i+1}`,`Route ${i+1} depth`,-1,1,.01,0]]).flat(),
 ...VOICE_COLOUR,
];
export const FM_MOD_SOURCES=['Off','LFO 1','LFO 2','Mod envelope','Velocity','Keyboard · centred on C4','Pressure','Mod wheel','Smooth random · per voice'];
export const FM_MOD_TARGETS=['Off','Pitch · ±100 cents','Index · ±100%','Feedback · ±0.5','Amplitude · ±100%','Stereo balance',...Array.from({length:6},(_,i)=>`Operator ${i+1} level · ±100%`)];
export const FM_OPERATOR=[
 ['ratio','Frequency ratio',.25,32,.01,1],['fixed','Fixed frequency · Hz (0 = ratio)',0,16000,1,0],['detune','Detune · cents',-50,50,.5,0],['level','Output / modulation level',0,8,.01,1],['attack','Attack time · s',0,8,.001,.005],['decay1','First decay time · s',.002,12,.001,.6],['peak','Peak level',0,1,.01,1],['decay2','Second decay time · s',.002,16,.001,2],['breakpoint','First decay level',0,1,.01,.5],['sustain','Held level',0,1,.01,.3],['release','Release time · s',0,12,.001,.8],['velocity','Velocity sensitivity',0,1,.01,.5],['keyScale','Keyboard level scaling',-1,1,.01,0],['rateScale','Keyboard rate scaling',0,1,.01,0],['pressure','Pressure → operator level',0,2,.01,0],['pan','Carrier pan',-1,1,.01,0],['enabled','Operator enabled',0,1,1,1],['wave','Wave shape',0,3,1,0],
 ['attackCurve','Attack curve · 1 = original',.25,4,.05,1],['decayCurve','Decay curve · 1 = original',.25,4,.05,1],['releaseCurve','Release curve · 1 = original',.25,4,.05,1],
 ['legacyEnvelope','Legacy envelope timing',0,1,1,0],
];
export const FM_ALGORITHMS=['Serial stack','Parallel stacks','Paired operators / converging modulators','Parallel carriers','Branched stack','Long stack + pair'];
const defaults=defs=>Object.fromEntries(defs.map(([id,,,,,v])=>[id,v]));
export function topology(count,algorithm){
 const routes=Array.from({length:6},()=>Array(6).fill(0)),carriers=Array(6).fill(0);const wire=(a,b)=>routes[a][b]=1,c=i=>carriers[i]=1;
 if(algorithm===3){for(let i=0;i<count;i++)c(i);}
 else if(algorithm===2&&count===6){for(let i=0;i<6;i+=2){wire(i,i+1);c(i+1);}}
 else if(algorithm===2){for(let i=0;i<3;i++)wire(i,3);c(3);}
 else if(algorithm===1){const half=count/2;for(let b=0;b<count;b+=half){for(let i=b;i<b+half-1;i++)wire(i,i+1);c(b+half-1);}}
 else if(algorithm===4){wire(0,1);wire(0,2);wire(1,3);wire(2,3);for(let i=3;i<count-1;i++)wire(i,i+1);c(count-1);}
 else if(algorithm===5){const split=count===6?4:3;for(let i=0;i<split-1;i++)wire(i,i+1);c(split-1);for(let i=split;i<count-1;i++)wire(i,i+1);c(count-1);}
 else{for(let i=0;i<count-1;i++)wire(i,i+1);c(count-1);}
 return {routes,carriers};
}
export function initialFM(){return {version:1,kind:'fm',name:'Init FM',global:defaults(FM_GLOBAL),operators:Array.from({length:6},()=>defaults(FM_OPERATOR)),...topology(6,2),effects:defaultEffects(),inserts:defaultInserts(),routing:{},performance:sanitizeNoteBehavior()};}
const clean=(raw,defs)=>Object.fromEntries(defs.map(([id,,min,max,step,v])=>{const x=raw?.[id];return [id,typeof x==='number'&&Number.isFinite(x)?Math.max(min,Math.min(max,step===1?Math.round(x):x)):v];}));
export function sanitizeFM(raw){
 if(raw?.version!==1||raw?.kind!=='fm')throw Error('Unsupported FM patch.');
 const global=clean(raw.global,FM_GLOBAL);global.operators=global.operators>=5?6:4;
 global.feedbackOp=Math.min(global.feedbackOp,global.operators-1);
 const base=topology(global.operators,global.algorithm);
 const routes=base.routes.map((row,from)=>row.map((v,to)=>{const n=raw.routes?.[from]?.[to];return from<to&&to<global.operators&&typeof n==='number'&&Number.isFinite(n)?Math.max(0,Math.min(2,n)):from<to&&to<global.operators?v:0;}));
 const carriers=base.carriers.map((v,i)=>i<global.operators&&typeof raw.carriers?.[i]==='number'&&Number.isFinite(raw.carriers[i])?Math.max(0,Math.min(1,raw.carriers[i])):i<global.operators?v:0);
 if(!carriers.some(Boolean))carriers[global.operators-1]=1;
 return {version:1,kind:'fm',name:typeof raw.name==='string'?raw.name.slice(0,80):'Imported FM',global,operators:Array.from({length:6},(_,i)=>clean(raw.operators?.[i],FM_OPERATOR)),routes,carriers,effects:sanitizeEffects(raw.effects??{bypass:1}),inserts:sanitizeInserts(raw.inserts),routing:sanitizeInstrumentEffects(raw.routing),performance:sanitizeNoteBehavior(raw.performance)};
}
export const cloneFM=p=>sanitizeFM(JSON.parse(JSON.stringify(p)));
export function fmPacket(raw){const p=sanitizeFM(raw);return {globals:FM_GLOBAL.map(([id],i)=>[i,p.global[id]]),operators:p.operators.flatMap((op,n)=>FM_OPERATOR.map(([id],i)=>[n,i,op[id]])),routes:p.routes.flatMap((row,from)=>row.map((value,to)=>[from,to,value])),carriers:p.carriers.map((value,i)=>[i,value])};}
function recipe(name,count,algorithm,globals,operators){const p=initialFM();p.name=name;Object.assign(p.global,{operators:count,algorithm},globals);Object.assign(p,topology(count,algorithm));operators.forEach((op,i)=>Object.assign(p.operators[i],op));
 // Carriers set the loudness: full velocity sensitivity there makes a soft key soft (at 0.5 it only lost about 4 dB). Modulators keep theirs, so velocity still shapes the brightness.
 for(let i=0;i<count;i++)if(p.carriers[i]>0)p.operators[i].velocity=1;
 return p;}
export const FM_RECIPES=[
 recipe('Tine constellation',6,2,{feedback:.12},[
  {ratio:1,level:2.7,decay1:.4,breakpoint:.25,decay2:2,sustain:.06,release:.5,velocity:.9},
  {ratio:1,level:.9,decay1:1.5,breakpoint:.65,decay2:4,sustain:.35,release:1.2,pan:-.2},
  {ratio:14,level:1.2,decay1:.08,breakpoint:.02,decay2:.2,sustain:0,release:.15,velocity:1},
  {ratio:1,level:.45,decay1:.8,breakpoint:.4,decay2:3,sustain:.2,release:1,pan:.2},
  {ratio:1,level:1.6,decay1:.35,breakpoint:.3,decay2:2,sustain:.1,release:.7},
  {ratio:2,level:.35,decay1:1,breakpoint:.5,decay2:3,sustain:.2,release:1.3},
 ]),
 recipe('Glass satellites',6,1,{feedback:.06,gain:.18},[{ratio:3.5,level:1.1,decay1:.3,sustain:0,keyScale:-.5},{ratio:2.76,level:1.6,decay1:.5,breakpoint:.2,sustain:.02,keyScale:-.6},{ratio:1,release:3,decay1:2,breakpoint:.4,sustain:.1,pan:-.3},{ratio:5.4,level:.6,decay1:.25,sustain:0,keyScale:-.6},{ratio:1.5,level:1.1,decay1:.6,sustain:.02,keyScale:-.5},{ratio:2,level:.7,release:3,decay1:2,sustain:.1,pan:.3}]),
 recipe('Four-op round bass',4,1,{feedback:.2,gain:.27},[{ratio:1,level:2.5,decay1:.15,breakpoint:.1,decay2:.2,sustain:.05,velocity:.9},{ratio:1,level:1,attack:.004,decay1:.4,sustain:.5,release:.25},{ratio:2,level:1.1,decay1:.09,sustain:0},{ratio:1,level:.5,decay1:.25,sustain:.3,release:.2}]),
 recipe('Breathing FM brass',6,2,{feedback:.12,vibrato:3},[{ratio:1,level:2.5,attack:.18,decay1:.8,breakpoint:.7,sustain:.6,pressure:.8},{ratio:1,attack:.08,sustain:.8,release:.5},{ratio:1,level:1.2,attack:.23,sustain:.6,pressure:.6},{ratio:2,level:.45,attack:.1,sustain:.6,pan:-.2,release:.45},{ratio:2,level:1.1,attack:.2,sustain:.5},{ratio:1,level:.6,attack:.1,sustain:.7,pan:.2,release:.5}]),
 recipe('Bowed glass pad',6,1,{feedback:.07,vibrato:4,lfoRate:.3,lfoIndex:.06,gain:.47},[{ratio:1,level:.6,attack:1,decay1:2,sustain:.6},{ratio:2,level:1.3,attack:.9,decay1:2,sustain:.6,pressure:.4},{ratio:1,attack:.65,decay1:2,sustain:.85,release:3,pan:-.4,detune:-3},{ratio:3.001,level:.4,attack:1.5,sustain:.3},{ratio:1,level:.8,attack:1.2,sustain:.5},{ratio:1,attack:.9,sustain:.8,release:3.5,pan:.4,detune:3}]),
 recipe('Parallel drawbars',6,3,{feedback:.04,gain:.2},[{ratio:.5,level:1.4,sustain:.9,decay1:.1,release:.25},{ratio:1,level:2,sustain:.9,decay1:.1,release:.25},{ratio:2,level:1.2,sustain:.9,decay1:.1,release:.25},{ratio:3,level:.7,sustain:.9,decay1:.1,release:.25},{ratio:4,level:.4,sustain:.9,decay1:.1,release:.25},{ratio:6,level:.24,sustain:.9,decay1:.1,release:.25}]),
 recipe('Fixed orbit bells',4,1,{feedback:.06,gain:.19},[{fixed:1627,level:1.4,attack:.003,decay1:.15,breakpoint:.15,decay2:1,sustain:0,release:.6,velocity:.9},{ratio:1,level:.85,attack:.003,decay1:1.4,breakpoint:.35,decay2:3,sustain:.08,release:2.5,pan:-.25},{fixed:3431,level:.65,attack:.003,decay1:.4,breakpoint:.12,decay2:1.5,sustain:0,release:.8},{ratio:2,level:.4,attack:.004,decay1:2,breakpoint:.3,decay2:4,sustain:.04,release:3,pan:.25}]),
 recipe('Four-op hollow reed',4,2,{feedback:.06,vibrato:4,gain:.2},[{ratio:2,level:1.1,attack:.09,decay1:.7,breakpoint:.75,decay2:1,sustain:.6,pressure:.5},{ratio:3,wave:1,level:.25,attack:.12,decay1:1,breakpoint:.7,sustain:.5,pressure:.4},{ratio:1,wave:2,level:.15,attack:.1,sustain:.5},{ratio:1,level:.85,attack:.055,decay1:1,breakpoint:.85,decay2:.5,sustain:.7,release:1}]),
];

const livingGlass=cloneFM(FM_RECIPES[4]);livingGlass.name='Living glass';
Object.assign(livingGlass.global,{wanderCents:3,wanderRate:.18,lfo2Rate:.12,modAttack:2,modDecay:3,modSustain:.4,modSource1:8,modTarget1:2,modDepth1:.16,modSource2:3,modTarget2:6,modDepth2:.35,modSource3:2,modTarget3:5,modDepth3:.18});
livingGlass.operators[0].attackCurve=1.3;Object.assign(livingGlass.inserts,{chorus:.3,phaser:.1,phaserDepth:.7,highGain:-1,gain:-1});FM_RECIPES.push(livingGlass);

const choir=cloneFM(FM_RECIPES[3]);choir.name='Air choir';Object.assign(choir.global,{polyphony:16,gain:.17,index:.7,feedback:.04,breath:.35,formant:.85,vowel:.15,formantShift:-2,body:.12,bodyType:3,noisePressure:.6,wanderCents:2});for(const op of choir.operators)Object.assign(op,{attack:.7,release:1.5});
// The carriers (operators 2, 4 and 6) feed nothing, so doubling them is +6 dB with the same tone; the level pass needs more than the gain limit allows.
for(const i of [1,3,5])choir.operators[i].level*=2;
FM_RECIPES.push(choir);
const airReed=cloneFM(FM_RECIPES[7]);airReed.name='Air reed';Object.assign(airReed.global,{breath:.5,formant:.2,vowel:1.7,body:.3,bodyType:3,noisePressure:.8,noiseAttack:.2});FM_RECIPES.push(airReed);
