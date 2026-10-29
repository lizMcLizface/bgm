// Measures instrument levels (full velocity) in headless Chrome and merges them into src/labs/levels/suite.json,
// the data the /labs/levels/ page ships with. Needs the dev server (npm run dev) running.
// The work is split across several Chrome processes (one shard each), so it uses several cores.
//
//   npm run levels:measure                 measure what is missing or changed since it was measured
//   npm run levels:measure -- --all        re-measure everything
//   npm run levels:measure -- --group=bass measure one category (ids: see src/labs/levels/groups.js)
//   npm run levels:measure -- --ids=library-Warm%20Strings,rosin-silk
//   npm run levels:measure -- --workers=8  Chrome processes to run at once (default: a quarter of the logical cores, 2 to 8)
//   npm run levels:measure -- --keep-removed   do not drop voices that no longer exist
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const arg=(key,fallback)=>process.argv.find(s=>s.startsWith('--'+key+'='))?.slice(key.length+3)??fallback;
const flag=key=>process.argv.includes('--'+key);
const origin=process.env.SYNTH_LAB_URL||'http://localhost:5173',file=path.resolve('src/labs/levels/suite.json');
const workers=Math.max(1,Number(arg('workers',Math.min(8,Math.max(2,Math.floor(os.availableParallelism()/4))))));
const suite=JSON.parse(await fs.readFile(file,'utf8'));
const launch=()=>puppeteer.launch({executablePath:process.env.SYNTH_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required']});
async function open(browser,label){
 const page=await browser.newPage();page.on('pageerror',e=>console.error(label,'page error:',e.message));
 await page.exposeFunction('report',line=>console.log(label+line));await page.goto(origin+'/tools/stress.html');return page;
}
const known=Object.fromEntries(Object.entries(suite.voices).map(([id,v])=>[id,v.sig]));
const options={all:flag('all'),group:arg('group'),ids:arg('ids')?.split(',').map(decodeURIComponent)};

// Which instruments need measuring, and which exist at all.
let plan;
{const browser=await launch();try{
 plan=await (await open(browser,'')).evaluate(async(known,options)=>{
  const {LAB_VOICES}=await import('/src/labs/catalog.js'),{signature}=await import('/src/labs/levels/render.js'),{groupOf}=await import('/src/labs/levels/groups.js');
  const wanted=options.ids?new Set(options.ids):null;
  return {todo:LAB_VOICES.filter(v=>!wanted||wanted.has(v.id)).filter(v=>!options.group||groupOf(v.family,v.name)===options.group).filter(v=>options.all||wanted||known[v.id]!==signature(v)).map(v=>v.id),current:LAB_VOICES.map(v=>v.id)};
 },known,options);
}finally{await browser.close();}}
console.log(`${plan.todo.length} of ${plan.current.length} instruments to measure, in ${Math.min(workers,plan.todo.length)} Chrome processes`);

const results={},failed=[];let finished=0;
async function shard(index,ids){
 const browser=await launch();
 try{
  const page=await open(browser,'');
  const run=await page.evaluate(async(ids,per)=>{
   const {LAB_VOICES}=await import('/src/labs/catalog.js'),{measureAll}=await import('/src/labs/levels/render.js');
   const results={},failed=[];
   await measureAll(LAB_VOICES.filter(v=>ids.includes(v.id)),{concurrency:per,onResult:(v,entry)=>{results[v.id]=entry;report('\u0001'+v.name+'\u0001'+entry.engine);},onFail:(v,e)=>{failed.push(v.name+': '+e.message);report('\u0002'+v.name+': '+e.message);}});
   return {results,failed};
  },ids,2);
  Object.assign(results,run.results);failed.push(...run.failed);
 }finally{await browser.close();}
}
// Progress lines from the shards: \u0001name\u0001engine for a result, \u0002 for a failure.
const shown=console.log;console.log=(...a)=>{const t=String(a[0]);if(t.startsWith('\u0001')){const [,name,engine]=t.split('\u0001');shown(`  ${String(++finished).padStart(3)} / ${plan.todo.length}  ${name} (${engine})`);}else if(t.startsWith('\u0002'))shown('  FAILED '+t.slice(1));else shown(...a);};
const shards=Array.from({length:Math.min(workers,plan.todo.length)},()=>[]);plan.todo.forEach((id,i)=>shards[i%shards.length].push(id));
await Promise.all(shards.map((ids,i)=>shard(i,ids)));
console.log=shown;

const voices={...suite.voices,...results};
if(!flag('keep-removed'))for(const id of Object.keys(voices))if(!plan.current.includes(id)){delete voices[id];console.log('dropped',id);}
const ordered=Object.fromEntries(Object.entries(voices).sort(([a],[b])=>a<b?-1:1));
// One instrument per line keeps the diff of a re-measurement readable.
const body=Object.entries(ordered).map(([id,v])=>JSON.stringify(id)+':'+JSON.stringify(v)).join(',\n');
const head=`{"version":1,"velocity":1,"generated":${JSON.stringify(Object.keys(results).length?new Date().toISOString():suite.generated)},"voices":{\n`;
await fs.writeFile(file,head+body+'\n}}\n');
console.log(`wrote ${Object.keys(ordered).length} instruments to ${path.relative('.',file)}${failed.length?`; ${failed.length} failed`:''}`);
if(failed.length){console.log(failed.join('\n'));process.exitCode=1;}
