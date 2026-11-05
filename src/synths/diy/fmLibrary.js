// DIY FM sound library: original voices in the spirit of a classic FM bank, written for this synth's 1-8 operator engine.
// Every sound is plain data (operator ratios, levels, envelopes and wiring); nothing here is a copy of any cartridge.
// Output gain per sound comes from fmLibraryGains.json, written by tools/calibrateFMLibrary.mjs so that all of them play at the same loudness.
import {initialFM,topology,sanitizeFM} from '../../synth-lab/fmPatch';
import gains from './fmLibraryGains.json';
import {FX,rackFor} from './fmLibraryFx';

// Envelope shorthand: attack, first decay (to the breakpoint level), breakpoint, second decay (to the held level), held level, release.
const e=(attack,decay1,breakpoint,decay2,sustain,release)=>({attack,decay1,breakpoint,decay2,sustain,release});
// A struck envelope that dies away completely, a gated one that holds until release, and one that decays to a held level.
const hit=(decay,release=.2,tail=decay*4)=>e(.002,decay,.25,tail,0,release);
const gate=(attack,release)=>e(attack,.05,1,1,1,release);
const rise=(attack,hold,release)=>e(attack,.1,hold,1,hold,release);
const o=(ratio,level,env,extra)=>({ratio,level,...env,...extra});

// name, category, styles, operator count, starting topology, global settings, operators, extras:
// wire [[from,to,amount]] and out [carrier indices or [index,amount]] replace the starting topology; inserts and perf set the effects and note behaviour.
function sound(name,category,styles,count,algorithm,globals,ops,extra={}){
 const p=initialFM();p.name=name;Object.assign(p.global,{operators:count,algorithm,gain:gains[name]??p.global.gain},globals);
 Object.assign(p,topology(count,algorithm));
 if(extra.wire){p.routes=p.routes.map(row=>row.map(()=>0));for(const [a,b,v=1] of extra.wire)p.routes[a][b]=v;}
 if(extra.out){p.carriers=p.carriers.map(()=>0);for(const c of extra.out){const [i,v=1]=Array.isArray(c)?c:[c];p.carriers[i]=v;}}
 ops.forEach((op,i)=>Object.assign(p.operators[i],op));
 // Full velocity sensitivity on the carriers makes a soft key soft; the modulators keep theirs so velocity still shapes the brightness.
 for(let i=0;i<count;i++)if(p.carriers[i]>0&&!(ops[i]&&'velocity' in ops[i]))p.operators[i].velocity=1;
 const fx=FX[name]??{};
 Object.assign(p.effects,fx.effects);Object.assign(p.inserts,extra.inserts,fx.inserts);Object.assign(p.performance,extra.perf);
 return {patch:sanitizeFM(p),category,styles:[...styles,`${count} op`],rack:rackFor(fx.rack)};
}
const S=sound;

export const FM_LIBRARY_CATEGORIES=[
 {id:'epiano',label:'Electric pianos',blurb:'Tines, bars and reeds from two to eight operators'},
 {id:'mallets',label:'Mallets & plucks',blurb:'Struck wood, metal and strings'},
 {id:'church',label:'Bells & chimes',blurb:'Inharmonic ratios and fixed frequencies'},
 {id:'organs',label:'Organs',blurb:'Additive stops and reed pipes'},
 {id:'winds',label:'Brass & winds',blurb:'Sections, solos and breath'},
 {id:'strings',label:'Strings & pads',blurb:'Slow ensembles and evolving beds'},
 {id:'choirs',label:'Voices',blurb:'Choirs, vowels and glass harmonica'},
 {id:'basses',label:'Basses & leads',blurb:'Low end, mono solos and sync'},
 {id:'perc',label:'Percussion',blurb:'Kicks, toms, snares and metal'},
 {id:'fx',label:'Effects & textures',blurb:'Sweeps, drones and machines'},
];

