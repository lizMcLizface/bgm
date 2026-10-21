// Layout and interaction regression audit for the full VS panel.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const origin=process.env.SYNTH_PUBLIC_URL??'http://127.0.0.1:5187';
const out='.tmp/vs-layout';fs.mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width:1440,height:1000});
 await page.goto(origin+'/synths/vs/?bank=vs-factory&program=0',{waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.querySelector('.wake')&&!document.querySelector('.wake').disabled);
 await page.click('.wake');await page.waitForFunction(()=>!document.querySelector('.wake'));
 const results=[];
 for(const [width,height] of [[3035,1125],[1920,1080],[1440,900],[1280,800],[1024,768],[768,1024],[390,844]]){
  await page.setViewport({width,height});
  for(const scope of [false,true]){
   const toggle=await page.$('button[title="Oscilloscope and spectrum"]');
   if((await toggle.evaluate(el=>el.getAttribute('aria-pressed')==='true'))!==scope)await toggle.click();
   await page.evaluate(()=>document.querySelector('main.panel').scrollTo(0,0));
   const report=await page.evaluate(()=>{
    const panel=document.querySelector('main.panel'),rect=el=>el.getBoundingClientRect(),groups=[...panel.querySelectorAll('.group')],bad=[];
    for(let i=0;i<groups.length;i++){
     const g=groups[i],a=rect(g),title=g.querySelector('h3')?.textContent;
     for(const c of g.querySelectorAll('[role=slider],.fader-label,select,input,button')){
      const b=rect(c);
      if(b.left<a.left-1||b.right>a.right+1||b.top<a.top-1||b.bottom>a.bottom+1)bad.push(title+': overflowing '+(c.getAttribute('aria-label')??c.className));
     }
     for(let j=i+1;j<groups.length;j++){
      const b=rect(groups[j]);
      if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)bad.push(title+': overlapping '+groups[j].querySelector('h3')?.textContent);
     }
    }
    return {bad,bodyWidth:document.documentElement.scrollWidth,width:innerWidth,panelHeight:panel.clientHeight,groups:groups.length};
   });
   assert.deepEqual(report.bad,[],`${width}x${height}, scope ${scope}`);
   assert.ok(report.bodyWidth<=width+1,'horizontal page overflow');assert.ok(report.panelHeight>80,'panel has no usable height');
   const name=`${width}x${height}${scope?'-scope':''}`;
   await page.screenshot({path:`${out}/${name}.png`});
   await page.evaluate(()=>{const p=document.querySelector('main.panel');p.scrollTop=p.scrollHeight;});
   assert.equal(await page.evaluate(()=>{const p=document.querySelector('main.panel'),last=[...p.querySelectorAll('.group')].at(-1);return last.getBoundingClientRect().bottom<=p.getBoundingClientRect().bottom+1;}),true,'bottom controls unreachable');
   if(width===1440||width===390)await page.screenshot({path:`${out}/${name}-bottom.png`});
   results.push({width,height,scope,groups:report.groups,panelHeight:report.panelHeight});
  }
 }
 // Both newly presented controls must still edit the correct engine parameters.
 await page.setViewport({width:1440,height:1000});
 await page.select('select[aria-label="Amplifier envelope loop"]','3');
 const range=await page.$('input[aria-label="Pressure amount"]');await range.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>{const p=JSON.parse(localStorage.getItem('synths:vs:patch')??'null');return p?.values.ampLoop===3&&p.values.pressureAmount===-98;});
 await page.keyboard.press('Tab');await page.locator('h1').click();await page.keyboard.down('a');
 await page.waitForFunction(()=>Number(document.querySelector('.meter b')?.textContent)>0);await page.keyboard.up('a');
 assert.deepEqual(errors,[]);console.table(results);
 fs.writeFileSync(out+'/results.json',JSON.stringify({results,interactions:true,errors},null,2));
}finally{await browser.close();}
