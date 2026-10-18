// @vitest-environment node
import fs from 'node:fs';
import {TEXTURE_SOUNDS,textureConfig,textureFixture,textureVariants} from './textureFixtures';
import {renderSpectralKernel} from './spectralEngine';
import {renderInserts} from './inserts';
import {insertsActive} from './insertsConfig';
const modules=Object.fromEntries(['core','fm','inserts'].map(name=>[name,new WebAssembly.Module(fs.readFileSync(`public/synth-lab/${name}.wasm`))]));
test('texture comparisons isolate source/insert changes and retain the same complete score',()=>{
 expect(textureConfig({sound:'invalid',rate:8})).toEqual({sound:'fm-all',rate:48000});
 for(const [sound]of TEXTURE_SOUNDS){const f=textureFixture({sound}),rows=textureVariants(f);expect(rows.length).toBe(sound.endsWith('all')?3:2);expect(f.notes.every(n=>n.time+n.duration<f.scoreSeconds)).toBe(true);expect(insertsActive(rows[0].inserts)).toBe(false);
  if(sound!=='fm-motion')expect(insertsActive(rows.at(-1).inserts)).toBe(true);
  f.seconds=.8;f.notes=f.notes.slice(0,1).map(n=>({...n,time:.02,duration:.6}));for(const row of rows){const source=renderSpectralKernel(modules[f.kind==='fm'?'fm':'core'],{...f,patch:row.patch},48000,1),out=renderInserts(modules.inserts,source,48000,row.inserts);expect(out[0].every(Number.isFinite)).toBe(true);expect(out[0].some(x=>Math.abs(x)>1e-4)).toBe(true);}
 }
});
