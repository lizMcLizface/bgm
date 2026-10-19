// Observe cost/state over a long release, not a fresh voice on every timing pass.
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const firefox=process.argv.includes('--firefox'),out=path.resolve(process.env.SYNTH_PROFILE_DIR??'.tmp/idle-dsp');await fs.mkdir(out,{recursive:true});
const binaries=Object.fromEntries(await Promise.all(['core','fm','inserts'].map(async k=>[k,(await fs.readFile('public/synth-lab/'+k+'.wasm')).toString('base64')])));
const b=await puppeteer.launch({browser:firefox?'firefox':'chrome',executablePath:firefox?'.tmp/browsers/firefox/win64-stable_158.0/core/firefox.exe':'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:firefox?[]:['--no-sandbox','--mute-audio'],protocolTimeout:600000});const report={browser:await b.version(),rows:[]};
try{const p=await b.newPage();await p.goto('http://127.0.0.1:5173/tools/synth-lab.html');await p.exposeFunction('__idleProgress',row=>console.log(JSON.stringify(row)));
report.rows=await p.evaluate(async binaries=>{
 const {DSP_CASES,dspFixture,prepareDsp}=await import('/src/synth-lab/profileDsp.js'),{defaultInserts,insertsPacket}=await import('/src/synth-lab/insertsConfig.js'),modules=Object.fromEntries(await Promise.all(Object.entries(binaries).map(async([k,b])=>[k,await WebAssembly.compile(Uint8Array.from(atob(b),c=>c.charCodeAt(0)))]))),rows=[];
 for(const id of ['core-8','fm-tines','insert-eq','insert-phaser','insert-flanger','insert-chorus','insert-all']){
  const spec=DSP_CASES.find(c=>c.id===id);let run,output,stat,frame=0;
  if(spec.kernel!=='inserts'){const f=dspFixture(spec,{seconds:1});f.notes=f.notes.map(n=>({...n,duration:.05}));const prepared=prepareDsp(modules[f.kernel],f);run=()=>prepared.run().ms;output=prepared.output;stat=prepared.stat;}
  else{const e=new WebAssembly.Instance(modules.inserts,{}).exports;e.inserts_init(48000);insertsPacket({...defaultInserts(),...spec.changes}).forEach(v=>e.inserts_param(...v));e.inserts_settle();const input=[0,1].map(c=>new Float32Array(e.memory.buffer,e.inserts_input(c),2048));output=[0,1].map(c=>new Float32Array(e.memory.buffer,e.inserts_output(c),2048));stat=()=>[];run=()=>{const start=performance.now();for(let at=0;at<48000;at+=128){const n=Math.min(128,48000-at);for(const x of input)x.fill(0,0,n);if(frame===0)input.forEach(x=>x[0]=.1);e.inserts_render(n);frame+=n;}return performance.now()-start;};}
  const windows=[];for(let s=0;s<40;s++){const ms=run();let nonzero=0,subnormal=0,peak=0;for(const x of output)for(let i=0;i<128;i++){const a=Math.abs(x[i]);peak=Math.max(peak,a);if(a>0){nonzero++;if(a<2**-126)subnormal++;}}windows.push({second:s+1,ms,peak,nonzero,subnormal,stats:stat()});}
  const row={id,windows};rows.push(row);await __idleProgress({id,first:windows[0],late:windows.slice(-2)});
 }return rows;
},binaries);}catch(e){report.failure=String(e);process.exitCode=1;console.error(e);}finally{await fs.writeFile(path.join(out,(firefox?'firefox':'chrome')+'.json'),JSON.stringify(report,null,2));await b.close();}
