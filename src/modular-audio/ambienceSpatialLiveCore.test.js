// @vitest-environment node
import{it,expect}from'vitest';
import fs from'node:fs';import assert from'node:assert/strict';import{OwnedAmbienceSpatial,ambienceSpatialSpec}from'./ownedAmbienceSpatial.js';import{OwnedAmbienceSpatialLiveCore as Live}from'./ownedAmbienceSpatialLiveCore.js';import{OwnedAmbienceControlPreparation as Planner,prepareAmbienceSpatialPhase}from'./ownedAmbienceControlPreparation.js';
const lm=new WebAssembly.Module(fs.readFileSync('public/ambience-spatial-live/live.wasm')),fm=new WebAssembly.Module(fs.readFileSync('public/ambience-spatial/spatial.wasm')),pm=new WebAssembly.Module(fs.readFileSync('public/ambience-control-preparation/preparation.wasm'));let compared=0;
it('preserves all accepted wet PCM and drift controls through separately prepared live publication at six rates',()=>{
for(const rate of[8000,44100,48000,88200,96000,192000])for(const mode of[0,1]){const offset=17.3,live=new Live(lm,{sampleRate:rate,offset}),planners=[];
const layers=Array.from({length:6},(_,i)=>({birth:0,mode,period:180*(.85+.3*((i*.381966+.19)%1)),shape:[.2,.15,.65,-.1+i*.03,.35]}));const commands=Array.from({length:7},(_,i)=>({op:'wander',observedFrame:0,target:i,at:0,tau:.4,args:[i===6?1:mode,i===6?180:layers[i].period,i===6?.08:.2,0,0,0]}));const finite=new OwnedAmbienceSpatial(fm,ambienceSpatialSpec(rate,{offset,layers,contributors:layers.map((_,i)=>({slot:i,layer:i,owner:i+1})),commands}));
try{for(let i=0;i<7;i++){const period=i===6?180:layers[i].period,m=i===6?1:mode,phase=prepareAmbienceSpatialPhase(pm,{sampleRate:rate,wave:i,period,offset});for(let start=0;start<phase.table.length;start+=1024)live.phaseChunk(i,start,phase.table.subarray(start,start+1024));live.sealPhase(i);let p,packet;if(m){p=new Planner(pm,{seed:i===6?4411:6101+i*53,period,offset});planners.push(p);packet=p.first(period);live.beginWalk(i,packet,{periodBefore:period});live.walkChunk(i,0,packet.points);live.sealWalk(i);}const n=live.create(i,{birth:0,mode:m,period,shape:i===6?undefined:layers[i].shape});if(p)p.commit(packet.id,n,0);live.command(1,i,0,0,.4,[m,period,i===6?.08:.2,0,0,0]);if(i<6)live.bind(i,i,i+1);}
 for(let q=0;q<40;q++){for(let s=0;s<6;s++)for(let ch=0;ch<2;ch++)for(let j=0;j<128;j++){const v=Math.fround(.01*Math.sin((q*128+j)*(.05+s*.01)+ch));live.input[s][ch][j]=finite.input[s][ch][j]=v;}live.render({sourceAudio:63,layerAudio:63,filterAudio:262143,bed:2});finite.render();for(let b=0;b<7;b++){for(let ch=0;ch<2;ch++)assert.deepEqual(new Uint32Array(live.output[b][ch].buffer,live.output[b][ch].byteOffset,128),new Uint32Array(finite.output[b][ch].buffer,finite.output[b][ch].byteOffset,128),`PCM${rate}/${mode}/${q}/${b}/${ch}`);assert.deepEqual(live.controls[b],finite.controls[b],`control${rate}/${mode}/${q}/${b}`);}compared++;}
}finally{finite.dispose();live.dispose();planners.forEach(p=>p.dispose());}}
expect(compared).toBe(480);});

