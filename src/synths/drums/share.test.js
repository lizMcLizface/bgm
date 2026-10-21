// @vitest-environment node
import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {KITS,ARRANGEMENTS,arrangementBank,drumParams,drumPresets} from './kits';
import {cleanRack,RACK_PARAMS} from '../effects/params';
import {encodeDrumState,decodeDrumState,drumShareUrl,readDrumLink} from './share';

const state=kit=>({bank:arrangementBank(kit,ARRANGEMENTS[0]),values:drumParams(kit).sanitize({bdTune:.123456789,tempo:137,swing:.61}),rack:{...cleanRack(),'effects.delay':.25,'effects.delayMs':410,'compressor.enabled':1},name:'My drums 🎶'});
test('portable URLs round-trip custom banks, all cell strengths, lengths, tempos, sounds and rack values',()=>{
 for(const kit of Object.values(KITS)){
  const s=state(kit);s.bank.current=7;s.bank.lengths[7]=12;s.bank.tempos[7]=87.5;
  s.bank.patterns[7][0][15]=2;s.bank.patterns[7].at(-1)[2]=1;s.bank.patterns[7].at(-1)[3]=2;
  const code=encodeDrumState(kit,s),out=decodeDrumState(kit,code);
  expect(out).toEqual({bank:s.bank,patch:{values:s.values,rack:s.rack,name:s.name}});
  expect(code.startsWith('2.')).toBe(true);expect(code.length).toBeLessThan(700);
  const url=drumShareUrl(kit,s,`https://calmbgm.com/synths/${kit.id}/?bank=old&program=2#old`);
  expect(new URL(url).search).toBe('');expect(readDrumLink(kit,url)).toEqual(out);
 }
});
// Independently encode/decode with Node's zlib, rather than the browser library.
const unpack=code=>JSON.parse(inflateRawSync(Buffer.from(code.slice(2),'base64url')).toString());
const pack=data=>'2.'+deflateRawSync(Buffer.from(JSON.stringify(data))).toString('base64url');
test('malformed, oversized, cross-machine and future links fail without returning partial state',()=>{
 const kit=KITS.tr808,s=state(kit),code=encodeDrumState(kit,s);
 for(const bad of ['', '!', 'a'.repeat(17000), code.slice(0,-10)])expect(()=>decodeDrumState(kit,bad)).toThrow();
 expect(()=>decodeDrumState(KITS.tr606,code)).toThrow();
 for(const edit of [d=>d.v=3,d=>d.l=Array(8).fill(0),d=>d.c=[8],d=>d.i=-1,d=>d.t=Array(8).fill(301),d=>d.s[130]=999,d=>d.r['unknown']=1,d=>d.r.constructor=1,d=>d.n[0]='x'.repeat(33),d=>d.p='!']){
  const d=unpack(code);edit(d);expect(()=>decodeDrumState(kit,pack(d))).toThrow();
 }
 expect(readDrumLink(kit,'https://calmbgm.com/synths/tr808/#drum=bad').error).toBeTruthy();
 expect(readDrumLink(kit,'https://calmbgm.com/synths/tr808/')).toEqual({});
 s.bank.patterns[0][0][0]=3;expect(()=>encodeDrumState(kit,s)).toThrow();
 const bomb='2.'+deflateRawSync(Buffer.from(' '.repeat(1000000))).toString('base64url');
 expect(()=>decodeDrumState(kit,bomb)).toThrow();
});
test('legacy links remain exact and are shortened when shared again',()=>{
 for(const kit of Object.values(KITS)){
  const s=state(kit),cells=s.bank.patterns.flat(2),bytes=Buffer.alloc(cells.length/4);
  cells.forEach((v,i)=>bytes[i>>2]|=v<<(i%4)*2);
  const d={v:1,k:kit.id,p:bytes.toString('base64url'),l:s.bank.lengths,t:s.bank.tempos,c:s.bank.chain,i:s.bank.current,title:s.bank.title,n:s.bank.names,sound:s.name,s:s.values,r:s.rack};
  const legacy=Buffer.from(JSON.stringify(d)).toString('base64url'),restored=decodeDrumState(kit,legacy);
  expect(restored).toEqual({bank:s.bank,patch:{name:s.name,values:s.values,rack:s.rack}});
  const compact=encodeDrumState(kit,{bank:restored.bank,...restored.patch});
  expect(compact.length).toBeLessThan(legacy.length*.3);expect(decodeDrumState(kit,compact)).toEqual(restored);
 }
});
test('blank banks and omitted default metadata round-trip without losing edited parameters',()=>{
 const kit=KITS.tr808,s=state(kit);
 s.bank={...s.bank,patterns:s.bank.patterns.map(p=>p.map(r=>r.map(()=>0))),chain:[],title:'',names:Array(8).fill('')};
 const code=encodeDrumState(kit,s);expect(decodeDrumState(kit,code).bank).toEqual(s.bank);
 expect(unpack(code).p).toBe('');expect(code.length).toBeLessThan(250);
});
test('old links keep the original deep kick while new Classic and Deep recipes share independently',()=>{
 const kit=KITS.tr808,params=drumParams(kit),presets=drumPresets(kit,params),s=state(kit);
 for(const name of ['Classic','Deep']){
  const preset=presets.find(p=>p.name===name),expected=name==='Deep'?1:0;
  const code=encodeDrumState(kit,{...s,...preset});expect(decodeDrumState(kit,code).patch.values.kickBody).toBe(expected);
 }
 const old=unpack(encodeDrumState(kit,s));delete old.s?.['133'];
 expect(decodeDrumState(kit,pack(old)).patch.values.kickBody).toBe(1);
});
test('dense edited banks and all non-default parameters still fit in a portable link',()=>{
 const kit=KITS.tr808,s=state(kit),params=drumParams(kit);
 s.bank.patterns=s.bank.patterns.map(p=>p.map((r,t)=>r.map((_,i)=>i%(t===kit.tracks.length?4:3))));
 for(const table of [params,RACK_PARAMS])for(const p of table.PARAMS)(table===params?s.values:s.rack)[p.key]=p.curve==='step'?p.max:p.min+(p.max-p.min)*.123456789012345;
 const code=encodeDrumState(kit,s);expect(code.length).toBeLessThan(10000);expect(decodeDrumState(kit,code).bank).toEqual(s.bank);
});
