import {compileDeskMixer} from './mixerConfig.js';

export const MIXER_GRAPH_PARAMETER_NAMES=Object.freeze({
 strip:Object.freeze(['trim','highpass','lowpass','low','mid','high','pan','level']),
 matrix:Object.freeze(['width','pan']),fader:Object.freeze(['level']),limiter:Object.freeze(['enabled','ceiling']),
});
const safeFrame=n=>Number.isSafeInteger(n)&&n>=0;
const ownerId=n=>Number.isInteger(n)&&n>0&&n<=0xffffffff;
const label=s=>typeof s==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(s)&&!['constructor','prototype','__proto__'].includes(s);
const hashId=s=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h&0xffffff;};
const clone=v=>JSON.parse(JSON.stringify(v));

/**
 * One serializable desk graph authority, with explicit host stage boundaries.
 * Returned export IDs are taps, not extra audible sums or invented FX kernels.
 * Host-return plans need a phased host bridge; this is not a turnkey live route.
 */
export function compileMixerGraph(state,roles,options={}){
 const {sampleRate=48000,auxiliary=true,trimRoles=false,settled=false,musicStage=auxiliary?'host-return':'neutral',masterInsertStage='host-return',returns=[]}=options;
 if(!['host-return','neutral'].includes(musicStage)||!['host-return','neutral'].includes(masterInsertStage)||!Array.isArray(returns)||returns.length>16||roles?.some(id=>!label(id)))throw Error('Invalid mixer host boundary configuration');
 const returnIds=new Set();for(const r of returns){if(!label(r?.id)||returnIds.has(r.id)||!['headroom','pre-music','master'].includes(r.target)||r.target==='headroom'&&!auxiliary||r.latencyFrames!==undefined&&r.latencyFrames!==null&&!safeFrame(r.latencyFrames))throw Error('Invalid mixer external return');returnIds.add(r.id);}
 for(const key of ['musicLatencyFrames','masterInsertLatencyFrames'])if(options[key]!==undefined&&options[key]!==null&&!safeFrame(options[key]))throw Error('Invalid mixer host latency');
 const desk=compileDeskMixer(state,roles,{sampleRate,auxiliary,trimRoles,settled}),modules=[],connections=[],used=new Map(),reductions=[],currentParameters={},mapping={inputs:{roles:{},returns:{},ambience:null,musicReturn:null,masterInsertReturn:null},strips:{},matrix:0,fader:0,limiter:0,output:0,exports:{postStrip:{},headroom:null,preMusic:null,preMasterInsert:null}};
 const id=(prefix,key)=>{const n=prefix|hashId(key);if(used.has(n))throw Error(`Mixer module identity collision: ${key}`);used.set(n,key);return n;};
 const host=(key)=>{const n=id(0x10000000,key);modules.push({id:n,type:'host.audio',version:1,parameters:{}});return n;};
 const unit=(kind,key,config)=>{const n=id(0x20000000,key);modules.push({id:n,type:`desk.${kind}`,version:1,parameters:{},config:clone(config)});currentParameters[n]=config.parameters.slice();return n;};
 const edge=(from,to,port='program.in')=>connections.push({id:connections.length+1,kind:'audio',from:{module:from,port:'audio.out'},to:{module:to,port}});
 const sum=(key,inputs)=>{if(!inputs.length)throw Error('Mixer sum requires an input');let n=inputs[0];for(let i=1;i<inputs.length;i++){const next=id(0x30000000,`${key}:${i}:${inputs[i]}`);modules.push({id:next,type:'ref.mix',version:1,parameters:{gain:1}});edge(n,next,'a.in');edge(inputs[i],next,'b.in');n=next;}reductions.push({stage:key,inputs:inputs.slice(),output:n,order:'left fold in recorded input order; native Web Audio sum rounding is not asserted'});return n;};
 for(const role of roles){const input=host(`role:${role}`),strip=unit('strip',`strip:${role}`,desk.strips[role]);mapping.inputs.roles[role]=input;mapping.strips[role]=strip;mapping.exports.postStrip[role]={module:strip,port:'audio.out',position:'post desk strip/fader; actual shared bus and section-space send tap'};edge(input,strip);}
 for(const r of returns)mapping.inputs.returns[r.id]=host(`return:${r.id}`);
 const returnsAt=target=>returns.filter(r=>r.target===target).map(r=>mapping.inputs.returns[r.id]);
 let music=sum('role-group',[...roles.map(r=>mapping.strips[r]),...returnsAt('headroom')]);
 if(auxiliary){const headroom=unit('strip','strip:headroom',desk.strips.headroom);mapping.strips.headroom=headroom;mapping.exports.headroom={module:headroom,port:'audio.out'};edge(music,headroom);music=headroom;}
 // Native reverbHub is connected to Generator.output before the desk group.
 // Explicit caller return order preserves deterministic reference reduction.
 const preMusic=returnsAt('pre-music');if(preMusic.length)music=sum('pre-music',[...preMusic,music]);mapping.exports.preMusic={module:music,port:'audio.out'};
 const stages=[];
 if(musicStage==='host-return'){const input=host('music-return');mapping.inputs.musicReturn=input;stages.push({id:'music',mode:'host-return',export:clone(mapping.exports.preMusic),return:{module:input,port:'audio.out'},processing:'Generator output fade, optional sweep and arrangement levelTrim',latencyFrames:options.musicLatencyFrames??null});music=input;}else stages.push({id:'music',mode:'neutral',processing:'Caller explicitly bypasses post-group Generator stages for this reference',latencyFrames:0});
 const masterInputs=[music];
 if(auxiliary){const input=host('ambience'),strip=unit('strip','strip:ambience',desk.strips.ambience);mapping.inputs.ambience=input;mapping.strips.ambience=strip;edge(input,strip);masterInputs.push(strip);}
 masterInputs.push(...returnsAt('master'));
 const master=sum('master-input',masterInputs),matrix=unit('matrix','master-matrix',desk.matrix),fader=unit('fader','master-fader',desk.fader),limiter=unit('limiter','master-limiter',desk.limiter);mapping.matrix=matrix;mapping.fader=fader;mapping.limiter=limiter;mapping.exports.preMasterInsert={module:matrix,port:'audio.out'};edge(master,matrix);
 if(masterInsertStage==='host-return'){const input=host('master-insert-return');mapping.inputs.masterInsertReturn=input;edge(input,fader);stages.push({id:'master-insert',mode:'host-return',export:clone(mapping.exports.preMasterInsert),return:{module:input,port:'audio.out'},processing:'Actual master insert between stereo matrix/balance and master level/dim',latencyFrames:options.masterInsertLatencyFrames??null});}else{edge(matrix,fader);stages.push({id:'master-insert',mode:'neutral',processing:'Caller explicitly confirms no active master insert for this reference',latencyFrames:0});}
 edge(fader,limiter);const output=id(0x40000000,'output');mapping.output=output;modules.push({id:output,type:'ref.output',version:1,parameters:{}});edge(limiter,output);
 if(modules.length>64||connections.length>128)throw Error('Mixer graph resource bounds exceeded');
 const hostLatencies=stages.map(s=>s.latencyFrames),known=hostLatencies.every(n=>n!==null),ownedLatencyFrames=Math.ceil(sampleRate*.003);
 return {version:1,kind:'desk.mixer-graph-plan',sampleRate,roles:roles.slice(),graph:{version:1,modules,connections,events:[]},mapping,reductions,stages,returns:clone(returns),capturedState:clone(desk.capturedState),initialState:clone(desk.capturedState),currentParameters,parameterProjection:'Last scheduled state snapshot, not observed DSP values; cancellation/repatch requires a fresh projection',lastStateFrame:0,options:{sampleRate,auxiliary,trimRoles,settled,musicStage,masterInsertStage,returns:clone(returns),musicLatencyFrames:options.musicLatencyFrames??null,masterInsertLatencyFrames:options.masterInsertLatencyFrames??null},external:{...clone(desk.external),roleInputPosition:'After existing role effects/scene gain/duck/wander, before desk strip',sharedSends:{source:'mapping.exports.postStrip',busGainSmoothingSeconds:.03,sectionSpaceSmoothing:'barSeconds * .7; tempo/section owned by host',returnTarget:'headroom'},reverbHubReturnTarget:'pre-music',returnInventoryExplicit:Object.hasOwn(options,'returns'),finalLimiter:'Already rendered by graph desk.limiter; external limiter metadata describes native fallback only, never a second series limiter',requiresPhasedHostExecution:stages.some(s=>s.mode==='host-return'),automaticLatencyCompensation:false,upstreamRoleEffectsIncluded:false},latency:{ownedOutputFrames:ownedLatencyFrames,externalStageFrames:hostLatencies,totalFromPostStripIngressFrames:known?ownedLatencyFrames+hostLatencies.reduce((a,b)=>a+b,0):null,returnInputs:returns.map(r=>({id:r.id,latencyFrames:r.latencyFrames??null})),scope:'Graph-owned limiter delay plus explicitly declared host stages; upstream source/effect latency and scheduling/device buffering excluded'}};
}

