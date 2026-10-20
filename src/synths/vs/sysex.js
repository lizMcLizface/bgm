// Sequential Prophet VS (1986) program SysEx and wave sets → named values.
// See docs/VS_SYSEX_FORMAT.md. No Sequential data ships with the site: players
// import their own .syx and wave files.
//
// Messages (owner's manual CM2400B, p. 14-22): F0 01 0A <nn> <data> F7, nn = program
// 00–63 hex (0–99) or 64 hex = all 100. Each data byte is sent as two 4-bit pieces,
// high first; a program is 82 bytes = 656 bits holding the fields of the manual's
// Table 14-1 bit-packed in table order, most significant bit first (646 bits; the
// pressure destinations take 15 bits, not the table's 14, and 9 bits are spare).
// Worked out against the manual's filled-in sheets for programs 03, 08, 33 and 40
// and its program list: all 100 names, the levels, rates, pans and routings match.

const FIELD_ROWS=[
 // [key, bits, signed?]
 ...['A','B','C','D'].map(x=>['wave'+x,7]),
 ...['A','B','C','D'].map(x=>['coarse'+x,5]),
 ...['A','B','C','D'].map(x=>['fine'+x,7]),
 ['cutoff',7],['resonance',7],['filterEnvAmount',7],
 ['lfo1Shape',3],['lfo2Shape',3],['lfo1Rate',7],['lfo2Rate',7],
 ...envelope('amp',4),
 ...envelope('filter',5),
 ...['1','2','3','4','4A'].map(r=>['mixRate'+r,7]),
 ...[0,1,2,3,4].map(i=>['mixX'+i,7,true]),
 ...[0,1,2,3,4].map(i=>['mixY'+i,7,true]),
 ['mixLoop',3],['mixRepeat',3],
 ['keyboardMode',2],['splitPoint',7],['linkProgram',7],['doubleDetune',5],['doubleDelay',7],
 ['unison',3],['glide',7],['chorusSides',2],['chorusRate',7],['chorusDepth',7],['volume',7],
 ...[0,1,2,3,4,5,6,7].map(v=>['pan'+v,7,true]),
 ...[0,1,2,3,4,5,6,7].map(c=>['name'+c,5]),
 ['arpRate',7],['arpMode',2],['arpScan',3],['arpOctaves',2],['arpRepeats',2],['arpSplit',2],
 ['arpVoicing',1],['arpVelocity',1],['arpLayer',1],['arpRests',1],
 ['lfo1Amount',7],['lfo2Amount',7],
 ['pressureAmount',8,true],['velocityAmount',8,true],['keyboardAmount',8,true],['filterEnvModAmount',8,true],
 ['lfo1Dest',10],['lfo2Dest',10],['pressureDest',15],['velocityDest',5],['keyboardDest',4],['filterEnvDest',2],['modWheelDest',3],
];
function envelope(name,levels){
 return [...['1','2','3','4','4A'].map(r=>[`${name}Rate${r}`,7]),...Array.from({length:levels},(_,i)=>[`${name}Level${i}`,7]),[name+'Loop',3],[name+'Repeat',3]];
}
export const FIELDS=FIELD_ROWS.map(([key,bits,signed=false])=>({key,bits,signed}));
export const PROGRAM_BYTES=82;

// Modulation destinations per source, in bit order (bit 0 first): Figure 10-1 of the manual.
// Confirmed bit by bit on the sheets where a program uses them; marked ones are inferred from the figure's order.
export const DESTINATIONS={
 lfo1Dest:['freq A','freq B','freq C','freq D','filter','mix A-C','mix B-D','LFO 2 rate','LFO 2 amount','pan'],
 lfo2Dest:['freq A','freq B','freq C','freq D','filter','mix A-C','mix B-D','LFO 1 rate','LFO 1 amount','pan'],
 pressureDest:['freq A','freq B','freq C','freq D','filter','mix A-C','mix B-D','LFO 1 rate','LFO 1 amount','LFO 2 rate','LFO 2 amount','volume','pan','chorus rate','chorus depth'],
 velocityDest:['filter env amount','mix A-C','mix B-D','amp env amount','pan'],
 keyboardDest:['filter','mix A-C','mix B-D','pan'],
 filterEnvDest:['freq (all 4)','pan'],
 modWheelDest:['LFO 1 amount','LFO 2 amount','chorus depth'],
};
export const CHARACTERS='ABCDEFGHIJKLMNOPQRSTUVWXYZ12345 ';
export const LFO_SHAPES=['triangle','square','saw down','ramp up','random'];
export const LOOPS=['off','forward from 0','forward from 1','forward from 2','back and forth 0-3','back and forth 1-3','back and forth 2-3'];
export const KEYBOARD_MODES=['single','split','double'];
export const ARP_MODES=['normal','auto latch','extend'];
export const ARP_SCANS=['up','down','up/down','assign','reverse','random'];
const NOTES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
/** MIDI note → the VS's own name (middle C, MIDI 60, is C3 on the VS). */
export const noteName=n=>`${NOTES[n%12]}${Math.floor(n/12)-2}`;

