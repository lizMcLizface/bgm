import fs from 'node:fs';
import vm from 'node:vm';
import {createOutputMonitor} from './outputMonitor';

let nodes;
beforeEach(()=>{vi.useFakeTimers();nodes=[];vi.stubGlobal('AudioWorkletNode',class{constructor(){this.port={postMessage:vi.fn(),close:vi.fn()};this.disconnect=vi.fn();nodes.push(this);}});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('routes concurrent replies by ID, supports cancellation and expires silent clients without overwriting callbacks',async()=>{
 const context={audioWorklet:{addModule:vi.fn(async()=>{})}},level=vi.fn(),monitor=await createOutputMonitor(context,level),a=vi.fn(),b=vi.fn(),old=vi.fn();
 monitor.requestStereoScope(8192,a,'scope');monitor.requestStereoScope(16384,b,'spectrum');monitor.requestScope(100,old);const messages=nodes[0].port.postMessage.mock.calls.map(([m])=>m);
 expect(messages.map(m=>m.n)).toEqual([8192,16384,100]);nodes[0].port.onmessage({data:{type:'scope',id:messages[1].id,right:new Float32Array([.4])}});expect(b).toHaveBeenCalledOnce();expect(a).not.toHaveBeenCalled();
 nodes[0].port.onmessage({data:{type:'scope',id:messages[0].id}});expect(a).toHaveBeenCalledOnce();const cancel=monitor.requestStereoScope(1,a,'scope'),cancelled=nodes[0].port.postMessage.mock.lastCall[0].id;cancel();nodes[0].port.onmessage({data:{type:'scope',id:cancelled}});expect(a).toHaveBeenCalledOnce();
 monitor.requestStereoScope(1,b,'spectrum');await vi.advanceTimersByTimeAsync(501);expect(b).toHaveBeenLastCalledWith(null);expect(old).not.toHaveBeenCalled();nodes[0].port.onmessage({data:{type:'level',peak:.2}});expect(level).toHaveBeenCalledWith(.2);
 monitor.dispose();monitor.dispose();expect(nodes[0].disconnect).toHaveBeenCalledOnce();expect(nodes[0].port.close).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
it('bounds pending captures, replaces a consumer request and shares registration per AudioContext',async()=>{
 const context={audioWorklet:{addModule:vi.fn(async()=>{})}},m=await createOutputMonitor(context),other=await createOutputMonitor(context),cb=vi.fn();expect(context.audioWorklet.addModule).toHaveBeenCalledOnce();
 m.requestStereoScope(100000,cb,'same');m.requestStereoScope(7,cb,'same');expect(nodes[0].port.postMessage.mock.calls[0][0].n).toBe(65536);nodes[0].port.onmessage({data:{type:'scope',id:1}});expect(cb).not.toHaveBeenCalled();
 for(let i=0;i<7;i++)m.requestStereoScope(1,cb,'client'+i);const rejected=vi.fn();m.requestStereoScope(1,rejected,'overflow');await vi.runAllTicks();expect(rejected).toHaveBeenCalledWith(null);expect(nodes[0].port.postMessage).toHaveBeenCalledTimes(9);
 const late=nodes[0].port.onmessage;m.dispose();late({data:{type:'scope',id:2}});expect(cb).not.toHaveBeenCalled();m.requestStereoScope(1,cb);expect(nodes[0].port.postMessage).toHaveBeenCalledTimes(9);other.dispose();expect(vi.getTimerCount()).toBe(0);
});
it('passes audio exactly, retains stereo history through wraparound and adapts old mono requests explicitly',()=>{
 for(const rate of [44100,48000,96000]){
  let Processor;const replies=[];vm.runInNewContext(fs.readFileSync('public/synths/output-scope.js','utf8'),{Float32Array,Math,sampleRate:rate,AudioWorkletProcessor:class{constructor(){this.port={postMessage:data=>replies.push(data)};}},registerProcessor:(_name,implementation)=>Processor=implementation});
  const processor=new Processor(),left=[],right=[];
  for(let block=0;left.length<67000;block++){const size=[64,128,256][block%3],l=Float32Array.from({length:size},(_,i)=>Math.sin((left.length+i)*.03)*.4),r=Float32Array.from(l,v=>-v),out=[new Float32Array(size),new Float32Array(size)];processor.process([[l,r]],[out]);expect(out[0]).toEqual(l);expect(out[1]).toEqual(r);left.push(...l);right.push(...r);}
  processor.port.onmessage({data:{type:'scope',id:22,n:70000,stereo:true}});const stereo=replies.at(-1);expect(stereo.id).toBe(22);expect(stereo.rate).toBe(rate);expect([...stereo.left]).toEqual(left.slice(-65536));expect([...stereo.right]).toEqual(right.slice(-65536));
  processor.port.onmessage({data:{type:'scope',id:23,n:100}});expect([...replies.at(-1).samples]).toEqual(Array(100).fill(0));
  const mono=Float32Array.from([.2,.1,0]),out=[new Float32Array(3),new Float32Array(3)];processor.process([[mono]],[out]);expect(out[1]).toEqual(mono);processor.process([[]],[out]);expect([...out[0]]).toEqual([0,0,0]);expect([...out[1]]).toEqual([0,0,0]);
 }
});