function stage(live,wave,{rate=48000,period=73,offset=0,mode=0,birth=0}={}){
 const phase=prepareAmbienceSpatialPhase(pm,{sampleRate:rate,wave,period,offset});for(let i=0;i<phase.table.length;i+=1024)live.phaseChunk(wave,i,phase.table.subarray(i,i+1024));live.sealPhase(wave);let p,packet;
 try{if(mode){p=new Planner(pm,{seed:wave===6?4411:6101+wave*53,period,offset});packet=p.first(period);live.beginWalk(wave,packet,{periodBefore:period});live.walkChunk(wave,0,packet.points);live.sealWalk(wave);}const n=live.create(wave,{birth,mode,period,shape:[.2,0,.8,0,.3]});if(p)p.commit(packet.id,n,birth);}finally{p?.dispose();}
}
it('keeps active source PCM/control untouched by invalid, overlapping, nonsequential or legacy requests',()=>{
 const a=new Live(lm,{sampleRate:48000}),b=new Live(lm,{sampleRate:48000});try{
  for(const c of[a,b]){stage(c,2);c.command(1,2,0,0,.4,[0,73,.2,0,0,0]);c.bind(0,2,11);}
  expect(()=>a.create(2,{birth:0,mode:0,period:73})).toThrow();expect(()=>a.command(0,2,0,0,481,[.2,0,.8,0,.3,0])).toThrow();expect(()=>a.phaseChunk(2,100,new Float32Array(128))).toThrow();
  expect(a.e.ambience_spatial_command(a.handle,0,6,2,0,100000,0,0,0,0,0,0,0)).toBe(0);expect(a.e.ambience_spatial_reset(a.handle)).toBe(0);expect(a.e.ambience_spatial_live_begin(a.handle,37,0)).toBe(0);
  expect(()=>a.command(1,2,0,0,.4,[1,73,.2,0,0,0])).toThrow();
  for(let q=0;q<10;q++){for(const c of[a,b]){c.input[0][0].fill(.01);c.input[0][1].fill(.02);c.render({sourceAudio:1,layerAudio:4,filterAudio:64});}expect(a.output[2][0]).toEqual(b.output[2][0]);expect(a.controls[2]).toEqual(b.controls[2]);}
 }finally{a.dispose();b.dispose();}
});
it('rejects full future event lanes atomically and reuses cold storage on a new isolated lease',()=>{
 const a=new Live(lm,{sampleRate:48000}),b=new Live(lm,{sampleRate:48000});try{
  for(const c of[a,b]){stage(c,2);c.bind(0,2,11);}
  let accepted=0;for(;accepted<600;accepted++){const args=[.2,0,.8,0,.3,0];try{a.command(0,2,0,1000+accepted,0,args);}catch{break;}b.command(0,2,0,1000+accepted,0,args);}
  expect(accepted).toBeGreaterThan(400);expect(accepted).toBeLessThan(512);expect(()=>a.command(0,2,0,2000,0,[.2,0,.8,0,.3,0])).toThrow();
  for(const c of[a,b]){c.input[0][0].fill(.01);c.render({sourceAudio:1,layerAudio:4,filterAudio:64});}expect(a.output[2][0]).toEqual(b.output[2][0]);
  const memory=a.memory;a.begin(128000,17.3);expect(a.stats()).toMatchObject({created:0,contributions:0,frame:128000});expect(a.memory).toBe(memory);expect(b.stats().created).toBe(4);expect(b.stats().contributions).toBe(1);
  stage(a,3,{offset:17.3,birth:128000/48000,mode:1});expect(a.memory).toBe(memory);a.bind(0,3,99);a.command(7,0,99,3,0,[0,0,0,0,0,0]);expect(a.stats().contributions).toBe(0);expect(b.stats().contributions).toBe(1);
 }finally{a.dispose();b.dispose();}
});

it('preserves the authored main-thread observation independently from a later render receipt clock',()=>{
 const a=new Live(lm,{sampleRate:48000});try{stage(a,2);a.bind(0,2,1);a.sync(1280);a.command(0,2,0,0,.3,[.2,0,.8,0,.3,0],0);expect(a.stats()).toMatchObject({frame:1280,observedFrame:0});a.command(0,2,0,128/48000,.3,[.3,0,.8,0,.3,0],128);const before=a.stats();expect(()=>a.command(0,2,0,.1,.3,[.4,0,.8,0,.3,0],0)).toThrow();expect(a.stats().observedFrame).toBe(128);expect(a.stats().frame).toBe(before.frame);expect(()=>a.command(0,2,0,.1,.3,[.4,0,.8,0,.3,0],37)).toThrow();}finally{a.dispose();}
});

