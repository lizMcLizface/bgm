// @vitest-environment node
import fs from 'node:fs';
import {it,expect} from 'vitest';
import {WalkPath} from '../app/engine/wander.js';
import {OwnedAmbienceControlPreparation as Captured} from './ownedAmbienceControlPreparation.js';
import {AmbienceLiveControlPlanner as Live} from './ambienceLiveControlPlanner.js';
import {AmbienceLiveControlProducer as Producer} from './ambienceLiveControlProducer.js';
const module=new WebAssembly.Module(fs.readFileSync('public/ambience-control-preparation/preparation.wasm'));
function first(p,birth=0) { const packet=p.first(),offset=p.stats().offset; let count=0; while(count<packet.maxCount && birth+(packet.firstIndex+count)*2-offset<=birth+90) count++; p.commit(packet.id,count,birth); return {packet,count}; }
it('retains a fixed diagnostic ring through6000 actual Rust refills with untouched JS WalkPath Float32 knots and exact RNG draws',()=>{
 const recipe={seed:6207,period:73,offset:17.3},p=new Live(module,recipe),reference=new WalkPath(recipe.seed,recipe.period);
 try { const {packet,count}=first(p);expect(Math.fround(packet.initial)).toBe(Math.fround(reference.valueAt(recipe.offset)));for(let j=0;j<count;j++)expect(Math.fround(packet.points[j*2+1])).toBe(Math.fround(reference.knot(packet.firstIndex+j)));const memory=p.e.memory.buffer,entries=p.journal.entries;
  for(let i=1;i<=6000;i++){if(i%997===0){const period=i%2?101:43;p.setPeriod(period);reference.setPeriod(period);}const r=p.refill(i*15);for(let j=0;j<r.maxCount;j++)expect(Math.fround(r.points[j*2+1])).toBe(Math.fround(reference.knot(r.firstIndex+j)));p.commit(r.id,r.maxCount,0);}
  const s=p.receiptStatus();expect(s.retained).toBe(256);expect(s.total).toBe(6007);expect(s.recent).toHaveLength(256);expect(s.recent.at(-1)).toMatchObject({op:'refill',now:90000});expect(p.e.memory.buffer).toBe(memory);expect(p.journal.entries).toBe(entries);expect(p.stats().randomDraws).toBe(reference.draws);expect(p.stats().committedPlans).toBe(6001);expect(()=>p.save()).toThrow('not a captured replay');
 }finally{p.dispose();}
});
it('refuses an expired horizon before RNG/candidate mutation and keeps cancellation and independent seeds exact',()=>{
 const a=new Live(module,{seed:4411,period:180}),b=new Live(module,{seed:4411,period:180}),other=new Live(module,{seed:6207,period:180});
 try{first(a,7.25);first(b,7.25);first(other,7.25);const before=a.stats();expect(()=>a.refill(97.2501)).toThrow('ninety-second');expect(a.stats()).toEqual(before);const cancelled=a.refill(22.25);a.cancel(cancelled.id);expect(a.stats()).toEqual(before);const r=a.refill(22.25),same=b.refill(22.25),different=other.refill(22.25);expect(r.points).toEqual(same.points);expect(r.points).not.toEqual(different.points);a.commit(r.id,r.maxCount,7.25);b.commit(same.id,same.maxCount,7.25);expect(a.stats()).toEqual(b.stats());a.reset();expect(a.receiptStatus().total).toBe(0);expect(a.receiptStatus().retained).toBe(0);first(a);expect(a.stats().committedPlans).toBe(1);
 }finally{a.dispose();b.dispose();other.dispose();}
});
it('preserves the original captured planner journal bound and saved replay contract',()=>{const p=new Captured(module,{seed:4411,period:180});try{first(p);for(let i=1;i<4096;i++){const r=p.refill(i*15);p.commit(r.id,r.maxCount,0);}expect(()=>p.refill(4096*15)).toThrow('history capacity');const text=p.save(),copy=Captured.load(module,text);try{expect(copy.stats()).toEqual(p.stats());}finally{copy.dispose();}}finally{p.dispose();}});
it('changes only the producer planner policy and bounds independent stream ownership before allocation',()=>{const producer=new Producer(module,{post(){},sha256:async()=>''});try{expect(()=>producer.open({slot:16,wave:2,sampleRate:48000,period:73})).toThrow('bounded');producer.open({slot:0,wave:2,sampleRate:48000,period:73});producer.open({slot:1,wave:2,sampleRate:48000,period:73});const a=producer.streams.get(2).planner,b=producer.streams.get(9).planner;expect(a).toBeInstanceOf(Live);first(a);first(b);for(let i=1;i<=4100;i++){const r=a.refill(i*15);a.commit(r.id,r.maxCount,0);}expect(producer.receipts({slot:0,wave:2}).retained).toBe(256);expect(producer.receipts({slot:1,wave:2}).total).toBe(1);expect(()=>producer.open({slot:0,wave:2,sampleRate:48000,period:73})).toThrow('already exists');producer.closeStream({slot:0,wave:2});expect(producer.stats().streams).toBe(1);}finally{producer.dispose();}});
