// @vitest-environment node
import {unpackVoice,decodeVoice,parseDx7Sysex,noteName} from './sysex';

// Packs one voice (VMEM, 128 bytes) from per-operator settings (OP1 first) and globals.
function packVoice({ops,alg=1,fb=0,oks=1,lfo=[35,0,0,0,1,0],pms=3,transpose=24,name='E.PIANO 1 ',peg=[99,99,99,99,50,50,50,50]}){
 const p=new Uint8Array(128);
 ops.forEach((o,i)=>{
  const at=(5-i)*17;                           // stored OP6 first
  p.set([...o.rates,...o.levels,o.bp,o.ld,o.rd,o.lc|o.rc<<2,o.rs|(o.det+7)<<3,o.ams|o.kvs<<2,o.ol,o.mode|o.coarse<<1,o.fine],at);
 });
 p.set(peg,102);p[110]=alg-1;p[111]=fb|oks<<3;p.set(lfo.slice(0,4),112);p[116]=lfo[4]|lfo[5]<<1|pms<<4;p[117]=transpose;
 p.set([...name.padEnd(10)].map(c=>c.charCodeAt(0)),118);
 return p;
}
const op=(over={})=>({rates:[95,29,20,50],levels:[99,95,0,0],bp:39,ld:0,rd:0,lc:0,rc:0,rs:3,det:0,ams:0,kvs:2,ol:99,mode:0,coarse:1,fine:0,...over});
const VOICE={alg:5,fb:6,transpose:24,ops:[op(),op({coarse:14,ol:58,det:-3,rd:19,rc:3,lc:1}),op({ol:99}),op({mode:1,coarse:2,fine:50}),op({coarse:0,fine:50}),op({coarse:1,ol:89,kvs:7})]};
function bulk(voices){
 const data=[...voices.flatMap(v=>[...packVoice(v)])];
 const sum=data.reduce((s,b)=>s+b,0);
 return new Uint8Array([0xF0,0x43,0x00,0x09,0x20,0x00,...data,(128-(sum&127))&127,0xF7]);
}

test('a packed voice decodes into named operator and global settings',()=>{
 const v=decodeVoice(unpackVoice(packVoice(VOICE)));
 expect([v.name,v.algorithm,v.feedback,v.oscKeySync,v.transpose]).toEqual(['E.PIANO 1',5,6,true,0]);
 expect(v.lfo).toEqual({wave:'triangle',speed:35,delay:0,pitchModDepth:0,ampModDepth:0,keySync:true,pitchModSensitivity:3});
 expect(v.operators.map(o=>o.op)).toEqual([1,2,3,4,5,6]);
 const op2=v.operators[1];
 expect(op2.frequency).toEqual({ratio:14});expect([op2.level,op2.detune,op2.velocitySensitivity]).toEqual([58,-3,2]);
 expect(op2.keyScaling).toEqual({breakPoint:'C3',left:{depth:0,curve:'-exp'},right:{depth:19,curve:'+lin'},rate:3});
 expect(op2.eg).toEqual({rates:[95,29,20,50],levels:[99,95,0,0]});
 expect(v.operators[3].frequency).toEqual({fixedHz:316.2});        // 100 Hz × 10^0.5
 expect(v.operators[4].frequency).toEqual({ratio:.75});             // coarse 0 = ×0.5, fine +50 %
 expect(v.operators[5].velocitySensitivity).toBe(7);
});

test('32-voice bulks parse with their checksum; single-voice dumps too; other SysEx is skipped',()=>{
 const file=bulk(Array.from({length:32},(_,i)=>({...VOICE,name:`VOICE ${i+1}`})));
 const voices=parseDx7Sysex(new Uint8Array([0xF0,0x41,0x10,0xF7,...file]));
 expect(voices).toHaveLength(32);expect(voices.every(v=>v.checksumOk)).toBe(true);
 expect([voices[0].number,voices[31].name]).toEqual([1,'VOICE 32']);
 const bad=Uint8Array.from(file);bad[100]^=1;expect(parseDx7Sysex(bad)[0].checksumOk).toBe(false);
 const single=unpackVoice(packVoice(VOICE)),sum=single.reduce((s,b)=>s+b,0);
 const one=parseDx7Sysex(new Uint8Array([0xF0,0x43,0x00,0x00,0x01,0x1B,...single,(128-(sum&127))&127,0xF7]));
 expect(one.map(v=>[v.number,v.name,v.checksumOk])).toEqual([[null,'E.PIANO 1',true]]);
 expect([noteName(60),noteName(21)]).toEqual(['C3','A-1']);
});
