// Writes a factory bank as human-readable YAML, laid out by panel section.
// Knobs and sliders use the panel's 0–10 scale; a trailing comment gives the unit
// value where one is known (≈ = this project's estimated calibration).
// Usage: npx vite-node tools/exportPatchesYaml.mjs <bank.syx | tape.wav> [--out file.yaml]
// Input: Juno-106, Prophet-5/10 Rev 4, Prophet VS or DX7 .syx, a Jupiter-8 tape WAV, or the
// OB-Xa patch-book JSON (tools/obxa-patch-book/).
// Output defaults to patches/<synth>/<input name>.yaml (git-ignored: factory data is not ours to publish).
import fs from 'node:fs';
import path from 'node:path';
import {junoValues,patchCode,factoryName} from '../src/synths/juno/sysex.js';
import {decodeTape} from '../src/synths/jupiter/tape.js';
import {decodePatch} from '../src/synths/jupiter/patch.js';
import {JP8_NAMES} from '../src/synths/jupiter/names.js';
import {parseProphetSysex,CALIBRATION as P5} from '../src/synths/prophet/sysex.js';
import {parseVsSysex} from '../src/synths/vs/sysex.js';
import {parseDx7Sysex} from '../src/synths/dx7/sysex.js';

const file=process.argv[2];
if(!file){console.error('Usage: vite-node tools/exportPatchesYaml.mjs <bank.syx | tape.wav> [--out file.yaml]');process.exit(1);}
const arg=n=>{const i=process.argv.indexOf(n);return i>0?process.argv[i+1]:null;};

