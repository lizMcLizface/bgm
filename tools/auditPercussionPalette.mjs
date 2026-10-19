import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const origin=process.env.SYNTH_LAB_URL??'http://127.0.0.1:5173',dir=path.resolve(process.env.SYNTH_PROFILE_DIR??'.tmp/percussion-palette');await fs.mkdir(dir,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.SYNTH_BROWSER_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,acceptInsecureCerts:true,args:['--no-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required'],protocolTimeout:180000});
const report={created:new Date().toISOString(),errors:[],limits:'Functional desktop render/playback checks; no new physical lock-screen or sustained performance claim.'};
try{
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
 await page.evaluateOnNewDocument(()=>{localStorage.setItem('bgm-tour-v2','true');localStorage.setItem('bgm-stage-v2','7');localStorage.setItem('bgm-backdrop','false');});
 await page.goto(origin+'/tools/percussion-engine.html');await page.waitForFunction(()=>window.__percussionLab);
 report.renders=await page.evaluate(async()=>{
  const rows=[];for(const voice of ['felt','crisp','tr808','hand'])for(const style of ['bossa','jazz','broken','ambient','hand']){
   const r=await __percussionLab.renderCase('wasm',{voice,style,bars:4,fixture:'groove',groove:1,seed:42,embellish:'1'});
   if(!r.peak||r.peak>=1||r.nonFinite||r.counts.oscillators||r.counts.noiseSources)throw Error('Palette render failed '+voice+'/'+style);
   rows.push({voice,style,peak:r.peak,rms:r.rms,hits:r.plan.events.length,counts:r.counts});
  }
  for(const rate of [44100,96000])for(const tone of [-1,1]){
   const r=await __percussionLab.renderCase('wasm',{voice:'hand',fixture:'all',rate,tone,decay:tone<0?2:.5});if(!r.peak||r.peak>=1||r.nonFinite)throw Error('Hand kit controls failed');rows.push({voice:'hand',fixture:'all',rate,tone,peak:r.peak,rms:r.rms});
  }return rows;
 });
 await page.setViewport({width:412,height:915});await page.select('[name=voice]','hand');await page.select('[name=style]','bossa');await page.select('[name=groove]','1');await page.select('[name=meter]','6/8');await page.click('button[type=submit]');
 await page.waitForFunction(()=>__percussionLab.results.length===1&&!document.querySelector('button[type=submit]').disabled);
 await page.$eval('#results audio',e=>e.play());await page.select('[name=style]','broken');
 report.stale=await page.evaluate(()=>({outdated:document.querySelector('#results').dataset.outdated,paused:document.querySelector('#results audio').paused,status:document.querySelector('#status').textContent}));if(report.stale.outdated!=='true'||!report.stale.paused)throw Error('Old audio was not marked stale');
 await page.click('button[type=submit]');await page.waitForFunction(()=>document.querySelector('#results').dataset.outdated==='false');
 report.ui=await page.evaluate(()=>({voice:document.querySelector('[name=voice]').value,style:document.querySelector('[name=style]').value,groove:document.querySelector('[name=groove]').value,meter:document.querySelector('[name=meter]').value,pads:[...document.querySelectorAll('#pads button')].map(x=>x.textContent),units:__percussionLab.results[0].plan.bars[0].units,players:document.querySelectorAll('#results audio').length,cursors:document.querySelectorAll('.comparison-cursor').length,overflow:document.documentElement.scrollWidth>innerWidth}));
 if(report.ui.pads.length!==11||report.ui.units!==6||report.ui.overflow||report.ui.cursors!==1)throw Error('Palette UI failed');await page.screenshot({path:dir+'/phone-hand.png',fullPage:true});
 await page.goto(origin+'/?preset=rainy-cafe&wasm=0&mediaHelper=1');await page.waitForFunction(()=>window.__generator&&!__generator.audioEngineReady);await page.$eval('[aria-label="Choose percussion preset"]',e=>e.click());await page.$eval('.gen-vb [data-preset=hand]',e=>e.click());await page.waitForFunction(()=>__generator.settings.drums.kit==='hand'&&!__generator.percussionReady);await page.keyboard.press('Escape');
 report.playback=await page.evaluate(async()=>{
  const g=__generator;if(g.audioEngine==='wasm'||g.percussionEngine!=='wasm')throw Error('Hand kit changed the melodic engine');
  const inst=g.roles.perc.instrument;g.set('seed',293169949);g.transport.lookahead=20;const rows=[];
  for(const style of ['bossa','jazz','broken','ambient','hand']){
   if(g.isRunning)g.stop();g.reset();g.set('drums',{...g.settings.drums,style});await g.start();while(g.transport.nextBeatTime-g.AC.currentTime<19.5)g.transport.tick();await new Promise(r=>setTimeout(r,1100));
   if(inst!==g.roles.perc.instrument||inst.error||inst.sources.size||inst.stats.dropped||inst.stats.resyncs)throw inst.error??Error('Live hand source failed');rows.push({style,stats:inst.stats,ahead:g.transport.nextBeatTime-g.AC.currentTime});
  }
  await g.loadPercussionVoice('felt');await g.loadPercussionVoice('hand');if(g.roles.perc.instrument!==inst)throw Error('Kit switch replaced the queued hand source');
  g.stop();await new Promise(r=>setTimeout(r,1200));if(inst.stats.active||inst.stats.queued)throw Error('Stop retained hand hits');
  const {renderPcm}=await import('/src/app/engine/render.js');for(const[name,role]of Object.entries(g.roles))role.mute=name!=='perc';const exports=[];
  for(const style of ['bossa','jazz','broken','ambient','hand']){
   g.set('drums',{...g.settings.drums,style});g.reset();let count=0,sum=0,peak=0;
   await renderPcm(g,8,{onChunk:a=>{for(const x of a){if(!Number.isFinite(x))throw Error('Invalid PCM');count++;sum+=x*x;peak=Math.max(peak,Math.abs(x));}}});
   if(!peak||peak>=32767)throw Error('Silent/clipped hand export '+style);exports.push({style,peak:peak/32767,rms:Math.sqrt(sum/count)/32767});
  }
  return {melodicEngine:g.audioEngine,percussion:g.percussionEngine,voice:g.settings.drums.kit,rows,exports};
 });
 // Reload through a real main-page voice choice and a saved composition link.
 const saved=await page.evaluate(async()=>{const {shareUrl}=await import('/src/app/settings.js');return shareUrl(__generator.settings,{},location);});await page.goto(saved);await page.waitForFunction(()=>window.__generator&&!__generator.audioEngineReady);
 report.reload=await page.evaluate(()=>({voice:__generator.settings.drums.kit,style:__generator.settings.drums.style,backend:__generator.percussionEngine,room:__generator.settings.drumKit.room}));if(report.reload.voice!=='hand'||report.reload.style!=='hand'||report.reload.backend!=='wasm'||report.reload.room!==.1)throw Error('Hand voice/style lost in share link');
 await page.click('.embedded-book-toggle');
 await page.evaluate(()=>[...document.querySelectorAll('nav[aria-label="Rulebook pages"] button')].find(b=>b.textContent.includes('Percussion')).click());
 await page.waitForSelector('[aria-label="Invite percussion: approach"]');
 report.styleLabels=await page.$eval('[aria-label="Invite percussion: approach"]',e=>[...e.options].map(o=>o.textContent));
 if(!report.styleLabels.includes('Bossa / light Latin')||!report.styleLabels.includes('Hand-percussion groove'))throw Error('Unlabelled main-page style');
 await page.select('[aria-label="Invite percussion: approach"]','jazz');await page.waitForFunction(()=>__generator.settings.drums.style==='jazz');await new Promise(r=>setTimeout(r,600));await page.reload();await page.waitForFunction(()=>window.__generator);
 report.rulebookReload=await page.evaluate(()=>({voice:__generator.settings.drums.kit,style:__generator.settings.drums.style}));if(report.rulebookReload.style!=='jazz'||report.rulebookReload.voice!=='hand')throw Error('Rulebook lost percussion style');
 if(report.errors.length)throw Error(report.errors.join('\n'));
}catch(e){report.failure=String(e);process.exitCode=1;console.error(e);}finally{await fs.writeFile(dir+'/report.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({failure:report.failure,errors:report.errors,renders:report.renders?.length,ui:report.ui,reload:report.reload}));
