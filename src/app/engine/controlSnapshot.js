// Metadata only: the native AudioNodes remain the audible implementation.
// A finite owned source freezes this state once, then advances its own clock.
export class ControlClock {
 constructor(time,frequency=0,phase=0,depth=0){this.time=time;this.frequency=this.baseFrequency=Math.fround(frequency);this.phase=phase-Math.floor(phase);this.rates=[];this.active=true;this.notBefore=time;this.depthTime=time;this.initial=depth;this.target=depth;this.tau=0;}
 frequencyAt(time){let hz=this.baseFrequency;for(const p of this.rates){if(p[0]>time)break;hz=p[1];}return hz;}
 phaseAt(time){if(!this.active)return this.phase;let cycles=this.phase,at=Math.max(this.time,this.notBefore);if(time<=at)return cycles;let hz=this.frequencyAt(at);for(const p of this.rates){if(p[0]<=at)continue;if(p[0]>time)break;cycles+=(p[0]-at)*hz;at=p[0];hz=p[1];}return ((cycles+(time-at)*hz)%1+1)%1;}
 setActive(active,time,notBefore=time){this.phase=this.phaseAt(time);this.baseFrequency=this.frequencyAt(time);this.rates=this.rates.filter(p=>p[0]>time);this.time=time;this.active=active;this.notBefore=notBefore;}
 start(time){this.baseFrequency=this.frequencyAt(time);this.rates=this.rates.filter(p=>p[0]>time);this.time=time;this.phase=0;}
 rate(frequency,time,now=time){const phase=this.phaseAt(now),hz=this.frequencyAt(now);this.rates=this.rates.filter(p=>p[0]>now&&p[0]<time);this.phase=phase;this.time=now;this.baseFrequency=hz;this.frequency=Math.fround(frequency);this.rates.push([time,this.frequency]);}
 depthAt(time){return this.tau?this.target+(this.initial-this.target)*Math.exp(-Math.max(0,time-this.depthTime)/this.tau):this.target;}
 depth(value,time,tau=0){this.initial=this.depthAt(time);this.target=value;this.tau=tau;this.depthTime=time;}
 settings(){return {frequency:this.frequency,depth:this.target,tau:this.tau};}
 capture(time){if(time<this.time||time<this.depthTime)throw Error('Control capture predates the current settings');const running=this.active&&time>=this.notBefore;return {kind:'sine',phase:this.phaseAt(time),frequency:running?this.frequencyAt(time):this.frequency,initialDepth:this.depthAt(time),targetDepth:this.target,tau:this.tau,points:running?this.rates.filter(p=>p[0]>time).map(([at,hz])=>[at-time,hz]):[]};}
}
