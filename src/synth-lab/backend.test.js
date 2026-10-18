// @vitest-environment node
import {vi} from 'vitest';
import fs from 'node:fs';
vi.mock('../app/engine/Instrument',()=>({default:class {}}));
vi.mock('../nodes/noiseGenerator',()=>({noiseReady:async()=>{}}));
vi.mock('../nodes/bitcrusher',()=>({bitCrusherReady:async()=>{}}));
import {WasmBackend} from './backend';
import {initialPatch,parameterTriples} from './patch';
import {fixture,matchGains} from './bench';

test('an immediate key release executes after its scheduled attack, leaving no held voice',()=>{
 const e=new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync('public/synth-lab/core.wasm')),{}).exports;
 e.engine_init(48000);const patch=initialPatch();patch.layers[0].release=.01;
 for(const triple of parameterTriples(patch))e.engine_param(...triple);
 const node={port:{postMessage:packet=>{for(const event of packet.values??[])e.engine_event(...event);if(packet.type==='panic')e.engine_panic();}}};
 const backend=new WasmBackend({currentTime:0,sampleRate:48000},node);
 const id=backend.on(60,.8);backend.off(id);
 for(let i=0;i<400;i++)e.engine_render(128);
 expect(e.engine_stat(0)).toBe(0);
 backend.on(62,.8,3);backend.panic();for(let i=0;i<1200;i++)e.engine_render(128);
 expect(e.engine_stat(0)).toBe(0);expect(backend.starts.size).toBe(0);
});

test('editable tempo and capacity cannot create unbounded or nonfinite fixtures',()=>{
 for(const bpm of [0,NaN,Infinity,-200,1,999]){
  const score=fixture('stress',bpm,100000);
  expect(score.notes.length).toBe(128);expect(Number.isFinite(score.scoreSeconds)).toBe(true);
  expect(score.scoreSeconds).toBeGreaterThan(4);expect(score.scoreSeconds).toBeLessThan(25);
  expect(score.notes.every(n=>Number.isFinite(n.time)&&Number.isFinite(n.duration))).toBe(true);
 }
});

test('tail matching excludes the dry attack and silent references cannot mute a comparison',()=>{
 const a={metrics:{rms:.5},tail:{rms:.01}},b={metrics:{rms:.25},tail:{rms:.02}};
 expect(matchGains(a,b)).toEqual([.5,1]);expect(matchGains(a,b,{tail:true})).toEqual([1,.5]);
 expect(matchGains(a,{metrics:{rms:0},tail:{rms:0}},{tail:true})).toEqual([1,1]);
});
