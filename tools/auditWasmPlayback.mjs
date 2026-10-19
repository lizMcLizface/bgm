// Actual main-page preset/export graphs. Dev server required (__generator).
// Offline wall time is NOT an AudioWorklet CPU/deadline or phone-lock result.
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const arg=(key,fallback)=>process.argv.find(s=>s.startsWith('--'+key+'='))?.slice(key.length+3)??fallback;
const seconds=Number(arg('seconds',24)),repeats=Number(arg('repeats',3)),presets=arg('presets','glass-conservatory,tine-and-tide,lantern-circuit').split(',');
if(!Number.isFinite(seconds)||seconds<4||seconds>60||!Number.isInteger(repeats)||repeats<1||repeats>7||presets.some(p=>!['glass-conservatory','tine-and-tide','lantern-circuit'].includes(p)))throw Error('Use 4–60 seconds, 1–7 repeats and native showcase preset IDs.');
const origin=process.env.SYNTH_LAB_URL||'http://localhost:5173',output=path.resolve(process.env.SYNTH_AUDIT_DIR||'.tmp/wasm-playback');
await fs.mkdir(output,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.SYNTH_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required'],protocolTimeout:600000});
const report={browser:await browser.version(),created:new Date().toISOString(),protocol:{seconds,repeats,warmup:1,seed:42},rows:[],errors:[],limits:'Desktop Chrome main-page offline exports, including planning, graph preparation, native nodes, worklets, progress, effects and PCM packing. One warm-up per mode; alternating mode order. No claim about audio-thread load, underruns, Pixel/Surface hardware, thermal limits or locked-phone playback.'};
try{
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(origin+'/tools/stress.html');await page.evaluate(()=>{localStorage.setItem('bgm-tour-v2','true');localStorage.setItem('bgm-stage-v2','7');localStorage.setItem('bgm-backdrop','false');localStorage.setItem('bgm-hide-ui','false');});
 report.builds=await page.evaluate(async()=>Object.fromEntries(await Promise.all(['build','fm-build','effects-build','inserts-build'].map(async id=>[id,await(await fetch('/synth-lab/'+id+'.json')).json()]))));
 for(const preset of presets){
  await page.goto(origin+'/?preset='+preset+'&intro=short');
  await page.waitForFunction(()=>window.__generator&&!__generator.audioEngineReady&&['lead','pad','counter','bass'].every(r=>__generator.roles[r].instrument.voice),{timeout:60000});
  const row=await page.evaluate(async({seconds,repeats})=>{
   const g=window.__generator,{renderPcm}=await import('/src/app/engine/render.js');g.set('seed',42);
   const modes=[{source:'full',room:'full'},{source:'full',room:'light'},{source:'economy',room:'light'}],runs=[];
   for(let repeat=-1;repeat<repeats;repeat++)for(const mode of (repeat%2?modes:modes.slice().reverse())){
    localStorage.setItem('bgm-wasm-performance',mode.source);localStorage.setItem('bgm-performance',JSON.stringify({reverb:mode.room,sharedReverb:false}));
    let sum=0,count=0,peak=0;const start=performance.now(),info=await renderPcm(g,seconds,{onChunk:a=>{for(const x of a){sum+=x*x;count++;peak=Math.max(peak,Math.abs(x));}}});
    if(repeat>=0)runs.push({...mode,ms:performance.now()-start,peak:peak/32767,rms:Math.sqrt(sum/count)/32767,frames:info.frames,rate:info.sampleRate});
   }
   return {runs,userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency};
  },{seconds,repeats});
  if(row.runs.some(r=>!Number.isFinite(r.rms)||r.rms<=0||r.peak>=.99))throw Error('Silent/nonfinite/clipping graph: '+preset);
  report.rows.push({preset,...row});console.log(JSON.stringify(report.rows.at(-1)));await fs.writeFile(path.join(output,'chrome.json'),JSON.stringify(report,null,2));
 }
 if(report.errors.length)throw Error(report.errors.join('\n'));
}catch(e){report.failure=String(e);process.exitCode=1;console.error(e);}finally{await fs.writeFile(path.join(output,'chrome.json'),JSON.stringify(report,null,2));await browser.close();}
