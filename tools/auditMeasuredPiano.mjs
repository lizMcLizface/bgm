import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {renderPiano} from '../src/app/engine/piano.js';
import {createRustPiano} from '../src/app/engine/rustPiano.js';
import {MEASURED_TYPES,checkPianoTables} from './buildPianoTables.mjs';
checkPianoTables();
const manifest=JSON.parse(fs.readFileSync('public/piano-preparation/build.json')),r=createRustPiano(new WebAssembly.Module(fs.readFileSync('public/piano-preparation/piano.wasm'))),trials=[];
const hash=a=>crypto.createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const quick=process.argv.includes('--quick');
try{
 for(const type of MEASURED_TYPES)for(const sampleRate of quick?[48000]:[8000,24000,44100,48000,96000,192000])for(const frequency of quick?[220]:[27.5,220,1046.5])for(const controls of quick?[{decay:.7,velocity:4/7,unison:.65,seed:4294967295}]:[{decay:.7,velocity:4/7,unison:.65,seed:4294967295},{decay:3,velocity:0,unison:0,seed:0}]){
  const options={type,...controls},js=renderPiano(sampleRate,frequency,options),rust=r.renderNote(sampleRate,frequency,options);assert.equal(rust.length,js.length);let max=0,error=0,energy=0,first=null;
  for(let i=0;i<js.length;i++){assert.ok(Number.isFinite(rust[i]));const d=rust[i]-js[i];if(d&&first===null)first=i;max=Math.max(max,Math.abs(d));error+=d*d;energy+=js[i]*js[i];}
  const result={type,sampleRate,frequency,options,frames:js.length,maxAbsoluteError:max,relativeRmsError:Math.sqrt(error/energy),bitExact:first===null,firstDifferentFrame:first,referenceSha256:hash(js),rustSha256:hash(rust)};trials.push(result);console.log(JSON.stringify({...result,referenceSha256:undefined,rustSha256:undefined}));assert.ok(max<=1e-6,`${type}: PCM difference ${max}`);assert.equal(r.activeHandles,0);
 }
 const report={kind:'piano.measured-rust-preparation-compatibility',version:1,engineVersion:manifest.version,wasmSha256:manifest.wasm,scope:'Actual eight measured tables, interpolation, hammer curves, tidy rules, modal/noise DSP and anchor normalization, before the native/owned voice chain. No physical listening claim.',pass:true,comparisons:trials.length,bitExact:trials.filter(t=>t.bitExact).length,maxAbsoluteError:Math.max(...trials.map(t=>t.maxAbsoluteError)),trials};
 fs.writeFileSync(`reports/modular_audio/piano-measured-${quick?'quick':'rust-compatibility'}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,trials:undefined}));
}finally{r.dispose();}
