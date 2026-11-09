// @vitest-environment node
import fs from 'node:fs';
import {it,expect,vi} from 'vitest';
import {verifyPool} from './poolVerification';
import {verifyWorker} from './workerVerification';
import {profileOptions} from './bufferProfiles';
import {BrowserThreadWorker,MessageChannel} from '../../tools/workerNodeAdapter.mjs';
vi.stubGlobal('MessageChannel',MessageChannel);
const assets={fixture:JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json')),contracts:JSON.parse(fs.readFileSync('public/modular-audio/contracts.json')),modules:{graph:new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm'))}};
it.each(['medium','short'])('preserves the full 48 kHz score and three-rate controls with %s buffering',async profile=>{for(const rate of [44100,48000,96000]){const r=await verifyPool(assets,rate,{seconds:rate===48000?17.5:1.01,options:profileOptions(profile),makeWorker:()=>new BrowserThreadWorker()});expect(r.pass).toBe(true);expect(r.sameCadenceMaxAbs).toBe(0);expect(r.referenceBlockFrames).toBe(1024);expect(r.workers.reduce((n,w)=>n+w.graph.applied,0)).toBe(r.serial.applied);}},180000);
it('retains exact same-cadence single-worker rendering with the short profile',async()=>{const r=await verifyWorker(assets,48000,{options:profileOptions('short'),makeWorker:()=>new BrowserThreadWorker()});expect(r.pass).toBe(true);expect(r.sameCadenceMaxAbs).toBe(0);expect(r.options.delayFrames).toBe(1024);},120000);
it('keeps independent profile instances and generations isolated',async()=>{const rows=await Promise.all(['medium','short'].map((profile,i)=>verifyPool(assets,48000,{generation:31+i,seconds:1.01,options:profileOptions(profile),makeWorker:()=>new BrowserThreadWorker()})));expect(rows.every(r=>r.pass)).toBe(true);expect(rows.map(r=>r.workers[0].generation)).toEqual([31,32]);},30000);
