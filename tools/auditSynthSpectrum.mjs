// Bundled-kernel spectral matrix, with no audio hardware or browser dependency.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
const output=path.resolve(process.env.SYNTH_AUDIT_DIR||'.tmp/spectral-audit');
await fs.mkdir(output,{recursive:true});
const report={created:new Date().toISOString(),runtime:process.version,method:'65536-sample Blackman-Harris; +/-5-bin harmonic guards; 20 Hz..80% Nyquist. Off-harmonic is not a universal alias measure. Reference includes rate-dependent timbre and uses a low-pass/downsample. Timings are single offline runs, not live CPU.',rows:[]};
try{
 const {spectralFixture,SPECTRAL_CASES}=await server.ssrLoadModule('/src/synth-lab/spectralFixtures.js');
 const {renderSpectralKernel,referenceChannels,analyseSpectralChannels}=await server.ssrLoadModule('/src/synth-lab/spectralEngine.js');
 const modules={fm:await WebAssembly.compile(await fs.readFile('public/synth-lab/fm.wasm')),subtractive:await WebAssembly.compile(await fs.readFile('public/synth-lab/core.wasm'))};
 const cases=process.argv.includes('--edges')?SPECTRAL_CASES.filter(([id])=>['sub-saw','sub-sync','sub-pwm'].includes(id)):SPECTRAL_CASES;
 for(const hz of [220,997,3137])for(const rate of [44100,48000,96000])for(const [test]of cases){
  const fixture=spectralFixture({rate,test,hz,depth:process.argv.includes('--deep')?3:1}),module=modules[fixture.kind],start=performance.now(),reference=analyseSpectralChannels(referenceChannels(module,fixture),fixture),refMs=performance.now()-start;
  const row={config:fixture.config,fundamental:fixture.fundamental,referenceRate:rate*fixture.referenceFactor,reference:{metrics:reference.metrics,renderAndAnalysisMs:refMs},paths:[]};
  const variants=fixture.kind==='fm'?[[0,false],[1,false],[2,false]]:[[0,true],[0,false]];
  for(const [quality,legacyEdges]of variants){const before=performance.now(),channels=renderSpectralKernel(module,fixture,rate,quality,{legacyEdges}),renderMs=performance.now()-before,analysis=analyseSpectralChannels(channels,fixture,reference.spectrum);if(analysis.metrics.peak>=1||analysis.metrics.nonFinite)throw Error('Clipped or nonfinite probe '+test);row.paths.push({path:fixture.kind==='fm'?2**quality+'x':legacyEdges?'previous':'refined',quality:fixture.kind==='fm'?2**quality:1,metrics:analysis.metrics,renderMs});}
  report.rows.push(row);console.log(`${hz} Hz / ${rate} ${test}: off-harmonic dB ${row.paths.map(p=>p.metrics.offHarmonicDb?.toFixed(1)).join(' / ')}`);
 }
 for(const row of report.rows.filter(r=>r.config.test==='fm-bright'&&r.config.hz===3137&&r.config.depth===1))if(row.paths[2].metrics.offHarmonicDb>row.paths[0].metrics.offHarmonicDb-10)throw Error('Bright FM quality regression.');
 for(const row of report.rows.filter(r=>r.config.test==='sub-pwm'&&r.config.depth===1))if(row.paths[1].metrics.offHarmonicDb>row.paths[0].metrics.offHarmonicDb-10)throw Error('Moving PWM edge regression.');
}catch(e){report.failure=String(e);process.exitCode=1;console.error(e);}finally{await fs.writeFile(path.join(output,'matrix'+(process.argv.includes('--edges')?'-edges':'')+(process.argv.includes('--deep')?'-deep':'')+'.json'),JSON.stringify(report,null,2));await server.close();}
