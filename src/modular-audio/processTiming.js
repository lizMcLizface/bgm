// Optional wall-time observation only. No clock means unavailable, not zero CPU.
export class ProcessTiming {
  constructor(clock=globalThis.performance){this.clock=typeof clock?.now==='function'?clock:null;this.calls=0;this.totalMs=0;this.maxMs=0;this.overQuantumPeriod=0;this.bins=new Uint32Array(32);}
  start(){if(!this.clock)return 0;try{return this.clock.now();}catch{this.clock=null;return 0;}}
  stop(start,frames,rate){
    if(!this.clock)return;
    try{const ms=this.clock.now()-start;if(!Number.isFinite(ms)||ms<0){this.clock=null;return;}this.calls++;this.totalMs+=ms;this.maxMs=Math.max(this.maxMs,ms);if(ms>frames/rate*1000)this.overQuantumPeriod++;this.bins[Math.min(31,Math.max(0,Math.ceil(Math.log2(Math.max(1,ms*1000)))))]++;}catch{this.clock=null;}
  }
  snapshot(){return {available:!!this.clock,scope:'process() wall time including copy/DSP and preemption; not callback scheduling, CPU utilization or device underruns',reason:this.clock?null:'Monotonic performance.now() is unavailable or failed in this worklet',calls:this.clock?this.calls:null,totalMs:this.clock?this.totalMs:null,maxMs:this.clock?this.maxMs:null,overQuantumPeriod:this.clock?this.overQuantumPeriod:null,histogramLog2Us:this.clock?Array.from(this.bins):null};}
}
