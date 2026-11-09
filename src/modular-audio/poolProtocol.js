import {WorkerPcmQueue,workerOptions} from './workerProtocol.js';
import {QueueLead} from './queueLead.js';

// Coherent publication: all groups must supply the current source sample.
// Otherwise every program/key input is zero for that sample; never mix a stale
// or different-frame group with fresh sources. All queues advance together.
export class AlignedSourcePool {
  constructor(options,end,groups,recycle){
    this.o=workerOptions(options);this.groups=groups;this.frame=0;this.end=end;
    this.queues=groups.map((_,i)=>new WorkerPcmQueue(this.o,end,b=>recycle(i,b)));
    this.blocks=Array(groups.length).fill(null);this.missing=Array(groups.length).fill(false);
    this.counters={deliveredFrames:0,underrunFrames:0,underrunQuanta:0,recoveries:0};this.wasMissing=false;
    this.lead=new QueueLead(this.o.delayFrames,this.o.blockFrames);
  }
  accept(group,b){if(!Number.isInteger(group)||!this.queues[group])return false;return this.queues[group].accept(b);}
  observeLead(needed){let minimum=this.o.delayFrames;for(let g=0;g<this.queues.length;g++)minimum=Math.min(minimum,this.queues[g].observeLead(needed));this.lead.observe(minimum,needed,this.end-this.frame,this.frame);return minimum;}
  fill(inputs,n){
    let missed=false;this.missing.fill(false);
    for(let i=0;i<n;i++,this.frame++){
      let complete=true;
      for(let g=0;g<this.queues.length;g++){
        const q=this.queues[g];let block=null;
        for(let s=0;s<q.slots.length;s++){const b=q.slots[s];if(b&&b.frame+b.n<=this.frame){q.release(s);continue;}if(b&&b.frame<=this.frame&&this.frame<b.frame+b.n)block=b;}
        this.blocks[g]=block;
        if(!block){complete=false;this.missing[g]=true;q.counters.underrunFrames++;q.wasMissing=true;}
        else{q.counters.deliveredFrames++;if(q.wasMissing){q.counters.recoveries++;q.wasMissing=false;}}
      }
      if(complete){this.counters.deliveredFrames++;if(this.wasMissing){this.counters.recoveries++;this.wasMissing=false;}}
      else{this.counters.underrunFrames++;missed=true;this.wasMissing=true;}
      for(let bus=0;bus<7;bus++){inputs[bus][i*2]=0;inputs[bus][i*2+1]=0;}
      if(complete)for(let g=0;g<this.groups.length;g++){
        const b=this.blocks[g],offset=this.frame-b.frame;
        for(const id of this.groups[g])for(let ch=0;ch<2;ch++)inputs[id-1][i*2+ch]=b.pcm[((id-1)*b.n+offset)*2+ch];
        if(this.groups[g].includes(6))for(let ch=0;ch<2;ch++)inputs[6][i*2+ch]=b.pcm[(6*b.n+offset)*2+ch];
      }
      for(let g=0;g<this.queues.length;g++){const q=this.queues[g],b=this.blocks[g];q.frame=this.frame+1;if(b&&this.frame+1===b.frame+b.n)q.release(b.slot);}
    }
    if(missed)this.counters.underrunQuanta++;
    for(let g=0;g<this.queues.length;g++)if(this.missing[g])this.queues[g].counters.underrunQuanta++;
  }
  stats(){return {...this.counters,lead:this.lead.snapshot(),groups:this.queues.map(q=>q.stats())};}
  dispose(){this.queues.forEach(q=>q.dispose());}
}
