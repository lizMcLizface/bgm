// @vitest-environment node
import fs from'node:fs';import{it,expect}from'vitest';import{portableTapeRetirementPlan}from'../../tools/tapePortableFixturePlan.js';import{OwnedTapeLifecycleQueue}from'./ownedTapeLifecycleQueue.js';
const module=new WebAssembly.Module(fs.readFileSync('public/tape-lifecycle-queue/lifecycle.wasm'));
it.each([8000,24000,44100,48000,96000,192000])('admits the declared review plan against actual Rust tail authority at %iHz',rate=>{
 const plan=portableTapeRetirementPlan(rate),q=new OwnedTapeLifecycleQueue(module,rate);let lfoFrames=0;
 try{
  q.enqueueRetire(plan.retireFrame,0,1);q.enqueueActivate(plan.activateFrame,2);
  for(let frame=0;frame<plan.renderEndFrame;frame+=128){
   // Conservatively keep the first input active 256 frames beyond the fixture stop.
   const active=frame<plan.sourceStopFrame+256||frame>=plan.activateFrame;
   const mask=q.begin(frame,{inputSilent:!active,inputActive:active,demand:true});
   if((mask>>6&3)!==0)lfoFrames+=128;
   q.finish(350); // Slowest tested tone; fixture tone1300 has a shorter bound.
  }
  expect(q.stats()).toMatchObject({queuedEvents:0,observedSequence:2,lastError:0,policy:{epoch:2,retirements:1,activations:1}});
  expect(lfoFrames).toBe(plan.expectedLfoFrames);
  if(rate===48000)expect(plan).toEqual({sourceStopFrame:1024,retireFrame:4096,activateFrame:8192,renderEndFrame:12288,expectedLfoFrames:8192});
 }finally{q.dispose();}
});
it('retains the failed high-rate fixed4096 counterexample before dequeue or ACK',()=>{
 const q=new OwnedTapeLifecycleQueue(module,192000);
 try{q.enqueueRetire(4096,0,1);for(let frame=0;frame<4096;frame+=128){q.begin(frame,{inputSilent:frame>=1280,inputActive:frame<1280,demand:true});q.finish(350);}
 const before=q.stats();expect(()=>q.begin(4096,{inputSilent:true,inputActive:false,demand:true})).toThrow('callback rejected');
 expect(q.stats()).toMatchObject({queuedEvents:1,observedSequence:0,policy:{epoch:1,remainingOutputs:7,retirements:0}});
 expect(q.stats().policy).toEqual(before.policy);
 }finally{q.dispose();}
});