// ---- tiny YAML writer: maps, lists of scalars (flow style), scalars with optional comments
const note=(v,comment)=>({v,comment});
const scalar=v=>typeof v==='string'?(/^[\w.+\-' ]+$/.test(v)&&!/^[-+.\d]/.test(v)&&!/^(yes|no|true|false|null|on|off)$/i.test(v)||/^(on|off)$/.test(v)?v:JSON.stringify(v))
 :typeof v==='boolean'?(v?'on':'off'):Array.isArray(v)?`[${v.map(scalar).join(', ')}]`:String(v);
function emit(obj,indent=''){
 const lines=[];
 for(const [k,raw] of Object.entries(obj)){
  if(raw===undefined)continue;
  const {v,comment}=raw&&typeof raw==='object'&&'v' in raw?raw:{v:raw};
  if(v&&typeof v==='object'&&!Array.isArray(v)){lines.push(`${indent}${k}:${comment?`  # ${comment}`:''}`);lines.push(...emit(v,indent+'  '));}
  else lines.push(`${indent}${k}: ${scalar(v)}${comment?`  # ${comment}`:''}`);
 }
 return lines;
}
const document=(header,patches)=>[...header.map(h=>`# ${h}`),'',...patches.flatMap(p=>{const [first,...rest]=emit(p,'  ');return [`- ${first.trimStart()}`,...rest,''];})].join('\n');

const ten=(x,max)=>Math.round(x/max*100)/10;            // raw → panel 0–10, one decimal
const fmt=(v,unit)=>{
 if(unit==='s')return v<1?`${Math.round(v*1000)} ms`:`${v.toFixed(v<10?2:1)} s`;
 if(unit==='Hz')return v<10?`${v.toFixed(2)} Hz`:v<1000?`${v.toFixed(0)} Hz`:`${(v/1000).toFixed(1)} kHz`;
 return `${v} ${unit}`;
};
const NOTES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const st=v=>`${v>0?'+':''}${Number.isInteger(v)?v:v.toFixed(1)} st`;

// ---- Juno-106
function juno(bytes,name){
 const out=[];let next=0;
 for(let i=0;i<bytes.length;i++){
  if(bytes[i]!==0xF0)continue;
  const end=bytes.indexOf(0xF7,i);if(end<0)break;
  const m=bytes.subarray(i,end+1);i=end;
  if(m.length!==24||m[1]!==0x41||(m[2]!==0x30&&m[2]!==0x31))continue;
  const index=m[2]===0x30?m[4]&127:next;next=index+1;
  const s=[...m.subarray(5,21)],b=m[21],w=m[22],v=junoValues(s,b,w),x=k=>ten(s[k],127);
  out.push({
   code:patchCode(index),name:factoryName(s,b,w)??undefined,
   lfo:{rate:note(x(0),'≈ '+fmt(v.lfoRate,'Hz')),delay:note(x(1),'≈ '+fmt(v.lfoDelay,'s'))},
   dco:{range:["16'","8'","4'"][v.range],lfo:note(x(2),`≈ ${v.lfoDco.toFixed(1)} st`),pwm:x(3),pwm_by:v.pwmSource?'manual':'lfo',
    waves:[v.pulse&&'pulse',v.saw&&'saw'].filter(Boolean),sub:x(15),noise:x(4)},
   hpf:note(v.hpf,['bass boost','flat','~225 Hz','~700 Hz'][v.hpf]),
   vcf:{freq:note(x(5),`≈ ${fmt(v.cutoff,'Hz')} at middle C`),res:x(6),env_polarity:v.envPolarity?'inverted':'normal',env:x(7),lfo:x(8),kybd:x(9)},
   vca:{mode:v.vcaMode?'gate':'env',level:x(10)},
   env:{attack:note(x(11),'≈ '+fmt(v.attack,'s')),decay:note(x(12),'≈ '+fmt(v.decay,'s')),sustain:x(13),release:note(x(14),'≈ '+fmt(v.release,'s'))},
   chorus:['off','I','II'][v.chorus],
  });
 }
 return {synth:'juno-106',text:document([`Juno-106 bank from ${name}: ${out.length} patches, ${out.filter(p=>p.name).length} of them factory patches.`,'Juno SysEx carries no names: factory patches are recognised by content and named; the rest have none.',
  'Sliders and knobs on the panel 0–10 scale. ≈ = estimated calibration (src/synths/juno/sysex.js CALIBRATION).'],out)};
}

// ---- Jupiter-8
function jupiter(bytes,name){
 const tape=decodeTape(bytes),code=n=>`${Math.floor(n/8)+1}${n%8+1}`;
 const out=tape.patches.map(p=>{
  const v=decodePatch(p.data),x=k=>ten(v[k]*255,255);
  return {
   code:code(p.number),name:JP8_NAMES[p.number],...(p.damaged?{damaged:note(true,'checksum or framing error: values may be wrong')}:{}),
   lfo:{rate:x('lfoRate'),delay:x('lfoDelay'),wave:v.lfoWave},
   vco_mod:{lfo:x('vcoModLfo'),env1:x('vcoModEnv'),to:v.vcoModVco1&&v.vcoModVco2?'both':v.vcoModVco1?'vco-1':v.vcoModVco2?'vco-2':'none'},
   pwm:{amount:x('pwm'),source:v.pwmSource},
   vco1:{range:v.vco1Range,wave:v.vco1Wave,cross_mod:x('crossMod')},
   vco2:{range:note(st(Math.round(v.vco2Semitones*10)/10),"continuous, from 8'"),fine:note(x('vco2Fine'),'5 = centre'),wave:v.vco2Wave,sync:v.sync,low_freq:v.vco2Low},
   source_mix:note(x('sourceMix'),'0 = VCO-1 … 10 = VCO-2'),
   hpf:x('hpf'),
   vcf:{cutoff:x('cutoff'),res:x('resonance'),slope:note(v.vcfSlopeUp?'up':'down','which of −12/−24 dB is up: unconfirmed'),
    env_mod:x('envMod'),env:note(v.vcfEnvUp?'up':'down','up believed ENV-1'),lfo:x('vcfLfo'),key_follow:x('keyFollow')},
   vca:{level:x('vcaLevel'),lfo:note(v.vcaLfo,'switch 0–3')},
   env1:{attack:x('env1Attack'),decay:x('env1Decay'),sustain:x('env1Sustain'),release:x('env1Release'),key_follow:v.env1KeyFollow,polarity:v.env1Inverted?'inverted':'normal'},
   env2:{attack:x('env2Attack'),decay:x('env2Decay'),sustain:x('env2Sustain'),release:x('env2Release'),key_follow:v.env2KeyFollow},
  };
 });
 const extra=[tape.missing.length&&`Missing: ${tape.missing.map(code).join(' ')}.`,tape.damaged.length&&`Damaged: ${tape.damaged.map(code).join(' ')}.`].filter(Boolean);
 return {synth:'jupiter-8',text:document([`Jupiter-8 bank decoded from the tape recording ${name}: ${out.length} patches, tape speed ${(tape.speed*100).toFixed(1)} %.`,...extra,
  'Sliders and knobs on the panel 0–10 scale; unit calibration still to be done (docs/JP8_TAPE_FORMAT.md).'],out)};
}

// ---- Prophet-5 / 10 (Rev 4)
function prophet(bytes,name){
 const programs=parseProphetSysex(bytes);
 const out=programs.map(({code,data:d,values:v})=>{
  const k=i=>ten(Math.min(d[i],120),120),list=pairs=>pairs.filter(([,on])=>on).map(([n])=>n);
  // the amount only matters when something is routed (the Rev 3 programs hold junk there otherwise)
  const touch=(pairs,amount,raw)=>{const to=list(pairs);return to.length?{to,amount:note(Math.round(amount*100)/10,raw>127?'unset: full depth':undefined)}:'off';};
  const pitch=raw=>{const s=Math.floor(Math.min(raw,96)/2);return note(`${NOTES[s%12]}${Math.floor(s/12)}`,st(s-24)+" from 8'");};
  const voices=v.unison?{mode:v.unisonChord?'unison chord':'unison',...(v.unisonChord?{chord:note(v.chord,'semitones above the key')}:{count:v.unisonVoices}),detune:note(d[54],'0–7'),key_priority:v.keyPriority}
   :{mode:'poly',...(v.unisonChord&&v.chord.length>1?{stored_chord:note(v.chord,'chord memory, unison off')}:{})};
  return {
   code,name:v.name,
   osc_a:{freq:pitch(d[0]),waves:list([['saw',v.oscASaw],['pulse',v.oscAPulse]]),pw:k(8),sync:note(v.sync,'Osc A slaved to Osc B')},
   osc_b:{...(v.oscBLowFreq?{freq:note(k(1),'low-freq mode: '+fmt(v.oscBLowHz,'Hz'))}:{freq:pitch(d[1])}),fine:note(k(2),`+${v.oscBFineCents.toFixed(0)} cents`),
    waves:list([['saw',v.oscBSaw],['triangle',v.oscBTri],['pulse',v.oscBPulse]]),pw:k(9),low_freq:v.oscBLowFreq,keyboard:v.oscBKeyboard},
   mixer:{osc_a:k(14),osc_b:k(15),noise:k(16)},
   filter:{cutoff:k(17),resonance:k(18),env_amount:k(40),keyboard:v.keyTrack,revision:v.filterRev==='rev3'?'Rev 3':'Rev 1/2'},
   filter_env:{attack:k(43),decay:k(45),sustain:k(47),release:k(49)},
   amp_env:{attack:k(44),decay:k(46),sustain:k(48),release:k(50)},
   release:note(v.release,'off = releases cut short'),
   poly_mod:{filter_env:k(32),osc_b:k(33),to:list([['freq A',v.polyModFreqA],['pw A',v.polyModPwA],['filter',v.polyModFilter]])},
   lfo:{freq:k(21),initial_amount:k(22),waves:list([['saw',v.lfoSaw],['triangle',v.lfoTri],['square',v.lfoSquare]])},
   wheel_mod:{source_mix:note(k(26),'0 = LFO … 10 = noise'),to:list([['freq A',v.wheelFreqA],['freq B',v.wheelFreqB],['pw A',v.wheelPwA],['pw B',v.wheelPwB],['filter',v.wheelFilter]])},
   glide:k(13),vintage:k(37),
   velocity:touch([['filter',v.velFilter],['amp',v.velAmp]],v.velocityAmount,d[97]),
   aftertouch:touch([['filter',v.afterFilter],['amp',v.afterAmp]],v.aftertouchAmount,d[98]),
   voices,
   bend_range:note(v.bendRange,'semitones'),
  };
 });
 return {synth:'prophet-5',text:document([`${programs[0]?.device??'Prophet'} programs from ${name}: ${out.length}. Codes: U/F = user/factory bank 1–5, then group and program (F5 = the original Rev 3 set).`,
  `Knobs on the panel 0–10 scale (raw 0–${P5.knobMax}); pitches as the panel shows them. Cutoff/envelope/LFO units still to be calibrated (docs/P5_SYSEX_FORMAT.md).`],out)};
}

// ---- Prophet VS (raw panel values 0–99 etc.: the VS shows numbers, not knob positions)
function vs(bytes,name){
 const programs=parseVsSysex(bytes),signed=v=>(v>0?'+':'')+v;   // only inside joystick x/y strings
 const out=programs.map(({number,values:v})=>{
  const osc=o=>({wave:o.wave,freq:note(`${o.coarse}.${String(o.fine).padStart(2,'0')}`,'coarse semitones . fine')});
  const env=e=>({rates:note(e.rates,'1, 2, 3, 4, 4A'),levels:e.levels,loop:e.loop,...(e.repeat!==null?{repeat:e.repeat}:{})});
  const mod=m=>m.to.length||m.amount?{amount:m.amount,to:m.to}:'off';
  return {
   number:String(number).padStart(2,'0'),name:v.name,
   oscillators:{a:osc(v.oscillators.A),b:osc(v.oscillators.B),c:osc(v.oscillators.C),d:osc(v.oscillators.D)},
   mix_envelope:{rates:note(v.mixEnvelope.rates,'1, 2, 3, 4, 4A'),points:note(v.mixEnvelope.points.map(p=>`${signed(p.x)}/${signed(p.y)}`),'joystick x/y: x −64 A … +63 C, y −64 B … +63 D'),loop:v.mixEnvelope.loop,...(v.mixEnvelope.repeat!==null?{repeat:v.mixEnvelope.repeat}:{})},
   filter:{cutoff:v.filter.cutoff,resonance:v.filter.resonance,env_amount:v.filter.envAmount},
   filter_envelope:env(v.filterEnvelope),
   amp_envelope:env(v.ampEnvelope),
   lfo1:v.lfo1,lfo2:v.lfo2,
   modulation:{lfo1:mod(v.modulation.lfo1),lfo2:mod(v.modulation.lfo2),pressure:mod(v.modulation.pressure),velocity:mod(v.modulation.velocity),
    keyboard:mod(v.modulation.keyboard),filter_env:mod(v.modulation.filterEnv),mod_wheel:v.modulation.modWheel.to.length?v.modulation.modWheel.to:'off'},
   voice:{unison:v.voice.unison==='off'?'off':note(v.voice.unison.detune,'unison on, detune'),glide:v.voice.glide,volume:v.voice.volume,pan:note(v.voice.pan,'voices 1–8, −63 left … +63 right')},
   keyboard:v.keyboard.mode==='single'?'single':{mode:v.keyboard.mode,link:v.keyboard.linkProgram,...(v.keyboard.mode==='split'?{split_point:v.keyboard.splitPoint}:{detune:v.keyboard.doubleDetune,delay:v.keyboard.doubleDelay})},
   chorus:v.chorus.left||v.chorus.right?{sides:[v.chorus.left&&'left',v.chorus.right&&'right'].filter(Boolean),rate:v.chorus.rate,depth:v.chorus.depth}:'off',
   arpeggiator:{...v.arpeggiator},
  };
 });
 return {synth:'prophet-vs',text:document([`Prophet VS programs from ${name}: ${out.length}.`,
  'Values as the VS displays them (mostly 0–99); amounts and pans are signed. Units (Hz, seconds) still to be calibrated (docs/VS_SYSEX_FORMAT.md).',
  'Waves 0–31 are user (RAM) waves, 32–127 ROM waves: a program only sounds right with the wave set it was made for.'],out)};
}

// ---- DX7 (values as the DX7 displays them, 0–99)
function dx7(bytes,name){
 const voices=parseDx7Sysex(bytes),bad=voices.filter(v=>!v.checksumOk).length;
 const out=voices.map(({number,values:v})=>({
  number:number??'single',name:v.name,
  algorithm:v.algorithm,feedback:v.feedback,osc_key_sync:v.oscKeySync,
  transpose:note(v.transpose,'semitones from C3'),
  lfo:{wave:v.lfo.wave,speed:v.lfo.speed,delay:v.lfo.delay,pitch_mod_depth:v.lfo.pitchModDepth,amp_mod_depth:v.lfo.ampModDepth,key_sync:v.lfo.keySync,pitch_mod_sensitivity:v.lfo.pitchModSensitivity},
  pitch_eg:{rates:v.pitchEg.rates,levels:note(v.pitchEg.levels,'50 = no shift')},
  operators:Object.fromEntries(v.operators.map(o=>[`op${o.op}`,{
   level:o.level,
   frequency:'ratio' in o.frequency?note(`×${o.frequency.ratio}`,`coarse ${o.coarse}, fine ${o.fine}`):note(`${o.frequency.fixedHz} Hz`,`fixed: coarse ${o.coarse}, fine ${o.fine}`),
   detune:o.detune,
   eg:{rates:o.eg.rates,levels:o.eg.levels},
   key_scaling:{break_point:o.keyScaling.breakPoint,left:`${o.keyScaling.left.depth} ${o.keyScaling.left.curve}`,right:`${o.keyScaling.right.depth} ${o.keyScaling.right.curve}`,rate:o.keyScaling.rate},
   velocity:o.velocitySensitivity,amp_mod:o.ampModSensitivity,
  }])),
 }));
 return {synth:'dx7',text:document([`DX7 voices from ${name}: ${out.length}${bad?` (checksum wrong in ${bad})`:', checksum correct'}.`,
  'Values as the DX7 shows them. Algorithm 1–32 decides which operators are carriers; EG rates/levels 0–99; key scaling curves -lin/-exp/+exp/+lin.'],out)};
}

// ---- OB-Xa (transcribed from the factory patch book; knobs 0–10, null = no pointer drawn)
function obxa(book,name){
 const k=v=>v===null?note('not set','no pointer on the drawing'):v;
 const knobs=o=>Object.fromEntries(Object.entries(o).map(([key,v])=>[key,typeof v==='number'||v===null?k(v):v]));
 const out=book.patches.map(p=>({
  code:p.code,name:p.name,
  ...(p.drawing_note?{drawing_note:p.drawing_note}:{}),
  pitch:p.pitch,
  oscillators:knobs(p.oscillators),mixer:p.mixer,filter:knobs(p.filter),
  filter_envelope:knobs(p.filter_envelope),amp_envelope:knobs(p.amp_envelope),
  lfo:knobs(p.lfo),control:knobs(p.control),
  ...(p.keyboard.length?{keyboard:p.keyboard}:{}),
  performance:note(knobs(p.performance),'front-panel controls the OB-Xa does not store'),
 }));
 return {synth:'oberheim-ob-xa',text:document([`OB-Xa factory programs from ${name}: ${out.length} (group C is not in this scan).`,
  "Measured from the patch book's panel drawings: knobs on the 0–10 scale (12 o'clock = 5), switches from the lit LEDs.",
  'Pitch is as printed under each drawing; the frequency knobs are only approximate on the drawings.'],out)};
}

const bytes=new Uint8Array(fs.readFileSync(file)),base=path.basename(file).replace(/\.[^.]+$/,'');
const result=/\.json$/i.test(file)&&/Oberheim OB-Xa/.test(fs.readFileSync(file,'utf8'))?obxa(JSON.parse(fs.readFileSync(file,'utf8')),path.basename(file))
 :/^RIFF/.test(String.fromCharCode(...bytes.subarray(0,4)))?jupiter(bytes,path.basename(file))
 :bytes[1]===0x41?juno(bytes,path.basename(file))
 :bytes[1]===0x43?dx7(bytes,path.basename(file))
 :bytes[1]===0x01&&bytes[2]===0x0A?vs(bytes,path.basename(file))
 :bytes[1]===0x01?prophet(bytes,path.basename(file))
 :null;
if(!result){console.error('Not a Juno-106, Prophet-5/10, Prophet VS or DX7 SysEx file, nor a WAV.');process.exit(1);}
const target=arg('--out')??path.join('patches',result.synth,`${base}.yaml`);
fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,result.text);
console.log(`${target}: ${(result.text.match(/^- /mg)??[]).length} patches`);
