// Prophet-5 / Prophet-10 (Rev 4, 2020–) program SysEx → named panel values.
// See docs/P5_SYSEX_FORMAT.md. No Sequential data ships with the site: players
// import a .syx file (Sequential's free factory download or their own dump).
//
// Message: F0 01 <device> 02 <bank> <program> <152 packed bytes> F7 (program dump)
// or F0 01 <device> 03 <152 packed bytes> F7 (edit buffer). Device 0x32 is in
// Sequential's Prophet-5 factory file; 0x31 is accepted too (Prophet-10).
// Banks 0–4 are the user banks, 5–9 the factory banks, 40 programs each
// (5 groups of 8). Packing: groups of 8 bytes, the first holding the top bits
// of the next 7 (bit k = byte k), so 152 bytes carry 133.
//
// Byte map cross-checked against Funkybot's MIT-licensed Rev 4 → RePro-5
// converter and against the 40 original Rev 3 programs in factory bank 5
// (every SYNC patch has sync on, BASS IN FIFTHS has Osc B 14 steps = a fifth
// above Osc A, the PWM/arpeggiator patches use Osc B low-freq via Poly-Mod).
// Knob bytes run 0–127: the factory set stores a full knob as 127 (and uses 121–126 too).

/** Measured or published mappings to units; estimates are marked. */
export const CALIBRATION={
 knobMax:127,
 // Osc frequency: 2 steps per semitone (each odd step plays the same note as the even one
 // below it), 0–96 = C0–C4 on the panel; 48 (C2) plays at 8' pitch. Above 96 = C4.
 freqStepsPerSemitone:2,freqMax:96,freq8ft:48,
 // Osc B fine: unipolar, measured on hardware (Funkybot, 2026): raw → cents sharp
 oscBFineCents:[[0,0],[16,13.4],[32,26.1],[48,38.9],[64,52],[80,64.8],[96,77.3],[112,90],[120,96.8],[127,102]],
 // Osc B in low-freq mode: raw frequency → Hz, measured to raw 90, extrapolated above (Funkybot, 2026)
// Units for the engine, all estimates until checked by ear or against recordings:
 // knob 0–1 → lo·(hi/lo)^knob.
 cutoffHz:[20,20000],attackS:[.001,10],decayS:[.002,15],lfoHz:[.05,25],glideS:[.005,5],
 oscBLowHz:[[0,.531],[10,.636],[14,.718],[22,.81],[24,.859],[30,.968],[36,1.154],[42,1.297],[48,1.469],[52,1.858],[54,2.074],[58,2.623],[60,2.97],[62,3.323],[66,4.223],[72,6.031],[78,8.443],[80,9.258],[82,10.937],[84,12.159],[90,16.857],[96,23.745],[102,33.448],[108,47.116],[114,66.37],[120,93.49]],
};

const PROGRAM_DUMP=0x02,EDIT_BUFFER=0x03,DEVICES={0x32:'Prophet-5',0x31:'Prophet-10'};
export const NAME_AT=65,NAME_LENGTH=20,PACKED_LENGTH=152;
export const KEY_PRIORITY=['low','last','low retrigger','last retrigger','high','high retrigger'];

/** Sequential "packed MS bit" → 8-bit bytes. */
export function unpack(packed){
 const out=[];
 for(let g=0;g<packed.length;g+=8){const top=packed[g];for(let k=0;k<7&&g+1+k<packed.length;k++)out.push(packed[g+1+k]|((top>>k)&1)<<7);}
 return Uint8Array.from(out);
}
/** 8-bit bytes → packed MS bit (for writing dumps back). */
export function pack(bytes){
 const out=[];
 for(let i=0;i<bytes.length;i+=7){let top=0;const chunk=[];for(let k=0;k<7;k++){const v=bytes[i+k]??0;top|=(v>>7&1)<<k;chunk.push(v&127);}out.push(top,...chunk);}
 return Uint8Array.from(out);
}

const lerpTable=(table,x)=>{
 if(x<=table[0][0])return table[0][1];
 for(let i=1;i<table.length;i++)if(x<=table[i][0]){const [x0,y0]=table[i-1],[x1,y1]=table[i];return y0+(y1-y0)*(x-x0)/(x1-x0);}
 return table.at(-1)[1];
};
// log-domain interpolation for rates
const logTable=(table,x)=>2**lerpTable(table.map(([a,b])=>[a,Math.log2(b)]),x);

