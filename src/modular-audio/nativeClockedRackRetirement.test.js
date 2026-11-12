// @vitest-environment node
import fs from'node:fs';import{afterEach,it,expect,vi}from'vitest';
import{attachClockRetirementReceiver}from'./nativeClockedRackFactory.js';
import{RustNativeRackNormal}from'./nativeRackNormalRust.js';
import{stampedRackTargetDescriptors}from'./stampedRackTargetTransport.js';
const manifest=JSON.parse(fs.readFileSync('public/rack-native-normal/build.json')),host=JSON.parse(fs.readFileSync('public/rack-native-normal/host-build.json')),module=new WebAssembly.Module(fs.readFileSync('public/rack-native-normal/rack.wasm'));
function setup(){
 class Node{constructor(){this.messages=[];this.port={postMessage:data=>this.messages.push(data),close:()=>this.closed=true};this.parameters=new Map([{name:'hostDemand'},...stampedRackTargetDescriptors({ranges:[[0,3],[-.5,2000]],slots:32})].map(d=>[d.name,{setValueAtTime(){}}]));}connect(){}disconnect(){}}
 vi.stubGlobal('AudioWorkletNode',Node);
 const context={sampleRate:48000,currentTime:512/48000,state:'running',addEventListener(){},removeEventListener(){}},inner=new RustNativeRackNormal(context,{manifest,host,module},{kind:'width',hostAwake:false}),node=inner.node;
 const stage={inner,disposed:false,error:null,fail(error){this.error??=String(error);void this.dispose().catch(()=>{});},dispose(){if(this.disposal)return this.disposal;this.disposed=true;return this.disposal=inner.dispose();}};
 attachClockRetirementReceiver(stage,()=>({spec:{generation:1}}));
 return{stage,inner,node};
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('actual preserved inner facade retains a dispose fence when its expected clock failure arrives first',async()=>{
 const{stage,inner,node}=setup();stage.fail(Error('source retired'));const request=node.messages.find(m=>m.kind==='dispose').request;expect(inner.pending.has(request)).toBe(true);
 inner.receive({kind:'native-clock-retired',generation:1,error:'source retired',stats:{failureState:{operation:'native-clock-retirement'}}});
 expect(inner.pending.has(request)).toBe(true);expect(inner.clockRetirement).toEqual({generation:1,error:'source retired'});
 inner.receive({kind:'disposed',request});await stage.disposal;expect(inner.node).toBe(null);expect(inner.pending.size).toBe(0);expect(node.closed).toBe(true);expect(stage.error).toContain('source retired');
});
it('unrelated actual DSP errors still reject the pending disposal fence and release its node',async()=>{
 const{stage,inner,node}=setup(),promise=stage.dispose();const rejected=expect(promise).rejects.toThrow('unrelated DSP failure');inner.receive({kind:'error',error:'unrelated DSP failure'});await rejected;expect(inner.node).toBe(null);expect(node.closed).toBe(true);
});
it('typed retirement cannot manufacture success when an actual disposal acknowledgement is absent',async()=>{
 vi.useFakeTimers();const{stage,inner,node}=setup();stage.fail(Error('source retired'));const rejected=expect(stage.disposal).rejects.toThrow('acknowledgement timed out');inner.receive({kind:'native-clock-retired',generation:1,error:'source retired'});await vi.advanceTimersByTimeAsync(5000);await rejected;expect(inner.node).toBe(null);expect(inner.pending.size).toBe(0);expect(node.closed).toBe(true);
});
