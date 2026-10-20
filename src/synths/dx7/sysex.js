// Yamaha DX7 voice SysEx → named values. The format is Yamaha's published one
// (DX7 owner's manual, MIDI data format). No cartridge data ships with the site:
// players import ROM1A–4B or any community/generated cartridge themselves.
//
// 32-voice bulk: F0 43 0n 09 20 00 <4096 bytes: 32 × 128 packed> <checksum> F7.
// Single voice:  F0 43 0n 00 01 1B <155 bytes unpacked> <checksum> F7.
// Checksum: the data bytes plus it sum to 0 (mod 128). Operators are stored OP6 first.

export const CURVES=['-lin','-exp','+exp','+lin'];
export const LFO_WAVES=['triangle','saw down','saw up','square','sine','sample & hold'];
const NOTES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
/** MIDI note → DX7 name (middle C, MIDI 60, is C3). */
export const noteName=n=>`${NOTES[n%12]}${Math.floor(n/12)-2}`;

/** One packed 128-byte voice (VMEM) → the 155 unpacked parameters (VCED order). */
export function unpackVoice(p){
 const v=[];
 for(let op=0;op<6;op++){                    // OP6 … OP1
  const o=p.subarray(op*17,op*17+17);
  v.push(o[0],o[1],o[2],o[3],o[4],o[5],o[6],o[7],o[8],o[9],o[10],
   o[11]&3,o[11]>>2&3,                          // left, right curve
   o[12]&7,                                      // rate scaling
   o[13]&3,o[13]>>2&7,                           // amp mod sensitivity, key velocity sensitivity
   o[14],                                        // output level
   o[15]&1,o[15]>>1&31,o[16],                    // mode, coarse, fine
   o[12]>>3&15);                                 // detune
 }
 v.push(...p.subarray(102,110),                  // pitch EG rates, levels
  p[110]&31,p[111]&7,p[111]>>3&1,               // algorithm, feedback, osc key sync
  p[112],p[113],p[114],p[115],p[116]&1,p[116]>>1&7,p[116]>>4&7,  // LFO speed, delay, PMD, AMD, sync, wave, pitch mod sens
  p[117],...p.subarray(118,128));               // transpose, name
 return Uint8Array.from(v);
}

/** 155 unpacked parameters → named voice. Operators listed OP1 … OP6. */
export function decodeVoice(v){
 const ops=[];
 for(let k=0;k<6;k++){
  const o=v.subarray(k*21,k*21+21),fixed=o[17]===1,coarse=o[18],fine=o[19];
  ops[5-k]={
   op:6-k,
   eg:{rates:[...o.subarray(0,4)],levels:[...o.subarray(4,8)]},
   keyScaling:{breakPoint:noteName(21+o[8]),left:{depth:o[9],curve:CURVES[o[11]]},right:{depth:o[10],curve:CURVES[o[12]]},rate:o[13]},
   ampModSensitivity:o[14],velocitySensitivity:o[15],level:o[16],
   // ratio: coarse 0 = ×0.5, fine adds 0–99 %; fixed: 1/10/100/1000 Hz × 10^(fine/100)
   frequency:fixed?{fixedHz:+(10**(coarse&3)*10**(fine/100)).toPrecision(4)}:{ratio:+((coarse||.5)*(1+fine/100)).toFixed(3)},
   coarse,fine,detune:o[20]-7,
  };
 }
 const g=v.subarray(126);
 return {
  name:String.fromCharCode(...g.subarray(19,29)).replace(/[^\x20-\x7e]/g,' ').trimEnd(),
  algorithm:g[8]+1,feedback:g[9],oscKeySync:!!g[10],
  transpose:g[18]-24,                            // semitones; 24 = C3
  lfo:{wave:LFO_WAVES[g[16]]??`? (${g[16]})`,speed:g[11],delay:g[12],pitchModDepth:g[13],ampModDepth:g[14],keySync:!!g[15],pitchModSensitivity:g[17]},
  pitchEg:{rates:[...g.subarray(0,4)],levels:[...g.subarray(4,8)]},
  operators:ops,
 };
}

const checksumOk=data=>(data.reduce((s,b)=>s+b,0)&0x7f)===0;

/** Every voice in a SysEx file (32-voice bulks and single voices), in file order: [{number, name, checksumOk, values, raw}] (raw = the 155 unpacked parameters). */
export function parseDx7Sysex(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 const voices=[];
 for(let i=0;i<bytes.length;i++){
  if(bytes[i]!==0xF0||bytes[i+1]!==0x43)continue;
  const end=bytes.indexOf(0xF7,i);if(end<0)break;
  const m=bytes.subarray(i,end+1);i=end;
  const format=m[3],size=m[4]<<7|m[5],data=m.subarray(6,6+size),ok=checksumOk(m.subarray(6,7+size));
  if(m.length<size+8)continue;
  if(format===9&&size===4096)for(let k=0;k<32;k++){const raw=unpackVoice(data.subarray(k*128,k*128+128)),values=decodeVoice(raw);voices.push({number:k+1,name:values.name,checksumOk:ok,values,raw});}
  else if(format===0&&size===155){const raw=Uint8Array.from(data),values=decodeVoice(raw);voices.push({number:null,name:values.name,checksumOk:ok,values,raw});}
 }
 return voices;
}
