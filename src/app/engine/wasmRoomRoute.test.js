import {createWasmRoomRoute} from './wasmRoomRoute';
const node=()=>({connect:vi.fn(),disconnect:vi.fn(),gain:{value:1},frequency:{value:1},Q:{value:1}});
test('shared sends get their own matching role fader, tone and wander path',()=>{
 const c={createGain:node,createBiquadFilter:node},i={roomOutput:node(),roomInput:node()},follower={input:node(),output:node(),dispose:vi.fn()},owner={createFollower:vi.fn(()=>follower)},r=createWasmRoomRoute(c,i,{roleWander:owner,volume:.35,cutoff:1200});
 expect(r.gain.gain.value).toBe(.35);expect(r.tone.frequency.value).toBe(1200);expect(owner.createFollower).toHaveBeenCalledTimes(1);expect(r.wander.output.connect).toHaveBeenCalledWith(i.roomInput);r.dispose();expect(r.wander.dispose).toHaveBeenCalledTimes(1);expect(i.roomOutput.disconnect).toHaveBeenCalled();
});
test('export bass sends skip the tone stage just like its dry channel',()=>{
 const c={createGain:node,createBiquadFilter:vi.fn()},i={roomOutput:node(),roomInput:node()},r=createWasmRoomRoute(c,i,{roleWander:{createFollower:()=>({input:node(),output:node(),dispose:vi.fn()})},tone:false});expect(c.createBiquadFilter).not.toHaveBeenCalled();expect(r.tone).toBeNull();expect(i.roomOutput.connect).toHaveBeenCalledWith(r.gain);r.dispose();
});
