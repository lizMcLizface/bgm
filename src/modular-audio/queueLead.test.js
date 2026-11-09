// @vitest-environment node
import {it,expect} from 'vitest';
import {contiguousLeadFrames,QueueLead} from './queueLead';
import {summarizeQueueLead} from './queueLeadSummary';
import {AlignedSourcePool} from './poolProtocol';
it('inspects unsorted, overlapping and partially consumed packets without counting beyond gaps or mutating slots',()=>{
  const slots=[{frame:512,n:256},{frame:0,n:256},{frame:128,n:384},null],before=structuredClone(slots);
  expect(contiguousLeadFrames(slots,128,1024)).toBe(640);expect(slots).toEqual(before);
  slots[2]=null;expect(contiguousLeadFrames(slots,128,1024)).toBe(128);
  expect(contiguousLeadFrames(slots,256,1024)).toBe(0);expect(contiguousLeadFrames(slots,800,1024)).toBe(0);
  expect(contiguousLeadFrames(before,128,512)).toBe(512);
});
it('separates finite terminal drain from steady lead and measures the actual final partial quantum',()=>{
  const q=new QueueLead(512,256);expect(q.snapshot()).toMatchObject({observations:0,steady:{minFrames:null,maxFrames:null}});
  q.observe(131,128,131,0);q.observe(3,3,3,128);q.observe(0,0,0,131);
  expect(q.snapshot()).toMatchObject({observations:2,steady:{samples:0,minFrames:null},drain:{samples:2,minFrames:3,belowQuantumQuanta:0,minNeededFrames:3,maxNeededFrames:128}});
});
it('bounds histograms and reports exact minima with percentile ranges, excluding terminal drain',()=>{
  const a=new QueueLead(512,256);a.observe(512,128,1024,0);a.observe(129,128,896,128);a.observe(0,128,768,256);a.observe(3,3,3,1021);
  expect(a.snapshot().steady).toMatchObject({samples:3,minFrames:0,zeroLeadQuanta:1,belowQuantumQuanta:1,belowBlockQuanta:2,firstZeroSourceFrame:256,histogram:[1,1,0,0,1]});
  const b=new QueueLead(512,256);b.observe(256,128,512,0);b.observe(1,1,1,511);
  expect(summarizeQueueLead([a.snapshot(),b.snapshot(),undefined],96000)).toMatchObject({observedRuns:2,samples:4,minFrames:0,p05LowerFrames:0,p05UpperFrames:127,drainSamples:2,belowQuantumQuanta:1,drainBelowQuantumQuanta:0});
  expect(summarizeQueueLead([b.snapshot()],48000)).toMatchObject({minFrames:256,p05LowerFrames:256,p05UpperFrames:383});
  expect(summarizeQueueLead([new QueueLead(512,256).snapshot()],48000)).toMatchObject({observedRuns:0,minFrames:null});
  const drain=new QueueLead(512,256);drain.observe(3,3,3,0);expect(summarizeQueueLead([drain.snapshot()],48000)).toMatchObject({observedRuns:1,samples:0,minFrames:null});
  expect(()=>summarizeQueueLead([a.snapshot(),new QueueLead(256,256).snapshot()],48000)).not.toThrow();
  const other=new QueueLead(256,256);other.observe(256,128,512,0);expect(()=>summarizeQueueLead([a.snapshot(),other.snapshot()],48000)).toThrow();
  expect(new QueueLead(16384,2048).snapshot().steady.histogram).toHaveLength(129);expect(()=>new QueueLead(16385,2048)).toThrow();
});
it('predicts coherent starvation even with future packets, then recovers at the current frame without replay',()=>{
  const pool=new AlignedSourcePool({blockFrames:256,poolBlocks:2},2048,[[1,5],[2,3],[4,6]],()=>{});
  const packet=(slot,frame)=>{const buffer=new ArrayBuffer(256*16*4);new Float32Array(buffer).fill(.25);return {slot,frame,n:256,generation:1,buffer};};
  pool.accept(0,packet(0,0));pool.accept(1,packet(0,256));pool.accept(2,packet(0,0));
  const inputs=Array.from({length:7},()=>new Float32Array(256));const before=pool.queues.map(q=>q.count);
  expect(pool.observeLead(128)).toBe(0);expect(pool.frame).toBe(0);expect(pool.queues.map(q=>q.count)).toEqual(before);
  pool.fill(inputs,128);expect(inputs.every(b=>b.every(x=>x===0))).toBe(true);
  pool.accept(1,packet(1,0));expect(pool.observeLead(128)).toBe(128);pool.fill(inputs,128);expect(inputs.every(b=>b.every(x=>x===.25))).toBe(true);
  const s=pool.stats();expect(s).toMatchObject({deliveredFrames:128,underrunFrames:128,underrunQuanta:1,recoveries:1,lead:{steady:{minFrames:0,belowQuantumQuanta:1}}});
  for(const q of [s,...s.groups])expect(q.lead.steady.belowQuantumQuanta+q.lead.drain.belowQuantumQuanta).toBe(q.underrunQuanta);
});
