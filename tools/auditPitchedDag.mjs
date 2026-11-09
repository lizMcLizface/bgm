import fs from 'node:fs';
import {coreCases} from './coreOwnedVerification.mjs';
import {fmCases,hash} from './fmOwnedVerification.mjs';
import {pitchedPatch} from '../src/modular-audio/pitchedFixture.js';
import {ReferenceGraph} from '../src/modular-audio/runtime.js';
const module=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm')),contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json'));
const results=[];
for(const [fm,cases,name]of [[false,coreCases(),'core'],[true,fmCases(),'fm']]){
 const gold=JSON.parse(fs.readFileSync(`src/modular-audio/${name}LegacyPcm.json`));
 for(const c of cases){const g=new ReferenceGraph(new WebAssembly.Instance(module,{}).exports,pitchedPatch(c.spec,fm),contracts,c.rate),out=[new Float32Array(c.total),new Float32Array(c.total)];try{
  for(let at=0,block=0;at<c.total;block++){const n=Math.min([128,37,203,1,127][block%5],c.total-at);g.render(n);out[0].set(g.left.subarray(0,n),at);out[1].set(g.right.subarray(0,n),at);at+=n;}
  const sha256=hash(Buffer.concat(out.map(x=>Buffer.from(x.buffer)))),expected=gold.fixtures.find(x=>x.key===`${c.id}/${c.rate}`)?.sha256;
  if(sha256!==expected)throw Error(`Pitched DAG PCM mismatch ${name}/${c.id}/${c.rate}: ${sha256} != ${expected}`);
  results.push({kind:name,key:`${c.id}/${c.rate}`,sha256,stats:g.stats(),pitched:g.pitchedStats(1)});
 }finally{g.dispose();}}
}
fs.writeFileSync('reports/modular_audio/m3d-pitched-dag-compatibility.json',JSON.stringify({pass:true,comparisons:results.length,graphVersion:JSON.parse(fs.readFileSync('public/modular-audio/build.json')).version,scope:'Rust pitched DAG nodes versus retained pre-extraction float goldens; irregular blocks and prepared legacy transitions',results},null,2)+'\n');console.log(`${results.length} exact pitched DAG / original PCM comparisons passed.`);
