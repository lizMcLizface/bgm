// @vitest-environment node
import {traceCpuProfiles,summarizeWorkletTrace} from './workletTraceSummary.mjs';
const frame=(functionName,codeType='wasm')=>({functionName,codeType,url:'',lineNumber:0});
const chunk=(pid,id,nodes,samples,timeDeltas)=>({name:'ProfileChunk',pid,id,tid:999,args:{data:{cpuProfile:{nodes,samples},timeDeltas}}});
test('trace samples belong to the original worklet, not their asynchronous emitter thread',()=>{
 const trace={traceEvents:[
  {name:'thread_name',pid:1,tid:4,args:{name:'Offline AudioWorklet thread'}},
  {name:'thread_name',pid:1,tid:999,args:{name:'Profiler helper'}},
  {name:'Profile',pid:1,tid:4,id:'1',args:{data:{startTime:100}}},
  chunk(1,'1',[{id:1,callFrame:frame('(root)','other')},{id:2,parent:1,callFrame:frame('render')}],[2],[200]),
  chunk(1,'1',[{id:3,parent:2,callFrame:frame('filter')}],[3],[300]),
  // Same profile id in another process must not merge into the worklet.
  {name:'Profile',pid:2,tid:5,id:'1',args:{data:{startTime:100}}},
  chunk(2,'1',[{id:1,callFrame:frame('main','JS')}],[1],[900]),
 ]},r=summarizeWorkletTrace(trace);
 expect(r.worklets).toHaveLength(1);expect(r.profiles).toHaveLength(2);expect(r.orphanChunks).toBe(0);
 expect(r.worklets[0].tid).toBe(4);expect(r.worklets[0].profile.endTime).toBe(600);
 expect(r.worklets[0].kinds.wasm).toBe(.5);
 expect(r.worklets[0].summary.inclusive.find(r=>r.functionName==='render').activePercent).toBe(100);
});
test('missing profile ownership is explicit, and missing sample timing is rejected',()=>{
 expect(traceCpuProfiles([chunk(1,'missing',[],[1],[1])]).orphanChunks).toBe(1);
 expect(()=>traceCpuProfiles([{name:'Profile',pid:1,id:'1',tid:1,args:{data:{startTime:0}}},chunk(1,'1',[],[1],[])])).toThrow('Incomplete');
 expect(summarizeWorkletTrace([]).worklets).toEqual([]);
});
