// Same timed hits through actual OfflineAudioContexts, not a synthetic DSP-only proxy.
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const dir=path.resolve(process.env.SYNTH_PROFILE_DIR??'.tmp/percussion-engine');
await fs.mkdir(dir,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.SYNTH_BROWSER_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required'],protocolTimeout:180000});
const report={created:new Date().toISOString(),errors:[],limits:'Desktop offline timing; waveform correlation is not a perceptual equivalence verdict. Compatibility is opt-in pending listening; no physical Android deadline claim.'};
try {
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto((process.env.SYNTH_LAB_URL??'http://127.0.0.1:5173')+'/tools/percussion-engine.html');
 await page.waitForFunction(()=>window.__percussionLab);
 report.hits=await page.evaluate(async()=>{
  const rows=[];
  for(const drum of ['kick','brush','shaker','rim','hat','swish','tom','clap','ride','crash','bell','snare','punch','sizzle']){
   const a=await __percussionLab.renderCase('native',{fixture:drum}),b=await __percussionLab.renderCase('wasm',{fixture:drum});
   let dot=0,ea=0,eb=0,err=0;
   for(let ch=0;ch<2;ch++){const x=a.buffer.getChannelData(ch),y=b.buffer.getChannelData(ch);for(let i=0;i<x.length;i++){dot+=x[i]*y[i];ea+=x[i]*x[i];eb+=y[i]*y[i];err+=(x[i]-y[i])**2;}}
   const row={drum,correlation:dot/Math.sqrt(ea*eb),rmsDeltaDb:10*Math.log10(eb/ea),errorDb:10*Math.log10(err/ea),peakDeltaDb:20*Math.log10(b.peak/a.peak),native:{...a,buffer:undefined,plan:undefined},wasm:{...b,buffer:undefined,plan:undefined}};
   if(!Number.isFinite(row.correlation)||Math.abs(row.rmsDeltaDb)>.8)throw Error('Percussion parity failed for '+drum);
   // Aligned attacks exclude Chrome's initial 440 Hz value in a partial
   // quantum of scheduled exponential automation (documented separately).
   const aligned=await __percussionLab.renderCase('native',{fixture:drum,offset:.064}),port=await __percussionLab.renderCase('wasm',{fixture:drum,offset:.064});
   let d=0,x2=0,y2=0;for(let ch=0;ch<2;ch++){const x=aligned.buffer.getChannelData(ch),y=port.buffer.getChannelData(ch);for(let i=0;i<x.length;i++){d+=x[i]*y[i];x2+=x[i]*x[i];y2+=y[i]*y[i];}}
   row.alignedCorrelation=d/Math.sqrt(x2*y2);if(row.alignedCorrelation<(drum==='sizzle'?.94:.99))throw Error('Aligned waveform parity failed for '+drum+': '+row.alignedCorrelation);
   rows.push(row);
  }return rows;
 });
 console.log(JSON.stringify(report.hits.map(({drum,correlation,rmsDeltaDb,peakDeltaDb})=>({drum,correlation,rmsDeltaDb,peakDeltaDb})),null,2));
 report.controls=await page.evaluate(async()=>{
  const rows=[];
  for(const rate of[44100,96000])for(const tone of[-1,1])for(const model of['native','wasm','808']){
   const r=await __percussionLab.renderCase(model,{fixture:'all',rate,tone,decay:tone<0?2:.5});
   rows.push({...r,rate,tone,buffer:undefined,plan:undefined});
  }return rows;
 });
 report.wet=await page.evaluate(async()=>{
  const rows=[];
  for(const fixture of['kick','brush','swish']){
   const options={fixture,offset:.064,room:.25},a=await __percussionLab.renderCase('native',options),b=await __percussionLab.renderCase('wasm',options);
   let dot=0,ea=0,eb=0;for(let ch=0;ch<2;ch++){const x=a.buffer.getChannelData(ch),y=b.buffer.getChannelData(ch);for(let i=0;i<x.length;i++){dot+=x[i]*y[i];ea+=x[i]*x[i];eb+=y[i]*y[i];}}
   const correlation=dot/Math.sqrt(ea*eb);if(correlation<.9999)throw Error('Wet parity failed: '+fixture);
   rows.push({fixture,correlation,rmsDeltaDb:10*Math.log10(eb/ea)});
  }return rows;
 });
 report.grooves=await page.evaluate(async()=>{
  const rows=[];for(let repeat=0;repeat<3;repeat++)for(const model of [['native','wasm','808'],['wasm','808','native'],['808','native','wasm']][repeat]){
   const result=await __percussionLab.renderCase(model,{style:'electro',kit:'crisp',bars:4,room:0});rows.push({...result,repeat,buffer:undefined,plan:undefined});
  }return rows;
 });
 if(report.errors.length)throw Error(report.errors.join('\n'));
}catch(error){report.failure=String(error);process.exitCode=1;console.error(error);}finally{await fs.writeFile(dir+'/report.json',JSON.stringify(report,null,2));await browser.close();}
