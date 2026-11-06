import {describe,expect,it} from 'vitest';
import {KITS,emptyPattern,foldAccent,ARRANGEMENTS,arrangementBank} from './kits';
import {SYNTHS} from '../models';
import {normalizeBank} from '../seq/bank';
import {encodeArrangement,decodeArrangement,arrangementFileName} from './arrangementFile';

const kit=KITS.tr808,synth=SYNTHS[kit.id];
const bankOf=()=>normalizeBank(arrangementBank(kit,ARRANGEMENTS[0]),{count:64,empty:emptyPattern(kit),valid:()=>true,migrate:foldAccent(kit)});

describe('arrangement file',()=>{
 it('round-trips a whole arrangement',()=>{
  const bank={...bankOf(),loopIn:0,loopOut:1,trackPlay:bankOf().trackPlay.map((p,i)=>i===0?{0:{div:'1/32',dir:'ping'}}:p),current:40};
  const values=synth.params.defaultValues(),text=encodeArrangement(kit,{bank,values,rack:null,name:'My song'});
  const back=decodeArrangement(kit,synth,text);
  expect(back.bank.patterns).toHaveLength(64);
  expect(back.bank.patterns[0]).toEqual(bank.patterns[0]);
  expect(back.bank.song).toEqual(bank.song);
  expect([back.bank.loopIn,back.bank.loopOut]).toEqual([0,1]);
  expect(back.bank.trackPlay[0]).toEqual({0:{div:'1/32',dir:'ping'}});
  expect(back.bank.current).toBe(40);
  expect(back.name).toBe('My song');
  expect(back.values.tempo).toBe(values.tempo);
 });
 it('writes empty patterns as null, keeping the file small',()=>{
  const data=JSON.parse(encodeArrangement(kit,{bank:bankOf(),values:{},rack:null,name:''}));
  expect(data.bank.patterns.filter(p=>p===null).length).toBeGreaterThan(50);
 });
 it('refuses other files, other machines and damage, with a message',()=>{
  const good=encodeArrangement(kit,{bank:bankOf(),values:{},rack:null,name:''});
  expect(()=>decodeArrangement(kit,synth,'nope')).toThrow(/not valid JSON/);
  expect(()=>decodeArrangement(kit,synth,'{"format":"x"}')).toThrow(/not a drum arrangement/);
  expect(()=>decodeArrangement(KITS.tr909,SYNTHS.tr909,good)).toThrow(/for the 808/);
  const bad=JSON.parse(good);bad.bank.patterns[0][0][0]=9;
  expect(()=>decodeArrangement(kit,synth,JSON.stringify(bad))).toThrow(/damaged/);
  expect(()=>decodeArrangement(kit,synth,JSON.stringify({...JSON.parse(good),version:99}))).toThrow(/newer/);
 });
 it('suggests a file name',()=>{
  expect(arrangementFileName(kit,{title:'Four on the Floor!'},'')).toBe('four-on-the-floor.tr808.json');
 });
});
