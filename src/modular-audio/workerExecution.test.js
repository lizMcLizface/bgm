// @vitest-environment node
import fs from 'node:fs';
import {describe,it,expect,vi} from 'vitest';
import {verifyWorker} from './workerVerification';
import {BrowserThreadWorker,MessageChannel} from '../../tools/workerNodeAdapter.mjs';
vi.stubGlobal('MessageChannel',MessageChannel);
const assets={fixture:JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json')),contracts:JSON.parse(fs.readFileSync('public/modular-audio/contracts.json')),modules:{graph:new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm'))}};
describe('actual threaded Rust graph execution',()=>{
 it.each([44100,48000,96000])('matches all eight serial buses for the full score and future cancellation at %i Hz',async rate=>{const r=await verifyWorker(assets,rate,{makeWorker:()=>new BrowserThreadWorker()});expect(r.pass).toBe(true);expect(r.maxAbs).toBe(0);expect(r.frames).toBe(Math.round(rate*17.5));expect(r.worker).toMatchObject({badRecycles:0,rejectedEvents:1});},120000);
 it('runs independent workers with independent generations and state',async()=>{const rows=await Promise.all([11,12].map(generation=>verifyWorker(assets,48000,{generation,seconds:1.01,makeWorker:()=>new BrowserThreadWorker()})));expect(rows.every(r=>r.pass)).toBe(true);expect(rows.map(r=>r.worker.generation)).toEqual([11,12]);expect(rows[0].worker.graph).toEqual(rows[1].worker.graph);},30000);
});
