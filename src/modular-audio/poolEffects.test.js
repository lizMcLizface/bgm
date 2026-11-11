// @vitest-environment node
import fs from 'node:fs';
import {it,expect,vi} from 'vitest';
import {ReferenceGraph,savePatch,loadPatch} from './runtime';
import {verifyPool} from './poolVerification';
import {verifyWorker} from './workerVerification';
import {sixSourceDag} from './pitchedFixture';
import {poolEffectsFixture} from './poolEffectsFixture';
import {BrowserThreadWorker,MessageChannel} from '../../tools/workerNodeAdapter.mjs';
vi.stubGlobal('MessageChannel',MessageChannel);
const assets={fixture:JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json')),contracts:JSON.parse(fs.readFileSync('public/modular-audio/contracts.json')),modules:{graph:new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm'))}};
it.each([44100,48000,96000])('preserves compensated branch FX, sends, key and prebooked master events in actual one/three-worker execution at %i Hz',async rate=>{
  const patch=loadPatch(savePatch(poolEffectsFixture(assets.fixture,rate),assets.contracts),assets.contracts),g=new ReferenceGraph(new WebAssembly.Instance(assets.modules.graph,{}).exports,patch,assets.contracts,rate,512);
  const expected=Object.fromEntries([1,2,3,4,5,6].map(id=>[id,g.latency(id)]));expect(g.latency(18)).toBe(256);expect(g.edgeLatency(3)).toBeGreaterThanOrEqual(0);g.dispose();
  for(const blockFrames of [512,1024]){
    const options={blockFrames,poolBlocks:4,scheduling:'message'},pool=await verifyPool(assets,rate,{patch,seconds:1.25,options,makeWorker:()=>new BrowserThreadWorker()});
    expect(pool.pass).toBe(true);expect(pool.sameCadenceMaxAbs).toBe(0);expect(pool.sourceLatencies).toEqual(expected);expect(pool.nonFinite).toBe(0);expect(pool.queue.underrunFrames).toBe(0);expect(pool.peaksByBus.every(peak=>peak>0)).toBe(true);expect(pool.workers.every(w=>Object.entries(w.sourceLatencies).every(([id,value])=>value===expected[id]))).toBe(true);expect(pool.master.applied+pool.workers.reduce((n,w)=>n+w.graph.applied,0)).toBe(pool.serial.applied);
    const worker=await verifyWorker(assets,rate,{patch,seconds:1.25,options,makeWorker:()=>new BrowserThreadWorker()});expect(worker.pass).toBe(true);expect(worker.sameCadenceMaxAbs).toBe(0);expect(worker.worker.sourceLatencies).toEqual(expected);
  }
},60000);
it('fails closed before starting pool threads when mixed FM paths have unequal fractional latency',async()=>{
  const patch={...sixSourceDag(assets.fixture,48000),latencyCompensation:true},makeWorker=vi.fn(()=>new BrowserThreadWorker());await expect(verifyPool(assets,48000,{patch,seconds:1.25,makeWorker})).rejects.toThrow(/fractional differences/);await expect(verifyWorker(assets,48000,{patch,seconds:1.25,makeWorker})).rejects.toThrow(/fractional differences/);expect(makeWorker).not.toHaveBeenCalled();
});
it('preserves real nonzero fractional FM metadata when all joined source path differences are integers',async()=>{
  const rate=48000,patch=poolEffectsFixture(assets.fixture,rate,{equalFractionalFm:true}),g=new ReferenceGraph(new WebAssembly.Instance(assets.modules.graph,{}).exports,patch,assets.contracts,rate,512),expected=Object.fromEntries([1,2,3,4,5,6].map(id=>[id,g.latency(id)]));
  expect(expected).toEqual({1:7.5,2:7.5,3:7.5,4:7.5,5:7.5,6:0});expect(g.latency(18)).toBe(263.5);g.dispose();
  const options={blockFrames:512,poolBlocks:4,scheduling:'message'},pool=await verifyPool(assets,rate,{patch,seconds:1.25,options,makeWorker:()=>new BrowserThreadWorker()});expect(pool.pass).toBe(true);expect(pool.sourceLatencies).toEqual(expected);expect(pool.sameCadenceMaxAbs).toBe(0);
  const worker=await verifyWorker(assets,rate,{patch,seconds:1.25,options,makeWorker:()=>new BrowserThreadWorker()});expect(worker.pass).toBe(true);expect(worker.worker.sourceLatencies).toEqual(expected);
},30000);
it.each([48000,96000])('retains actual rack pitch and Shimmer in the dependent compensated pool master at %i Hz',async rate=>{
  const patch=poolEffectsFixture(assets.fixture,rate,{extendedMaster:true}),g=new ReferenceGraph(new WebAssembly.Instance(assets.modules.graph,{}).exports,patch,assets.contracts,rate,512);expect(g.latency(18)).toBe(512);g.dispose();const options={blockFrames:512,poolBlocks:4,scheduling:'message'};
  const pool=await verifyPool(assets,rate,{patch,seconds:1.25,options,makeWorker:()=>new BrowserThreadWorker()}),worker=await verifyWorker(assets,rate,{patch,seconds:1.25,options,makeWorker:()=>new BrowserThreadWorker()});expect(pool.pass&&worker.pass).toBe(true);expect(pool.sameCadenceMaxAbs).toBe(0);expect(worker.sameCadenceMaxAbs).toBe(0);expect(pool.queue.underrunFrames).toBe(0);expect(pool.peaksByBus.every(peak=>peak>0)).toBe(true);expect(pool.master.applied).toBe(5);
},30000);
