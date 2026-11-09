// Source-frame distances, not wall time. Prepared storage only on hot paths.
const BUCKET=128,BINS=129,LIMIT=32,WIDTH=7;
class GapWindow {
  constructor(){this.positive=0;this.same=0;this.max=0;this.total=0;this.consumptions=0;this.maxConsumed=0;this.over=0;this.bins=new Uint32Array(BINS);}
  arrive(gap){if(!gap){this.same++;return false;}const record=gap>this.max;this.positive++;this.total+=gap;this.max=Math.max(this.max,gap);this.bins[Math.min(BINS-1,Math.floor(gap/BUCKET))]++;return record;}
  consume(span,capacity){this.consumptions++;this.maxConsumed=Math.max(this.maxConsumed,span);if(span>capacity)this.over++;}
  snapshot(){return {positiveGaps:this.positive,sameFrameArrivals:this.same,maxGapFrames:this.positive?this.max:null,totalGapFrames:this.total,histogram:Array.from(this.bins),consumptionQuanta:this.consumptions,maxConsumedSinceArrivalFrames:this.consumptions?this.maxConsumed:null,overCapacityQuanta:this.over};}
}
export class ArrivalGaps {
  constructor(capacity,end){this.capacity=capacity;this.end=end;this.last=null;this.observations=0;this.publications=0;this.priming=0;this.measured=0;this.expired=0;this.unpaired=0;this.wasShort=false;this.trace=new Float64Array(LIMIT*WIDTH);this.records=0;this.dropped=0;this.steady=new GapWindow();this.drain=new GapWindow();}
  record(kind,frame,packet,n,group,span,lead){if(this.records===LIMIT){this.dropped++;return;}const at=this.records++*WIDTH;this.trace[at]=kind;this.trace[at+1]=frame;this.trace[at+2]=packet;this.trace[at+3]=n;this.trace[at+4]=group;this.trace[at+5]=span;this.trace[at+6]=lead;}
  arrive(frame,packet,n,expired,group=-1){
    this.publications++;if(expired)this.expired++;
    if(!this.observations)this.priming++;
    else{this.measured++;if(this.last===null)this.unpaired++;else{const gap=frame-this.last,w=this.end-frame>=this.capacity?this.steady:this.drain;if(w.arrive(gap))this.record(0,frame,packet,n,group,gap,-1);}}
    this.last=frame;
  }
  observe(frame,needed,remaining,lead){
    if(needed<=0)return;this.observations++;
    const span=this.last===null?-1:frame+needed-this.last;
    if(span>=0)(remaining>=this.capacity?this.steady:this.drain).consume(span,this.capacity);
    const short=lead<needed;if(short&&!this.wasShort)this.record(1,frame,-1,needed,-1,span,lead);this.wasShort=short;
  }
  snapshot(){const trace=[];for(let i=0;i<this.records;i++){const at=i*WIDTH;trace.push({kind:this.trace[at]===0?'new-arrival-gap-maximum':'insufficient-lead-start',sourceFrame:this.trace[at+1],packetFrame:this.trace[at+2]<0?null:this.trace[at+2],frames:this.trace[at+3],group:this.trace[at+4]<0?null:this.trace[at+4],spanFrames:this.trace[at+5]<0?null:this.trace[at+5],readyLeadFrames:this.trace[at+6]<0?null:this.trace[at+6]});}return {scope:'Source frames advanced between valid publication callbacks, including expired packets; pool-level data uses any group arrival, not complete-cohort readiness. Startup excluded from measured gaps. Not wall time, CPU attribution or physical output.',capacityFrames:this.capacity,activeObservations:this.observations,publicationCallbacks:this.publications,primingArrivals:this.priming,measuredArrivals:this.measured,unpairedArrivals:this.unpaired,expiredPublications:this.expired,histogramBucketFrames:BUCKET,histogramOverflowFromFrames:(BINS-1)*BUCKET,steady:this.steady.snapshot(),drain:this.drain.snapshot(),traceLimit:LIMIT,traceDropped:this.dropped,trace};}
}
