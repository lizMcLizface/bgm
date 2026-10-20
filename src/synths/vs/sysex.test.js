// @vitest-environment node
import {FIELDS,PROGRAM_BYTES,CHARACTERS,joinNibbles,unpackProgram,decodeProgram,parseVsSysex,wavesFromSamples,noteName,parseVsWaveDump} from './sysex';

// Packs raw field values MSB-first in table order, as the VS does.
function pack(raw){
 const bytes=new Uint8Array(PROGRAM_BYTES);let bit=0;
 for(const {key,bits} of FIELDS){
  const v=(raw[key]??0)&((1<<bits)-1);
  for(let k=bits-1;k>=0;k--,bit++)if(v>>k&1)bytes[bit>>3]|=0x80>>(bit&7);
 }
 return bytes;
}
const nibbles=bytes=>[...bytes].flatMap(b=>[b>>4,b&15]);
const named=name=>Object.fromEntries([...name.padEnd(8)].map((c,i)=>['name'+i,CHARACTERS.indexOf(c)]));
// Shaped like factory program 03 VOLKANIK (manual p. 15-5/15-6)
const VOLKANIK={...named('VOLKANIK'),waveA:40,waveB:41,waveC:42,waveD:42,cutoff:99,lfo1Rate:12,lfo2Rate:13,
 ampRate1:36,ampRate2:36,ampRate3:35,ampRate4:92,ampRate4A:97,ampLevel1:99,ampLevel2:70,ampLevel3:99,ampLoop:5,
 filterRate2:42,filterRate4A:77,filterLevel1:87,filterLevel3:43,mixLoop:4,mixY0:63,mixY1:-64,mixX2:63,mixY2:-64,
 doubleDetune:13,doubleDelay:60,unison:5,chorusSides:3,chorusRate:30,chorusDepth:53,volume:20,
 ...Object.fromEntries([-63,-45,-26,-10,9,27,46,63].map((v,i)=>['pan'+i,v])),
 arpRate:88,arpMode:1,arpScan:3,arpVoicing:1,arpVelocity:1,arpRests:1,
 lfo1Amount:82,lfo2Amount:83,pressureAmount:51,keyboardAmount:-13,
 lfo1Dest:0b1110100000,lfo2Dest:0b1111000000,pressureDest:1<<9,keyboardDest:1,modWheelDest:0b111,splitPoint:60};

test('the field table fits 82 bytes: 647 bits of fields, 9 spare',()=>{
 const bits=FIELDS.reduce((s,f)=>s+f.bits,0);
 expect(bits).toBe(647);expect(bits).toBeLessThanOrEqual(PROGRAM_BYTES*8);
});

test('nibbles join high first and fields round-trip, signed ones as two\'s complement',()=>{
 expect([...joinNibbles([0x0B,0x05,0x00,0x0F])]).toEqual([0xB5,0x0F]);
 const raw=unpackProgram(pack(VOLKANIK));
 for(const [k,v] of Object.entries(VOLKANIK))expect(raw[k]).toBe(v);
});

test('a program decodes into the values on its factory sheet',()=>{
 const v=decodeProgram(unpackProgram(pack(VOLKANIK)));
 expect(v.name).toBe('VOLKANIK');
 expect(Object.values(v.oscillators).map(o=>o.wave)).toEqual([40,41,42,42]);
 expect(v.voice).toEqual({unison:{detune:5},glide:0,volume:20,pan:[-63,-45,-26,-10,9,27,46,63]});
 expect(v.keyboard).toMatchObject({mode:'single',splitPoint:'C3',doubleDetune:13,doubleDelay:240});
 expect(v.ampEnvelope).toEqual({rates:[36,36,35,92,97],levels:[0,99,70,99],loop:'back and forth 1-3',repeat:'continuous'});
 expect(v.filterEnvelope.levels).toEqual([0,87,0,43,0]);
 expect(v.mixEnvelope.points.slice(0,3)).toEqual([{x:0,y:63},{x:0,y:-64},{x:63,y:-64}]);
 expect(v.arpeggiator).toMatchObject({rate:88,mode:'auto latch',scan:'assign',octaves:1,voicing:'poly',velocity:true,rests:true});
 expect(v.modulation.lfo1).toEqual({amount:82,to:['mix A-C','LFO 2 rate','LFO 2 amount','pan']});
 expect(v.modulation.lfo2.to).toEqual(['mix B-D','LFO 1 rate','LFO 1 amount','pan']);
 expect(v.modulation.pressure).toEqual({amount:51,to:['LFO 2 rate']});
 expect(v.modulation.keyboard).toEqual({amount:-13,to:['filter']});
 expect(v.modulation.modWheel.to).toEqual(['LFO 1 amount','LFO 2 amount','chorus depth']);
});

test('bank and single-program dumps parse; other SysEx is skipped',()=>{
 const one=pack(VOLKANIK),other=pack({...VOLKANIK,...named('ZENNY 1')});
 const bank=[0xF0,0x01,0x0A,0x64,...nibbles(Array.from({length:100},(_,i)=>i===3?one:other).flatMap(b=>[...b])),0xF7];
 const single=[0xF0,0x01,0x0A,0x08,...nibbles(one),0xF7];
 const p=parseVsSysex(new Uint8Array([...bank,0xF0,0x43,0x00,0xF7,...single]));
 expect(p).toHaveLength(101);
 expect([p[0].name,p[3].name,p[100].name,p[100].number]).toEqual(['ZENNY 1','VOLKANIK','VOLKANIK',8]);
});

test('wave sets split into normalised 128-sample cycles; note names follow the VS (middle C = C3)',()=>{
 const s=new Float32Array(256);for(let i=0;i<256;i++)s[i]=i<128?.5*Math.sin(2*Math.PI*i/128)+.1:i%2;
 const w=wavesFromSamples(s,{first:32});
 expect(w.map(x=>x.number)).toEqual([32,33]);
 expect(Math.max(...w[0].samples)).toBeCloseTo(1);expect(w[1].samples[0]).toBeCloseTo(-1);
 expect([noteName(60),noteName(61),noteName(36)]).toEqual(['C3','C#3','C1']);
});

test('a user-wave dump decodes 32 waves of 128 signed 12-bit samples: top bytes first, then the low nibbles',()=>{
 const data=new Uint8Array(32*192);
 for(let w=0;w<32;w++)for(let k=0;k<128;k++){
  const v=Math.round(2047*Math.sin(2*Math.PI*(k+w)/128))&0xFFF;    // 12-bit two's complement
  data[w*192+k]=v>>4;data[w*192+128+(k>>1)]|=(v&15)<<(k&1?0:4);
 }
 const waves=parseVsWaveDump(new Uint8Array([0xF0,0x01,0x0A,0x7F,...nibbles(data),0xF7]));
 expect(waves).toHaveLength(32);
 waves.forEach((w,i)=>{expect(w.number).toBe(i);for(const k of [0,17,64,127])expect(w.samples[k]).toBeCloseTo(Math.sin(2*Math.PI*(k+i)/128),2);});
 expect(parseVsWaveDump(new Uint8Array([0xF0,0x01,0x0A,0x64,0xF7]))).toBeNull();
});
