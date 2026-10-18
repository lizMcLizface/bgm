// Opt-in full-graph benchmark. Start npm run dev; run browsers separately.
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import puppeteer from 'puppeteer-core';
const arg=(key,d)=>process.argv.find(v=>v.startsWith('--'+key+'='))?.split('=').slice(1).join('=')??d;
const name=process.env.SYNTH_BROWSER==='firefox'?'firefox':'chrome',executablePath=process.env.SYNTH_BROWSER_PATH||(name==='chrome'?['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync):null);
if(!executablePath)throw Error('Set SYNTH_BROWSER_PATH to an installed browser.');
const output=path.resolve(process.env.SYNTH_AUDIT_DIR||'.tmp/stress-audit'),origin=process.env.SYNTH_LAB_URL||'http://localhost:5173';await fs.mkdir(output,{recursive:true});
const browser=await puppeteer.launch(name==='firefox'?{browser:'firefox',executablePath,headless:true,defaultViewport:null,extraPrefsFirefox:{'media.autoplay.default':0},protocolTimeout:600000}:{executablePath,headless:true,pipe:true,args:['--no-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required'],protocolTimeout:600000});
const report={version:1,created:new Date().toISOString(),browser:name,browserVersion:await browser.version(),system:{platform:os.platform(),release:os.release(),cpu:os.cpus()[0]?.model,logicalCPUs:os.cpus().length,totalMemory:os.totalmem()},errors:[],live:[],method:'Headless desktop. Offline wall throughput is not live audio CPU/underruns. Software GPU runs are labelled. Browsers must be run sequentially.'};
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 await page.goto(origin+'/tools/stress.html');await page.waitForFunction(()=>window.__stressLab,{timeout:30000});
 if(!process.argv.includes('--skip-offline')){
  const suite=arg('suite','core'),repeats=Number(arg('repeats','3')),ids=arg('cases','').split(',').filter(Boolean);console.log(`Offline ${suite} / ${repeats} measured runs; warm-up excluded.`);
  // Poll progress outside the page's long evaluate so completed cases are visible.
  await page.evaluate(options=>{window.__stressAuditPromise=window.__stressLab.run(options);},ids.length?{caseIds:ids,repeats,warmup:!process.argv.includes('--no-warmup')}:{suite,repeats,warmup:!process.argv.includes('--no-warmup')});
  let seen=0;while(await page.evaluate(()=>window.__stressLab.busy)){
   await new Promise(resolve=>setTimeout(resolve,500));const rows=await page.evaluate(()=>window.__stressLab.report.offline.map(r=>({id:r.id,status:r.status,summary:r.summary,error:r.error})));for(const r of rows.slice(seen))console.log(JSON.stringify(r));seen=rows.length;
  }
  report.matrix=await page.evaluate(()=>window.__stressAuditPromise);await fs.writeFile(path.join(output,name+'.json'),JSON.stringify(report,null,2));
 }
 if(process.argv.includes('--verify')){const ids=['sub-layers','fm-six','mixed-room','mixed-private','room-long','mixed-96'];console.log('Verification subset / three measured runs.');report.verified=await page.evaluate(caseIds=>window.__stressLab.run({caseIds,repeats:3,warmup:true}),ids);}
 if(process.argv.includes('--live'))for(const caseId of arg('live-cases','mixed-room,boundary-band').split(','))for(const fluidResolution of arg('fluids','0,256,512').split(',').map(Number)){
  const seconds=Number(arg('seconds','30'));console.log(`Live ${caseId} / fluid ${fluidResolution} / ${seconds} s`);
  const row=await page.evaluate(opts=>window.__stressLab.live(opts),{caseId,fluidResolution,seconds,warmupSeconds:2});report.live.push(row);await fs.writeFile(path.join(output,name+'.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({caseId,fluidResolution,status:row.status,clock:row.clock,frame:row.frame,fluid:row.fluid,telemetry:row.sourceTelemetryComplete,counters:Object.values(row.stats.sources).reduce((a,s)=>({late:a.late+(s.late??0),dropped:a.dropped+(s.dropped??0),steals:a.steals+(s.steals??0)}),{late:0,dropped:0,steals:0}),missed:row.stats.missedCycles}));
 }
 await page.screenshot({path:path.join(output,name+'-desktop.png'),fullPage:true});await page.setViewport({width:390,height:844});report.layout={width:390,scroll:await page.evaluate(()=>document.documentElement.scrollWidth)};await page.screenshot({path:path.join(output,name+'-mobile.png'),fullPage:true});
 const last=await page.evaluate(()=>window.__stressLab.report);report.final=last;
 if(report.errors.length||report.layout.scroll>390)throw Error('Browser errors or layout overflow.');
 const bad=last.offline.filter(r=>r.status!=='complete'||r.summary.nonFinite||r.summary.silent||r.summary.clipped||r.summary.dropped||r.summary.late||r.summary.missingStats);if(bad.length)throw Error('Inspect offline cases: '+bad.map(r=>r.id).join(', '));
 if(report.live.some(r=>r.status!=='complete'||r.errors.length||!r.sourceTelemetryComplete))throw Error('Inspect incomplete live sessions.');
 console.log('Complete; inspect throughput and live observations in '+path.join(output,name+'.json'));
}catch(e){report.failure=String(e);process.exitCode=1;console.error(e);}finally{await fs.writeFile(path.join(output,name+'.json'),JSON.stringify(report,null,2));await browser.close();}
