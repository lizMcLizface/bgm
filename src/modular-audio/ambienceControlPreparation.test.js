// @vitest-environment node
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {it,expect} from 'vitest';
import {seeded,normal} from '../app/random.js';
import {OwnedAmbienceControlPreparation as Planner,prepareAmbienceSpatialPhase} from './ownedAmbienceControlPreparation.js';
import fixture from './nativeWavePreparationFixture.json';
const module=new WebAssembly.Module(fs.readFileSync('public/ambience-control-preparation/preparation.wasm'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const scope={seeded,normal};vm.createContext(scope);
vm.runInContext(fs.readFileSync('src/app/engine/wander.js','utf8').replace(/^import.*$/mg,'').replace(/export /g,'')+'\nthis.WalkPath=WalkPath;',scope);
function firstCount(p,birth,offset){let n=0;while(n<p.maxCount&&birth+p.points[n*2]*2-offset<=birth+90)n++;return n;}
it('owns original first-booking and rolling WalkPath arithmetic at six rates, large offsets and future period edits',()=>{
 let points=0,refills=0;
 for(const rate of[8000,44100,48000,88200,96000,192000])for(const offset of[0,17.3,89.25,1000000]){
  const birth=130176/rate,a=new Planner(module,{seed:6101,period:73,offset}),original=new scope.WalkPath(6101,73);
  try{const p=a.first(101),n=firstCount(p,birth,offset);expect(p.initial).toBe(original.valueAt(offset));let next=Math.floor(offset/2)+1;
   for(let i=0;i<n;i++){expect(p.points[i*2]).toBe(next);expect(p.points[i*2+1]).toBe(original.knot(next++));points++;}
   a.commit(p.id,n,birth);original.setPeriod(101);
   for(let step=1;step<=40;step++){
    if(step%7===0){a.setPeriod(35+step*3);original.setPeriod(35+step*3);}
    const now=birth+step*15,r=a.refill(now);
    for(let i=0;i<r.maxCount;i++){expect(r.points[2*i]).toBe(next);expect(r.points[2*i+1]).toBe(original.knot(next++));points++;}
    expect(birth+next*2-offset).toBeGreaterThan(now+90);a.commit(r.id,r.maxCount,birth);
    expect(a.stats().randomDraws).toBe(original.draws);expect(a.stats().nextIndex).toBe(next);refills++;
   }
   const before=a.save(),stats=a.stats();expect(()=>a.refill(birth+100000)).toThrow('refused');expect(a.save()).toBe(before);expect(a.stats()).toEqual(stats);
  }finally{a.dispose();}
 }
 expect(points).toBe(8277);expect(refills).toBe(960);
});
it('admits and commits resources atomically, preserving RNG across wrong acknowledgements, cancellation and overlapping edits',()=>{
 const a=new Planner(module,{seed:6101,period:73,offset:17.3});try{
  const before=a.stats(),p=a.first(101),n=firstCount(p,37/48000,17.3);
  expect(()=>a.first()).toThrow();expect(()=>a.setPeriod(80)).toThrow();expect(()=>a.save()).toThrow();expect(()=>a.commit(p.id+1,n,37/48000)).toThrow();expect(()=>a.commit(p.id,n+1,37/48000)).toThrow();expect(a.stats()).toEqual(before);
  p.points.fill(NaN);a.cancel(p.id);const q=a.first(101);expect([...q.points].every(Number.isFinite)).toBe(true);a.commit(q.id,n,37/48000);
  const saved=a.save(),state=a.stats(),r=a.refill(25);a.cancel(r.id);expect(a.save()).toBe(saved);expect(a.stats()).toEqual(state);expect(()=>a.cancel(r.id)).toThrow();
 }finally{a.dispose();}
});
it('reconstructs committed JSON history and independent future packets without reusing runtime acknowledgement tags',()=>{
 const a=new Planner(module,{seed:4411,period:180,offset:89.25});let b;try{
  const p=a.first(41),birth=1792/44100;a.commit(p.id,firstCount(p,birth,89.25),birth);
  for(let i=1;i<20;i++){const r=a.refill(birth+i*15);a.commit(r.id,r.maxCount,birth);if(i%4===0)a.setPeriod(80+i);}
  b=Planner.load(module,a.save());expect(b.stats()).toEqual(a.stats());const x=a.refill(400),y=b.refill(400);expect(x.points).toEqual(y.points);a.cancel(x.id);b.cancel(y.id);expect(a.save()).toBe(b.save());
  const tag=x.id;a.reset();const cold=a.first();expect(cold.id).toBeGreaterThan(tag);expect(a.stats().randomDraws).toBe(0);a.cancel(cold.id);
 }finally{a.dispose();b?.dispose();}
});
it('reproduces every nonzero actual Native phase resource directly from original layer recipes',()=>{
 const waves=['rain','thunder','wind','waves','fire','vinyl','total'];let n=0;
 for(const c of fixture.cases){const wave=waves.indexOf(c.recipe.name);if(wave<0)continue;
  const resource=prepareAmbienceSpatialPhase(module,{sampleRate:c.rate,wave,period:c.recipe.period,offset:c.recipe.offset});
  expect(resource.real).toBe(c.real);expect(resource.imag).toBe(c.imag);expect(hash(new Uint8Array(resource.table.buffer))).toBe(c.nativeSha256);n++;
 }
 expect(n).toBe(21);
});
it('bounds invalid recipes and saved histories before allocation and frees invalid replay handles',()=>{
 const never=new Proxy({},{get(){throw Error('Reached Wasm');}});
 for(const c of[{seed:-1,period:73},{seed:1,period:14},{seed:1,period:73,offset:1e6+1}])expect(()=>new Planner(never,c)).toThrow('Invalid');
 for(const c of[{sampleRate:7999,wave:0,period:180},{sampleRate:48000,wave:7,period:180},{sampleRate:48000,wave:0,period:Infinity},{sampleRate:48000,wave:0,period:180,offset:-1}])expect(()=>prepareAmbienceSpatialPhase(never,c)).toThrow('Invalid bounded');
 expect(()=>Planner.load(module,'x'.repeat(2*1024*1024+1))).toThrow('byte budget');expect(()=>Planner.load(module,JSON.stringify({version:1,profile:'ambience-live-control-preparation-v1',recipe:{seed:1,period:73},commands:[{op:'untrusted'}]}))).toThrow('Unknown saved');
 const e=new WebAssembly.Instance(module,{}).exports;expect(e.ambience_control_preparation_new(1,NaN,0)).toBe(0);expect(e.ambience_control_preparation_phase_new(48000,0,180,1e6+1)).toBe(0);
});
