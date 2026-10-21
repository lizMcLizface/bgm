// Exercise the actual static/public build, including deep links and audio.
// Start `vite preview --mode public --port 5187`, then run this script.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {parse} from 'yaml';

const origin=process.env.SYNTH_PUBLIC_URL??'http://127.0.0.1:5187';
const index=JSON.parse(fs.readFileSync('dist-public/synth-presets/index.json','utf8'));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required']});
const errors=[],results=[];
try{
 const page=await browser.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width:1280,height:900});
 await page.evaluateOnNewDocument(()=>Object.defineProperty(navigator.clipboard,'writeText',{value:async text=>{window.__copied=text;}}));
 for(const synth of [...new Set(index.banks.map(b=>b.synth))]){
  console.log(`Checking ${synth}…`);
  const entry=index.banks.find(b=>b.synth===synth),bank=parse(fs.readFileSync('dist-public/'+entry.url,'utf8'));
  // Pick a non-first program so a missing URL selection cannot accidentally pass.
  const program=bank.programs[Math.min(2,bank.programs.length-1)];
  const url=`${origin}/synths/${synth}/?bank=${entry.id}&program=${encodeURIComponent(program.id)}`;
  const response=await page.goto(url,{waitUntil:'networkidle0'});assert.equal(response.status(),200);
  await page.waitForFunction(name=>document.querySelector('.patch-name')?.textContent===name,{},program.name);
  await page.waitForFunction(()=>document.querySelector('.wake')&&!document.querySelector('.wake').disabled);
  await page.click('.wake');await page.waitForFunction(()=>!document.querySelector('.wake'));
  const selects=await page.$$('.comparison-presets select');
  assert.equal(await selects[0].evaluate(el=>el.value),entry.id);assert.equal(await selects[1].evaluate(el=>el.value),program.id);
  // Persistence and link loading must agree on every resolved parameter.
  await page.waitForFunction(id=>!!JSON.parse(localStorage.getItem(`synths:${id}:patch`)??'null')?.comparison,{},synth);
  const stored=await page.evaluate(id=>JSON.parse(localStorage.getItem(`synths:${id}:patch`)),synth);
  assert.deepEqual(stored.values,program.values);
  await page.evaluate(()=>[...document.querySelectorAll('.comparison-presets button')].find(b=>b.textContent==='Copy comparison link').click());
  assert.equal(await page.evaluate(()=>window.__copied),url);
  const download=await page.$eval('.comparison-presets a',a=>a.href),yaml=await fetch(download);assert.equal(yaml.status,200);assert.equal(parse(await yaml.text()).id,entry.id);
  // A real worklet must report active voices while a computer key is held.
  if(synth.startsWith('tr')){
   // Drum slots start at MIDI 36, not the shell's default MIDI 48.
   const low=await page.evaluate(()=>JSON.parse(localStorage.getItem('synths:setup')??'{}').keysLow??48);
   for(let n=low;n>36;n-=12)await page.click('button[aria-label="Keys down an octave"]');
  }
  await page.locator('h1').click();await page.keyboard.down('a');
  await page.waitForFunction(()=>Number(document.querySelector('.meter b')?.textContent)>0,{timeout:10000}).catch(e=>{throw Error(`${synth}: no active audio voices (${e.message})`);});
  await page.keyboard.up('a');
  await page.click('button[aria-label="Effects rack"]');
  assert.ok(await page.$eval('.rack-panel',p=>p.querySelectorAll('.rack-block').length>=9),`${synth}: shared effects rack unavailable`);
  await page.click('button[aria-label="Effects rack"]');
  // Editing breaks the exact-preset URL; reload restores it and its values.
  const slider=await page.$('.panel [role=slider]');
  if(slider){await slider.focus();await page.keyboard.press('ArrowUp');assert.equal(new URL(page.url()).searchParams.has('bank'),false);}
  await page.goto(url,{waitUntil:'networkidle0'});
  await page.waitForFunction(name=>document.querySelector('.patch-name')?.textContent===name,{},program.name);
  if(synth==='juno'){
   await page.waitForFunction(()=>document.querySelector('.wake')&&!document.querySelector('.wake').disabled);
   await page.click('.wake');await page.waitForFunction(()=>!document.querySelector('.wake'));
   await page.setViewport({width:390,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,'mobile horizontal overflow');
   fs.mkdirSync('.tmp/synth-public-audit',{recursive:true});await page.screenshot({path:'.tmp/synth-public-audit/juno-phone.png'});
   await page.setViewport({width:1280,height:900});
  }
  results.push({synth,program:program.name,audio:true,link:true,yaml:true});
 }
 assert.deepEqual(errors,[]);console.table(results);
 fs.writeFileSync('.tmp/synth-public-audit/results.json',JSON.stringify({origin,results,errors},null,2));
}finally{await browser.close();}
