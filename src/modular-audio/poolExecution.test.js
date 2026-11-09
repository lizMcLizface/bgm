// @vitest-environment node
import fs from 'node:fs';
import {describe,it,expect,vi} from 'vitest';
import {verifyPool} from './poolVerification';
import {planSourcePool} from './poolPlan';
import {sixSourceDag} from './pitchedFixture';
import {BrowserThreadWorker,MessageChannel} from '../../tools/workerNodeAdapter.mjs';
vi.stubGlobal('MessageChannel',MessageChannel);
const assets={fixture:JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json')),contracts:JSON.parse(fs.readFileSync('public/modular-audio/contracts.json')),modules:{graph:new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm'))}};
describe('three-worker source partition with Rust master',()=>{
  it('rejects missing/duplicate sources and owners spanning workers',()=>{const p=sixSourceDag(assets.fixture,48000);expect(()=>planSourcePool(p,assets.contracts,[[1,2],[3,4],[5,5]])).toThrow();for(const e of p.events)if(e.target===2)e.owner=1;expect(()=>planSourcePool(p,assets.contracts)).toThrow('Cross-worker');});
  it.each([44100,48000,96000])('matches every original source/key/master sample with actual workers at %i Hz',async rate=>{const r=await verifyPool(assets,rate,{makeWorker:()=>new BrowserThreadWorker()});expect(r.pass).toBe(true);expect(r.maxAbs).toBe(0);expect(r.workers.every(w=>w.frame===r.frames&&w.badRecycles===0)).toBe(true);expect(r.queue.underrunFrames).toBe(0);expect(r.workers.reduce((sum,w)=>sum+w.graph.applied,0)+r.master.applied).toBe(r.serial.applied);},180000);
  it('owns two independent complete pools/generations',async()=>{const rows=await Promise.all([21,22].map(generation=>verifyPool(assets,48000,{generation,seconds:1.01,makeWorker:()=>new BrowserThreadWorker()})));expect(rows.every(r=>r.pass)).toBe(true);expect(rows.map(r=>r.workers[0].generation)).toEqual([21,22]);},30000);
});
