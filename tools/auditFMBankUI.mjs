import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const firefox=process.argv.includes('--firefox'),origin=process.env.SYNTH_LAB_URL??'http://127.0.0.1:5173',out=path.resolve(process.env.SYNTH_PROFILE_DIR??'.tmp/fm-bank/ui');
await fs.mkdir(out,{recursive:true});const report={origin,rows:[],errors:[]};
const browser=await puppeteer.launch({browser:firefox?'firefox':'chrome',executablePath:firefox?'.tmp/browsers/firefox/win64-stable_158.0/core/firefox.exe':'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:firefox?[]:['--no-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required'],protocolTimeout:120000});
try{report.browser=await browser.version();for(const trial of [{bank:true},{bank:false},{bank:true,unsupported:true},{bank:true,missing:true}]){
 const p=await browser.newPage();p.on('pageerror',e=>report.errors.push(String(e)));const requests=[];p.on('request',r=>{if(r.url().includes('fm-bank.wasm'))requests.push(r.url());});
 await p.evaluateOnNewDocument(({unsupported})=>{localStorage.setItem('bgm-tour-v2','true');localStorage.setItem('bgm-stage-v2','7');localStorage.setItem('bgm-backdrop','false');localStorage.setItem('bgm-wasm-performance','full');localStorage.setItem('bgm-performance',JSON.stringify({sharedReverb:true,reverb:'full'}));if(unsupported)WebAssembly.validate=()=>false;window.__bankNodes=[];window.__workletErrors=[];const Native=AudioWorkletNode;window.AudioWorkletNode=class extends Native{constructor(context,name,options){super(context,name,options);const r={name,node:this,context,stats:[],adds:[]};__bankNodes.push(r);const post=this.port.postMessage.bind(this.port);this.port.postMessage=(data,...rest)=>{if(data.type==='add')r.adds.push(data);return post(data,...rest);};this.port.addEventListener('message',({data})=>{if(data.type==='stats')r.stats.push(data);if(data.type==='error')__workletErrors.push(data);});this.port.start();this.addEventListener('processorerror',()=>__workletErrors.push('processorerror'));}};},trial);
 if(trial.missing){await p.setRequestInterception(true);p.on('request',r=>void(new URL(r.url()).pathname.endsWith('/fm-bank.wasm')?r.respond({status:404,body:'unavailable'}):r.continue()));}
 await p.goto(origin+'/?preset=tine-and-tide&wasm=1&intro=short'+(trial.bank?'&bank=1':''));await p.waitForFunction(()=>document.querySelector('.gen-engine-toggle')?.textContent.startsWith('Wasm')&&(__bankNodes.some(n=>n.name==='calmbgm-fm-bank'&&n.adds.length>=3)||__bankNodes.filter(n=>n.name==='calmbgm-fm').length>=3),{timeout:60000});await p.mouse.click(4,4);
 const row=await p.evaluate(async()=>{
  const bank=__bankNodes.find(n=>n.name==='calmbgm-fm-bank'),channels=bank?bank.adds.slice(0,3).map(a=>({r:bank,slot:a.slot,token:a.token})):__bankNodes.filter(n=>n.name==='calmbgm-fm').slice(0,3).map(r=>({r}));
  const context=channels[0].r.context;await context.resume();const frame=Math.round((context.currentTime+.04)*context.sampleRate);
  const post=(c,data)=>c.r.node.port.postMessage({...data,...(bank?{slot:c.slot,token:c.token}:{})});
  channels.forEach((c,i)=>post(c,{type:'events',values:[[0,9000+i,frame,60+i*4,.5]]}));await new Promise(r=>setTimeout(r,1300));
  const snapshot=()=>__bankNodes.map(n=>({name:n.name,stats:n.stats.slice(-4)})),before=snapshot();post(channels[0],{type:'panic'});await new Promise(r=>setTimeout(r,1100));const after=snapshot();channels.forEach(c=>post(c,{type:'panic'}));
  return {url:location.href,preference:localStorage.getItem('bgm-audio-engine'),before,after,errors:__workletErrors};
 });
 assert.equal(row.errors.length,0);assert.equal(row.preference,null);const expected=trial.bank&&!trial.missing&&!trial.unsupported,hasBank=row.before.some(n=>n.name==='calmbgm-fm-bank');assert.equal(hasBank,expected);if(expected){const stats=row.before.flatMap(n=>n.stats);assert(stats.some(s=>s.vectorFrames>0));assert(row.after.flatMap(n=>n.stats).some(s=>s.active>0));assert(new URL(row.url).searchParams.get('bank')==='1');}else if(!trial.bank||trial.unsupported)assert.equal(requests.length,0);report.rows.push({...trial,...row,requests});await p.close();
 }
 const lab=await browser.newPage();lab.on('pageerror',e=>report.errors.push(String(e)));
 await lab.evaluateOnNewDocument(()=>{window.__labBanks=0;window.__labErrors=[];const Native=AudioWorkletNode;window.AudioWorkletNode=class extends Native{constructor(c,name,o){super(c,name,o);if(name==='calmbgm-fm-bank')__labBanks++;this.port.addEventListener('message',({data})=>{if(data.type==='error')__labErrors.push(data);});this.port.start();}};});
 await lab.goto(origin+'/labs/all/?bank=1');await lab.waitForFunction(()=>document.querySelector('.lab-primary')&&!document.querySelector('.lab-primary').disabled,{timeout:60000});
 await lab.evaluate(()=>{const b=[...document.querySelectorAll('.lab-voice-choice')].find(b=>/bowed glass/i.test(b.querySelector('strong')?.textContent));if(!b)throw Error('Missing FM voice');b.click();});
 await lab.waitForFunction(()=>/bowed glass/i.test(document.querySelector('.lab-play h2')?.textContent)&&document.querySelector('.lab-primary')&&!document.querySelector('.lab-primary').disabled&&__labBanks>0,{timeout:60000});
 await lab.keyboard.down('a');await lab.keyboard.down('s');await new Promise(r=>setTimeout(r,300));await lab.keyboard.up('a');await lab.keyboard.up('s');
 assert(new URL(lab.url()).searchParams.get('bank')==='1');report.lab=await lab.evaluate(()=>({url:location.href,banks:__labBanks,errors:__labErrors,status:document.querySelector('.lab-status').textContent}));assert.equal(report.lab.errors.length,0);await lab.close();assert.equal(report.errors.length,0);
}catch(e){report.failure=String(e);process.exitCode=1;console.error(e);}finally{await fs.writeFile(path.join(out,(firefox?'firefox':'chrome')+'-ui.json'),JSON.stringify(report,null,2));await browser.close();}
