import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer-core';
const arg=(k,d)=>process.argv.find(v=>v.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const browserName=process.env.SYNTH_BROWSER==='firefox'?'firefox':'chrome',out=path.resolve(process.env.SYNTH_PROFILE_DIR??'.tmp/fm-bank/results'),seconds=Number(arg('seconds',4)),repeats=Number(arg('repeats',3));
if(![1,3,5].includes(repeats)||!Number.isFinite(seconds)||seconds<1||seconds>30)throw Error('Invalid repetitions/duration');
const builds=JSON.parse(await fs.readFile('.tmp/fm-bank/builds.json','utf8')),files={scalar:'.tmp/bank-baseline/fm.wasm',simd:'.tmp/bank-baseline/fm-simd.wasm',bank:'.tmp/fm-bank/bank.wasm'},modules={},hashes={};
for(const [k,f]of Object.entries(files)){const bytes=await fs.readFile(f);modules[k]=bytes.toString('base64');hashes[k]=crypto.createHash('sha256').update(bytes).digest('hex');}if(hashes.bank!==builds.bank.sha256)throw Error('Stale bank binary');
await fs.mkdir(out,{recursive:true});const report={created:new Date().toISOString(),cpu:os.cpus()[0]?.model,builds,hashes,protocol:{seconds,repeats,rate:48000,block:128,quality:'Full 2x unless mixed fixture',warmup:1,order:'rotating scalar, individual SIMD, same-module independent, bank'},rows:[],errors:[]};
const browser=await puppeteer.launch({browser:browserName,executablePath:process.env.SYNTH_BROWSER_PATH??(browserName==='chrome'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'.tmp/browsers/firefox/win64-stable_158.0/core/firefox.exe'),headless:true,args:browserName==='chrome'?['--no-sandbox','--mute-audio']:[],protocolTimeout:600000});
try{report.browser=await browser.version();const p=await browser.newPage();p.on('pageerror',e=>report.errors.push(String(e)));await p.goto(process.env.SYNTH_LAB_URL??'http://127.0.0.1:5173/tools/fm.html');await p.exposeFunction('__bankProgress',r=>console.log(JSON.stringify(r)));
report.rows=await p.evaluate(async({modules,seconds,repeats,requested})=>{
 const {bankFixture}=await import('/src/synth-lab/fmBankBench.js'),{FM_RECIPES,cloneFM}=await import('/src/synth-lab/fmPatch.js');
 const compiled=Object.fromEntries(await Promise.all(Object.entries(modules).map(async([k,b])=>[k,await WebAssembly.compile(Uint8Array.from(atob(b),c=>c.charCodeAt(0)))])));
 const specs=[{id:'sparse-two',recipes:[0,2],voices:1},{id:'sparse-four',recipes:[0,2,5,9],voices:1},{id:'duets-four',recipes:[0,2,5,9],voices:2},{id:'dense-four',recipes:[0,2,5,9],voices:8},{id:'mixed-quality',recipes:[0,2,5,9],voices:1,mixed:true}].filter(s=>!requested.length||requested.includes(s.id));
 const rows=[],modes=['scalar','simd','bank-independent','bank'];
 for(const spec of specs){const patches=spec.recipes.map((i,s)=>{const p=cloneFM(FM_RECIPES[i]);p.global.quality=spec.mixed&&s>=2?s-2:1;p.global.polyphony=16;return p;}),options={seconds,voices:spec.voices};
  const validation=modes.map(mode=>bankFixture(compiled,patches,{...options,mode,capture:true}));let maxDifference=0;
  for(let k=1;k<modes.length;k++)for(let s=0;s<patches.length;s++)for(let i=0;i<validation[0].pcm[s].length;i++){const a=validation[0].pcm[s][i],b=validation[k].pcm[s][i];if(!Number.isFinite(b))throw Error('Nonfinite PCM');maxDifference=Math.max(maxDifference,Math.abs(a-b));}if(maxDifference!==0)throw Error('PCM mismatch '+spec.id+': '+maxDifference);
  const runs=modes.map(()=>[]);for(let repeat=0;repeat<repeats;repeat++)for(let j=0;j<modes.length;j++){const k=(j+repeat)%modes.length;runs[k].push(bankFixture(compiled,patches,{...options,mode:modes[k]}).ms);}
  const medians=runs.map(a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)]),row={...spec,patches,medians:Object.fromEntries(modes.map((m,i)=>[m,medians[i]])),runs,maxDifference,vectorFrames:validation.at(-1).vectorFrames,memory:validation.map(r=>r.memory),reduction:1-medians[3]/medians[0]};rows.push(row);await __bankProgress({id:row.id,medians:row.medians,reduction:row.reduction});
 }return rows;
},{modules,seconds,repeats,requested:arg('cases','').split(',').filter(Boolean)});if(report.errors.length)throw Error(report.errors.join('\n'));
}catch(e){report.failure=String(e);process.exitCode=1;console.error(e);}finally{await fs.writeFile(path.join(out,browserName+'-kernels.json'),JSON.stringify(report,null,2));await browser.close();}