it('switches an existing sine to its first offthread-prepared walk with exact accepted finite PCM/control at six rates',()=>{
 for(const rate of[8000,44100,48000,88200,96000,192000]){
  const offset=1e6,birth=2048/rate,shape=[.2,0,.8,0,.3],a=new Live(lm,{sampleRate:rate,offset}),p=new Planner(pm,{seed:6207,period:73,offset});
  const layers=Array.from({length:6},(_,i)=>i===2?{birth:0,mode:0,period:73,shape}:{}),commands=[{op:'wander',observedFrame:0,target:2,at:0,tau:.4,args:[0,73,.2,0,0,0]},{op:'wander',observedFrame:2048,target:2,at:birth,tau:.4,args:[1,101,.2,0,0,0]}],b=new OwnedAmbienceSpatial(fm,ambienceSpatialSpec(rate,{offset,layers,contributors:[{slot:0,layer:2,owner:1}],commands}));
  try{stage(a,2,{rate,offset});a.bind(0,2,1);a.command(1,2,0,0,.4,[0,73,.2,0,0,0]);const packet=p.first(101);a.beginWalk(2,packet,{periodBefore:73});a.walkChunk(2,0,packet.points);a.sealWalk(2);
   for(let q=0;q<40;q++){if(q===16){const n=a.activateWalk(2,{birth,period:101,depth:.2,observedFrame:2048});p.commit(packet.id,n,birth);}for(const c of[a,b]){c.input[0][0].fill(.01);c.input[0][1].fill(.02);c.render({sourceAudio:1,layerAudio:4,layerParameters:4,filterAudio:64,filterParameters:64,bed:0});}expect(a.output[2]).toEqual(b.output[2]);expect(a.controls[2]).toEqual(b.controls[2]);}
  }finally{a.dispose();b.dispose();p.dispose();}
 }
});
it('refuses first-walk activation before consuming its staging or changing active sine state when settings lanes are full',()=>{
 const a=new Live(lm,{sampleRate:48000}),p=new Planner(pm,{seed:6207,period:73,offset:0});try{stage(a,2);const packet=p.first(101);a.beginWalk(2,packet,{periodBefore:73});a.walkChunk(2,0,packet.points);a.sealWalk(2);let accepted=0;for(;accepted<300;accepted++){try{a.command(1,2,0,1000+accepted,0,[0,73,.2,0,0,0],0);}catch{break;}}expect(accepted).toBeLessThan(256);const count=a.e.ambience_spatial_live_walk_count(a.walk[2],0),before=a.e.ambience_spatial_stat(a.handle,25);expect(()=>a.activateWalk(2,{birth:0,period:101,depth:.2,observedFrame:0})).toThrow('admission');expect(a.e.ambience_spatial_live_walk_count(a.walk[2],0)).toBe(count);expect(a.e.ambience_spatial_stat(a.handle,25)).toBe(before);expect(a.e.ambience_spatial_stat(a.handle,27)).toBe(0);expect(p.stats().randomDraws).toBe(0);}finally{a.dispose();p.dispose();}
});

it('keeps a dedicated monotonic authored clock across same-frame calls and nonzero-origin lease resets',()=>{
 const a=new Live(lm,{sampleRate:48000,originFrame:128000});try{stage(a,2,{birth:128000/48000});a.sync(129280);const args=[.2,0,.8,0,.3,0];a.command(0,2,0,128000/48000,.3,args,128000);a.command(0,2,0,128000/48000,.3,args,128000);expect(a.stats()).toMatchObject({frame:129280,observedFrame:128000});expect(()=>a.command(0,2,0,128000/48000,.3,args,127872)).toThrow();expect(a.stats().observedFrame).toBe(128000);a.begin(256000,0);expect(a.stats()).toMatchObject({frame:256000,observedFrame:256000,created:0});stage(a,2,{birth:256000/48000});expect(()=>a.command(0,2,0,256000/48000,.3,args,128000)).toThrow();a.command(0,2,0,256000/48000,.3,args,256000);expect(a.stats().observedFrame).toBe(256000);}finally{a.dispose();}
});

it('echoes actual stored knot fields after incoming transfer scratch is cleared',()=>{
 const a=new Live(lm,{sampleRate:48000}),p=new Planner(pm,{seed:6207,period:73,offset:0});try{const packet=p.first(73),expected=packet.points.slice();a.beginWalk(2,packet,{periodBefore:73});a.walkChunk(2,0,packet.points);a.walkScratch[2].fill(0);expect(a.e.ambience_spatial_live_walk_read(a.walk[2],0,packet.maxCount)).toBe(1);expect(a.walkScratch[2].slice(0,expected.length)).toEqual(expected);a.walkScratch[2].fill(0);expect(a.e.ambience_spatial_live_walk_read(a.walk[2],packet.maxCount,1)).toBe(0);expect(a.walkScratch[2].every(x=>x===0)).toBe(true);}finally{a.dispose();p.dispose();}
});
