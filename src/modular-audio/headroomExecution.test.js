// @vitest-environment node
import fs from 'node:fs';
import {it,expect,vi} from 'vitest';
import {verifyPool} from './poolVerification';
import {profileOptions} from './bufferProfiles';
import {BrowserThreadWorker,MessageChannel} from '../../tools/workerNodeAdapter.mjs';
vi.stubGlobal('MessageChannel',MessageChannel);
const assets={fixture:JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json')),contracts:JSON.parse(fs.readFileSync('public/modular-audio/contracts.json')),modules:{graph:new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm'))}};
it.each([2,4])('keeps raw PCM, controls and clocks exact with %i extra Short blocks',async extra=>{
 for(const rate of [44100,48000,96000]){const r=await verifyPool(assets,rate,{seconds:rate===96000?17.5:1.01,options:profileOptions('short',extra),makeWorker:()=>new BrowserThreadWorker()});expect(r.pass).toBe(true);expect(r.sameCadenceMaxAbs).toBe(0);expect(r.options).toMatchObject({blockFrames:256,poolBlocks:4+extra,delayFrames:256*(4+extra)});expect(r.workers.every(w=>w.graph.frame===r.frames&&w.badRecycles===0)).toBe(true);expect(r.queue.arrivals.activeObservations).toBe(0);}
},180000);
it('owns independent larger pools without coupling generations or capacities',async()=>{const rows=await Promise.all([2,4].map((extra,i)=>verifyPool(assets,48000,{generation:61+i,seconds:1.01,options:profileOptions('short',extra),makeWorker:()=>new BrowserThreadWorker()})));expect(rows.every(r=>r.pass)).toBe(true);expect(rows.map(r=>r.workers[0].generation)).toEqual([61,62]);expect(rows.map(r=>r.options.poolBlocks)).toEqual([6,8]);},30000);
