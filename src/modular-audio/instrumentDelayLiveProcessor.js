import{PhysicalInputRouteState}from'./physicalInputRouteState.js';
import{OwnedInstrumentDelayLive}from'./ownedInstrumentDelayLive.js';
import{INSTRUMENT_DELAY_WORD_OPTIONS,InstrumentDelayWordCodec}from'./instrumentDelayLiveWords.js';
import{StampedWordReader,stampedWordDescriptors}from'./stampedWordTransport.js';
import{NativeContextClockCodec,nativeContextClockDescriptors}from'./nativeContextClockCodec.js';
const exactIdentity=(a,b)=>a&&b&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).length===3&&Object.keys(b).length===3&&Object.keys(b).every(k=>a[k]===b[k]);
export class InstrumentDelayProcessor extends AudioWorkletProcessor{
 static get parameterDescriptors(){return[{name:'terminalGate',defaultValue:0,minValue:0,maxValue:1,automationRate:'a-rate'},{name:'routeTag',defaultValue:0,minValue:0,maxValue:16777215,automationRate:'a-rate'},...nativeContextClockDescriptors(),...stampedWordDescriptors(INSTRUMENT_DELAY_WORD_OPTIONS)];}
 constructor({processorOptions:p}){
  super();this.identity=p.identity;this.mode=p.mode;this.channels=p.channels;this.outputChannels=p.mode==='ping-pong'?2:p.channels;this.origin=p.originFrame;this.endFrame=p.endFrame??null;this.pending=[];this.disposed=false;this.error=null;this.disposeRefusals=0;this.terminalGateSeen=false;this.terminalQuanta=0;this.pendingQuanta=0;this.preorigin=0;this.future=0;this.route=null;this.lastRouteAck=null;this.routeEvents=0;this.hasPulled=false;this.firstPulledFrame=null;this.reanchors=0;this.reanchorFrames=0;this.needed=new Uint16Array(11);this.reader=new StampedWordReader(INSTRUMENT_DELAY_WORD_OPTIONS);this.codec=new InstrumentDelayWordCodec();this.port.onmessage=({data})=>this.message(data);
  try{
   if(p.version!=='__DELAY_HOST_VERSION__'||!exactIdentity(p.identity,{hostVersion:p.version,kernelVersion:'__DELAY_KERNEL_VERSION__',ownerGeneration:p.identity?.ownerGeneration})||!Number.isInteger(p.identity.ownerGeneration)||p.identity.ownerGeneration<1||p.identity.ownerGeneration>4294967295||![1,2].includes(p.channels))throw Error('Instrument Delay host identity/layout differs');
   this.route=new PhysicalInputRouteState(this.channels);this.clock=new NativeContextClockCodec(p.clockSpec);this.core=new OwnedInstrumentDelayLive(new WebAssembly.Instance(p.module,{}).exports,sampleRate,{mode:p.mode,channels:p.channels,origin:p.originFrame});
   if(!Array.isArray(p.initialRows)||p.initialRows.length>128)throw Error('Instrument Delay cold command bound');let previous=this.origin;
   for(const row of p.initialRows){if(!Array.isArray(row)||row.length!==6||!Number.isSafeInteger(row[0])||row[0]%128||row[0]<previous)throw Error('Instrument Delay cold chronology differs');this.codec.encode(...row.slice(1));this.validateLane(this.codec.decode(this.codec.words));previous=row[0];}
   this.core.sync(previous);for(const row of p.initialRows)this.codec.decode(this.codec.encode(...row.slice(1))).apply(this.core,row[0]);
   this.port.postMessage({kind:'ready',identity:this.identity,stats:this.snapshot()});
  }catch(error){this.fail(error);}
 }
 validateLane(row){if(!['delay','ping-pong'].includes(this.mode)||this.mode==='delay'&&[1,2,6].includes(row.lane))throw Error('Instrument Delay row addresses absent original stage');}
 observed(){if(!this.core)return this.lastObserved??null;const lanes=this.mode==='delay'?[0,3,4,5,7,8,9,10]:Array.from({length:11},(_,i)=>i);return{frame:this.core.stat(0),scope:'Last prepared/rendered Rust delay curves, not synchronous Native intrinsic getters',lanes:lanes.map(lane=>({lane,value:this.core.curve(lane,127)}))};}
 snapshot(){return{identity:this.identity,mode:this.mode,channels:this.channels,origin:this.origin,kernel:this.core?.stats()??this.lastStats??null,observed:this.observed(),clock:this.clock?.snapshot()??null,transport:this.reader.snapshot(),pendingQuanta:this.pendingQuanta,preoriginDeferrals:this.preorigin,futureDeferrals:this.future,route:this.route?.snapshot()??null,hasPulled:this.hasPulled,firstPulledFrame:this.firstPulledFrame,reanchors:this.reanchors,reanchorFrames:this.reanchorFrames,terminalGateSeen:this.terminalGateSeen,terminalQuanta:this.terminalQuanta,disposeRefusals:this.disposeRefusals,disposed:this.disposed,error:this.error};}
 receipt(reason){if(this.disposed)return;this.lastStats=this.core?.stats()??null;this.lastObserved=this.observed();this.disposed=true;let failure;try{this.core?.dispose();}catch(error){failure=String(error);}this.core=null;this.port.postMessage({type:'disposed',identity:this.identity,version:1,released:true,clean:!failure,error:failure??null,reason,stats:this.snapshot()});}
 fail(error){if(this.disposed)return;this.error=String(error);let diagnostics;try{diagnostics=this.snapshot();}catch(issue){diagnostics={error:String(issue)};}for(const row of this.pending)this.port.postMessage({kind:'rejected',identity:this.identity,request:row.request,error:this.error});this.pending.length=0;this.port.postMessage({kind:'error',identity:this.identity,error:this.error,diagnostics});this.receipt('failure');}
 message(d){
  if(d?.kind==='dispose'){if(Object.keys(d).length!==2||!exactIdentity(d.identity,this.identity)){this.disposeRefusals=Math.min(4294967295,this.disposeRefusals+1);this.port.postMessage({kind:'dispose-refused',identity:this.identity,error:'Instrument Delay terminal request identity differs'});return;}this.receipt('dispose');return;}
  if(this.disposed)return;
  try{
   if(d?.kind==='native-clock-spec'){if(JSON.stringify(d.spec)!==JSON.stringify(this.clock.spec))throw Error('Instrument Delay clock specification differs');return;}
   if(d?.kind==='native-clock-failed'){if(d.generation!==this.clock.spec.generation)throw Error('Instrument Delay retired clock generation differs');throw Error(d.error??'Instrument Delay clock generation retired');}
   if(!exactIdentity(d?.identity,this.identity)||!Number.isInteger(d.request)||d.request<1||d.request>4294967295||this.pending.length>=16)throw Error('Instrument Delay request identity/budget differs');
   if(d.kind==='stats'&&Object.keys(d).length!==3||d.kind==='flush'&&Object.keys(d).some(k=>!['kind','identity','request','requiredSequence','requiredRouteTag','requireClock'].includes(k)))throw Error('Instrument Delay request shape differs');
   if(d.kind==='stats')this.port.postMessage({kind:'stats',identity:this.identity,request:d.request,stats:this.snapshot()});
   else if(d.kind==='flush'){if(!Number.isInteger(d.requiredSequence)||d.requiredSequence<0||d.requiredSequence>16777215||d.requireClock!==undefined&&typeof d.requireClock!=='boolean'||d.requiredRouteTag!==undefined&&(!Number.isInteger(d.requiredRouteTag)||d.requiredRouteTag<0||d.requiredRouteTag>16777215||d.requiredRouteTag===1))throw Error('Instrument Delay flush contract differs');this.pending.push({request:d.request,requiredSequence:d.requiredSequence,requiredRouteTag:d.requiredRouteTag,requireClock:d.requireClock===true,minimumCoreCalls:d.requireClock?this.core.stat(2)+1:0});this.flush();}
   else throw Error('Unknown Instrument Delay control request');
  }catch(error){this.fail(error);}
 }
 flush(){for(let i=this.pending.length-1;i>=0;i--){const p=this.pending[i];if(this.reader.sequence<p.requiredSequence||p.requireClock&&(!this.clock.calls||this.core.stat(2)<p.minimumCoreCalls)||p.requiredRouteTag!==undefined&&(this.route.tag!==p.requiredRouteTag||!this.route.realized()))continue;this.pending.splice(i,1);this.port.postMessage({kind:'flushed',identity:this.identity,request:p.request,clockReceipt:p.requireClock?{version:1,generation:this.clock.spec.generation,requiredSequence:p.requiredSequence,minimumCoreCalls:p.minimumCoreCalls,coreCalls:this.core.stat(2),clockCalls:this.clock.calls,frame:this.clock.lastFrame,routeProof:this.route.proof()}:null,stats:this.snapshot()});}}
 wait(kind){if(++this.pendingQuanta>64)throw Error('Instrument Delay isolated readiness bound');if(kind==='preorigin')this.preorigin++;if(kind==='future')this.future++;return true;}
 readDue(parameters,frame,isolated){
  const r=this.reader,saved=[r.sequence,r.count,r.lastAuthorFrame,r.deferredSequence,r.deferredWord,r.deferredQuanta],count=r.read(parameters);let future=false;const needed=this.needed;needed.fill(0);
  for(let i=0;i<count;i++){const author=r.frames[i],row=this.codec.decode(r.words,i*14);this.validateLane(row);if(author<this.origin||author>frame+8192)throw Error('Instrument Delay publication outside current epoch');if(author>frame)future=true;if(row.op!==3)needed[row.lane]++;}
  if(future){if(!isolated)throw Error('Instrument Delay future publication while active');[r.sequence,r.count,r.lastAuthorFrame,r.deferredSequence,r.deferredWord,r.deferredQuanta]=saved;this.wait('future');return false;}
  for(let lane=0;lane<11;lane++)if(needed[lane]&&!this.core.credit(lane,needed[lane],r.frames[0]))throw Error('Instrument Delay whole lane batch capacity');
  this.core.sync(frame);for(let i=0;i<count;i++)this.codec.decode(r.words,i*14).apply(this.core,r.frames[i]);if(count)this.port.postMessage({kind:'observed',identity:this.identity,sequence:r.sequence});return true;
 }
 quiesce(parameters){const gate=parameters.terminalGate;if(!(gate instanceof Float32Array)||![1,128].includes(gate.length))throw Error('Instrument Delay terminal gate shape differs');let seen=this.terminalGateSeen;for(const value of gate){if(value!==0&&value!==1||seen&&value===0)throw Error('Instrument Delay terminal gate must be one-way Boolean');if(value===1)seen=true;}this.terminalGateSeen=seen;if(seen){this.terminalQuanta++;return true;}return false;}
 process(inputs,outputs,parameters){const out=outputs[0];if(!out?.length)return!this.disposed;for(const plane of out)plane.fill(0);if(this.disposed)return false;
  try{
   if(this.quiesce(parameters))return true;
   const input=inputs[0]??[],channels=input.length;if(channels>2||channels!==0&&channels!==this.channels||out.length!==this.outputChannels||out.some(plane=>plane.length!==128))throw Error('Instrument Delay input/output layout differs');
   this.route.observe(parameters.routeTag,channels);const pulled=this.route.actualPulled,isolated=channels===0;
   const frame=this.clock.next(parameters,{allowPending:isolated});if(frame===null)return this.wait('clock');const coreFrame=this.core.stat(0);if(frame<coreFrame){if(!isolated||coreFrame-frame>8192||this.core.stat(2)!==0)throw Error('Instrument Delay clock precedes active core');return this.wait('preorigin');}if(frame>coreFrame&&pulled&&this.hasPulled&&!this.route.allowReanchor)throw Error('Instrument Delay active frontier lacks physical reconnect permit');
   if(!this.readDue(parameters,frame,isolated))return true;if(frame>coreFrame){this.reanchors++;this.reanchorFrames+=frame-coreFrame;}this.pendingQuanta=0;
   const renderedBefore=this.core.stat(5);for(let c=0;c<channels;c++)this.core.input[c].set(input[c]);this.core.render(channels,pulled);if(pulled){if(!this.hasPulled)this.firstPulledFrame=frame;this.hasPulled=true;}for(let c=0;c<this.outputChannels;c++)out[c].set(this.core.output[c]);this.route.committed(frame);if(this.route.phase!=='active'&&this.route.phase!=='off'&&this.routeEvents<32){this.routeEvents++;this.port.postMessage({kind:'route-transition',identity:this.identity,route:this.route.proof(),renderedFramesBefore:renderedBefore,renderedFramesAfter:this.core.stat(5),kernelPeak:this.core.stat(1)});}if(this.route.realized()&&this.lastRouteAck!==this.route.tag){this.lastRouteAck=this.route.tag;this.port.postMessage({kind:'route-observed',identity:this.identity,route:this.route.proof()});}this.flush();if(this.endFrame!==null&&frame+128>=this.endFrame){this.receipt('offline-end');return false;}return true;
  }catch(error){for(const plane of out)plane.fill(0);this.fail(error);return false;}
 }
}
registerProcessor('instrument-delay-__DELAY_HOST_VERSION__',InstrumentDelayProcessor);
