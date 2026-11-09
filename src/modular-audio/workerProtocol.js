// Fixed-size transferable pool. This is not shared Wasm memory or a worker pool.
import {contiguousLeadFrames,QueueLead} from './queueLead.js';
export const BUS_COUNT = 8;
export function workerScheduling(value='timer'){if(!['timer','message'].includes(value))throw Error('Invalid worker scheduling');return value;}
export function workerOptions(raw = {}) {
  const o = {blockFrames:1024, poolBlocks:4, generation:1, scheduling:'timer', ...raw};
  workerScheduling(o.scheduling);
  if (![256,512,1024,2048].includes(o.blockFrames) || !Number.isInteger(o.poolBlocks) || o.poolBlocks < 2 || o.poolBlocks > 8 || !Number.isInteger(o.generation) || o.generation < 1 || o.generation > 0xffffffff) throw Error('Invalid worker bounds');
  o.delayFrames = o.blockFrames * o.poolBlocks;
  o.bufferBytes = o.blockFrames * BUS_COUNT * 2 * 4;
  return o;
}
export function sourceViews(g,ids=null) {
  const views = Array.from({length:6}, (_,i)=>!ids||ids.includes(i+1)?g.outputs.get(i+1):null);
  views.push(g.kicks.get(6));
  if (ids?ids.some(id=>!views[id-1])||ids.includes(6)&&!views[6]:views.some(x=>!x)) throw Error('Worker requires declared source ports');
  return views;
}
export function copyGraph(g, views, pcm, frames,partial=false) {
  for (let bus=0;bus<BUS_COUNT;bus++) for (let i=0;i<frames;i++) {
    const to=(bus*frames+i)*2;
    pcm[to]=bus===7?(partial?0:g.left[i]):views[bus]?.[i*2]??0;
    pcm[to+1]=bus===7?(partial?0:g.right[i]):views[bus]?.[i*2+1]??0;
  }
}
export function graphSnapshot(g,ids=null) {
  return {graph:g.stats(), meters:g.meters(), memoryBytes:g.engine.memory.buffer.byteLength,
    roles:Array.from({length:6},(_,i)=>ids&&!ids.includes(i+1)?null:i===5?g.percussionStats(i+1):g.pitchedStats(i+1))};
}

// No waiting, sorting, DSP, or typed-view creation in consume(). Views are made
// when a transferred block arrives. Misses advance the clock and emit silence.
export class WorkerPcmQueue {
  constructor(options, endFrame, recycle) {
    this.o=workerOptions(options);
    if (!Number.isSafeInteger(endFrame+this.o.delayFrames)||endFrame<1) throw Error('Invalid worker end frame');
    this.end=endFrame; this.recycle=recycle; this.frame=0; this.count=0;this.wasMissing=false;
    this.slots=Array(this.o.poolBlocks).fill(null);
    this.lead=new QueueLead(this.o.delayFrames,this.o.blockFrames);
    this.counters={deliveredFrames:0,underrunFrames:0,underrunQuanta:0,recoveries:0,lateBlocks:0,staleGeneration:0,rejectedBlocks:0,acceptedBlocks:0,queueHighWater:0};
  }
  contiguousLead(){return contiguousLeadFrames(this.slots,this.frame,this.o.delayFrames);}
  observeLead(needed){const lead=this.contiguousLead();this.lead.observe(lead,needed,this.end-this.frame,this.frame);return lead;}
  stats(){return {...this.counters,queuedBlocks:this.count,lead:this.lead.snapshot()};}
  release(slot) {
    const b=this.slots[slot]; if(!b)return;
    this.slots[slot]=null; this.count--;
    this.recycle(b);
  }
  accept(b) {
    const o=this.o;
    if(b.generation!==o.generation){this.counters.staleGeneration++;return false;}
    if(!Number.isInteger(b.slot)||b.slot<0||b.slot>=o.poolBlocks||this.slots[b.slot]||!Number.isSafeInteger(b.frame)||b.frame<0||b.frame%o.blockFrames||!Number.isInteger(b.n)||b.n!==Math.min(o.blockFrames,this.end-b.frame)||b.n<1||b.buffer?.byteLength!==o.bufferBytes){this.counters.rejectedBlocks++;return false;}
    if(b.frame+b.n<=this.frame){this.counters.lateBlocks++;this.recycle(b);return false;}
    // Protocol sender owns one in-flight buffer per slot. Reject overlapping
    // publication even with a different slot; never replay duplicate frames.
    for(const prior of this.slots)if(prior&&prior.frame===b.frame){this.counters.rejectedBlocks++;return false;}
    b.pcm=new Float32Array(b.buffer);this.slots[b.slot]=b;this.count++;
    this.counters.acceptedBlocks++;this.counters.queueHighWater=Math.max(this.counters.queueHighWater,this.count);return true;
  }
  consume(outputs, at, frames) {
    let missing=false;
    for(let i=0;i<frames;i++,this.frame++) {
      let block=null;
      for(let s=0;s<this.slots.length;s++){
        const b=this.slots[s];
        if(b&&b.frame+b.n<=this.frame){this.release(s);continue;}
        if(b&&b.frame<=this.frame&&this.frame<b.frame+b.n)block=b;
      }
      if(!block){this.counters.underrunFrames++;missing=true;this.wasMissing=true;}
      else{this.counters.deliveredFrames++;if(this.wasMissing){this.counters.recoveries++;this.wasMissing=false;}}
      for(let bus=0;bus<outputs.length;bus++)for(let ch=0;ch<outputs[bus].length;ch++)outputs[bus][ch][at+i]=block?block.pcm[(bus*block.n+this.frame-block.frame)*2+Math.min(ch,1)]:0;
      if(block&&this.frame+1===block.frame+block.n)this.release(block.slot);
    }
    if(missing)this.counters.underrunQuanta++;
  }
  dispose(){for(let s=0;s<this.slots.length;s++)this.release(s);}
}
