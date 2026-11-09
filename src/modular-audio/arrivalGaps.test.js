// @vitest-environment node
import {it,expect} from 'vitest';
import {ArrivalGaps} from './arrivalGaps';
import {WorkerPcmQueue} from './workerProtocol';
import {AlignedSourcePool} from './poolProtocol';
const packet=(slot,frame,generation=1)=>({slot,frame,n:256,generation,buffer:new ArrayBuffer(256*16*4)});
it('does not invent quantum observations from priming or consumer-paced publications',()=>{const a=new ArrivalGaps(1024,10000);a.arrive(0,0,256,false);a.arrive(1024,256,256,true);expect(a.snapshot()).toMatchObject({activeObservations:0,primingArrivals:2,measuredArrivals:0,expiredPublications:1,steady:{maxGapFrames:null,maxConsumedSinceArrivalFrames:null}});});
it('measures completed callback gaps and open consumption spans without requiring a clock',()=>{
  const a=new ArrivalGaps(1024,10000);for(let i=0;i<4;i++)a.arrive(0,i*256,256,false);
  for(let frame=0;frame<1152;frame+=128)a.observe(frame,128,10000-frame,Math.max(0,1024-frame));
  a.arrive(1152,1024,256,false);a.arrive(1152,1280,256,false);
  const s=a.snapshot();expect(s).toMatchObject({publicationCallbacks:6,primingArrivals:4,measuredArrivals:2,steady:{positiveGaps:1,sameFrameArrivals:1,maxGapFrames:1152,totalGapFrames:1152,consumptionQuanta:9,maxConsumedSinceArrivalFrames:1152,overCapacityQuanta:1}});
  expect(s.steady.histogram[9]).toBe(1);expect(s.trace).toEqual(expect.arrayContaining([expect.objectContaining({kind:'insufficient-lead-start',sourceFrame:1024,spanFrames:1152,readyLeadFrames:0}),expect.objectContaining({kind:'new-arrival-gap-maximum',sourceFrame:1152,spanFrames:1152})]));
});
it('separates final drain, includes expired traffic, bounds overflow histograms and trace storage',()=>{
  const a=new ArrivalGaps(512,100000);a.observe(0,128,100000,0);a.arrive(128,0,256,false);expect(a.snapshot().unpairedArrivals).toBe(1);
  for(let i=1;i<50;i++){const frame=i*384;a.observe(frame,128,100000-frame,512);a.arrive(frame,0,256,true);a.observe(frame+128,128,100000-frame-128,0);}
  a.arrive(40000,0,256,true);a.observe(99997,3,3,3);a.arrive(100000,0,256,true);
  const s=a.snapshot();expect(s.steady.histogram).toHaveLength(129);expect(s.steady.histogram[128]).toBe(1);expect(s.drain).toMatchObject({consumptionQuanta:1,maxConsumedSinceArrivalFrames:60000,overCapacityQuanta:1});expect(s.trace).toHaveLength(32);expect(s.traceDropped).toBeGreaterThan(0);expect(s.expiredPublications).toBe(51);expect(s.measuredArrivals).toBe(s.unpairedArrivals+s.steady.positiveGaps+s.steady.sameFrameArrivals+s.drain.positiveGaps+s.drain.sameFrameArrivals);
});
it('counts valid publications only and leaves queue consumption, late disposal and generation guards intact',()=>{
  const recycled=[],q=new WorkerPcmQueue({blockFrames:256,poolBlocks:4},4096,b=>recycled.push(b));q.accept(packet(0,0));q.accept(packet(1,0));q.accept(packet(1,256,2));q.accept({...packet(1,256),buffer:new ArrayBuffer(4)});
  const output=Array.from({length:8},()=>[new Float32Array(128),new Float32Array(128)]);for(let i=0;i<3;i++){q.observeLead(128);q.consume(output,0,128);}q.accept(packet(0,0));
  expect(q.frame).toBe(384);expect(recycled).toHaveLength(2);expect(q.stats()).toMatchObject({lateBlocks:1,rejectedBlocks:2,staleGeneration:1,underrunFrames:128,arrivals:{publicationCallbacks:2,primingArrivals:1,measuredArrivals:1,expiredPublications:1,activeObservations:3,steady:{maxGapFrames:384}}});
});
it('distinguishes any-group arrivals from a missing group and keeps coherent program/key silence',()=>{
  const p=new AlignedSourcePool({blockFrames:256,poolBlocks:2},4096,[[1,5],[2,3],[4,6]],()=>{}),inputs=Array.from({length:7},()=>new Float32Array(256));
  for(let g=0;g<3;g++)p.accept(g,packet(0,0));for(let i=0;i<3;i++){p.observeLead(128);p.fill(inputs,128);if(i<2)p.accept(0,packet(1-i,(i+1)*256));}
  const s=p.stats();expect(inputs.every(b=>b.every(x=>x===0))).toBe(true);expect(s.arrivals.steady.maxGapFrames).toBe(128);expect(s.groups[1].arrivals.steady.maxConsumedSinceArrivalFrames).toBe(384);expect(s.groups[1].arrivals.measuredArrivals).toBe(0);expect(s.arrivals.publicationCallbacks).toBe(s.groups.reduce((n,g)=>n+g.arrivals.publicationCallbacks,0));
});
