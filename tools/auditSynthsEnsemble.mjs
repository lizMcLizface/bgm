import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const origin=process.env.SYNTH_LAB_URL??'http://127.0.0.1:5173',out='.tmp/synths-ensemble';
await fs.mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required']});
const errors=[],report={};
try{
 const page=await browser.newPage();await page.setViewport({width:1500,height:1050});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.evaluateOnNewDocument(()=>{
  window.__ensembleNodes=[];const Native=AudioWorkletNode;
  window.AudioWorkletNode=class extends Native{constructor(c,name,o){super(c,name,o);const record={name,node:this,context:c,stats:[],events:[]};window.__ensembleNodes.push(record);const post=this.port.postMessage.bind(this.port);this.port.postMessage=(m,...rest)=>{if(m.type==='events')record.events.push(...m.values);post(m,...rest);};this.port.addEventListener('message',({data})=>{if(data.type==='error')console.error(data.message);if(data.type==='stats')record.stats.push(data);});this.port.start();}};
 });
 await page.goto(origin+'/synths/ensemble/');await page.waitForSelector('.ensemble-player');await page.screenshot({path:out+'/desktop.png',fullPage:true});
 await page.waitForSelector('.gen-timeline-canvas');assert(await page.$eval('.gen-tracks',e=>e.children.length)>=5);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewport({width:760,height:1000});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth,{timeout:3000});await page.setViewport({width:1500,height:1050});
 report.layout={timeline:true,tracks:true};
 await page.select('[aria-label="Ensemble preset"]','3');
 await page.click('.ensemble-play');await page.waitForFunction(()=>document.querySelector('.ensemble-play').textContent.includes('Pause'),{timeout:30000});
 await page.waitForFunction(()=>__ensembleNodes.some(n=>n.name==='calmbgm-classics'&&n.events.some(e=>Number.isFinite(e[4]))),{timeout:20000});
 report.initial=await page.evaluate(()=>({status:document.querySelector('[role=status]').textContent,contexts:new Set(__ensembleNodes.filter(n=>!Number.isFinite(n.context.length)).map(n=>n.context)).size}));assert.equal(report.initial.contexts,1);
 await page.select('[aria-label="Ensemble preset"]','3');await page.waitForFunction(()=>!document.querySelector('.ensemble-play').disabled,{timeout:30000});
 await page.waitForFunction(()=>__ensembleNodes.filter(n=>n.name==='calmbgm-classics'&&n.stats.some(s=>s.peak>0)).length>=4,{timeout:30000});
 report.fourClassics=await page.evaluate(()=>__ensembleNodes.filter(n=>n.name==='calmbgm-classics').map(n=>({stats:n.stats.slice(-3),events:n.events.length,rate:n.context.sampleRate})));
 await page.click('.ensemble-sound-tools button:nth-child(2)');await page.waitForSelector('.rack-control');
 await page.screenshot({path:out+'/effects.png',fullPage:true});
 await page.select('[aria-label="Lead source"]','vs');await page.waitForFunction(()=>!document.querySelector('.ensemble-play').disabled,{timeout:30000});
 await page.click('.ensemble-sound-tools button:first-child');await page.waitForSelector('.vector');
 await page.screenshot({path:out+'/vector.png',fullPage:true});
 for(const id of ['cs80','juno','prophet5','jupiter8','minimoog','dx7','obxa']){
  await page.select('[aria-label="Lead source"]',id);await page.waitForFunction(()=>!document.querySelector('.ensemble-play').disabled,{timeout:30000});await page.waitForSelector('.embedded-instrument [role=slider]');
 }
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copiedEnsemble=value;}}}));
 await page.evaluate(()=>[...document.querySelectorAll('.ensemble button')].find(b=>b.textContent==='Copy link').click());
 await page.waitForFunction(()=>window.__copiedEnsemble?.includes('#ensemble='));
 const link=await page.evaluate(()=>__copiedEnsemble);
 const linked=await browser.newPage();linked.on('pageerror',e=>errors.push(e.message));await linked.goto(link);await linked.waitForSelector('.ensemble-player');
 assert((await linked.$eval('.ensemble-sound h2',el=>el.textContent)).includes('Oberon'));await linked.close();
 page.once('dialog',dialog=>dialog.accept('Saved audit ensemble'));
 await page.evaluate(()=>[...document.querySelectorAll('.ensemble button')].find(b=>b.textContent==='Save current').click());
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('synths:ensembles')??'[]').some(p=>p.name==='Saved audit ensemble'));
 report.sharing={saved:true,linkCharacters:link.length};
 await page.select('[aria-label="Lead source"]','calmbgm');await page.waitForFunction(()=>!document.querySelector('.ensemble-play').disabled,{timeout:30000});
 await page.click('.ensemble-play');await page.waitForFunction(()=>document.querySelector('.ensemble-play').textContent.includes('Play'));
 await page.setViewport({width:390,height:844});await page.screenshot({path:out+'/phone-progression.png',fullPage:true});
 await page.evaluate(()=>document.querySelector('.ensemble-sound').scrollIntoView());await page.screenshot({path:out+'/phone-sound.png'});
 report.phone=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.equal(report.phone.scrollWidth,report.phone.width);
 report.offline=await page.evaluate(async()=>{
  const [{default:Classics},{SYNTHS}]=await Promise.all([import('/src/app/engine/classicsInstrument.js'),import('/src/synths/models.js')]);
  const ctx=new OfflineAudioContext(2,48000,48000),synth=SYNTHS.prophet5;
  const inst=await Promise.race([Classics.create({context:ctx,preset:{classics:{synth:'prophet5',values:synth.presets[0].values}},polyphony:2}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Offline classic initialization timed out')),5000))]);
  inst.connect(ctx.destination);inst.scheduleNote(60,.01,.3,.8);inst.prepareOffline();const buffer=await ctx.startRendering(),peak=Math.max(...buffer.getChannelData(0).map(Math.abs));inst.dispose();return {peak,state:ctx.state};
 });assert(report.offline.peak>0);
 const standalone=await browser.newPage();standalone.on('pageerror',e=>errors.push(e.message));await standalone.goto(origin+'/synths/prophet5/');await standalone.waitForSelector('.wake');await standalone.click('.wake');await standalone.waitForFunction(()=>!document.querySelector('.wake'),{timeout:30000});report.standalone=true;await standalone.close();
 report.errors=errors;assert.deepEqual(errors,[]);
 console.log(JSON.stringify(report,null,2));
}catch(error){report.failure=error.stack;report.errors=errors;console.error(error);process.exitCode=1;}
finally{await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