/** Panel step → semitones relative to 8' (−24 = C0 … +24 = C4). */
export const freqSemitones=raw=>Math.floor(Math.min(raw,CALIBRATION.freqMax)/CALIBRATION.freqStepsPerSemitone)-CALIBRATION.freq8ft/CALIBRATION.freqStepsPerSemitone;
/** Bank 0–9 and program 0–39 → "U1-11" … "F5-58" (bank, group, program as on the panel). */
export const programCode=(bank,program)=>`${bank<5?'U':'F'}${bank%5+1}-${Math.floor(program/8)+1}${program%8+1}`;

/** One unpacked program (≥99 bytes) → named values. Knobs 0–1, switches boolean. */
export function decodeProgram(d){
 const knob=i=>Math.min(d[i],CALIBRATION.knobMax)/CALIBRATION.knobMax,on=i=>d[i]!==0;
 const unisonRaw=d[53],chord=[...d.subarray(55,65)].filter(v=>v!==127);
 return {
  name:programName(d),
  // oscillators
  oscAFreq:freqSemitones(d[0]),oscBFreq:freqSemitones(d[1]),
  oscBFineCents:lerpTable(CALIBRATION.oscBFineCents,d[2]),
  oscASaw:on(3),oscAPulse:on(4),oscBSaw:on(5),oscBTri:on(6),oscBPulse:on(7),
  oscAPw:knob(8),oscBPw:knob(9),
  sync:on(10),oscBLowFreq:on(11),oscBKeyboard:on(12),
  oscBLowHz:logTable(CALIBRATION.oscBLowHz,Math.min(d[1],120)),
  glide:knob(13),
  // mixer and filter
  mixA:knob(14),mixB:knob(15),noise:knob(16),
  cutoff:knob(17),resonance:knob(18),
  keyTrack:['off','half','full'][Math.min(d[19],2)],
  filterRev:d[20]?'rev3':'rev12',     // Rev 3 = CEM3320 character, Rev 1/2 = SSI2040 character
  filterEnv:knob(40),
  // wheel-mod: LFO (saw/tri/square, any combination) mixed with noise, routed by switches
  lfoRate:knob(21),lfoInitial:knob(22),
  lfoSaw:on(23),lfoTri:on(24),lfoSquare:on(25),
  wheelMix:knob(26),                   // 0 = LFO … 1 = noise
  wheelFreqA:on(27),wheelFreqB:on(28),wheelPwA:on(29),wheelPwB:on(30),wheelFilter:on(31),
  // Poly-Mod: filter envelope and Osc B into Osc A frequency, Osc A PW and cutoff
  polyModEnv:knob(32),polyModOscB:knob(33),
  polyModFreqA:on(34),polyModPwA:on(35),polyModFilter:on(36),
  vintage:knob(37),
  // touch
  afterFilter:on(38),afterAmp:on(39),velFilter:on(41),velAmp:on(42),
  // older firmware leaves these 255 (unset): the switch then applies full depth
  velocityAmount:d[97]>127?1:d[97]/127,aftertouchAmount:d[98]>127?1:d[98]/127,
  // envelopes (filter, amplifier)
  filterAttack:knob(43),filterDecay:knob(45),filterSustain:knob(47),filterRelease:knob(49),
  ampAttack:knob(44),ampDecay:knob(46),ampSustain:knob(48),ampRelease:knob(50),
  release:on(51),                      // release switch off = both releases fast
  // voices
  unison:on(52),
  unisonVoices:unisonRaw<10?unisonRaw+1:null,    // 10 = chord: one voice per stored chord note
  unisonChord:unisonRaw===10,
  chord,                               // semitones above the played key, root first
  unisonDetune:d[54]/7,
  bendRange:d[86]+1,                   // semitones
  keyPriority:KEY_PRIORITY[d[87]]??'low',
 };
}

const expMap=([lo,hi],x)=>lo*(hi/lo)**x;
const flag=b=>b?1:0;

