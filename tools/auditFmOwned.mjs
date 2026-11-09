import fs from 'node:fs';
import {hash,fmCases,legacyOwnedExports,OwnedFm,pcm} from './fmOwnedVerification.mjs';
const original='.tmp/fm-before-m3b/fm.wasm',golden='src/modular-audio/fmLegacyPcm.json';
const old=fs.existsSync(original)?new WebAssembly.Module(fs.readFileSync(original)):null;
const gold=fs.existsSync(golden)?JSON.parse(fs.readFileSync(golden)):null;
if(!old&&!gold)throw Error('Preserved pre-extraction FM or original PCM goldens required');
const graph=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm')),legacy=new WebAssembly.Module(fs.readFileSync('public/synth-lab/fm.wasm')),cases=fmCases(),results=[];
for(const c of cases){const e=new WebAssembly.Instance(graph,{}).exports,owned=new OwnedFm(e,c.spec,c.rate),rebuilt=new OwnedFm(legacyOwnedExports(legacy),c.spec,c.rate),baseline=old?new OwnedFm(legacyOwnedExports(old),c.spec,c.rate):null;
 try{const a=pcm(owned,c.total),b=pcm(rebuilt,c.total),originalPcm=baseline?pcm(baseline,c.total):null,key=`${c.id}/${c.rate}`,expected=originalPcm?.sha256??gold.fixtures.find(f=>f.key===key)?.sha256;
  if(a.sha256!==expected||b.sha256!==expected||gold&&gold.fixtures.find(f=>f.key===key)?.sha256!==expected)throw Error('FM exact legacy PCM mismatch: '+key);
  if(JSON.stringify(a.stats)!==JSON.stringify(b.stats))throw Error('FM owned/legacy stats mismatch: '+key);
  results.push({key,total:c.total,sha256:expected,peak:a.peak,...a.stats});
 }finally{owned.dispose();rebuilt.dispose();baseline?.dispose();}
}
if(!gold)fs.writeFileSync(golden,JSON.stringify({provenance:'Exact float PCM from preserved pre-M3b scalar FM Wasm, L then R; source SHA256 '+hash(fs.readFileSync(original)),fixtures:results.map(({key,total,sha256})=>({key,total,sha256}))},null,2)+'\n');
const report={pass:true,comparisons:results.length,scope:'Preserved scalar FM, rebuilt legacy ABI and owned FM handles; irregular partial blocks, original transition semantics, three sample rates',originalWasm:gold?.provenance??hash(fs.readFileSync(original)),graph:JSON.parse(fs.readFileSync('public/modular-audio/build.json')),results};
const output=process.argv.find(a=>a.startsWith('--out='))?.slice(6)??'reports/modular_audio/fm-owned-compatibility.json';
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(`${results.length} exact original/rebuilt/owned FM comparisons passed.`);
