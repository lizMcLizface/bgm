// Shared control-rate patch interpolation. No second synth instance or tail reset.
export const flattenFM=p=>[...p.globals.map(([i,v])=>[0,i,v]),...p.operators.map(([op,i,v])=>[1,op*32+i,v]),...p.routes.map(([a,b,v])=>[2,a*8+b,v]),...p.carriers.map(([i,v])=>[3,i,v])];
export const coreDiscrete=(s,i)=>s===0?[0,1,2].includes(i):[0,1,11,44,48,52,53,54,58,94].includes(i)||(i>=74&&i<=85&&(i-74)%3!==2);
export const fmDiscrete=(s,i)=>s===0?[0,1,2,4,6,13,49].includes(i)||(i>=29&&i<=40&&(i-29)%3!==2):s===1?[16,17].includes(i%32):false;
export const coreLog=(s,i)=>s===0?[9].includes(i):[9,12,17,18,20,21,22,24,25,35,45,65,66,68,72,88,96].includes(i);
export const fmLog=(s,i)=>s===0?[10,16,19,20,22,26,28,43,51].includes(i):s===1?[0,1,4,5,7,10].includes(i%32):false;
export class PatchTransition {
 constructor(values,performance,apply,onPerformance,discrete,log,rate){
  this.values=new Map(values.map(([s,i,v])=>[s+':'+i,v]));this.performance=performance;this.apply=apply;this.onPerformance=onPerformance;this.discrete=discrete;this.log=log;this.rate=rate;this.pending=[];this.active=null;this.outputGain=1;
 }
 schedule(values,performance,frame,seconds=.06){
  if(!Number.isFinite(frame)||frame<0||!Number.isFinite(seconds)||values.length>512||values.some(t=>t.length!==3||t.some(v=>!Number.isFinite(v))))throw Error('Invalid patch transition.');
  const p={values,performance,frame:Math.round(frame),seconds:seconds<=0?0:Math.max(.016,Math.min(2,seconds))};
  const at=this.pending.findIndex(x=>x.frame===p.frame);if(at>=0)this.pending[at]=p;else{if(this.pending.length>=32)throw Error('Patch queue full (32).');this.pending.push(p);this.pending.sort((a,b)=>a.frame-b.frame);}
 }
 update(frame){
  const a=this.active;if(!a)return;
  const t=Math.min(1,Math.max(0,(frame-a.start)/(a.end-a.start))),ease=t*t*(3-2*t);
  for(const r of a.rows){
   if(r.discrete){if(!a.switched&&frame>=a.mid){this.apply(r.s,r.i,r.to);this.values.set(r.key,r.to);}}
   else{const v=t===1?r.to:r.log?Math.exp(Math.log(r.from)+(Math.log(r.to)-Math.log(r.from))*ease):r.from+(r.to-r.from)*ease;this.apply(r.s,r.i,v);this.values.set(r.key,v);}
  }
  if(!a.switched&&frame>=a.mid){this.onPerformance(a.performance,frame);this.performance=a.performance;a.switched=true;}
  if(t===1)this.active=null;
 }
 tick(frame){
  const a=this.active;
  if(a&&(frame>=a.next||frame>=a.end||(!a.switched&&frame>=a.mid)||this.pending[0]?.frame<=frame)){
   this.update(frame);if(this.active)this.active.next=this.active.start+(Math.floor((frame-this.active.start)/16)+1)*16;
  }
  while(this.pending[0]?.frame<=frame){
   const p=this.pending.shift(),rows=[];
   for(const [s,i,to]of p.values){const key=s+':'+i,from=this.values.get(key)??to;if(from!==to)rows.push({s,i,key,from,to,discrete:this.discrete(s,i)||(this.discrete===fmDiscrete&&s===1&&i%32===1&&(from===0||to===0)),log:from>0&&to>0&&this.log(s,i)});}
   const perfChanged=JSON.stringify(p.performance)!==JSON.stringify(this.performance),structural=rows.some(r=>r.discrete)||p.performance?.mode!==this.performance?.mode;
   if(!rows.length&&!perfChanged)continue;
   if(p.seconds===0){for(const r of rows){this.apply(r.s,r.i,r.to);this.values.set(r.key,r.to);}if(perfChanged)this.onPerformance(p.performance,frame);this.performance=p.performance;this.active=null;}
   else{const end=frame+Math.max(2,Math.round(p.seconds*this.rate));this.active={rows,performance:p.performance,start:frame,next:frame+16,end,mid:Math.round((frame+end)/2),switched:false,structural};}
  }
 }
 span(frame,count){
  if(this.pending.length)count=Math.min(count,Math.max(1,this.pending[0].frame-frame));
  if(this.active){count=Math.min(count,Math.max(1,this.active.next-frame),this.active.end-frame);if(!this.active.switched)count=Math.min(count,Math.max(1,this.active.mid-frame));}
  return Math.max(1,count);
 }
 gain(frame){const a=this.active,target=a?.structural?Math.min(1,Math.abs(frame-a.mid)/Math.max(1,this.rate*.004)):1,step=1/Math.max(1,this.rate*.004);this.outputGain+=Math.max(-step,Math.min(step,target-this.outputGain));return this.outputGain;}
 clear(){this.pending.length=0;this.active=null;this.outputGain=1;}
}
