/** Build a separately named clock-authoritative host from the preserved Width/Ring body.
 * No authored controls, Native program audio or Rust DSP are rewritten here. */
export function nativeClockedRackProcessor(base,codec){
 const replace=(from,to)=>{if(base.split(from).length!==2)throw Error('Clocked rack source boundary changed: '+from.slice(0,80));base=base.replace(from,to);};
 replace('/*__HOST_RENDER_CLOCK__*/',codec);
 replace("{name:'hostDemand',defaultValue:0,minValue:0,maxValue:1,automationRate:'a-rate'},","{name:'hostDemand',defaultValue:0,minValue:0,maxValue:1,automationRate:'a-rate'},...nativeContextClockDescriptors(),");
 replace('this.clock=new HostRenderClock();', 'this.nativeClockSpec=p.originFrame===0?nativeContextClockSpec(sampleRate,0,1):null;this.clock=this.nativeClockSpec?new NativeContextClockCodec(this.nativeClockSpec):null;this.pendingClockQuanta=0;this.maxNativeClockLag=0;this.nativeClockLagQuanta=0;this.initialClockDeferrals=0;this.initialClockDeferredCode=null;');
 replace('renderClock:this.clock.snapshot(),','renderClock:this.clock?.snapshot()??null,nativeClockSpec:this.nativeClockSpec,pendingClockQuanta:this.pendingClockQuanta,rawFrame:this.callbackRawFrame??null,effectiveFrame:this.callbackEffectiveFrame??null,maxNativeClockLag:this.maxNativeClockLag,nativeClockLagQuanta:this.nativeClockLagQuanta,initialClockDeferrals:this.initialClockDeferrals,initialClockDeferredCode:this.initialClockDeferredCode,');
 replace('message(d){if(this.disposed)return;',`message(d){if(this.disposed)return;if(d?.kind==='native-clock-failed'){if(!this.nativeClockSpec||d.generation!==this.nativeClockSpec.generation){this.fail(Error('Native clock failure generation differs'));return;}this.error=String(Error(d.error??'Native clock generation retired'));this.recordFailure('native-clock-retirement',[],this.error);for(const pending of this.pending)this.port.postMessage({kind:'rejected',request:pending.request,error:this.error});this.pending.length=0;const stats=this.snapshot();this.release();this.port.postMessage({kind:'native-clock-retired',generation:d.generation,error:this.error,stats});return;}if(d?.kind==='native-clock-spec'){try{const candidate=new NativeContextClockCodec(d.spec);if(this.nativeClockSpec&&JSON.stringify(this.nativeClockSpec)!==JSON.stringify(d.spec))throw Error('Native clock generation/specification changed');if(!this.clock){this.nativeClockSpec=Object.freeze({...d.spec});this.clock=candidate;}this.port.postMessage({kind:'native-clock-bound',generation:d.spec.generation});}catch(error){this.fail(error);}return;}`);
 replace('process(inputs,outputs,parameters){', "awaitNativeClock(out,isolated){if(!isolated||this.pendingClockQuanta>=64)throw Error('Native clock unavailable before active rack processing');this.pendingClockQuanta++;for(const a of out)a.fill(0);return true;}process(inputs,outputs,parameters){");
 const begin=base.indexOf(' // Actual reused-context construction');
 const end=base.indexOf('this.callbackEffectiveFrame=frame;',begin);
 if(begin<0||end<begin)throw Error('Original clock block boundary changed');
 base=base.slice(0,begin)+`
 // Native inputs encode the actual context frame independently of stale globals.
 const isolated=channels===0&&allUnpulled;
 if(!this.clock)return this.awaitNativeClock(out,isolated);
 const initial=this.clock.calls===0;let frame;
 try{frame=this.clock.next(parameters,{allowPending:isolated});}catch(error){if(!initial||!isolated||!['RESIDUAL','VECTOR','CANONICAL'].includes(error.code))throw error;this.initialClockDeferrals++;this.initialClockDeferredCode=error.code;return this.awaitNativeClock(out,isolated);}
 if(frame===null)return this.awaitNativeClock(out,isolated);
 if(frame<this.originFrame){if(!initial||!isolated)throw Error('Native clock precedes active rack origin');this.clock.lastFrame=null;this.clock.calls=0;this.clock.forwardGapFrames=0;this.clock.maxCycleResidual=0;this.initialClockDeferrals++;this.initialClockDeferredCode='BEFORE_ORIGIN';return this.awaitNativeClock(out,isolated);}
 this.pendingClockQuanta=0;`+base.slice(end);
 replace('this.callbackEffectiveFrame=frame;', 'this.callbackEffectiveFrame=frame;if(frame>currentFrame){this.maxNativeClockLag=Math.max(this.maxNativeClockLag,frame-currentFrame);this.nativeClockLagQuanta++;}');
 replace("registerProcessor('native-rack-normal-__HOST_VERSION__'", "registerProcessor('native-rack-clocked-__HOST_VERSION__'");
 return base;
}

/** Mechanical outer-facade fork: only the pre-preparation program edge differs. */
export function nativeClockedRackExtraSource(base){
 const end=base.indexOf('export async function prepareNormalRackNative(');
 if(end<0)throw Error('Original rack factory boundary changed');
 base=base.slice(0,end).replace("import{prepareNativeRackNormal}from'./nativeRackNormalBrowser.js';",'');
 if(base.split('this.input.connect(this.inner.input);').length!==2)throw Error('Original program edge boundary changed');
 return '// Generated from preserved NativeRackExtraStage; program input stays isolated until preparation ACK.\n'+base.replace('export class NativeRackExtraStage','export class ClockedRackExtraStage').replace('this.input.connect(this.inner.input);','');
}
