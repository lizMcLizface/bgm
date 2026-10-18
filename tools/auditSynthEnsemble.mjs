// Opt-in browser/audio audit. Run the Vite dev server first; normal tests need no browser.
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const browser=process.env.SYNTH_BROWSER==='firefox'?'firefox':'chrome';
const executablePath=process.env.SYNTH_BROWSER_PATH||(browser==='chrome'?['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync):null);
if(!executablePath)throw Error('Set SYNTH_BROWSER_PATH to your installed Chrome or Firefox executable.');
const origin=process.env.SYNTH_LAB_URL||'http://localhost:5173',output=path.resolve(process.env.SYNTH_AUDIT_DIR||'.tmp/ensemble-audit');
await fs.mkdir(output,{recursive:true});
const instance=await puppeteer.launch(browser==='firefox'?{browser,executablePath,headless:true,defaultViewport:null,extraPrefsFirefox:{'media.autoplay.default':0},protocolTimeout:240000}:{executablePath,headless:true,pipe:true,args:['--no-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required'],protocolTimeout:240000});
const report={browser,errors:[],renders:[],live:[]};
try{
 const page=await instance.newPage();await page.setViewport({width:1440,height:1000});page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto(origin+'/tools/ensemble-synth.html');await page.waitForFunction(()=>window.__ensembleLab,{timeout:30000});
 report.echo=await page.evaluate(async()=>{
  const {createRoutedEffects}=await import('/src/synth-lab/routedEffects.js'),rows=[];
  for(const rate of [44100,48000,96000])for(const pingPong of [0,1]){
   const pair=[];
   for(const kind of ['wasm','hybrid']){
    const ctx=new OfflineAudioContext(2,rate*3,rate),bus=await createRoutedEffects(ctx,{dry:0,reverb:0,delay:.4,delayMs:409,feedback:.4,delayToReverb:0,pingPong},{kind});
    const input=ctx.createBuffer(2,1,rate);input.getChannelData(0)[0]=.25;const source=ctx.createBufferSource();source.buffer=input;source.connect(bus.inputs[2]);bus.connect(ctx.destination);source.start();const result=await ctx.startRendering(),taps=[];
    for(let n=1;n<=6;n++){const channel=pingPong?(n-1)%2:0,data=result.getChannelData(channel);let peak=0,frame=0;for(let i=Math.round((n*.409-.025)*rate);i<Math.round((n*.409+.025)*rate);i++)if(Math.abs(data[i])>peak){peak=Math.abs(data[i]);frame=i;}taps.push({channel,frame,peak});}
    pair.push({kind,compensationFrames:bus.nativeDelayCompensationFrames??0,taps});bus.dispose();source.disconnect();
   }
   rows.push({rate,pingPong,pair});
  }return rows;
 });
 // Allow fractional-delay interpolation differences; protect one-sample
 // timing and wet level within 1%, rather than claiming identical DSP.
 for(const row of report.echo)for(let i=0;i<6;i++){const a=row.pair[0].taps[i],b=row.pair[1].taps[i];if(Math.abs(a.frame-b.frame)>1||Math.abs(b.peak/a.peak-1)>.01)throw Error('Native/Wasm echo timing or level mismatch: '+JSON.stringify(row));}
 console.log('Stereo/ping-pong echo timing and levels pass at 44.1/48/96 kHz.');
 report.instrumentRouting=await page.evaluate(async()=>{
  const {createRoutedEffects,createInstrumentEffects}=await import('/src/synth-lab/routedEffects.js');
  const {ensemblePlan,effectsLayout}=await import('/src/synth-lab/ensemblePlan.js');
  const rate=48000,ctx=new OfflineAudioContext(2,rate*3,rate),room=await createRoutedEffects(ctx,{dry:0,reverb:0},{kind:'local'}),routes=[];
  const settings=[{send:.2,delayMs:233,feedback:.4,tone:4500,pingPong:0,roomSend:0},{send:.3,delayMs:409,feedback:.6,tone:6500,pingPong:1,roomSend:0}];
  for(const p of settings){const route=await createInstrumentEffects(ctx,room,p);routes.push(route);const source=ctx.createBufferSource(),buffer=ctx.createBuffer(2,1,rate);buffer.getChannelData(0)[0]=.25;source.buffer=buffer;source.connect(route.inputs[2]);source.start();}
  room.connect(ctx.destination);const out=await ctx.startRendering(),taps=[];
  for(let voice=0;voice<2;voice++)for(let repeat=1;repeat<=5;repeat++){
   const p=settings[voice],at=Math.round(p.delayMs/1000*repeat*rate),channel=p.pingPong?(repeat-1)%2:0,peaks=[0,0];
   for(let ch=0;ch<2;ch++)for(let i=at-1;i<at+8;i++)peaks[ch]=Math.max(peaks[ch],Math.abs(out.getChannelData(ch)[i]));
   if(peaks[channel]<.0001||peaks[1-channel]>peaks[channel]*.01)throw Error('Independent voice repeat missing or in wrong stereo channel.');taps.push({voice,repeat,channel,peaks});
  }
  routes.forEach(r=>r.dispose());room.dispose();
  // Echo -> room must work even with dry and direct reverb sends at zero.
  async function roomOnly(roomSend){const context=new OfflineAudioContext(2,rate*3,rate),bus=await createRoutedEffects(context,{dry:0,reverb:0,decay:1.2},{kind:'local'}),route=await createInstrumentEffects(context,bus,{...settings[0],feedback:0,roomSend});
   const source=context.createBufferSource(),b=context.createBuffer(2,1,rate);b.getChannelData(0)[0]=.25;source.buffer=b;source.connect(route.inputs[2]);bus.connect(context.destination);source.start();const output=await context.startRendering();let energy=0;for(let i=rate;i<rate*2;i++)energy+=output.getChannelData(0)[i]**2;route.dispose();bus.dispose();return energy;}
  const roomEnergy=[await roomOnly(0),await roomOnly(.5)];if(roomEnergy[0]>1e-15||roomEnergy[1]<1e-10)throw Error('Echo to room depends incorrectly on the direct send.');
  // Changing a silent pad's private room must not alter another instrument.
  const isolation=[];
  for(const decay of [1.2,20]){
   const plan=ensemblePlan({count:2,voices:{0:{room:'private',roomDecay:decay}}}),layout=effectsLayout(plan,'local'),context=new OfflineAudioContext(2,rate*3,rate),buses=[];
   for(let i=0;i<layout.count;i++){const bus=await createRoutedEffects(context,layout.settings(i),{kind:'local'});bus.connect(context.destination);buses.push(bus);}
   const source=context.createBufferSource(),b=context.createBuffer(2,1,rate);b.getChannelData(0)[0]=.25;source.buffer=b;source.connect(buses[layout.assign(plan.parts[1])].inputs[1]);source.start();isolation.push(await context.startRendering());buses.forEach(b=>b.dispose());
  }
  let difference=0;for(let ch=0;ch<2;ch++)for(let i=0;i<isolation[0].length;i++)difference=Math.max(difference,Math.abs(isolation[0].getChannelData(ch)[i]-isolation[1].getChannelData(ch)[i]));
  if(difference>1e-7)throw Error('Private pad reverb changed shared instrument output.');
  return {taps,roomEnergy,privateRoomIsolationMaxDifference:difference};
 });
 console.log('Independent echo timing/stereo, echo-to-room and private-room isolation pass.');
 for(const scope of ['stems','full']){
  await page.goto(origin+'/tools/ensemble-synth.html?count=4&rooms=1&scope='+scope);await page.waitForFunction(()=>window.__ensembleLab);
  await page.evaluate(benchmark=>window.__ensembleLab.run(benchmark),process.argv.includes('--benchmark'));
  const result=await page.evaluate(()=>window.__ensembleLab.report);if(!result)throw Error(await page.$eval('#status',e=>e.textContent));report.renders.push(result);
  for(const row of result.rows)if(row.metrics.nonFinite||row.metrics.rms<1e-8||row.metrics.peak>=1)throw Error('Invalid or clipped default ensemble: '+row.path);
  console.log('Rendered '+scope+' comparison.');
 }
 await page.click('#start');await page.waitForFunction(()=>window.__ensembleLab.live);await new Promise(r=>setTimeout(r,12500));report.live.push(await page.evaluate(()=>window.__ensembleLab.snapshot()));
 if(process.argv.includes('--fluid')){await page.select('#fluid','256');await new Promise(r=>setTimeout(r,5000));report.live.push(await page.evaluate(()=>window.__ensembleLab.snapshot()));await page.select('#fluid','0');}
 await page.click('#stop');await page.select('#live-path','hybrid');await page.click('#start');await page.waitForFunction(()=>window.__ensembleLab.live);await new Promise(r=>setTimeout(r,3500));report.live.push(await page.evaluate(()=>window.__ensembleLab.snapshot()));await page.click('#stop');
 await page.click('#private-pad');
 await page.evaluate(()=>{const input=document.querySelector('[data-voice="1"][data-setting="delayMs"]');input.value='333';input.dispatchEvent(new Event('change'));});
 await page.reload();await page.waitForFunction(()=>window.__ensembleLab);
 report.privateRoom=await page.evaluate(async()=>{
  const {ensemblePlan}=await import('/src/synth-lab/ensemblePlan.js'),{renderEnsemble}=await import('/src/synth-lab/ensembleBackend.js'),plan=ensemblePlan(Object.fromEntries(new URLSearchParams(location.search))),result=await renderEnsemble(plan,'local');
  if(plan.parts[1].voiceEffects.delayMs!==333||plan.parts[0].voiceEffects.room!=='private')throw Error('Voice URL settings did not survive reload.');
  if(result.effectsBuses!==2||result.nativeDelayCount!==4||result.metrics.nonFinite||result.metrics.peak>=1||result.metrics.rms<1e-8)throw Error('Private-room ensemble failed.');
  return {...result,buffer:undefined};
 });
 await page.click('#start');await page.waitForFunction(()=>window.__ensembleLab.live);await new Promise(r=>setTimeout(r,3500));report.live.push(await page.evaluate(()=>window.__ensembleLab.snapshot()));await page.click('#stop');
 for(const live of report.live)if(live.stats.missedCycles||Object.values(live.stats.sources).some(s=>s.dropped||s.late))throw Error('Live scheduling issue; inspect the saved report.');
 await page.screenshot({path:path.join(output,browser+'-desktop.png'),fullPage:true});await page.setViewport({width:390,height:844});report.layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));await page.screenshot({path:path.join(output,browser+'-mobile.png'),fullPage:true});
 if(report.errors.length||report.layout.scroll>390)throw Error(JSON.stringify({errors:report.errors,layout:report.layout}));
 console.log('Live scheduling, layout and browser error checks pass. This is not a device-underrun measurement.');
}catch(e){report.failure=String(e);process.exitCode=1;console.error(e);}finally{await fs.writeFile(path.join(output,browser+'.json'),JSON.stringify(report,null,2));await instance.close();}
