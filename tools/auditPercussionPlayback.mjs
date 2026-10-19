import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const origin=process.env.SYNTH_LAB_URL??'http://127.0.0.1:5173',dir=path.resolve(process.env.SYNTH_PROFILE_DIR??'.tmp/percussion-playback');
await fs.mkdir(dir,{recursive:true});
const browser=await puppeteer.launch({browser:process.env.SYNTH_BROWSER==='firefox'?'firefox':'chrome',executablePath:process.env.SYNTH_BROWSER_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required'],protocolTimeout:120000});
const report={created:new Date().toISOString(),browser:await browser.version(),errors:[],rows:[]};
try {
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
 await page.evaluateOnNewDocument(()=>{localStorage.setItem('bgm-tour-v2','true');localStorage.setItem('bgm-stage-v2','7');localStorage.setItem('bgm-backdrop','false');});
 for(const model of ['wasm','808']) {
  await page.goto(origin+'/?preset=tine-and-tide&wasm=1&perf=1&mediaHelper=1&perc='+model);
  await page.waitForFunction(()=>window.__generator&&!__generator.audioEngineReady&&__generator.roles.pad.instrument.voice);
  await page.evaluate(async model=>{await __generator.loadPercussionVoice(model==='808'?'tr808':'felt');__generator.set('seed',293169949);},model);
  await page.click('.gen-play');await new Promise(r=>setTimeout(r,1500));
  const row=await page.evaluate(async()=>{
   const g=__generator,d=g.roles.perc.instrument;
   if(g.percussionEngine!==new URLSearchParams(location.search).get('perc')||d.error)throw d.error??Error('URL lost its source choice');
   // Felt and 808 share the same logical pad grid; source recipes and balance differ.
   const{planNotes,renderPcm}=await import('/src/app/engine/render.js');
   const plan=planNotes(g,{perc:true},30).notes;
   const before={model:g.percussionEngine,voice:g.settings.drums.kit,stats:d.stats,nativeSources:d.sources.size,plan:plan.map(({midi,time,duration,velocity,detune})=>({midi:({11:1,12:0,13:4})[midi]??midi,time,duration,velocity,detune}))};
   await g.seek(2);await new Promise(r=>setTimeout(r,300));g.stop();await new Promise(r=>setTimeout(r,1400));
   if(d.stats?.queued||d.stats?.active)throw Error('Stopped kit retained active or queued hits');
   const stopped=d.stats;g.reset();await g.start();await new Promise(r=>setTimeout(r,1200));
   if(d.error||!d.stats||d.stats.dropped||d.stats.resyncs)throw d.error??Error('Playback counters failed');g.stop();
   const exports=[];
   for(const drumsOnly of[false,true]){
    if(drumsOnly)for(const[name,role]of Object.entries(g.roles))role.mute=name!=='perc';
    let sum=0,peak=0,count=0;await renderPcm(g,5,{onChunk:a=>{for(const v of a){sum+=v*v;peak=Math.max(peak,Math.abs(v));count++;}}});
    const rms=Math.sqrt(sum/count)/32767;if(!(rms>0&&peak<32767))throw Error('Silent/clipped percussion export');exports.push({drumsOnly,rms,peak:peak/32767});
   }
   return{...before,stopped,restarted:d.stats,exports};
  });report.rows.push(row);
 }
 if(JSON.stringify(report.rows[0].plan)!==JSON.stringify(report.rows[1].plan))throw Error('Source choice changed the percussion plan');
 // Real rendered comparison UI, including the shared cursor and phone layout.
 await page.setViewport({width:412,height:915,deviceScaleFactor:1});
 await page.goto(origin+'/tools/percussion-engine.html?fixture=all&bars=1');await page.click('#percussion-engine button');
 await page.waitForFunction(()=>document.querySelectorAll('#results audio').length===2,{timeout:60000});
 await page.screenshot({path:dir+'/phone-comparison.png',fullPage:true});
 report.ui=await page.evaluate(()=>({players:document.querySelectorAll('#results audio').length,cursors:document.querySelectorAll('.comparison-cursor').length,overflow:document.documentElement.scrollWidth>innerWidth,status:document.querySelector('#status').textContent}));
 if(report.ui.overflow||report.ui.cursors!==2||report.errors.length)throw Error('Percussion UI or page errors: '+JSON.stringify(report));
}catch(error){report.failure=String(error);process.exitCode=1;console.error(error);}finally{await fs.writeFile(dir+'/report.json',JSON.stringify(report,null,2));await browser.close();}