const LIB=[
 // ---------- two operators: one modulator into one carrier ----------
 S('Pure FM tine','epiano',['tine','bright'],2,0,{feedback:0,index:1},[o(14,1.5,hit(.14,.1),{velocity:1}),o(1,1,e(.002,.9,.3,3.5,.04,.6))],{inserts:{chorus:.18}}),
 S('Two-op glass piano','epiano',['glassy'],2,0,{feedback:0,index:1},[o(3,1.3,hit(.3,.15),{velocity:.9}),o(1,1,e(.002,.7,.35,3,.05,.5))],{inserts:{chorus:.12}}),
 S('Two-op sub bass','basses',['sub','round'],2,0,{feedback:.15},[o(1,1.4,e(.003,.3,.4,1,.35,.2)),o(.5,1,e(.003,.25,.7,1,.65,.2))]),
 S('Two-op brass','winds',['brass','touch'],2,0,{feedback:0,vibrato:4,lfoDelay:.4},[o(1,2.4,e(.1,.5,.7,1,.6,.25),{pressure:.6}),o(1,1,gate(.07,.22))]),
 S('Two-op clav','epiano',['percussive','funk'],2,0,{feedback:.35},[o(1,3,hit(.12,.06,.4)),o(1,1,e(.002,.25,.5,.5,.2,.08))]),
 S('Two-op marimba','mallets',['woody','short'],2,0,{feedback:0},[o(4,1.8,hit(.05,.1),{velocity:1}),o(1,1,hit(.5,.2,1.5))]),
 S('Sine bell','church',['bell','inharmonic'],2,0,{feedback:0},[o(3.5,1.5,e(.002,.6,.3,3,0,1.2)),o(1,1,e(.002,1.2,.3,5,.02,2))],{inserts:{chorus:.2}}),
 S('Feedback saw lead','basses',['lead','mono','bright'],2,0,{feedback:.62,feedbackOp:0,vibrato:10,lfoDelay:.5,lfoRate:5.2},[o(1,2,gate(.01,.12)),o(1,1,gate(.008,.15))],{perf:{mode:2,portamento:.07}}),
 S('FM kick','perc',['kick','drum'],2,0,{feedback:0,pitchStart:18,pitchTime:.06,gain:.3},[o(1,2,hit(.08,.05),{velocity:.5}),o(.5,1,hit(.28,.05,.5),{velocity:.5})]),
 S('Laser zap','fx',['zap','sweep'],2,0,{feedback:.1,pitchStart:24,pitchTime:.22},[o(2,3,hit(.2,.05)),o(1,1,hit(.25,.05,.4))]),

 // ---------- three operators ----------
 S('Three-op Rhodes','epiano',['tine','warm'],3,1,{feedback:0,tremolo:.12,lfoRate:4.5},[o(14,1.1,hit(.1,.08),{velocity:1}),o(1,1,e(.002,.9,.3,3.5,.05,.6)),o(1,.7,e(.002,1.4,.5,4,.2,.8),{pan:.25})],{inserts:{chorus:.2}}),
 S('Three-op slap bass','basses',['slap','funk'],3,0,{feedback:.2},[o(3,1.5,hit(.07,.08)),o(1,2,e(.002,.3,.3,.8,.1,.15)),o(.5,1,e(.002,.35,.6,1,.5,.18))]),
 S('Three-op strings','strings',['bowed','slow'],3,1,{feedback:.05,vibrato:5,lfoDelay:.7},[o(1,.5,gate(.4,.5)),o(1,1,gate(.45,.7),{detune:-6,pan:-.4}),o(1,1,gate(.5,.7),{detune:6,pan:.4})],{wire:[[0,1,1],[0,2,1]],out:[1,2],inserts:{chorus:.3}}),
 S('Pan pipe','winds',['pipe','airy'],3,0,{feedback:0,breath:.3,formant:.1,vibrato:4,lfoDelay:.5,noisePressure:.5},[o(1,.35,gate(.05,.2)),o(3,.3,e(.04,.1,.5,.5,.4,.2)),o(1,1,gate(.06,.25))],{wire:[[0,2,1],[1,2,1]],out:[2]}),
 S('Wire pluck','mallets',['pluck','plucked'],3,0,{feedback:.1},[o(5,1.4,hit(.04,.06)),o(2,1.2,hit(.12,.1)),o(1,1,e(.002,.5,.3,2,.02,.4))]),
 S('Chime ladder','church',['bell','bright'],3,0,{feedback:0},[o(5.19,1.2,hit(.2,.4)),o(2.76,1.3,hit(.5,.5,1.5)),o(1,1,e(.002,1,.35,5,.02,2.5))],{inserts:{chorus:.15}}),
 S('Click organ','organs',['organ','percussive'],3,3,{feedback:0},[o(1,1,e(.004,.05,1,1,1,.12)),o(2,.6,e(.004,.05,1,1,1,.1)),o(4,.5,e(.002,.08,.1,.1,.1,.1))]),
 S('Three-op wobble','basses',['wobble','dubstep'],3,0,{feedback:.25,lfoRate:2.2,lfoIndex:.7,lfoShape:1},[o(1,2.5,gate(.005,.1)),o(1,1.5,gate(.005,.1)),o(.5,1,gate(.004,.12))],{perf:{mode:2,portamento:.04}}),
 S('Siren','fx',['siren','sweep'],3,0,{feedback:0,vibrato:100,lfoRate:.8,lfoShape:1},[o(2,.4,gate(.05,.3)),o(1,.6,gate(.05,.3)),o(1,1,gate(.04,.35))]),
 S('Blown bottle','winds',['airy','hollow'],3,0,{feedback:.05,breath:.5,formant:.2,vowel:1.5,noisePressure:.8},[o(1,.2,gate(.1,.2)),o(2,.12,gate(.12,.2)),o(1,1,gate(.1,.3))],{inserts:{highGain:-2}}),

 // ---------- four operators ----------
 S('Chorused EP','epiano',['tine','chorus'],4,1,{feedback:.06,tremolo:.1},[o(14,1.1,hit(.1,.08),{velocity:1}),o(1,1,e(.002,.9,.3,3.5,.05,.7),{detune:-3,pan:-.3}),o(14,1.1,hit(.1,.08),{velocity:1}),o(1,1,e(.002,.9,.3,3.5,.05,.7),{detune:3,pan:.3})],{inserts:{chorus:.25}}),
 S('Wurly bark','epiano',['reed','growl'],4,2,{feedback:.18,tremolo:.2,lfoRate:5.5},[o(2,1.2,hit(.12,.1,.5)),o(1,.9,e(.002,.4,.5,2,.12,.3)),o(1,1.2,e(.002,.7,.5,3,.1,.4)),o(1,1,e(.002,.9,.4,3,.1,.5))],{wire:[[0,3,1],[1,3,1],[2,3,1]],out:[3],inserts:{saturation:.2,drive:6}}),
 S('Funk bass','basses',['slap','round'],4,0,{feedback:.28},[o(2,1.6,hit(.06,.08)),o(1,1.8,hit(.14,.1,.4)),o(1,1.2,e(.002,.3,.3,.6,.15,.12)),o(.5,1,e(.002,.4,.65,1,.5,.16))]),
 S('Four-op vibraphone','mallets',['vibes','tremolo'],4,1,{feedback:0,tremolo:.45,lfoRate:5.5},[o(4,.7,hit(.1,.15)),o(1,1,e(.002,1.3,.3,5,.08,1.4)),o(10,.5,hit(.05,.1)),o(1,.35,e(.002,1.1,.4,4,.06,1.1),{pan:.3})],{inserts:{chorus:.1}}),
 S('Harpsichord','mallets',['pluck','baroque'],4,3,{feedback:.2},[o(1,1,e(.002,.35,.2,.7,.05,.06),{wave:1}),o(2,.55,e(.002,.25,.2,.5,.04,.05)),o(4,.5,e(.002,.15,.1,.3,.03,.05)),o(3,.35,hit(.08,.05))],{inserts:{highGain:2}}),
 S('Church bell four','church',['bell','fixed'],4,1,{feedback:0},[o(1,1.2,hit(.2,.4),{fixed:1480}),o(1,1,e(.003,2,.3,8,.02,4),{pan:-.2}),o(1,1.2,hit(.3,.6),{fixed:3150}),o(2.4,.7,e(.003,3,.3,9,.02,4.5),{pan:.2})],{inserts:{chorus:.1}}),
 S('Synth brass four','winds',['brass','stab'],4,2,{feedback:.15,vibrato:3,lfoDelay:.3},[o(1,2.2,e(.05,.35,.6,1,.55,.18),{pressure:.5}),o(1,1.4,e(.07,.4,.7,1,.65,.2)),o(1,1.7,e(.06,.4,.65,1,.6,.2)),o(1,1,gate(.04,.2),{detune:3})],{wire:[[0,3,1],[1,3,1],[2,3,1]],out:[3],inserts:{chorus:.2}}),
 S('Glass harp','choirs',['glass','sine'],4,3,{feedback:0,vibrato:5,lfoRate:5.5,lfoDelay:.9},[o(1,1,gate(.45,.9),{pan:-.5,detune:-3}),o(2,.35,gate(.5,.9),{pan:.5,detune:3}),o(3,.18,gate(.6,.9)),o(5,.08,gate(.7,.9))],{inserts:{chorus:.25}}),
 S('Four-op choir','choirs',['choir','vowel'],4,2,{feedback:.05,formant:.9,vowel:.2,breath:.25,noisePressure:.5,vibrato:4,lfoDelay:.8,index:.8},[o(1,1.1,gate(.5,1)),o(2,.4,gate(.6,1)),o(1,.9,gate(.55,1)),o(1,1,gate(.45,1.1))],{wire:[[0,3,1],[1,3,1],[2,3,1]],out:[3],inserts:{chorus:.3}}),
 S('Rubber bass','basses',['wobble','round'],4,0,{feedback:.4,pitchStart:7,pitchTime:.05},[o(1,2,e(.002,.2,.15,.3,.1,.1)),o(1,1.5,e(.002,.25,.3,.5,.2,.12)),o(2,.8,hit(.1,.1)),o(.5,1,e(.002,.3,.7,1,.6,.15))]),

 // ---------- five operators ----------
 S('Hammer keys','epiano',['piano','hammer'],5,1,{feedback:.1},[o(7,1,hit(.04,.06)),o(1,1.3,e(.002,.35,.3,1.2,.05,.2)),o(1,1,e(.002,.8,.3,4,.05,.5)),o(1,.8,e(.002,1.2,.3,5,.06,.7),{detune:2}),o(2,.35,e(.002,.5,.3,2,.04,.3))],{wire:[[0,1,1],[1,2,1],[3,4,0]],out:[2,3,4],inserts:{chorus:.08}}),
 S('Tubular bell','church',['bell','tubular'],5,1,{feedback:0},[o(3.5,1,hit(.15,.3)),o(1,1.2,hit(.4,.6,1.5)),o(1.99,1,e(.003,1.8,.3,6,.02,2.5)),o(2.71,.8,hit(.5,.8,2.5)),o(1,.9,e(.003,2.5,.3,8,.02,3.5),{pan:.3})],{wire:[[0,1,1],[2,4,1]],out:[1,3,4],inserts:{chorus:.12}}),
 S('Bowed bass','basses',['bowed','low'],5,0,{feedback:.1,vibrato:3,lfoDelay:.5,bow:.4},[o(1,.6,e(.15,.2,.7,1,.7,.3)),o(1,.8,e(.12,.2,.7,1,.75,.3)),o(2,.45,e(.1,.2,.6,1,.6,.3)),o(1,.7,e(.1,.2,.8,1,.8,.3)),o(.5,1,gate(.1,.25))]),
 S('Wide strings','strings',['ensemble','wide'],5,1,{feedback:.05,vibrato:5,lfoDelay:.8},[o(1,.5,gate(.35,.6)),o(1,1,gate(.4,.7),{detune:-8,pan:-.6}),o(1,.5,gate(.4,.6)),o(1,1,gate(.45,.8),{detune:7,pan:.6}),o(2,.35,gate(.5,.8))],{wire:[[0,1,1],[2,3,1],[4,3,0]],out:[1,3],inserts:{chorus:.35}}),
 S('FM sax','winds',['reed','solo'],5,0,{feedback:.28,feedbackOp:1,vibrato:7,lfoRate:5.4,lfoDelay:.35,breath:.2,noisePressure:.5},[o(1,.7,e(.04,.1,.7,1,.65,.12),{pressure:.6}),o(3,.9,e(.04,.15,.6,1,.55,.12),{pressure:.6}),o(1,1.5,e(.03,.2,.7,1,.6,.14)),o(1,.4,gate(.05,.15)),o(1,1,gate(.04,.15))],{wire:[[0,1,1],[1,2,1],[2,4,1],[3,4,1]],out:[4],perf:{mode:2,portamento:.04}}),
 S('Bright trumpet','winds',['brass','solo'],5,0,{feedback:.12,vibrato:5,lfoDelay:.5,index:1.1},[o(1,1.5,e(.045,.2,.75,1,.65,.1),{pressure:.8}),o(1,1.7,e(.04,.2,.75,1,.7,.1),{pressure:.8}),o(1,1.4,e(.035,.18,.8,1,.75,.1),{pressure:.5}),o(1,.6,e(.04,.1,.9,1,.85,.12)),o(1,1,gate(.035,.12))],{perf:{mode:2,portamento:.03}}),
 S('Digital pad five','strings',['pad','digital'],5,5,{feedback:.08,vibrato:3,lfoRate:.5,lfoDelay:1},[o(2,.5,gate(.9,1.8)),o(1,.9,gate(.9,2)),o(3,.3,gate(1.1,1.8),{pan:-.4}),o(1,.8,gate(1,2.2),{detune:4,pan:.4}),o(1,.6,gate(1.2,2.2),{detune:-4})],{wire:[[0,1,1],[2,3,1],[3,4,1]],out:[1,4],inserts:{chorus:.3}}),
 S('Gong','church',['metal','gong'],5,0,{feedback:.2,gain:.2},[o(1.41,2,e(.02,2,.5,6,.1,3),{velocity:.5}),o(2.37,1.8,e(.02,2.5,.5,7,.1,3.5)),o(3.11,1.4,e(.03,3,.5,8,.1,4)),o(.78,1.2,e(.03,3.5,.6,9,.1,4.5)),o(1,1,e(.04,4,.5,10,.1,5))],{inserts:{chorus:.15}}),
 S('Soft koto','mallets',['pluck','plucked'],5,0,{feedback:.08},[o(6,.8,hit(.03,.05)),o(3,1.1,hit(.08,.1)),o(1,1.2,e(.002,.4,.3,1.2,.02,.2)),o(2,.5,hit(.2,.2)),o(1,1,e(.002,.6,.25,2.5,.02,.4))],{wire:[[0,2,1],[1,2,1],[3,4,1],[2,4,1]],out:[4],inserts:{highGain:-1}}),

 // ---------- six operators ----------
 S('Grand tines','epiano',['piano','bright'],6,1,{feedback:.1,tremolo:.08},[o(14,.9,hit(.06,.06)),o(1,1.4,e(.002,.5,.3,1.5,.05,.25)),o(1,1,e(.002,1,.3,5,.05,.6)),o(7,.7,hit(.05,.05)),o(1,1.2,e(.002,.4,.3,1.3,.04,.2)),o(1,.9,e(.002,1.3,.3,5,.06,.7),{detune:3})],{wire:[[0,1,1],[1,2,1],[3,4,1],[4,5,1]],out:[2,5],inserts:{chorus:.1}}),
 S('Stage EP','epiano',['tine','dark'],6,2,{feedback:.15,tremolo:.15},[o(1,2.2,e(.002,.45,.25,2,.05,.4),{velocity:.9}),o(1,.9,e(.002,1.5,.65,4,.35,1.2),{pan:-.2}),o(14,1.1,hit(.07,.07),{velocity:1}),o(1,.5,e(.002,.8,.4,3,.2,1),{pan:.2}),o(1,1.5,e(.002,.35,.3,2,.1,.7)),o(2,.35,e(.002,1,.5,3,.2,1.3))],{inserts:{chorus:.22}}),
 S('String ensemble six','strings',['ensemble','slow'],6,1,{feedback:.06,vibrato:5,lfoRate:5,lfoDelay:.9},[o(1,.4,gate(.45,.9)),o(1,1,gate(.5,1),{detune:-7,pan:-.5}),o(1,.4,gate(.5,.9)),o(1,.4,gate(.45,.9)),o(1,1,gate(.55,1.1),{detune:6,pan:.5}),o(1,.9,gate(.5,1.1),{pan:.1})],{wire:[[0,1,1],[2,5,1],[3,4,1],[3,5,.5]],out:[1,4,5],inserts:{chorus:.35}}),
 S('Brass section','winds',['brass','section'],6,2,{feedback:.14,vibrato:3,lfoDelay:.4},[o(1,2.5,e(.08,.5,.7,1,.6,.2),{pressure:.8}),o(1,1,gate(.06,.2)),o(1,1.7,e(.1,.5,.7,1,.65,.2),{pressure:.6}),o(1,1,gate(.07,.2),{detune:4}),o(1,1.9,e(.09,.5,.7,1,.65,.2)),o(1,1,gate(.05,.2),{detune:-4})],{wire:[[0,1,1],[2,3,1],[4,5,1]],out:[1,3,5],inserts:{chorus:.18}}),
 S('Slow choir','choirs',['choir','pad'],6,2,{feedback:.04,formant:.9,vowel:.5,breath:.3,noisePressure:.5,vibrato:4,lfoRate:4.6,lfoDelay:1,index:.75},[o(1,1,gate(.7,1.5)),o(1,.9,gate(.8,1.5),{pan:-.5}),o(2,.5,gate(.8,1.5)),o(1,.9,gate(.75,1.5),{pan:.5}),o(3,.3,gate(.9,1.5)),o(1,.9,gate(.7,1.6),{detune:5})],{wire:[[0,1,1],[2,3,1],[4,5,1],[0,5,.4]],out:[1,3,5],inserts:{chorus:.3}}),
 S('Crystal chimes','church',['chime','bright'],6,1,{feedback:0},[o(5.4,.9,hit(.1,.2)),o(1,1.2,hit(.3,.6,1.5)),o(2.76,1,e(.002,1.5,.3,6,.02,2.5)),o(8.93,.6,hit(.06,.1)),o(1.5,1.1,e(.002,1.2,.3,5,.02,2)),o(1,.8,e(.002,2,.3,7,.02,3),{pan:.3})],{wire:[[0,1,1],[2,5,1],[3,4,1],[4,5,0]],out:[1,4,5],inserts:{chorus:.2,highGain:1}}),
 S('Harp','mallets',['pluck','harp'],6,1,{feedback:.06},[o(8,.7,hit(.02,.05)),o(2,1.2,hit(.1,.1)),o(1,1,e(.002,.7,.3,3,.02,.7)),o(5,.6,hit(.03,.06)),o(1,1.1,hit(.2,.2)),o(2,.7,e(.002,.9,.3,3.5,.02,.9),{pan:.3})],{wire:[[0,1,1],[1,2,1],[3,4,1],[4,5,1]],out:[2,5],inserts:{chorus:.1}}),
 S('Drifting pad','strings',['pad','evolving'],6,1,{feedback:.08,lfoRate:.2,wanderCents:3,modSource1:3,modTarget1:2,modDepth1:.5,modAttack:5,modDecay:6,modSustain:.4,modSource2:2,modTarget2:6,modDepth2:.3,lfo2Rate:.11},[o(2,1,gate(1.5,2.5)),o(1,1,gate(1.4,3),{detune:-4,pan:-.5}),o(3,.5,gate(1.8,2.5)),o(1,.9,gate(1.5,3),{detune:4,pan:.5}),o(1,.7,gate(1.6,3)),o(1,.8,gate(1.6,3.2),{pan:0})],{wire:[[0,1,1],[2,3,1],[4,5,1]],out:[1,3,5],inserts:{chorus:.3,phaser:.1}}),
 S('Double reed','winds',['reed','oboe'],6,0,{feedback:.2,feedbackOp:2,vibrato:6,lfoRate:5.2,lfoDelay:.45,breath:.15,formant:.4,vowel:1,noisePressure:.4},[o(2,.5,e(.05,.1,.8,1,.7,.15),{pressure:.5}),o(3,.5,e(.05,.1,.8,1,.7,.15)),o(1,1.2,e(.04,.15,.7,1,.65,.15),{wave:1}),o(2,.4,gate(.06,.15)),o(1,.35,gate(.05,.15)),o(1,1,gate(.04,.18))],{wire:[[0,2,1],[1,2,1],[2,5,1],[3,5,1],[4,5,1]],out:[5],perf:{mode:2,portamento:.04}}),
 S('Cathedral organ','organs',['organ','pipes'],6,3,{feedback:.05,gain:.2,vibrato:3,lfoRate:5,lfoDelay:.6},[o(.5,1.3,gate(.06,.3)),o(1,1.8,gate(.05,.3)),o(2,1.2,gate(.05,.3)),o(3,.7,gate(.05,.3)),o(4,.5,gate(.04,.3)),o(6,.3,gate(.04,.3))],{inserts:{chorus:.15}}),
 S('Pulse organ','organs',['organ','reedy'],6,2,{feedback:.18,gain:.2},[o(1,.9,gate(.01,.12),{wave:1}),o(2,.8,gate(.01,.1),{wave:2}),o(1,1.3,gate(.01,.1)),o(3,.5,gate(.01,.1)),o(1,.7,gate(.01,.1),{wave:1}),o(1,1,gate(.008,.12))],{wire:[[0,5,1],[1,5,1],[2,5,1],[3,5,.8],[4,5,.6]],out:[5]}),

 // ---------- seven operators ----------
 S('Seven-stack bell','church',['bell','rich'],7,1,{feedback:0},[o(3.5,.8,hit(.1,.2)),o(1,1.1,hit(.3,.5,1.5)),o(2.76,.9,e(.003,1.2,.3,6,.02,2)),o(1,.9,e(.003,2.5,.3,8,.02,3.5),{pan:-.3}),o(5.4,.7,hit(.1,.2)),o(1.5,1,e(.003,1.6,.3,6,.02,2.4)),o(1,.8,e(.003,3,.3,9,.02,4),{pan:.3})],{wire:[[0,1,1],[1,3,1],[2,3,1],[4,5,1],[5,6,1]],out:[3,6],inserts:{chorus:.15}}),
 S('Dream pad','strings',['pad','dreamy'],7,1,{feedback:.07,lfoRate:.35,vibrato:4,lfoDelay:1,wanderCents:4},[o(2,.5,gate(1.4,3)),o(1,1,gate(1.3,3.5),{detune:-5,pan:-.6}),o(1,.4,gate(1.5,3)),o(3,.3,gate(1.6,3)),o(1,1,gate(1.4,3.5),{detune:5,pan:.6}),o(1,.4,gate(1.6,3)),o(1,.8,gate(1.5,3.5))],{wire:[[0,1,1],[2,3,1],[3,4,1],[5,6,1]],out:[1,4,6],inserts:{chorus:.35,phaser:.08}}),
 S('Vox humana','choirs',['vowel','human'],7,2,{feedback:.05,formant:.95,vowel:.3,breath:.2,noisePressure:.6,vibrato:5,lfoRate:5,lfoDelay:.7,index:.8},[o(1,1,gate(.3,.8)),o(1,.8,gate(.35,.8)),o(2,.4,gate(.35,.8)),o(3,.25,gate(.4,.8)),o(1,.9,gate(.3,.9),{pan:-.5}),o(1,.9,gate(.3,.9),{pan:.5}),o(1,1,gate(.3,.9))],{wire:[[0,4,1],[1,5,1],[2,6,1],[3,6,1]],out:[4,5,6],inserts:{chorus:.25}}),
 S('Glass choir','choirs',['glass','airy'],7,1,{feedback:0,formant:.5,vowel:1.5,breath:.2,vibrato:4,lfoDelay:1,lfoRate:4.8},[o(2,.5,gate(.8,1.6)),o(1,1,gate(.8,2),{pan:-.5}),o(3,.3,gate(.9,1.6)),o(1,.9,gate(.9,2),{pan:.5,detune:3}),o(5,.15,gate(1,1.6)),o(1,.7,gate(.9,2.2),{detune:-3}),o(1,.5,gate(1,2.2))],{wire:[[0,1,1],[2,3,1],[4,5,1],[5,6,0]],out:[1,3,5,6],inserts:{chorus:.3,highGain:1}}),
 S('Synth strings seven','strings',['ensemble','lush'],7,1,{feedback:.05,vibrato:5,lfoDelay:1,lfoRate:5.1},[o(1,.4,gate(.5,.9)),o(1,1,gate(.5,1),{detune:-9,pan:-.7}),o(1,.4,gate(.55,.9)),o(1,.9,gate(.55,1),{detune:9,pan:.7}),o(1,.4,gate(.5,.9)),o(1,.9,gate(.55,1),{detune:-3,pan:-.2}),o(1,.9,gate(.55,1),{detune:3,pan:.2})],{wire:[[0,1,1],[2,3,1],[4,5,1],[4,6,1]],out:[1,3,5,6],inserts:{chorus:.4}}),
 S('Wide Rhodes','epiano',['tine','wide'],7,1,{feedback:.08,tremolo:.2,lfoRate:4.2},[o(14,.9,hit(.08,.07)),o(1,1.2,e(.002,.6,.3,3,.05,.5),{pan:-.5}),o(1,.8,e(.002,1.3,.4,4,.15,.9),{pan:-.2}),o(14,.9,hit(.08,.07)),o(1,1.2,e(.002,.6,.3,3,.05,.5),{pan:.5,detune:2}),o(1,.8,e(.002,1.3,.4,4,.15,.9),{pan:.2,detune:-2}),o(2,.3,e(.002,.9,.4,3,.1,.8))],{wire:[[0,1,1],[1,2,1],[3,4,1],[4,5,1],[6,2,0]],out:[2,5,6],inserts:{chorus:.35}}),
 S('Dust harp','mallets',['pluck','shimmer'],7,1,{feedback:.05},[o(9,.5,hit(.02,.05)),o(2,1,hit(.1,.1)),o(1,1,e(.002,.9,.3,4,.02,.9),{pan:-.4}),o(6,.5,hit(.03,.05)),o(3,1,hit(.1,.1)),o(1,1,e(.002,1.1,.3,5,.02,1.1),{pan:.4}),o(4,.3,e(.002,.6,.3,2,.02,.7))],{wire:[[0,1,1],[1,2,1],[3,4,1],[4,5,1]],out:[2,5,6],inserts:{chorus:.2}}),
 S('Orchestra swell','strings',['swell','cinematic'],7,5,{feedback:.1,vibrato:4,lfoDelay:1,modSource1:3,modTarget1:2,modDepth1:.6,modAttack:3.5,modDecay:4,modSustain:.6},[o(1,1,e(1.4,.3,.9,1,.9,2),{pressure:.5}),o(1,.9,e(1.5,.3,.9,1,.9,2)),o(2,.6,e(1.6,.3,.8,1,.8,2)),o(1,.8,e(1.2,.3,.9,1,.9,2),{pan:-.4}),o(1,.7,e(1.4,.3,.9,1,.9,2.2)),o(1,.5,e(1.6,.3,.9,1,.9,2.2),{pan:.4,detune:5}),o(1,.9,e(1.4,.3,.9,1,.9,2.5))],{wire:[[0,1,1],[1,2,1],[3,4,1],[5,6,1]],out:[2,4,6],inserts:{chorus:.3}}),

 // ---------- eight operators ----------
 S('Eight-op grand','epiano',['piano','full'],8,1,{feedback:.1},[o(7,.8,hit(.04,.05)),o(1,1.3,e(.002,.4,.3,1.4,.04,.2)),o(1,1,e(.002,.9,.3,5,.05,.6)),o(2,.4,hit(.1,.1)),o(14,.8,hit(.04,.05)),o(1,1.2,e(.002,.4,.3,1.4,.04,.2)),o(1,1,e(.002,1,.3,5,.05,.7),{detune:2.5}),o(3,.3,hit(.06,.08),{pan:.3})],{wire:[[0,1,1],[1,2,1],[4,5,1],[5,6,1]],out:[2,3,6,7],inserts:{chorus:.1}}),
 S('Full orchestra pad','strings',['pad','lush'],8,1,{feedback:.06,vibrato:4,lfoDelay:1.2,lfoRate:4.8,wanderCents:3},[o(1,.5,gate(.8,2)),o(1,1,gate(.9,2.2),{detune:-6,pan:-.7}),o(2,.5,gate(1,2)),o(1,.9,gate(.9,2.2),{detune:6,pan:.7}),o(1,.4,gate(1,2)),o(1,.9,gate(1,2.4),{pan:-.2}),o(3,.3,gate(1.1,2)),o(1,.8,gate(1,2.4),{pan:.2,detune:3})],{wire:[[0,1,1],[2,3,1],[4,5,1],[6,7,1]],out:[1,3,5,7],inserts:{chorus:.4}}),
 S('Gamelan','church',['gamelan','metal'],8,3,{feedback:0,gain:.2},[o(1,1,e(.002,1.6,.3,5,.02,1.6)),o(1.52,.9,e(.002,1.3,.3,4.5,.02,1.4),{pan:-.5}),o(2.14,.8,e(.002,1,.3,4,.02,1.2),{pan:.5}),o(2.63,.7,e(.002,.8,.3,3.5,.02,1)),o(3.7,.6,e(.002,.6,.3,3,.02,.8),{pan:-.3}),o(4.25,.5,e(.002,.5,.3,2.5,.02,.7),{pan:.3}),o(5.6,.4,hit(.3,.5)),o(7.1,.3,hit(.2,.4))],{inserts:{chorus:.12}}),
 S('Bell tree','church',['bell','shimmer'],8,1,{feedback:0},[o(4.3,.7,hit(.06,.1)),o(2.2,1,hit(.2,.3)),o(1,.9,e(.002,1,.3,4,.02,1.6),{pan:-.5}),o(6.4,.6,hit(.05,.1)),o(3.3,1,hit(.18,.3)),o(1.5,.9,e(.002,1.2,.3,4.5,.02,1.8),{pan:.5}),o(9.2,.5,hit(.04,.08)),o(4.7,.8,e(.002,.9,.3,3,.02,1.4),{pan:.2})],{wire:[[0,1,1],[1,2,1],[3,4,1],[4,5,1],[6,7,1]],out:[2,5,7],inserts:{chorus:.2,highGain:1}}),
 S('Evolving cloud','strings',['evolving','pad','ambient'],8,1,{feedback:.1,wanderCents:5,wanderRate:.2,lfoRate:.17,lfoIndex:.25,lfo2Rate:.09,lfo2Index:.3,modAttack:6,modDecay:8,modSustain:.35,modSource1:3,modTarget1:2,modDepth1:.55,modSource2:8,modTarget2:2,modDepth2:.2,modSource3:2,modTarget3:5,modDepth3:.4},[o(2,.8,gate(2,4)),o(1,1,gate(2,4.5),{detune:-5,pan:-.6}),o(3,.5,gate(2.4,4)),o(1,.9,gate(2.2,4.5),{detune:5,pan:.6}),o(5,.3,gate(2.6,4)),o(1,.8,gate(2.4,4.5),{pan:-.2}),o(7,.2,gate(2.8,4)),o(1,.7,gate(2.6,4.5),{pan:.2})],{wire:[[0,1,1],[2,3,1],[4,5,1],[6,7,1]],out:[1,3,5,7],inserts:{chorus:.3,phaser:.12}}),
 S('Wide brass eight','winds',['brass','big'],8,1,{feedback:.12,vibrato:3,lfoDelay:.4},[o(1,2,e(.08,.45,.7,1,.6,.2),{pressure:.7}),o(1,1,gate(.06,.2),{pan:-.5}),o(1,1.8,e(.09,.45,.7,1,.65,.2)),o(1,1,gate(.07,.2),{pan:.5,detune:4}),o(2,1,e(.1,.4,.6,1,.55,.2)),o(2,.6,gate(.08,.2),{pan:-.2}),o(1,1.7,e(.07,.45,.7,1,.65,.2)),o(1,1,gate(.06,.2),{pan:.2,detune:-4})],{wire:[[0,1,1],[2,3,1],[4,5,1],[6,7,1]],out:[1,3,5,7],inserts:{chorus:.22,saturation:.15,drive:5}}),
 S('Chime choir','choirs',['bell','vowel'],8,1,{feedback:0,formant:.6,vowel:.4,breath:.15,vibrato:4,lfoDelay:.8},[o(3,.6,gate(.5,1.5)),o(1,1,gate(.5,1.8),{pan:-.5}),o(5,.3,gate(.6,1.5)),o(2,.9,gate(.55,1.8),{pan:.5}),o(7,.25,gate(.6,1.5)),o(1,.7,gate(.55,1.8),{detune:4}),o(4,.35,gate(.6,1.5)),o(1,.6,gate(.55,1.8),{detune:-4})],{wire:[[0,1,1],[2,3,1],[4,5,1],[6,7,1]],out:[1,3,5,7],inserts:{chorus:.3,highGain:1}}),
 S('Singing metal','fx',['metal','vowel','drone'],8,2,{feedback:.3,feedbackOp:3,formant:.7,vowel:1.2,lfoRate:.3,lfoIndex:.4,vibrato:5,lfoDelay:1.2},[o(1.41,1.5,gate(.5,1.5)),o(2.76,1,gate(.6,1.5)),o(1,1.4,gate(.5,1.6)),o(3.5,1.6,gate(.7,1.6)),o(1,1.2,gate(.55,1.6)),o(5.4,.8,gate(.7,1.6)),o(1,1,gate(.5,1.7)),o(1,1,gate(.45,1.8))],{wire:[[0,6,1],[1,6,1],[2,6,1],[3,7,1],[4,7,1],[5,7,1]],out:[6,7],inserts:{chorus:.25}}),
 S('Sci-fi drone','fx',['drone','dark','ambient'],8,0,{feedback:.35,feedbackOp:2,wanderCents:8,wanderRate:.3,lfoRate:.13,lfoIndex:.6,lfo2Rate:.07,lfo2Index:.5,voiceDrift:12},[o(1.01,1.2,gate(1.5,3)),o(.5,1.5,gate(1.6,3.2)),o(1.99,1,gate(1.8,3)),o(3.01,.8,gate(2,3)),o(.25,1.4,gate(2,3.5)),o(5.02,.5,gate(2.2,3)),o(1,1.2,gate(2,3.5),{detune:7}),o(.5,1,gate(1.8,4))],{inserts:{chorus:.3,phaser:.15}}),

 // ---------- percussion and effects across operator counts ----------
 S('FM tom','perc',['tom','drum'],3,0,{feedback:.2,pitchStart:10,pitchTime:.09,gain:.28},[o(1.5,1.4,hit(.05,.05)),o(1,1.2,hit(.16,.08,.3)),o(.5,1,hit(.3,.1,.6))]),
 S('FM snare','perc',['snare','drum','noisy'],4,3,{feedback:.6,feedbackOp:0,pitchStart:6,pitchTime:.04},[o(2.3,3,hit(.04,.04,.1),{fixed:1850}),o(1,1,hit(.16,.06,.3),{fixed:420}),o(1,.8,hit(.1,.05,.2),{fixed:260}),o(3.5,.7,hit(.07,.05,.15),{fixed:3400})]),
 S('Metal hat','perc',['hat','metal'],6,3,{feedback:.45,feedbackOp:3,gain:.2},[o(1,2.5,hit(.04,.03,.08),{fixed:2140}),o(1,2.5,hit(.04,.03,.08),{fixed:3070}),o(1,2.25,hit(.035,.03,.08),{fixed:4130}),o(1,2.25,hit(.04,.03,.08),{fixed:5810}),o(1,2,hit(.03,.03,.07),{fixed:7240}),o(1,2,hit(.03,.03,.07),{fixed:9330})]),
 S('Open hat','perc',['hat','metal','open'],6,3,{feedback:.5,feedbackOp:3,gain:.2},[o(1,2.5,e(.002,.3,.3,.5,0,.2),{fixed:2140}),o(1,2.5,e(.002,.3,.3,.5,0,.2),{fixed:3070}),o(1,2.25,e(.002,.28,.3,.5,0,.2),{fixed:4130}),o(1,2.25,e(.002,.3,.3,.5,0,.2),{fixed:5810}),o(1,2,e(.002,.25,.3,.45,0,.2),{fixed:7240}),o(1,2,e(.002,.25,.3,.45,0,.2),{fixed:9330})]),
 S('Conga','perc',['conga','drum','hand'],4,0,{feedback:.1,pitchStart:5,pitchTime:.03},[o(3.2,1.2,hit(.03,.04,.06)),o(1,1.4,hit(.08,.06,.15)),o(1,1,hit(.22,.08,.4)),o(.5,.6,hit(.14,.06,.25))],{wire:[[0,2,1],[1,2,1],[3,2,0]],out:[2,3]}),
 S('Wood block','perc',['block','woody'],2,0,{feedback:0},[o(2.4,2,hit(.015,.03,.03)),o(1,1,hit(.07,.04,.12))]),
 S('Riser','fx',['riser','sweep'],5,0,{feedback:.3,pitchStart:-12,pitchTime:4,modAttack:4,modDecay:2,modSustain:1,modSource1:3,modTarget1:2,modDepth1:.9},[o(3,1.5,gate(3,.5)),o(2,1.5,gate(3,.5)),o(1,1.4,gate(3,.5)),o(1,.8,gate(3,.5)),o(1,1,gate(3,.6))],{inserts:{phaser:.2}}),
 S('Alien radio','fx',['radio','robot'],4,2,{feedback:.4,feedbackOp:1,lfoRate:7,lfoShape:3,vibrato:60,lfo2Rate:.3,lfo2Index:.7},[o(7.13,1.5,gate(.02,.2)),o(3.07,1.2,gate(.02,.2)),o(1.37,1.4,gate(.02,.2)),o(1,1,gate(.02,.25))],{wire:[[0,3,1],[1,3,1],[2,3,1]],out:[3]}),
 S('Glass static','fx',['texture','glassy','random'],6,3,{feedback:0,lfoRate:9,lfoShape:4,lfoIndex:.7,lfo2Rate:.4,lfo2Amp:.4,gain:.2},[o(5.1,1,gate(.4,1.2)),o(7.3,.9,gate(.5,1.2)),o(11.2,.8,gate(.6,1.2)),o(3.7,.9,gate(.5,1.2)),o(9.4,.7,gate(.7,1.2)),o(13.1,.6,gate(.8,1.2))],{wire:[[0,3,1],[1,4,1],[2,5,1]],out:[3,4,5,0]}),
 S('Dub wobble','basses',['wobble','mono'],4,0,{feedback:.35,lfoRate:1.6,lfoIndex:.9,lfoShape:1,pitchStart:0},[o(1,2.6,gate(.004,.1)),o(2,1.4,gate(.004,.1)),o(1,1,gate(.004,.12)),o(.5,1,gate(.004,.12))],{wire:[[0,1,1],[1,2,1],[2,3,0]],out:[2,3],perf:{mode:2,portamento:.05}}),
 S('Sync lead','basses',['lead','sync','mono'],5,0,{feedback:.5,feedbackOp:0,vibrato:12,lfoRate:5.8,lfoDelay:.4,modSource1:3,modTarget1:2,modDepth1:-.4,modAttack:.05,modDecay:1.5,modSustain:.6},[o(1,1.8,gate(.01,.15)),o(2,1.2,gate(.01,.15)),o(1,1.5,gate(.01,.15)),o(3,.7,gate(.01,.15)),o(1,1,gate(.008,.15))],{perf:{mode:2,portamento:.06}}),
 S('Sparkle pad','strings',['pad','bright','shimmer'],8,1,{feedback:.06,lfoRate:.4,wanderCents:3},[o(6,.4,gate(1.2,2.5)),o(2,.8,gate(1.2,2.5)),o(1,.9,gate(1.1,3),{pan:-.6}),o(8,.3,gate(1.4,2.5)),o(3,.7,gate(1.3,2.5)),o(1,.9,gate(1.1,3),{pan:.6}),o(5,.3,gate(1.5,2.5)),o(1,.6,gate(1.3,3.2),{detune:4})],{wire:[[0,1,1],[1,2,1],[3,4,1],[4,5,1],[6,7,1]],out:[2,5,7],inserts:{chorus:.35,highGain:1.5}}),
];

export const FM_LIBRARY=LIB.map(({patch,category,styles,rack})=>({name:patch.name,category,styles,patch,rack}));