/** Append a state snapshot's physical target changes to the saved graph clock. */
export function compileMixerGraphStateDiff(plan,state,{frame,owner}={}){
 if(plan?.version!==1||plan.kind!=='desk.mixer-graph-plan'||!safeFrame(frame)||frame<plan.lastStateFrame||!ownerId(owner))throw Error('Invalid mixer state diff clock/owner');
 const next=compileMixerGraph(state,plan.roles,plan.options),events=[];
 for(const n of next.graph.modules.filter(n=>n.config)){const previous=plan.currentParameters[n.id];if(!previous||previous.length!==n.config.parameters.length)throw Error('Mixer state diff changed topology');n.config.parameters.forEach((value,index)=>{if(value!==previous[index])events.push({kind:'parameter',target:n.id,owner,frame,parameter:MIXER_GRAPH_PARAMETER_NAMES[n.config.kind][index],value});});}
 if(plan.graph.events.length+events.length>4096)throw Error('Mixer graph event bounds exceeded');
 const externalUpdates=[];for(const [id,value]of Object.entries(next.external.stripEffects))if(JSON.stringify(value)!==JSON.stringify(plan.external.stripEffects[id]))externalUpdates.push({kind:'unprocessed-desk-space-settings',id,frame,owner,values:clone(value),scope:'Retained host metadata; no implicit send/effect processing'});
 return {events,externalUpdates,plan:{...plan,graph:{...plan.graph,events:[...plan.graph.events,...events]},currentParameters:clone(next.currentParameters),capturedState:clone(next.capturedState),external:{...plan.external,stripEffects:clone(next.external.stripEffects),limiter:clone(next.external.limiter)},lastStateFrame:frame}};
}