/** Two 4-bit pieces per byte, high first. */
export function joinNibbles(pieces){
 const out=new Uint8Array(pieces.length>>1);
 for(let i=0;i<out.length;i++)out[i]=(pieces[2*i]&15)<<4|(pieces[2*i+1]&15);
 return out;
}

/** 82 program bytes → raw field values (signed fields as two's complement). */
export function unpackProgram(bytes){
 let bit=0;const raw={};
 const read=n=>{let v=0;for(let k=0;k<n;k++,bit++)v=v<<1|(bytes[bit>>3]>>(7-(bit&7))&1);return v;};
 for(const {key,bits,signed} of FIELDS){const v=read(bits);raw[key]=signed&&v>=1<<(bits-1)?v-(1<<bits):v;}
 return raw;
}

const list=(names,mask)=>names.filter((_,i)=>mask>>i&1);
const loop=(raw,name)=>({loop:LOOPS[raw[name+'Loop']]??`? (${raw[name+'Loop']})`,repeat:raw[name+'Loop']?(raw[name+'Repeat']===0?'continuous':raw[name+'Repeat']):null});

/** Raw fields → named program (values in the panel's own units). */
export function decodeProgram(raw){
 const name=Array.from({length:8},(_,c)=>CHARACTERS[raw['name'+c]]).join('').trimEnd();
 const osc=x=>({wave:raw['wave'+x],coarse:raw['coarse'+x],fine:raw['fine'+x]});
 const env=(e,levels)=>({
  rates:['1','2','3','4','4A'].map(r=>raw[`${e}Rate${r}`]),
  levels:Array.from({length:levels},(_,i)=>raw[`${e}Level${i}`]),
  ...loop(raw,e),
 });
 const source=(amount,dest)=>({amount:raw[amount],to:list(DESTINATIONS[dest],raw[dest])});
 return {
  name,
  oscillators:{A:osc('A'),B:osc('B'),C:osc('C'),D:osc('D')},
  // joystick positions: x −64 (A, left) … +63 (C, right); y −64 (B, top) … +63 (D, bottom)
  mixEnvelope:{rates:['1','2','3','4','4A'].map(r=>raw['mixRate'+r]),points:[0,1,2,3,4].map(i=>({x:raw['mixX'+i],y:raw['mixY'+i]})),...loop(raw,'mix')},
  filter:{cutoff:raw.cutoff,resonance:raw.resonance,envAmount:raw.filterEnvAmount},
  filterEnvelope:env('filter',5),
  ampEnvelope:env('amp',4),                            // levels 4 and 4A are 0 on the amplifier
  lfo1:{shape:LFO_SHAPES[raw.lfo1Shape]??`? (${raw.lfo1Shape})`,rate:raw.lfo1Rate},
  lfo2:{shape:LFO_SHAPES[raw.lfo2Shape]??`? (${raw.lfo2Shape})`,rate:raw.lfo2Rate},
  modulation:{
   lfo1:source('lfo1Amount','lfo1Dest'),lfo2:source('lfo2Amount','lfo2Dest'),
   pressure:source('pressureAmount','pressureDest'),velocity:source('velocityAmount','velocityDest'),
   keyboard:source('keyboardAmount','keyboardDest'),filterEnv:source('filterEnvModAmount','filterEnvDest'),
   modWheel:{to:list(DESTINATIONS.modWheelDest,raw.modWheelDest)},
  },
  voice:{unison:raw.unison?{detune:raw.unison}:'off',glide:raw.glide,volume:raw.volume,pan:[0,1,2,3,4,5,6,7].map(v=>raw['pan'+v])},
  keyboard:{mode:KEYBOARD_MODES[raw.keyboardMode]??`? (${raw.keyboardMode})`,splitPoint:noteName(raw.splitPoint),linkProgram:raw.linkProgram,
   doubleDetune:raw.doubleDetune,doubleDelay:raw.doubleDelay*4},  // the panel shows the delay ×4
  // which of the two bits is left is not confirmed: every sheet has both sides on
  chorus:{left:!!(raw.chorusSides&1),right:!!(raw.chorusSides&2),rate:raw.chorusRate,depth:raw.chorusDepth},
  arpeggiator:{rate:raw.arpRate,mode:ARP_MODES[raw.arpMode]??`? (${raw.arpMode})`,scan:ARP_SCANS[raw.arpScan]??`? (${raw.arpScan})`,
   octaves:raw.arpOctaves+1,repeats:raw.arpRepeats+1,split:raw.arpSplit,voicing:raw.arpVoicing?'poly':'mono',
   velocity:!!raw.arpVelocity,layer:!!raw.arpLayer,rests:!!raw.arpRests},
 };
}

