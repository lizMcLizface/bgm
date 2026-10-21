// Run against the public Vite preview; exercise the actual existing Wasm cores.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const origin=process.env.SYNTH_PUBLIC_URL??'http://127.0.0.1:5187',out='.tmp/diy-synths';
fs.mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required']});
const results=[],errors=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.evaluateOnNewDocument(()=>{
  const Node=window.AudioWorkletNode;
  window.AudioWorkletNode=new Proxy(Node,{construct(Target,args){const node=new Target(...args);if(args[1]==='calmbgm-output-scope')window.__output=node;return node;}});
 });
 await page.goto(origin+'/synths/',{waitUntil:'networkidle0'});
 assert.deepEqual(await page.$$eval('.home-category h2',nodes=>nodes.map(n=>n.textContent)),['Vintage','DIY','Drums']);
 assert.equal(await page.$$eval('.home-grid a',nodes=>nodes.length),14);
 await page.screenshot({path:out+'/hub.png',fullPage:true});
 for(const id of ['poly','fm']){
  await page.setViewport({width:1440,height:1000});
  await page.goto(`${origin}/synths/${id}/?bank=${id}-originals&program=3`,{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>document.querySelector('.wake')&&!document.querySelector('.wake').disabled);
  await page.click('.wake');await page.waitForFunction(()=>!document.querySelector('.wake'));
  if(id==='poly'){
   await page.click('.diy-switch button:nth-child(2)');
   const cutoff=await page.$('[role=slider][aria-label="Low-pass cutoff"]');await cutoff.focus();await page.keyboard.press('ArrowUp');
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('synths:poly:patch')).values['layers.1.cutoff']!==1900);
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('synths:poly:patch')).values['layers.0.cutoff']),850);
  }else{
   await page.select('select[aria-label="Operator count"]','6');
   await page.click('.diy-operators button:nth-child(6)');
   await page.locator('button::-p-text(Advanced)').click();
   await page.$eval('input[aria-label="Operator 1 to 6"]',e=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,'0.7');e.dispatchEvent(new Event('input',{bubbles:true}));});
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('synths:fm:patch')).values['routes.0.5']===.7);
  }
  // The output tap captures the audible, post-effects stereo graph, not a
  // synthetic visualisation. A chord must produce real samples.
  await page.locator('h1').click();await page.keyboard.down('a');await page.keyboard.down('d');await page.keyboard.down('g');
  await page.waitForFunction(()=>Number(document.querySelector('.meter b')?.textContent)>=3);
  const signal=await page.evaluate(()=>new Promise(resolve=>{
   const node=window.__output,listener=({data})=>{if(data.type!=='scope')return;node.port.removeEventListener('message',listener);const samples=Array.from(data.samples);resolve({peak:Math.max(...samples.map(Math.abs)),rms:Math.sqrt(samples.reduce((s,v)=>s+v*v,0)/samples.length),finite:samples.every(Number.isFinite)});};
   node.port.addEventListener('message',listener);node.port.start();node.port.postMessage({type:'scope',n:4096});
  }));
  assert.ok(signal.finite&&signal.rms>1e-5&&signal.peak<2,`${id} invalid output ${JSON.stringify(signal)}`);
  await page.keyboard.up('a');await page.keyboard.up('d');await page.keyboard.up('g');
  await page.locator('button::-p-text(Panic)').click();
  for(const [width,height]of [[1920,1080],[1440,900],[1024,768],[768,1024],[390,844]]){
   await page.setViewport({width,height});
   for(const tab of ['Tone','Motion','Colour','Advanced']){
    await page.locator(`.diy-tabs button::-p-text(${tab})`).click();
    const report=await page.evaluate(()=>{
     const panel=document.querySelector('main.panel'),bad=[],groups=[...panel.querySelectorAll('.group')];
     for(let i=0;i<groups.length;i++){
      const a=groups[i].getBoundingClientRect();
      for(const c of groups[i].querySelectorAll('[role=slider],select,input')){
       // Wide FM routing intentionally scrolls inside its own container.
       if(c.closest('.diy-routing-scroll'))continue;
       const b=c.getBoundingClientRect();if(b.left<a.left-1||b.right>a.right+1||b.bottom>a.bottom+1)bad.push(c.getAttribute('aria-label')??c.className);
      }
      for(let j=i+1;j<groups.length;j++){const b=groups[j].getBoundingClientRect();if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)bad.push('overlapping groups');}
     }
     return {bad,bodyWidth:document.documentElement.scrollWidth,panelHeight:panel.clientHeight};
    });
    assert.deepEqual(report.bad,[],`${id} ${width} ${tab}`);assert.ok(report.bodyWidth<=width+1,`${id} ${width} overflow`);assert.ok(report.panelHeight>80);
    if(width===1440||width===390)await page.screenshot({path:`${out}/${id}-${width}-${tab}.png`});
    assert.ok(await page.evaluate(()=>{const p=document.querySelector('main.panel');p.scrollTop=p.scrollHeight;const last=[...p.querySelectorAll('.group')].at(-1);return !last||last.getBoundingClientRect().bottom<=p.getBoundingClientRect().bottom+1;}),'bottom controls unreachable');
    await page.$eval('main.panel',p=>p.scrollTop=0);
    results.push({id,width,height,tab,...report});
   }
   const toggle=await page.$('button[title="Oscilloscope and spectrum"]');
   await toggle.click();assert.ok(await page.$eval('main.panel',p=>p.clientHeight>80),'scope leaves panel unusable');await toggle.click();
  }
  await page.setViewport({width:1440,height:1000});
  await page.locator('button[aria-label="Setup"]').click();await page.locator('button::-p-text(Restart audio)').click();
  await page.waitForFunction(()=>!document.querySelector('.wake'));
  await page.locator('h1').click();await page.keyboard.down('a');await page.waitForFunction(()=>Number(document.querySelector('.meter b')?.textContent)>0);await page.keyboard.up('a');
  console.log(`${id}: audio ${signal.rms.toFixed(4)} RMS; 20 layouts, controls, routing and restart passed.`);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/results.json',JSON.stringify({results,errors},null,2));
}finally{await browser.close();}
