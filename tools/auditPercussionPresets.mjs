import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const origin=process.env.SYNTH_LAB_URL??'http://127.0.0.1:5173',dir=path.resolve(process.env.SYNTH_PROFILE_DIR??'.tmp/percussion-presets');await fs.mkdir(dir,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.SYNTH_BROWSER_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,acceptInsecureCerts:true,args:['--no-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required'],protocolTimeout:300000});
const report={created:new Date().toISOString(),errors:[],renders:[],limits:'Functional Chrome picker/catalog, offline audio and phone layout. No physical listening or background-performance claim.'};
try{
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(String(e)));await page.setViewport({width:1365,height:1050});
 await page.exposeFunction('recordReviewRender',async row=>{report.renders.push(row);await fs.writeFile(dir+'/report.json',JSON.stringify(report,null,2));});
 await page.evaluateOnNewDocument(()=>{localStorage.setItem('bgm-tour-v2','true');localStorage.setItem('bgm-stage-v2','7');localStorage.setItem('bgm-backdrop','false');});
 await page.goto(origin+'/?preset=morning-coffee&wasm=0&mediaHelper=1');await page.waitForFunction(()=>window.__generator);await page.evaluate(()=>__generator.AC.resume());
 await page.$eval('.gen-track-perc .gen-track-name',e=>e.click());await page.waitForSelector('.gen-vb');
 report.picker=await page.evaluate(()=>({cards:[...document.querySelectorAll('.gen-vb [data-preset] strong')].map(e=>e.textContent),groups:[...document.querySelectorAll('.gen-vb [data-group]')].map(e=>e.dataset.group),armed:document.querySelector('.gen-track-perc [title="Play this voice with the keyboard / MIDI"]').getAttribute('aria-pressed')}));
 if(report.picker.cards.join('/')!=='Felt/Crisp/808/Hand percussion'||report.picker.groups.join()!=='Drum kits'||report.picker.armed!=='true')throw Error('Percussion browser filters/arming');
 await page.$eval('.gen-vb [data-preset=hand]',e=>e.click());await page.waitForFunction(()=>__generator.settings.drums.kit==='hand'&&!__generator.percussionReady&&document.querySelector('.gen-vb').getAttribute('aria-busy')==='false');
 if(await page.evaluate(()=>__generator.audioEngine==='wasm'))throw Error('Hand changed the melodic engine');
 await page.keyboard.press('[');await page.waitForFunction(()=>__generator.settings.drums.kit==='tr808');await page.keyboard.press('[');await page.waitForFunction(()=>__generator.settings.drums.kit==='crisp');await page.keyboard.press('Escape');
 report.keyboard=await page.evaluate(()=>({kit:__generator.settings.drums.kit,scene:document.querySelector('.gen-scene-name').textContent,dialog:Boolean(document.querySelector('.gen-vb')),armed:document.querySelector('.gen-track-perc [title="Play this voice with the keyboard / MIDI"]').getAttribute('aria-pressed')}));if(report.keyboard.dialog||report.keyboard.armed!=='false')throw Error('Picker close did not restore arming');
 await page.$eval('.gen-scene-button',e=>e.click());report.catalog=await page.evaluate(async()=>{const {BROWSABLE_SCENES}=await import('/src/app/scenes.js');const names=[...document.querySelectorAll('.gen-pb-pick strong')].map(e=>e.textContent);return {count:names.length,expected:BROWSABLE_SCENES.length,unique:new Set(names).size,archives:names.filter(n=>n.includes('(previous)')||n.includes(' · ')),categories:[...document.querySelectorAll('.gen-pb-cats button')].map(e=>e.textContent)};});if(report.catalog.count!==report.catalog.unique||report.catalog.count!==report.catalog.expected||report.catalog.archives.length||report.catalog.categories.some(n=>n.startsWith('Updated')))throw Error('Temporary preset clutter');await page.$eval('.gen-pb-close',e=>e.click());
 await page.setViewport({width:412,height:915});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);await page.$eval('.gen-track-perc .gen-track-name',e=>e.click());await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));report.mobile=await page.evaluate(()=>({cards:document.querySelectorAll('.gen-vb [data-preset]').length,overflow:document.documentElement.scrollWidth>innerWidth}));if(report.mobile.overflow||report.mobile.cards!==4)throw Error('Mobile kit picker');await page.screenshot({path:dir+'/phone-kit-picker.png'});await page.keyboard.press('Escape');
 await page.evaluate(async()=>{if(__generator.audioEngine!=='wasm')await __generator.setAudioEngine('wasm');});
 report.audio=await page.evaluate(async()=>{
  const {sceneBySlug,sceneSettings}=await import('/src/app/scenes.js'),{renderPcm}=await import('/src/app/engine/render.js'),{inheritBook,applyBook}=await import('/src/app/rulebook/session.js'),{findPreset}=await import('/src/app/editor/presetStore.js');const g=__generator;
  for(const name of ['Morning coffee','Late-night brushes','Late Show Lounge','Island Shop Hours','Desert dusk','Deep night','Tape memories','Night drive','Pastel Coastline','Pocket Circuit','Tine and Tide','Lantern Circuit']){
   const scene=sceneBySlug(name);g.setMany(sceneSettings(scene,293169949));applyBook(g,inheritBook(scene.rulebook));if(g.percussionReady)await g.percussionReady;g.set('sections',{...g.settings.sections,mode:'off'});g.set('ambience',Object.fromEntries(Object.keys(g.settings.ambience).map(k=>[k,0])));
   for(const[role,r]of Object.entries(g.roles)){r.mute=false;if(role!=='perc')g.loadRolePreset(role,scene.voices[role]);}g.reset();let peak=0,sum=0,count=0;
   await renderPcm(g,12,{onChunk:a=>{for(const x of a){if(!Number.isFinite(x))throw Error('Invalid PCM '+name);peak=Math.max(peak,Math.abs(x));sum+=x*x;count++;}}});if(!peak||peak>=32767)throw Error('Silent/clipped '+name);await window.recordReviewRender({name,peak:peak/32767,rms:Math.sqrt(sum/count)/32767,kit:g.settings.drums.kit,style:g.settings.drums.style,lead:g.roles.lead.presetName});
  }
  // A fixed one-voice score avoids mistaking an intentionally resting counter for silence.
  const {wasmVoiceById}=await import('/src/synth-lab/voiceLibrary.js'),{renderFM}=await import('/src/synth-lab/fmBackend.js');const p=structuredClone(wasmVoiceById('soft-pipes').patch);p.global.polyphony=1;
  const current=await renderFM(p,{pattern:'chords'});p.global.gain=.2;const previous=await renderFM(p,{pattern:'chords'});
  const rms=b=>{let sum=0;for(let c=0;c<b.numberOfChannels;c++)for(const x of b.getChannelData(c))sum+=x*x;return Math.sqrt(sum/(b.length*b.numberOfChannels));};
  const boostDb=20*Math.log10(rms(current.buffer)/rms(previous.buffer)),counterDb=20*Math.log10(rms(current.buffer)*.13/(rms(previous.buffer)*.22));if(Math.abs(counterDb)>1||boostDb<4||boostDb>6)throw Error('Soft Pipes balance');return {boostDb,counterDb};
 });
 if(report.errors.length)throw Error(report.errors.join('\n'));
}catch(e){report.failure=String(e);process.exitCode=1;console.error(e);}finally{await fs.writeFile(dir+'/report.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({failure:report.failure,errors:report.errors,picker:report.picker,catalog:report.catalog,renders:report.renders.length,audio:report.audio}));