/** A decoded program → values for the engine (src/synths/prophet/params.js keys). Plays dry, as the hardware. */
export function engineValues(v,d){
 const C=CALIBRATION;
 const chord=v.unisonChord?v.chord.slice(0,10):[];
 return {
  pmEnv:v.polyModEnv,pmOscB:v.polyModOscB,pmFreqA:flag(v.polyModFreqA),pmPwA:flag(v.polyModPwA),pmFilter:flag(v.polyModFilter),
  lfoRate:expMap(C.lfoHz,v.lfoRate),lfoSaw:flag(v.lfoSaw),lfoTri:flag(v.lfoTri),lfoSquare:flag(v.lfoSquare),lfoAmount:v.lfoInitial,wheelMix:v.wheelMix,
  wmFreqA:flag(v.wheelFreqA),wmFreqB:flag(v.wheelFreqB),wmPwA:flag(v.wheelPwA),wmPwB:flag(v.wheelPwB),wmFilter:flag(v.wheelFilter),
  aFreq:v.oscAFreq,aSaw:flag(v.oscASaw),aPulse:flag(v.oscAPulse),aPw:v.oscAPw,sync:flag(v.sync),
  // in low-frequency mode the whole knob travel is a rate: keep the raw step (2 per semitone)
  bFreq:v.oscBLowFreq?d[1]/C.freqStepsPerSemitone-C.freq8ft/C.freqStepsPerSemitone:v.oscBFreq,
  bFine:v.oscBFineCents,bSaw:flag(v.oscBSaw),bTri:flag(v.oscBTri),bPulse:flag(v.oscBPulse),bPw:v.oscBPw,bLow:flag(v.oscBLowFreq),bKybd:flag(v.oscBKeyboard),
  mixA:v.mixA,mixB:v.mixB,mixNoise:v.noise,
  cutoff:expMap(C.cutoffHz,v.cutoff),res:v.resonance,fEnv:v.filterEnv,track:['off','half','full'].indexOf(v.keyTrack),filterRev:v.filterRev==='rev3'?1:0,
  fAttack:expMap(C.attackS,v.filterAttack),fDecay:expMap(C.decayS,v.filterDecay),fSustain:v.filterSustain,fRelease:expMap(C.decayS,v.filterRelease),
  aAttack:expMap(C.attackS,v.ampAttack),aDecay:expMap(C.decayS,v.ampDecay),aSustain:v.ampSustain,aRelease:expMap(C.decayS,v.ampRelease),
  release:flag(v.release),
  glide:v.glide>0?expMap(C.glideS,v.glide):0,
  unison:flag(v.unison),unisonVoices:v.unisonVoices??Math.max(1,chord.length),unisonDetune:v.unisonDetune,
  priority:Math.max(0,KEY_PRIORITY.indexOf(v.keyPriority)),
  chord:flag(chord.length>0),...Object.fromEntries(Array.from({length:10},(_,i)=>[`chord${i+1}`,chord[i]??-1])),
  velFilter:v.velFilter?v.velocityAmount:0,velAmp:v.velAmp?v.velocityAmount:0,
  afterFilter:v.afterFilter?v.aftertouchAmount:0,afterAmp:v.afterAmp?v.aftertouchAmount:0,
  bendRange:v.bendRange,vintage:v.vintage,
  chorusMix:0,reverbMix:0,
 };
}

export const programName=d=>String.fromCharCode(...d.subarray(NAME_AT,NAME_AT+NAME_LENGTH)).replace(/[^\x20-\x7e]/g,' ').trim();

/** Every program in a SysEx file (program dumps and edit-buffer dumps), in file order. */
export function parseProphetSysex(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 const programs=[];
 for(let i=0;i<bytes.length;i++){
  if(bytes[i]!==0xF0)continue;
  const end=bytes.indexOf(0xF7,i);if(end<0)break;
  const m=bytes.subarray(i,end+1);i=end;
  if(m[1]!==0x01||!DEVICES[m[2]])continue;
  const dump=m[3]===PROGRAM_DUMP,start=dump?6:m[3]===EDIT_BUFFER?4:-1;
  if(start<0||m.length<start+PACKED_LENGTH+1)continue;
  const data=unpack(m.subarray(start,start+PACKED_LENGTH));
  const bank=dump?m[4]:null,program=dump?m[5]:null;
  const values=decodeProgram(data);
  programs.push({device:DEVICES[m[2]],bank,program,code:dump?programCode(bank,program):'Edit',name:programName(data),data,values,engine:engineValues(values,data)});
 }
 return programs;
}
