// @vitest-environment node
import fs from'node:fs';import{it,expect}from'vitest';import{lifecycleRoomProgram,lifecycleRoomExpected}from'../../tools/roomSplitLifecycle.js';import{liveRoomAssets}from'./liveRoomComplete.fixture.js';import{liveRoomCompleteSourceInput}from'../../tools/liveRoomCompleteSource.js';
const assets={...liveRoomAssets,control:{module:new WebAssembly.Module(fs.readFileSync('public/room-control-live/control.wasm'))}};
it.each([8000,24000,44100,48000,96000,192000])('reused-context reference keeps literal absolute output seconds and one delay at%iHz',rate=>{
 const p=lifecycleRoomProgram(assets,rate,2,true),input=liveRoomCompleteSourceInput(rate,2,p.frames),epoch=130176,first=epoch+p.latencyFrames,events=[{amount:.8,drySeconds:(first+13)/rate,wetSeconds:(first+41)/rate},{amount:.5,drySeconds:first/rate+.27,wetSeconds:first/rate+.27+1/rate}],a=lifecycleRoomExpected(assets,p,input,epoch,events),b=lifecycleRoomExpected(assets,p,input,epoch,events);
 expect(a).toHaveLength(2);expect(a).toEqual(b);expect(a.every(c=>c.length===p.frames+p.latencyFrames&&c.subarray(0,p.latencyFrames).every(x=>x===0)&&c.every(Number.isFinite))).toBe(true);expect(a[0].reduce((n,x)=>Math.max(n,Math.abs(x)),0)).toBeGreaterThan(.001);
});
