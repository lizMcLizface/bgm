// Aggregate only matching profiles/rates. Histogram percentiles are frame ranges.
export function summarizeQueueLead(records,rate){
  const observed=records.filter(r=>r?.observations>0),first=observed[0];
  if(!first)return {observedRuns:0,samples:0,minFrames:null,minMs:null,p05LowerFrames:null,p05UpperFrames:null,p05LowerMs:null,p05UpperMs:null,reason:'No active-consumption queue-lead observations'};
  if(observed.some(r=>r.capacityFrames!==first.capacityFrames||r.histogramBucketFrames!==first.histogramBucketFrames))throw Error('Cannot combine different queue-lead profiles');
  const bins=Array(first.steady.histogram.length).fill(0);let min=Infinity,samples=0,zeros=0,belowQuantum=0,belowBlock=0,drainSamples=0,drainBelowQuantum=0;
  for(const r of observed){const s=r.steady;for(let i=0;i<bins.length;i++)bins[i]+=s.histogram[i];if(s.samples)min=Math.min(min,s.minFrames);samples+=s.samples;zeros+=s.zeroLeadQuanta;belowQuantum+=s.belowQuantumQuanta;belowBlock+=s.belowBlockQuanta;drainSamples+=r.drain.samples;drainBelowQuantum+=r.drain.belowQuantumQuanta;}
  let lower=null,upper=null,total=0;
  if(samples)for(let i=0;i<bins.length;i++){total+=bins[i];if(total>=Math.ceil(samples*.05)){lower=i*first.histogramBucketFrames;upper=Math.min(first.capacityFrames,(i+1)*first.histogramBucketFrames-1);break;}}
  return {observedRuns:observed.length,capacityFrames:first.capacityFrames,samples,minFrames:samples?min:null,minMs:samples?min/rate*1000:null,zeroLeadQuanta:zeros,belowQuantumQuanta:belowQuantum,belowBlockQuanta:belowBlock,drainSamples,drainBelowQuantumQuanta:drainBelowQuantum,p05LowerFrames:lower,p05UpperFrames:upper,p05LowerMs:lower===null?null:lower/rate*1000,p05UpperMs:upper===null?null:upper/rate*1000,histogram:bins,reason:samples?null:'Only planned terminal-drain observations'};
}
