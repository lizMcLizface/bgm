// Public-build integration: libraries, actual worklet playback, edited URL snapshots,
// conflicting local storage, clipboard fallback and phone/desktop layouts.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const origin=process.env.SYNTH_PUBLIC_URL??'http://127.0.0.1:5187',out='.tmp/drum-library';fs.mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required']});
const errors=[],results=[];
const wait=(p,fn,...args)=>p.waitForFunction(fn,{polling:100},...args);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const textClick=(p,scope,text)=>p.evaluate(({scope,text})=>{const b=[...document.querySelectorAll(scope+' button')].find(b=>b.textContent===text);if(!b)throw Error('Missing button '+text);b.click();},{scope,text});
const stored=(p,id)=>p.evaluate(id=>Object.fromEntries(['patterns','patch','rack'].map(k=>[k,JSON.parse(localStorage.getItem(`synths:${id}:${k}`))])),id);
async function pageFor(context,id,href){
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});
 await p.evaluateOnNewDocument(()=>{
  Object.defineProperty(navigator.clipboard,'writeText',{value:async text=>{window.__copied=text;},configurable:true});
  window.__commands=[];
  const Native=window.AudioWorkletNode;window.AudioWorkletNode=new Proxy(Native,{construct(Target,args){
   const node=new Target(...args);if(args[1]==='calmbgm-output-scope')window.__tap=node;
   if(args[1]==='calmbgm-classics')window.__audioContext=args[0];
   if(args[1]==='calmbgm-classics'){const send=node.port.postMessage.bind(node.port);node.port.postMessage=(data,...rest)=>{if(data.type==='seq')window.__commands.push(...data.values);return send(data,...rest);};}
   return node;
  }});
 });
 await p.goto(href??`${origin}/synths/${id}/`,{waitUntil:'networkidle0'});
 await wait(p,()=>document.querySelector('.wake')&&!document.querySelector('.wake').disabled);
 assert.equal(await p.$eval('.play',b=>b.getAttribute('aria-pressed')),'false','link autoplayed');
 await p.click('.wake');await wait(p,()=>!document.querySelector('.wake'));return p;
}
try{
 for(const id of ['tr808','tr909','tr606']){
  const context=await browser.createBrowserContext(),p=await pageFor(context,id);
  await textClick(p,'.shelf-switch','Sounds');await textClick(p,'.presets','Deep');
  assert.equal(await p.$eval('[role=radiogroup][aria-label="Kick body"] [aria-checked=true]',b=>b.textContent),'Deep');
  await textClick(p,'.presets','Classic');
  assert.equal(await p.$eval('[role=radiogroup][aria-label="Kick body"] [aria-checked=true]',b=>b.textContent),'Classic');
  await textClick(p,'.shelf-switch','Beats');assert.equal(await p.$$eval('[aria-label="Drum loop"] option',a=>a.length),32);
  await p.select('[aria-label="Rhythm style"]','Percussion');await textClick(p,'.presets','Load loop');
  await textClick(p,'.shelf-switch','Arrangements');assert.equal(await p.$$eval('[aria-label="Drum arrangement"] option',a=>a.length),12);
  await p.select('[aria-label="Drum arrangement"]','disco-turn');await textClick(p,'.presets','Load arrangement');
  assert.equal(await p.$$eval('.chain .link',a=>a.length),4);
  await p.evaluate(()=>{window.__commands=[];});
  await p.click('.play');await wait(p,()=>document.querySelector('.drum-stage')?.textContent.includes('Playing B: Groove'));
  assert.equal(await p.$eval('.patterns [aria-checked=true]',b=>b.textContent),'B');
  assert.equal(await p.$eval('[aria-label="Snare drum step 5"]',b=>b.getAttribute('aria-pressed')),'true');
  await wait(p,()=>document.querySelector('.patterns [aria-checked=true]')?.textContent==='C');
  assert.equal(await p.$eval('[aria-label="Bass drum step 4"]',b=>b.getAttribute('aria-pressed')),'true');
  assert.equal(await p.evaluate(()=>window.__commands.some(([cmd])=>cmd===2)),false,'following pages queued a pattern in the engine');
  await wait(p,()=>Number(document.querySelector('.meter b')?.textContent)>0);await p.click('.play');
  // Custom edits, including a flam, medium accent, length and pattern tempo.
  await textClick(p,'.patterns','H');await p.select('.transport .inline select','12');
  await p.$eval('.transport input[type=number]',input=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'93');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await textClick(p,'.tool','Flam');await p.click('[aria-label="Bass drum step 2"]');
  await p.click('[aria-label="Accent step 2"]');await p.click('[aria-label="Accent step 2"]');
  await textClick(p,'.shelf-switch','Sounds');await textClick(p,'.presets','Boom');
  await p.click('button[aria-label="Effects rack"]');await textClick(p,'.rack-recipes','Dub echoes');
  assert.equal(await p.$$eval('.rack-block header p',a=>a.length),0,'effect taglines remain');
  assert.equal(await p.$$eval('.rack-recipes button',a=>a.length),14);
  await pause(450);const before=await stored(p,id);
  await textClick(p,'.synth-bar','Share drums');await wait(p,()=>window.__copied?.includes('#drum='));const url=await p.evaluate(()=>window.__copied);
  assert.ok(url.includes('#drum=2.')&&url.length<750,`oversized usual share URL: ${url.length}`);
  await context.close();
  const receiver=await browser.createBrowserContext();
  const seed=await receiver.newPage();await seed.goto(`${origin}/synths/${id}/`,{waitUntil:'networkidle0'});
  await seed.evaluate(id=>{for(const key of ['patterns','patch','rack'])localStorage.setItem(`synths:${id}:${key}`,JSON.stringify(key==='patch'?{name:'Stale kit',values:{tempo:55}}:key==='rack'?{'effects.delay':.8}:null));},id);await seed.close();
  // Open an old-format link to prove that existing shares still load, then re-share it.
  const b=before.patterns,cells=b.patterns.flat(2),bytes=Buffer.alloc(cells.length/4);cells.forEach((v,i)=>bytes[i>>2]|=v<<(i%4)*2);
  const old={v:1,k:id,p:bytes.toString('base64url'),l:b.lengths,t:b.tempos,c:b.chain,i:b.current,title:b.title,n:b.names,sound:before.patch.name,s:before.patch.values,r:before.rack};
  const legacy=`${origin}/synths/${id}/#drum=${Buffer.from(JSON.stringify(old)).toString('base64url')}`;
  const q=await pageFor(receiver,id,legacy);await pause(450);const after=await stored(q,id);
  assert.deepEqual(after,before,'shared state did not override recipient storage');
  await textClick(q,'.synth-bar','Share drums');await wait(q,()=>window.__copied?.includes('#drum=2.'));
  assert.equal(await q.evaluate(()=>window.__copied),url,'re-sharing the legacy link changed its state');
  await q.goto(url,{waitUntil:'networkidle0'});await q.reload({waitUntil:'networkidle0'});await q.click('.wake');await wait(q,()=>!document.querySelector('.wake'));
  assert.equal(await q.$eval('.patterns [aria-checked=true]',b=>b.textContent),'H');
  assert.ok(await q.$eval('[aria-label="Bass drum step 2"]',b=>b.classList.contains('flam')));
  await q.click('.play');await wait(q,()=>document.querySelector('.drum-stage')?.textContent.includes('Playing B: Groove'));await q.click('.play');
  // A direct edit detaches the old shared URL, and fallback still offers a copyable link.
  const fader=await q.$('[role=slider][aria-label="Tempo"]');await fader.focus();await q.keyboard.press('ArrowUp');assert.equal(new URL(q.url()).hash,'');
  await q.evaluate(()=>Object.defineProperty(navigator.clipboard,'writeText',{value:async()=>{throw Error('clipboard denied');},configurable:true}));
  await textClick(q,'.synth-bar','Share drums');await wait(q,()=>document.querySelector('[aria-label="Drum share link"]'));
  await q.evaluate(()=>document.querySelector('[aria-label="Drum share link"]').blur());
  // Test the longest chain because it gives the transport the most to wrap.
  await textClick(q,'.shelf-switch','Arrangements');await q.select('[aria-label="Drum arrangement"]','house-lift');await textClick(q,'.presets','Load arrangement');
  for(const [width,height]of [[390,844],[768,1024],[1280,800],[1920,1080],[3837,1747]]){
   await q.setViewport({width,height});await pause(60);
   const layout=await q.evaluate(()=>{
    const t=document.querySelector('.transport'),r=t.getBoundingClientRect();
    const over=[...t.querySelectorAll('button,input,select,.drum-stage')].filter(e=>{const b=e.getBoundingClientRect();return b.bottom>r.bottom+1||b.right>r.right+1;}).map(e=>e.textContent||e.getAttribute('aria-label'));
    return {doc:document.documentElement.scrollWidth,viewport:innerWidth,over,wide:[...document.querySelectorAll('body *')].filter(e=>{const b=e.getBoundingClientRect();return b.right>innerWidth+1&&getComputedStyle(e).position!=='absolute';}).slice(0,10).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right}))};
   });
   await q.screenshot({path:`${out}/${id}-${width}.png`});
   assert.equal(layout.doc<=width+1,true,`${id} ${width}: document overflow ${JSON.stringify(layout)}`);assert.deepEqual(layout.over,[],`${id} ${width}: transport overflow`);
   results.push({id,width,height,link:true,audio:true});
  }
  // Loops disable song playback and preserve the other seven patterns.
  await textClick(q,'.shelf-switch','Beats');await q.select('[aria-label="Drum loop"]','flam-parade');
  await q.click('.play');await wait(q,()=>document.querySelector('.seq-cells')?.dataset.running==='1');await q.evaluate(()=>{window.__commands=[];});
  await textClick(q,'.presets','Load loop');assert.equal(await q.$$eval('.chain .link',a=>a.length),0);
  await pause(200);assert.equal(await q.$eval('.play',b=>b.getAttribute('aria-pressed')),'true');assert.equal(await q.$eval('.seq-cells',e=>e.dataset.running),'1');
  assert.equal(await q.evaluate(()=>window.__commands.some(([cmd])=>cmd===0||cmd===6)),false,'loading a loop restarted or stopped playback');
  await q.click('.play');
  // Compare the actual output tails with dry native effects and neutral outboard.
  await textClick(q,'.shelf-switch','Sounds');await textClick(q,'.presets','Classic');
  await q.click('button[aria-label="Effects rack"]');await textClick(q,'.rack-recipes','Clean');await textClick(q,'.rack-toolbar','Clear rack tails');await q.click('button[aria-label="Effects rack"]');
  const tails=[];
  for(const mode of ['Classic','Deep']){
   await textClick(q,'.synth-bar','Panic');await textClick(q,'[role=radiogroup][aria-label="Kick body"]',mode);
   const time=await q.evaluate(()=>window.__audioContext.currentTime);await q.click('.seq-names button:nth-child(2)');
   await wait(q,time=>window.__audioContext.currentTime>=time+.6,time);
   tails.push(await q.evaluate(()=>new Promise(resolve=>{const node=window.__tap;const listener=({data})=>{if(data.type!=='scope')return;node.port.removeEventListener('message',listener);resolve(Math.sqrt(data.samples.reduce((s,v)=>s+v*v,0)/data.samples.length));};node.port.addEventListener('message',listener);node.port.start();node.port.postMessage({type:'scope',n:4096});})));
  }
  assert.ok(tails[1]>Math.max(1e-7,tails[0])*1.8,`${id}: Deep did not retain its much longer kick tail ${tails}`);
  console.log(`${id}: dry Classic/Deep output tail RMS ${tails.map(x=>x.toFixed(6)).join(' / ')}`);
  await receiver.close();console.log(`${id}: compact/legacy links, page follow, uninterrupted loop loading, playback and five layouts passed`);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/results.json`,JSON.stringify({results,errors},null,2));
}finally{await browser.close();}
