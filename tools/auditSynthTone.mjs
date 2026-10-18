import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'}),output=path.resolve(process.env.SYNTH_AUDIT_DIR||'.tmp/tone-audit');
await fs.mkdir(output,{recursive:true});const report={created:new Date().toISOString(),runtime:process.version,method:'Actual component impulse responses at -60 dBFS; chorus noise measurements omit initial 50 ms. No hardware-emulation or live CPU claim.',filters:[],chorus:[]};
try{
 const a=await server.ssrLoadModule('/src/synth-lab/toneAnalysis.js'),{TONE_FAMILIES}=await server.ssrLoadModule('/src/synth-lab/toneFixtures.js'),module=await WebAssembly.compile(await fs.readFile('public/synth-lab/core.wasm'));
 report.build=JSON.parse(await fs.readFile('public/synth-lab/build.json'));
 for(const rate of [44100,48000,96000])for(const cutoff of [200,2000,8000])for(const resonance of [0,.35,.8,1])for(const [id,,response,family]of TONE_FAMILIES){
  const config={rate,cutoff,resonance,response,family},rows=[];for(const modern of [false,true]){const impulse=a.impulseResponse(module,config,{modern});if(!impulse.every(Number.isFinite))throw Error('Nonfinite filter impulse.');rows.push({modern,...a.filterSummary(a.responseCurve(impulse,rate),cutoff)});}
  if(resonance===0&&['lp12','lp24'].includes(id)&&Math.abs(rows[1].cutoffDb+3.0103)>.15)throw Error('Calibrated cutoff regression.');report.filters.push({id,config,rows});
 }
 for(const rate of [44100,48000,96000])for(const amount of [0,.4,.8])for(const speed of [.05,.35,2])for(const depth of [0,3.5,8]){
  const input=a.deterministicNoise(rate,1),skip=Math.round(rate*.05),cut=channels=>channels.map(c=>c.slice(skip)),dry=a.stereoMeasure(cut(input)),rows=[];
  for(const modern of [false,true]){const out=a.chorusProbe(module,input,{rate,amount,speed,depth},{modern}),m=a.stereoMeasure(cut(out));if(m.peak>.3)throw Error('Chorus headroom regression.');if(amount===0&&Math.abs(m.rms-dry.rms)>1e-8)throw Error('Chorus bypass regression.');rows.push({modern,...m,levelDb:20*Math.log10(m.rms/dry.rms)});}
  report.chorus.push({config:{rate,amount,speed,depth},rows});
 }
 console.log(`${report.filters.length} filter and ${report.chorus.length} chorus cases pass.`);
}catch(e){report.failure=String(e);process.exitCode=1;console.error(e);}finally{await fs.writeFile(path.join(output,'matrix.json'),JSON.stringify(report,null,2));await server.close();}
