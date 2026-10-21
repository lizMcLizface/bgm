// Actual browser audio, same-tab editing and a separate connected controller.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const origin=process.env.SYNTH_PUBLIC_URL??'http://127.0.0.1:5187',out='.tmp/synth-rack';fs.mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required']});
const errors=[],results=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=(page,fn,...args)=>page.waitForFunction(fn,{polling:100},...args);
async function set(page,key,value){
 await page.$eval(`[data-rack-param="${key}"] input[type=number]`,(input,value)=>{input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));input.blur();},value);
}
async function signal(page,n=4096){return page.evaluate(n=>new Promise(resolve=>{
 const node=window.__tap,listener=({data})=>{if(data.type!=='scope')return;node.port.removeEventListener('message',listener);const a=data.samples;resolve({peak:Math.max(...a.map(Math.abs)),rms:Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length),finite:a.every(Number.isFinite)});};
 node.port.addEventListener('message',listener);node.port.start();node.port.postMessage({type:'scope',n});
}),n);}
async function source(id){
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});
 await page.evaluateOnNewDocument(()=>{
  const piano={id:'audit-piano',name:'Test piano',state:'connected',onmidimessage:null};
  Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>({inputs:new Map([[piano.id,piano]]),onstatechange:null})});
  window.__midi=data=>piano.onmidimessage?.({data});
  localStorage.setItem('synths:setup',JSON.stringify({...JSON.parse(localStorage.getItem('synths:setup')??'{}'),keys:'show'}));
  const Node=window.AudioWorkletNode;
  window.AudioWorkletNode=new Proxy(Node,{construct(Target,args){
   const node=new Target(...args);
   if(['calmbgm-subtractive','calmbgm-fm','calmbgm-classics'].includes(args[1])){window.__context=args[0];const make=args[0].createDynamicsCompressor.bind(args[0]);args[0].createDynamicsCompressor=()=>window.__compressor=make();const gain=args[0].createGain.bind(args[0]);window.__gains=[];args[0].createGain=()=>{const n=gain();window.__gains.push(n);return n;};const connect=node.connect.bind(node);node.connect=(target,...rest)=>{window.__rackInput=target;return connect(target,...rest);};}
   if(args[1]==='calmbgm-output-scope')window.__tap=node;
   return node;
  }});
 });
 await page.goto(`${origin}/synths/${id}/?bank=${id}-originals&program=3`,{waitUntil:'networkidle0'});
 await wait(page,()=>document.querySelector('.wake')&&!document.querySelector('.wake').disabled);await page.click('.wake');await wait(page,()=>!document.querySelector('.wake'));
 return page;
}
try{
 const page=await source('poly');
 await page.locator('h1').click();await page.keyboard.down('a');await wait(page,()=>Number(document.querySelector('.meter b')?.textContent)>0);
 await page.click('button[aria-label="Effects rack"]');assert.ok(await page.$eval('.meter b',e=>Number(e.textContent)>0),'opening rack interrupted the voice');
 await page.keyboard.up('a');await page.locator('button::-p-text(Panic)').click();
 assert.equal(await page.$$('.rack-block').then(a=>a.length),10);
 const popup=await page.$eval('.rack-toolbar a',a=>a.href),polyId=new URL(popup).searchParams.get('target');
 // Inject a known sine into the real rack input while the synth is silent.
 await page.locator('.rack-recipes button::-p-text(Clean)').click();
 // A number may be outside the allowed range while it is being typed. Clamp
 // only on commit, so entering 100 does not turn its first digit into 40.
 const time=await page.$('[data-rack-param="effects.delayMs"] input[type=number]');await time.focus();await page.keyboard.down('Control');await page.keyboard.press('a');await page.keyboard.up('Control');await page.keyboard.type('100');await page.keyboard.press('Enter');
 await wait(page,()=>document.querySelector('[data-rack-param="effects.delayMs"] input[type=number]')?.value==='100');
 await set(page,'effects.delayMs',375);
 await page.evaluate(()=>{const c=window.__context,o=c.createOscillator(),g=c.createGain();o.frequency.value=997;g.gain.value=.5;o.connect(g);g.connect(window.__rackInput);o.start();window.__probe=o;});
 await pause(350);const clean=await signal(page);assert.ok(clean.finite&&clean.rms>.1);
 const recipes=await page.$$eval('.rack-recipes button',buttons=>buttons.map(b=>b.textContent));
 for(const name of recipes){
  await page.evaluate(name=>[...document.querySelectorAll('.rack-recipes button')].find(b=>b.textContent===name).click(),name);
  await page.locator('button::-p-text(Clear rack tails)').click();await pause(200);
  const audio=await signal(page);assert.ok(audio.finite&&audio.rms>.001&&audio.peak<2,`${name}: invalid rack output ${JSON.stringify(audio)}`);
 }
 await page.locator('.rack-recipes button::-p-text(Clean)').click();await page.locator('button::-p-text(Clear rack tails)').click();await pause(350);
 console.log(`${recipes.length} effects presets produce finite, bounded real audio.`);
 await page.click('button[aria-label="Bypass effects rack"]');await pause(350);const bypass=await signal(page);assert.ok(Math.abs(clean.rms-bypass.rms)/clean.rms<.015,'clean rack changes the signal');
 await page.click('button[aria-label="Bypass effects rack"]');
 await set(page,'compressor.threshold',-35);await set(page,'compressor.ratio',12);await page.click('button[aria-label="Compressor enabled"]');
 // The native compressor applies automatic makeup in addition to metered
 // reduction: https://www.w3.org/TR/webaudio-1.0/#computing-the-makeup-gain
 // Verify both its actual output and its reduction, rather than equating them.
 await pause(600);const compressed=await signal(page),parameters=await page.evaluate(()=>({actual:Object.fromEntries(['threshold','ratio','knee','attack','release'].map(k=>[k,window.__compressor[k].value])),reduction:window.__compressor.reduction}));
 assert.equal(parameters.actual.threshold,-35);assert.equal(parameters.actual.ratio,12);assert.ok(parameters.reduction<-15);
 assert.ok(compressed.finite&&compressed.rms<clean.rms*.8,`compressor did not process audio: ${JSON.stringify({clean,compressed,parameters})}`);
 assert.ok(await page.$eval('.rack-reduction meter',m=>m.value>5),'gain-reduction meter is not connected');
 console.log(`Real audio: clean ${clean.rms.toFixed(4)}, bypass ${bypass.rms.toFixed(4)}, compressed ${compressed.rms.toFixed(4)} RMS.`);
 await page.evaluate(()=>window.__midi([0x90,60,100]));await wait(page,()=>document.querySelector('.key[data-note="60"]')?.classList.contains('held'));
 const controller=await browser.newPage();controller.on('pageerror',e=>errors.push(e.message));await controller.setViewport({width:1440,height:1000});await controller.goto(popup,{waitUntil:'networkidle0'});
 await wait(controller,id=>document.querySelector('select[aria-label="Connected synth"]')?.value===id,polyId);
 assert.ok(await page.$eval('.key[data-note="60"]',e=>e.classList.contains('held')),'opening the rack tab released a held MIDI note');
 await page.evaluate(()=>window.__midi([0x80,60,0]));await page.bringToFront();await page.locator('button::-p-text(Panic)').click();await controller.bringToFront();
 await set(controller,'inserts.phaser',31);await wait(page,()=>document.querySelector('[data-rack-param="inserts.phaser"] input[type=number]')?.value==='31');
 await wait(page,()=>JSON.parse(localStorage.getItem('synths:poly:patch'))?.values['inserts.phaser']===.31);
 await set(controller,'compressor.threshold',-42);await wait(page,()=>JSON.parse(localStorage.getItem('synths:poly:rack'))?.['compressor.threshold']===-42);
 assert.equal(new URL(page.url()).searchParams.has('bank'),false,'remote edits retain exact-preset URL');
 const drum=await source('tr606');await drum.click('button[aria-label="Effects rack"]');
 await controller.bringToFront();
 await wait(controller,()=>[...document.querySelector('select[aria-label="Connected synth"]').options].some(o=>o.textContent.includes('TR-606')));
 const drumId=await controller.$eval('select[aria-label="Connected synth"]',s=>[...s.options].find(o=>o.textContent.includes('TR-606')).value);
 await controller.select('select[aria-label="Connected synth"]',drumId);await set(controller,'effects.delayMs',420);
 await wait(drum,()=>document.querySelector('[data-rack-param="effects.delayMs"] input[type=number]')?.value==='420');
 assert.equal(await page.$eval('[data-rack-param="effects.delayMs"] input[type=number]',e=>e.value),'375','controller edited an unselected synth');
 await set(controller,'instrument.reverbMix',60);await wait(drum,()=>JSON.parse(localStorage.getItem('synths:tr606:patch'))?.values.reverbMix===.6);
 await controller.select('select[aria-label="Connected synth"]',polyId);
 await controller.locator('.rack-recipes button::-p-text(Clean)').click();await set(controller,'effects.dry',0);await set(controller,'effects.delay',60);await set(controller,'effects.delayMs',100);await set(controller,'effects.feedback',65);
 await page.evaluate(()=>window.__probe.stop());await controller.locator('button::-p-text(Clear rack tails)').click();await pause(350);
 await page.evaluate(()=>{const c=window.__context,b=c.createBuffer(1,32,c.sampleRate);b.getChannelData(0)[0]=1;const source=c.createBufferSource();source.buffer=b;source.connect(window.__rackInput);source.start();});
 await pause(500);const echo=await signal(page,16384);assert.ok(echo.finite&&echo.peak>.001,'no actual delayed impulse after the source stopped');
 await controller.locator('button::-p-text(Clear rack tails)').click();await pause(250);const silence=await signal(page);assert.ok(silence.peak<1e-5,'clear tails left an audible signal');
 console.log('Separate controller: discovery, native/extra edits, source selection, real echo tails and clear passed.');
 for(const [width,height]of [[3837,1747],[3440,1440],[3035,1125],[2560,1080],[1920,1080],[1440,1000],[1024,768],[768,1024],[390,844]]){
  await page.bringToFront();
  await page.setViewport({width,height});await controller.setViewport({width,height});
  for(const scope of [false,true]){
   const toggle=await page.$('button[title="Oscilloscope and spectrum"]');if((await toggle.evaluate(e=>e.getAttribute('aria-pressed')==='true'))!==scope)await toggle.click();
   const report=await page.evaluate(()=>{
    const panel=document.querySelector('main.panel'),bad=[];
    for(const block of panel.querySelectorAll('.rack-block')){const a=block.getBoundingClientRect();for(const c of block.querySelectorAll('input,select,button,svg')){const b=c.getBoundingClientRect();if(b.left<a.left-1||b.right>a.right+1||b.bottom>a.bottom+1)bad.push(c.getAttribute('aria-label')??c.tagName);if(innerWidth>=2200&&c.matches('input[type=range]')&&b.width<80)bad.push('slider too narrow');}}
    panel.scrollTop=panel.scrollHeight;const bottom=panel.querySelector('.rack-block:last-child').getBoundingClientRect().bottom<=panel.getBoundingClientRect().bottom+1;panel.scrollTop=0;
    const content=panel.querySelector('.rack-content').getBoundingClientRect(),grid=panel.querySelector('.rack-grid');
    return {bad,bottom,panelHeight:panel.clientHeight,bodyWidth:document.documentElement.scrollWidth,contentWidth:content.width,panelWidth:panel.clientWidth,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,scrollHeight:panel.scrollHeight};
   });
   assert.deepEqual(report.bad,[],`${width} scope ${scope}`);assert.ok(report.bottom);assert.ok(report.panelHeight>80);assert.ok(report.bodyWidth<=width+1);
   if(width>=2200){assert.ok(report.contentWidth>=report.panelWidth*.95,'wide rack leaves unused side margins');assert.equal(report.columns,5,'wide rack needs five roomy columns');}
   if(width>=3440)assert.ok(report.scrollHeight<=report.panelHeight+1,'large widescreen should show every block without panel scrolling');
   await page.screenshot({path:`${out}/synth-${width}${scope?'-scope':''}.png`});results.push({width,height,scope,...report});
  }
  assert.ok(await controller.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'standalone horizontal overflow');
  if(width>=2200)assert.ok(await controller.$eval('.rack-content',e=>e.clientWidth>=innerWidth*.95),'standalone rack leaves wide side margins');
  if(width===3837||width===1440||width===390)await controller.screenshot({path:`${out}/controller-${width}.png`,fullPage:true});
 }
 // Choosing a comparison program restores its exact recipe and neutral extras.
 await page.locator('.comparison-presets button::-p-text(Load program)').click();await wait(page,()=>!!JSON.parse(localStorage.getItem('synths:poly:patch'))?.comparison);
 assert.equal(await page.$eval('[data-rack-param="effects.reverb"] input[type=number]',e=>e.value),'22');
 assert.equal(await page.$eval('button[aria-label="Compressor enabled"]',e=>e.getAttribute('aria-pressed')),'false');
 await drum.close();await wait(controller,id=>![...document.querySelector('select[aria-label="Connected synth"]').options].some(o=>o.value===id),drumId);
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/results.json',JSON.stringify({results,clean,bypass,compressed,echo,silence,errors},null,2));
 console.log('All rack layouts, preset restoration and disconnect checks passed.');
}finally{await browser.close();}
