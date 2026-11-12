// @vitest-environment node
import{vi,it,expect,beforeEach}from'vitest';
const state=vi.hoisted(()=>({actors:[]}));
vi.mock('../../nodes/instrumentDelayTimingRust.js',()=>({prepareInstrumentDelayTiming:async context=>Object.assign((ac,{mode='delay'}={})=>{
 if(ac!==context)throw Error('Actual factory context differs');
 const actor={AC:ac,mode,channels:1,outputChannels:mode==='delay'?1:2,alive:vi.fn(),preflightRows:vi.fn(),commands:vi.fn(),ready:Promise.resolve(),arm:vi.fn(),getNode:vi.fn(),connect:vi.fn(),disconnect:vi.fn(),setHostAwake:vi.fn(),dispose:vi.fn(),snapshot:()=>({}),disposalStatus:()=>({})};
 state.actors.push(actor);return actor;
},{hostVersion:'test-only',kernelVersion:'test-only',backend:'test-only'})}));
import{prepareOriginalDelayTiming,originalDelayTimingOf}from'../../modular-audio/originalDelayTiming.js';
import{scheduleEffectTiming}from'./tempoEffects.js';
import defaults from'./presetDefaults.js';
beforeEach(()=>{state.actors.length=0;});
async function fixture(){
 const AC={sampleRate:48000},make=await prepareOriginalDelayTiming(AC),log=[];
 const param=name=>({cancelScheduledValues:vi.fn(t=>log.push([name,'cancel',t])),setTargetAtTime:vi.fn((v,t,tau)=>log.push([name,'target',v,t,tau]))});
 const inst={AC,preset:{...defaults,delayTime:.37,delayAmount:.2,pingPongDelayTime:.8,pingPongAmount:.2,tremoloDepth:.2,tremoloRate:3.7,autoPanDepth:.2,autoPanRate:.22,filterLfoDepth:.2,filterLfoRate:2.3},delay:make(AC,{mode:'delay'}),pingPong:make(AC,{mode:'ping-pong'}),motion:{tremoloLfo:{frequency:param('tremolo')},panLfo:{frequency:param('pan')}},filterLfo:{frequency:param('filter')}};
 state.actors.forEach((a,i)=>{a.preflightRows.mockImplementation(()=>log.push([i,'preflight']));a.commands.mockImplementation(rows=>log.push([i,'commands',rows]));});
 return{inst,log,actors:[...state.actors]};
}
it('selects only actual context-bound factory facades; public shape does not grant control authority',async()=>{
 const{inst}=await fixture();expect(originalDelayTimingOf(inst.delay,{context:inst.AC,mode:'delay'})).toBe(inst.delay.timing);
 expect(originalDelayTimingOf({...inst.delay},{context:inst.AC,mode:'delay'})).toBe(null);
 expect(()=>originalDelayTimingOf(inst.delay,{context:{},mode:'delay'})).toThrow(/context\/mode/);
 expect(()=>originalDelayTimingOf(inst.delay,{context:inst.AC,mode:'ping-pong'})).toThrow(/context\/mode/);
});
it('preflights both actors before publishing in literal parent parameter order with unchanged free preset values',async()=>{
 const{inst,log}=await fixture(),before=structuredClone(inst.preset),start=.7000000000000001;
 scheduleEffectTiming(inst,.5,start);
 expect(log.slice(0,4).map(x=>x.slice(0,2))).toEqual([[0,'preflight'],[1,'preflight'],[0,'commands'],[1,'commands']]);
 expect(log[2][2]).toEqual([{op:3,lane:0,value:0,tau:0,seconds:start},{op:2,lane:0,value:.375,tau:.025,seconds:start}]);
 expect(log[3][2]).toEqual([0,1,2].flatMap(lane=>[{op:3,lane,value:0,tau:0,seconds:start},{op:2,lane,value:.75,tau:.025,seconds:start}]));
 expect(log.slice(4)).toEqual([['tremolo','cancel',start],['tremolo','target',4,start,.025],['pan','cancel',start],['pan','target',.25,start,.025],['filter','cancel',start],['filter','target',2,start,.025]]);
 expect(inst.tempoTailReserve).toBe(true);expect(inst.tempoTimingTouched).toBe(true);expect(inst.preset).toEqual(before);
});
it('refuses later actor or Native parameter preflight without prior publication or parent flag mutation',async()=>{
 const{inst,log,actors}=await fixture();actors[1].preflightRows.mockImplementation(()=>{throw Error('capacity');});
 expect(()=>scheduleEffectTiming(inst,.5,1)).toThrow(/capacity/);expect(actors[0].commands).not.toHaveBeenCalled();expect(log.some(x=>x[1]==='target')).toBe(false);expect(inst.tempoTailReserve).toBeUndefined();expect(inst.tempoTimingTouched).toBeUndefined();
 actors[1].preflightRows.mockReset();inst.motion.panLfo.frequency={};expect(()=>scheduleEffectTiming(inst,.5,1)).toThrow(/contract/);expect(actors[0].commands).not.toHaveBeenCalled();expect(inst.tempoTailReserve).toBeUndefined();
});
it('validates later values and timestamps before mutation while retaining the original untouched early return',async()=>{
 const{inst,actors}=await fixture();scheduleEffectTiming(inst,0,NaN);expect(actors[0].preflightRows).not.toHaveBeenCalled();
 for(const start of[NaN,Infinity,-1])expect(()=>scheduleEffectTiming(inst,.5,start)).toThrow(/epoch/);
 inst.preset.autoPanRate=NaN;expect(()=>scheduleEffectTiming(inst,.5,1)).toThrow(/value/);
 expect(actors[0].commands).not.toHaveBeenCalled();expect(inst.tempoTailReserve).toBeUndefined();
});
it('skips bypassed rows until touched, then resets all bypassed targets to their free patch values',async()=>{
 const{inst,actors}=await fixture();Object.assign(inst.preset,{delayAmount:0,pingPongAmount:0,tremoloDepth:0,autoPanDepth:0,filterLfoDepth:0});
 scheduleEffectTiming(inst,.5,2);expect(actors[0].commands).not.toHaveBeenCalled();expect(actors[1].commands).not.toHaveBeenCalled();expect(inst.tempoTimingTouched).toBe(true);
 scheduleEffectTiming(inst,0,1);expect(actors[0].commands.mock.calls[0][0][1]).toMatchObject({value:.37,seconds:1});expect(actors[1].commands.mock.calls[0][0][1]).toMatchObject({value:.8,seconds:1});expect(inst.motion.panLfo.frequency.setTargetAtTime).toHaveBeenCalledWith(.22,1,.025);
});
it('allows one registered delay alongside the literal Native ping-pong parameters',async()=>{
 const{inst,log}=await fixture(),p=()=>({cancelScheduledValues:vi.fn(),setTargetAtTime:vi.fn()});inst.pingPong={leftDelay:{delayTime:p()},preDelay:{delayTime:p()},rightDelay:{delayTime:p()}};
 scheduleEffectTiming(inst,.5,1);expect(log.filter(x=>x[1]==='commands')).toHaveLength(1);for(const k of['leftDelay','preDelay','rightDelay'])expect(inst.pingPong[k].delayTime.setTargetAtTime).toHaveBeenCalledWith(.75,1,.025);
});
