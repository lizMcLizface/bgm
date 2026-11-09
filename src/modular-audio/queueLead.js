// Read-only queue inspection. Packets after a gap do not count as ready audio.
// At most 8 x 8 slot comparisons; no sorting, buffer recycling or allocation.
export function contiguousLeadFrames(slots,frame,capacity){
  let cursor=frame;
  for(let hop=0;hop<slots.length;hop++){
    let end=cursor;
    for(let i=0;i<slots.length;i++){const b=slots[i];if(b&&b.frame<=cursor&&b.frame+b.n>end)end=b.frame+b.n;}
    if(end===cursor)break;cursor=end;
  }
  return Math.min(capacity,Math.max(0,cursor-frame));
}
class LeadWindow {
  constructor(capacity,blockFrames){this.capacity=capacity;this.blockFrames=blockFrames;this.bins=new Uint32Array(Math.floor(capacity/128)+1);this.samples=0;this.min=Infinity;this.max=0;this.zeros=0;this.underQuantum=0;this.underBlock=0;this.firstZero=null;this.minNeeded=Infinity;this.maxNeeded=0;}
  observe(lead,needed,frame){
    this.samples++;this.min=Math.min(this.min,lead);this.max=Math.max(this.max,lead);this.minNeeded=Math.min(this.minNeeded,needed);this.maxNeeded=Math.max(this.maxNeeded,needed);
    if(lead===0){this.zeros++;if(this.firstZero===null)this.firstZero=frame;}
    if(lead<needed)this.underQuantum++;if(lead<this.blockFrames)this.underBlock++;
    this.bins[Math.floor(lead/128)]++;
  }
  snapshot(){return {samples:this.samples,minFrames:this.samples?this.min:null,maxFrames:this.samples?this.max:null,zeroLeadQuanta:this.zeros,belowQuantumQuanta:this.underQuantum,belowBlockQuanta:this.underBlock,firstZeroSourceFrame:this.firstZero,minNeededFrames:this.samples?this.minNeeded:null,maxNeededFrames:this.samples?this.maxNeeded:null,histogram:Array.from(this.bins)};}
}
export class QueueLead {
  constructor(capacity,blockFrames){
    if(!Number.isInteger(capacity)||capacity<1||capacity>16384||!Number.isInteger(blockFrames)||blockFrames<1||blockFrames>capacity)throw Error('Invalid queue-lead capacity');
    this.capacity=capacity;this.blockFrames=blockFrames;this.steady=new LeadWindow(capacity,blockFrames);this.drain=new LeadWindow(capacity,blockFrames);
  }
  observe(lead,needed,remaining,frame){
    if(needed<=0)return;
    (remaining>=this.capacity?this.steady:this.drain).observe(Math.min(this.capacity,Math.max(0,lead)),needed,frame);
  }
  snapshot(){return {scope:'Contiguous ready source frames at active-consumption quantum entry; startup delay excluded; final capacity window reported separately; not device output quality',capacityFrames:this.capacity,blockFrames:this.blockFrames,histogramBucketFrames:128,observations:this.steady.samples+this.drain.samples,steady:this.steady.snapshot(),drain:this.drain.snapshot()};}
}
