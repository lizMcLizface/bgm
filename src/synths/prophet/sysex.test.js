// @vitest-environment node
import {BY_KEY,clampValue} from './params';
import {pack,unpack,parseProphetSysex,decodeProgram,engineValues,freqSemitones,programCode,CALIBRATION} from './sysex';

// A program shaped like factory F5-17 "SYNC I": Osc A saw synced to a silent Osc B,
// filter envelope Poly-Mod into Osc A frequency.
function program({name='SYNC I',edit={}}={}){
 const d=new Uint8Array(133);
 Object.assign(d,{0:31,1:25,3:1,10:1,12:1,14:58,15:61,17:75,18:13,19:2,20:1,21:91,32:86,34:1,44:0,45:80,48:120,50:93,52:0,86:6,97:255,98:255});
 d.fill(127,55,65);
 [...name.padEnd(20)].forEach((c,i)=>d[65+i]=c.charCodeAt(0));
 for(const [k,v] of Object.entries(edit))d[k]=v;
 return d;
}
const dump=(bank,prog,data,device=0x32)=>[0xF0,0x01,device,0x02,bank,prog,...pack(data),0xF7];

test('MS-bit packing round-trips 133 bytes through 152 seven-bit bytes',()=>{
 const d=Uint8Array.from({length:133},(_,i)=>(i*37+11)&255);
 const p=pack(d);
 expect(p).toHaveLength(152);expect(p.every(b=>b<128)).toBe(true);
 expect([...unpack(p)]).toEqual([...d]);
 // the first byte of each group holds the top bits: bit k belongs to byte k
 expect([...unpack([0b0000101,1,2,3,4,5,6,7])]).toEqual([129,2,131,4,5,6,7]);
});

test('frequency steps: two per semitone, 48 = 8 foot, clamped at C4',()=>{
 expect([0,24,25,48,49,73,96,120].map(freqSemitones)).toEqual([-24,-12,-12,0,0,12,24,24]);
 expect(freqSemitones(39)-freqSemitones(25)).toBe(7);      // BASS IN FIFTHS
});

test('codes follow the panel: user/factory bank, group, program',()=>{
 expect([programCode(0,0),programCode(4,39),programCode(5,0),programCode(9,16)]).toEqual(['U1-11','U5-58','F1-11','F5-31']);
});

test('a program decodes into named panel values',()=>{
 const v=decodeProgram(program());
 expect(v.name).toBe('SYNC I');
 expect([v.oscAFreq,v.oscBFreq,v.oscASaw,v.oscAPulse,v.sync,v.oscBKeyboard]).toEqual([-9,-12,true,false,true,true]);
 expect(v.cutoff).toBeCloseTo(75/127);expect(v.keyTrack).toBe('full');expect(v.filterRev).toBe('rev3');
 expect([v.polyModEnv,v.polyModFreqA,v.polyModFilter]).toEqual([86/127,true,false]);
 expect(v.ampSustain).toBeCloseTo(120/127);expect(v.release).toBe(false);
 expect([v.unison,v.bendRange,v.keyPriority]).toEqual([false,7,'low']);
 // 255 = amount never set by older firmware: full depth
 expect([v.velocityAmount,v.aftertouchAmount]).toEqual([1,1]);
 // knobs run to 127 (the factory set stores full as 127, and uses 121–126)
 expect(decodeProgram(program({edit:{17:127}})).cutoff).toBe(1);
 expect(decodeProgram(program({edit:{17:120}})).cutoff).toBeCloseTo(120/127);
});

test('unison voices, chord memory, low-frequency Osc B and Osc B fine',()=>{
 const uni=decodeProgram(program({edit:{52:1,53:4,54:3}}));
 expect([uni.unison,uni.unisonVoices,uni.unisonChord]).toEqual([true,5,false]);expect(uni.unisonDetune).toBeCloseTo(3/7);
 const chord=decodeProgram(program({edit:{52:1,53:10,55:0,56:9,57:16,58:24}}));
 expect([chord.unisonChord,chord.unisonVoices,chord.chord]).toEqual([true,null,[0,9,16,24]]);
 const lfo=decodeProgram(program({edit:{11:1,1:0}}));
 expect(lfo.oscBLowFreq).toBe(true);expect(lfo.oscBLowHz).toBeCloseTo(.531);
 expect(decodeProgram(program({edit:{1:72}})).oscBLowHz).toBeCloseTo(6.031);
 expect(decodeProgram(program({edit:{2:64}})).oscBFineCents).toBeCloseTo(52);
 expect(CALIBRATION.oscBLowHz.at(-1)[0]).toBe(120);
});

test('a file of dumps parses program and edit-buffer messages, skipping others',()=>{
 const bytes=new Uint8Array([
  ...dump(9,6,program()),
  0xF0,0x41,0x30,0x00,0x01,0xF7,                         // someone else's SysEx
  ...dump(0,39,program({name:'Mine'}),0x31),
  0xF0,0x01,0x32,0x03,...pack(program({name:'Edit'})),0xF7,
  0xF0,0x01,0x32,0x02,0x00,0x00,0x01,0x02,0xF7,           // truncated: skipped
 ]);
 const p=parseProphetSysex(bytes);
 expect(p.map(x=>[x.code,x.name,x.device])).toEqual([['F5-17','SYNC I','Prophet-5'],['U1-58','Mine','Prophet-10'],['Edit','Edit','Prophet-5']]);
 expect(p[0].values.sync).toBe(true);
});

test('a decoded program maps onto the engine table: every key known, every value in range',()=>{
 const d=new Uint8Array(133);Object.assign(d,{0:48,1:110,3:1,11:1,12:0,14:127,17:64,19:2,20:1,43:0,46:127,51:1,52:1,53:10,55:0,56:4,57:7,58:127,59:127,60:127,61:127,62:127,63:127,64:127,97:255,98:40,41:1,38:1});
 const e=engineValues(decodeProgram(d),d);
 for(const [key,value] of Object.entries(e)){expect(BY_KEY[key],key).toBeDefined();expect(clampValue(key,value)).toBeCloseTo(value);}
 // low-frequency Osc B keeps the whole knob travel (step 110 = +31 st, a rate above the audio range)
 expect([e.bLow,e.bKybd,e.bFreq]).toEqual([1,0,31]);
 expect(e.cutoff).toBeCloseTo(20*1000**(64/127));expect(e.aDecay).toBeCloseTo(15);expect(e.track).toBe(2);
 // chord memory: unison with one voice per chord note
 expect([e.unison,e.chord,e.unisonVoices,e.chord1,e.chord2,e.chord3,e.chord4]).toEqual([1,1,3,0,4,7,-1]);
 // switches carry the Rev 4 amounts (255 = unset by older firmware: full)
 expect(e.velFilter).toBe(1);expect(e.afterFilter).toBeCloseTo(40/127);expect(e.afterAmp).toBe(0);
});
