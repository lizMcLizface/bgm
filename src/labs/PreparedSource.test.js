// @vitest-environment node
import {vi} from 'vitest';
const made=vi.hoisted(()=>[]);
vi.mock('../synth-lab/proceduralBackend',()=>({ProceduralBackend:{create:vi.fn(async c=>{const b={node:c.createGain(),ids:new Map(),buffers:new Map(),stats:()=>({preparedBytes:0}),prepare:vi.fn(async()=>{}),events:vi.fn(),off:vi.fn(),panic:vi.fn(),dispose:vi.fn(),patch:vi.fn(),start:vi.fn()};made.push(b);return b;})}}));
import {PreparedSource} from './PreparedSource';
const param=()=>({value:0,setTargetAtTime:vi.fn()});
function context(){const node=()=>({connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(),gain:param(),offset:param(),frequency:param(),Q:param()});return {currentTime:0,sampleRate:48000,createGain:node,createBiquadFilter:node,createConstantSource:node,createOscillator:node};}
test('live first-note preparation is serialized and a quick release cannot sound a late note',async()=>{
 const s=await PreparedSource.create(context(),{}),b=made.at(-1);let finish;b.prepare.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));const a=s.on(60,.7);await vi.waitFor(()=>expect(b.prepare).toHaveBeenCalledTimes(1));s.off(a);const second=s.on(64,.5);expect(second).not.toBe(a);expect(b.prepare).toHaveBeenCalledTimes(1);finish();await s.serial;expect(b.events).toHaveBeenCalledTimes(1);expect(b.events.mock.calls[0][0][0]).toMatchObject([0,second,240,64,.5]);s.dispose();
});
test('panic and disposal invalidate pending preparation and stop owned modulation nodes',async()=>{
 const s=await PreparedSource.create(context(),{}),b=made.at(-1);let finish;b.prepare.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));s.on(60,.7);await vi.waitFor(()=>expect(b.prepare).toHaveBeenCalledTimes(1));s.panic();finish();await s.serial;expect(b.events).not.toHaveBeenCalled();s.dispose();expect(b.dispose).toHaveBeenCalledOnce();expect(s.lfo.stop).toHaveBeenCalledOnce();expect(s.bend.stop).toHaveBeenCalledOnce();
});
test('a scheduled note that expires during preparation is dropped rather than played after its gate',async()=>{
 const c=context(),s=await PreparedSource.create(c,{}),b=made.at(-1);let finish;b.prepare.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));s.events([[0,5,0,60,.7],[1,5,4800,0,0]]);await vi.waitFor(()=>expect(b.prepare).toHaveBeenCalledTimes(1));c.currentTime=.5;finish();await s.serial;expect(b.events).toHaveBeenCalledWith([]);s.dispose();
});