/**
 * Every program in a Prophet VS SysEx file: bank dumps (nn = 64 hex, 100 programs) and
 * single-program dumps (nn = 0–99). Returns [{number, name, raw, values}] in file order.
 */
export function parseVsSysex(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 const programs=[];
 for(let i=0;i<bytes.length;i++){
  if(bytes[i]!==0xF0)continue;
  const end=bytes.indexOf(0xF7,i);if(end<0)break;
  const m=bytes.subarray(i,end+1);i=end;
  if(m[1]!==0x01||m[2]!==0x0A||m[3]>0x64)continue;
  const data=joinNibbles(m.subarray(4,m.length-1)),count=m[3]===0x64?100:1;
  if(data.length<count*PROGRAM_BYTES)continue;
  for(let k=0;k<count;k++){
   const raw=unpackProgram(data.subarray(k*PROGRAM_BYTES,(k+1)*PROGRAM_BYTES));
   const values=decodeProgram(raw);
   programs.push({number:count===1?m[3]:k,name:values.name,raw,values});
  }
 }
 return programs;
}

/**
 * A user-wave dump (F0 01 0A 7F … F7): the 32 RAM waves (VS numbers 0–31) as 128-sample cycles, ±1.
 * Joined bytes: 192 per wave = the top 8 bits of the 128 samples as signed bytes (two's complement),
 * then 64 bytes holding their low 4 bits, two per byte (high nibble first: assumed, below hearing
 * either way). Worked out from the data: read this way, 10 of the 64 user waves in two dumps are
 * exact copies of ROM waves (32, 37, 40, 46, 47, 50, 101) from the wave-set WAVs.
 */
export function parseVsWaveDump(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 for(let i=0;i<bytes.length;i++){
  if(bytes[i]!==0xF0||bytes[i+1]!==0x01||bytes[i+2]!==0x0A||bytes[i+3]!==0x7F)continue;
  const end=bytes.indexOf(0xF7,i);if(end<0)break;
  const data=joinNibbles(bytes.subarray(i+4,end));
  if(data.length<32*192)return null;
  return Array.from({length:32},(_,w)=>{
   const s=data.subarray(w*192,(w+1)*192);
   return {number:w,samples:Float32Array.from({length:128},(_,k)=>(((s[k]<<24>>24)<<4)|(s[128+(k>>1)]>>(k&1?0:4)&15))/2048)};
  });
 }
 return null;
}

export const WAVE_LENGTH=128;
/**
 * Single-cycle waves from mono samples: consecutive 128-sample cycles, normalised to ±1.
 * The Groove Synthesis compilation holds VS waves 0–63 (user 0–31, ROM 32–63) and 64–127 in two files of 64.
 */
export function wavesFromSamples(samples,{first=0}={}){
 const count=Math.floor(samples.length/WAVE_LENGTH),waves=[];
 for(let w=0;w<count;w++){
  const s=samples.subarray(w*WAVE_LENGTH,(w+1)*WAVE_LENGTH);
  let mean=0;for(const v of s)mean+=v;mean/=WAVE_LENGTH;
  let peak=0;for(const v of s)peak=Math.max(peak,Math.abs(v-mean));
  waves.push({number:first+w,samples:Float32Array.from(s,v=>peak?(v-mean)/peak:0)});
 }
 return waves;
}
