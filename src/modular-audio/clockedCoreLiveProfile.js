/** NEW source-clock adapter; the original Core/FM numerical/control body is retained. */
export function clockedCoreLiveSource(base){
 const replace=(a,b)=>{if(base.split(a).length!==2)throw Error('Core source adapter boundary changed: '+a.slice(0,60));base=base.replace(a,b);};
 replace("import{HostRenderClock}from'./hostRenderClock.js';","import{NativeContextClockCodec,nativeContextClockDescriptors}from'./nativeContextClockCodec.js';");
 replace('class OwnedCoreLiveProcessor extends AudioWorkletProcessor{','class ClockedCoreLiveProcessor extends AudioWorkletProcessor{\n static get parameterDescriptors(){return nativeContextClockDescriptors();}');
 replace('this.clock=new HostRenderClock();','this.clock=new NativeContextClockCodec(o.clockSpec,{allowGaps:false});this.initialClockWaits=0;');
 replace("receive(data){try{if(data.type==='dispose')", "receive(data){try{if(data?.kind==='native-clock-spec'){if(JSON.stringify(data.spec)!==JSON.stringify(this.clock.spec))throw Error('Core Native clock specification changed');this.port.postMessage({kind:'native-clock-bound',generation:data.spec.generation});return;}if(data?.kind==='native-clock-failed'){if(data.generation!==this.clock.spec.generation)throw Error('Core Native clock retirement generation differs');this.fail(Error(data.error??'Core Native clock retired'));return;}if(data.type==='dispose')");
 replace("else if(data.type==='parameters'){const at=","else if(data.type==='parameters'){if(!Number.isSafeInteger(data.frame)||data.frame<0)throw Error('Clocked source patch requires an explicit Native frame');const at=");
 replace('process(_inputs,outputs){','process(_inputs,outputs,parameters){');
 replace('const u=this.unit,frame=this.clock.next(currentFrame);',`const u=this.unit;let frame;try{frame=this.clock.next(parameters,{allowPending:this.rendered===0});}catch(error){if(this.rendered!==0||!['RESIDUAL','VECTOR','CANONICAL'].includes(error.code)||this.initialClockWaits>=64)throw error;this.initialClockWaits++;for(const p of out)p.fill(0);return true;}if(frame===null){for(const p of out)p.fill(0);return true;}if(this.rendered===0)this.port.postMessage({type:'clock-ready',frame,rawFrame:currentFrame,clock:this.clock.snapshot()});`);
 replace("registerProcessor('calmbgm-owned-core-live',OwnedCoreLiveProcessor);", "registerProcessor('calmbgm-owned-core-clocked-live',ClockedCoreLiveProcessor);");
 return '// Generated NEW Native-clock Core/FM host; accepted original source is untouched.\n'+base;
}
