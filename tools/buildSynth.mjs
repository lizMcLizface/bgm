import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const kernels=[
 {name:'core',crate:'synth-engine',binary:'calmbgm_synth',shared:['synth-engine/common/colour.rs','synth-engine/common/notes.rs','synth-engine/common/headroom.rs']},
 {name:'effects',crate:'synth-engine/effects',binary:'calmbgm_effects',shared:['synth-engine/common/headroom.rs']},
 {name:'fm',crate:'synth-engine/fm',binary:'calmbgm_fm',shared:['synth-engine/common/colour.rs','synth-engine/common/notes.rs','synth-engine/common/headroom.rs']},
 {name:'inserts',crate:'synth-engine/inserts',binary:'calmbgm_inserts'},
];
const sourceHash=kernel=>crypto.createHash('sha256').update([`${kernel.crate}/Cargo.toml`,`${kernel.crate}/src/lib.rs`,...(kernel.shared??[])].map(f=>fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n')).join('\n')).digest('hex');
const output=path.join(root,'public/synth-lab');
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const versionsPath=path.join(root,'src/synth-lab/kernelVersions.json');
const processors={core:'processor.js',fm:'fm-processor.js',effects:'effects-processor.js',inserts:'inserts-processor.js'};
const scriptBytes=file=>Buffer.from(fs.readFileSync(path.join(output,file),'utf8').replace(/\r\n/g,'\n'));
const transitionVersion=()=>hash(scriptBytes('patch-transition.js')).slice(0,16);
function assetVersions(){
 return Object.fromEntries(kernels.map(k=>{
  const bytes=Buffer.concat([fs.readFileSync(path.join(output,k.name+'.wasm')),scriptBytes(processors[k.name])]);
  return [k.name,hash(bytes).slice(0,16)];
 }));
}
if(process.argv.includes('--check')) {
 for(const kernel of kernels){
  const manifest=JSON.parse(fs.readFileSync(path.join(output,kernel.name==='core'?'build.json':kernel.name+'-build.json')));
  if(manifest.source!==sourceHash(kernel)||manifest.wasm!==hash(fs.readFileSync(path.join(output,kernel.name+'.wasm'))))throw Error(`${kernel.name} Wasm is stale; run npm run synth:build.`);
 }
 for(const file of ['processor.js','fm-processor.js'])if(!fs.readFileSync(path.join(output,file),'utf8').includes('patch-transition.js?v='+transitionVersion()))throw Error('Stale worklet import version; run npm run synth:build.');
 if(JSON.stringify(JSON.parse(fs.readFileSync(versionsPath,'utf8')))!==JSON.stringify(assetVersions()))throw Error('Stale synth cache versions; run npm run synth:build.');
 console.log('Subtractive, effects, FM and instrument inserts Wasm match the Rust sources.');
} else {
 const local=path.join(root,'.tmp/rust-tools'),cargoHome=path.join(local,'cargo'),rustHome=path.join(local,'rustup');
 const localCargo=path.join(cargoHome,'bin',process.platform==='win32'?'cargo.exe':'cargo');
 const cargo=process.env.SYNTH_CARGO||(fs.existsSync(localCargo)?localCargo:'cargo');
 const env={...process.env};if(cargo===localCargo){env.CARGO_HOME=cargoHome;env.RUSTUP_HOME=rustHome;env.PATH=path.dirname(cargo)+path.delimiter+env.PATH;}
 for(const kernel of kernels){
 const result=spawnSync(cargo,['build','--manifest-path',`${kernel.crate}/Cargo.toml`,'--release','--target','wasm32-unknown-unknown'],{cwd:root,env,stdio:'inherit'});
 if(result.error)throw Error('Install Rust and rustup target add wasm32-unknown-unknown, or set SYNTH_CARGO. '+result.error.message);
 if(result.status)process.exit(result.status);
 fs.mkdirSync(output,{recursive:true});const binary=fs.readFileSync(path.join(root,`${kernel.crate}/target/wasm32-unknown-unknown/release/${kernel.binary}.wasm`));
 fs.writeFileSync(path.join(output,kernel.name+'.wasm'),binary);
 const compiler=spawnSync('rustc',['--version'],{env,encoding:'utf8'}).stdout?.trim();
 fs.writeFileSync(path.join(output,kernel.name==='core'?'build.json':kernel.name+'-build.json'),JSON.stringify({api:1,source:sourceHash(kernel),wasm:hash(binary),bytes:binary.length,compiler},null,2)+'\n');
 console.log(`Built ${binary.length} byte ${kernel.name} kernel.`);
 }
 for(const file of ['processor.js','fm-processor.js']){const name=path.join(output,file),text=fs.readFileSync(name,'utf8');fs.writeFileSync(name,text.replace(/patch-transition\.js(?:\?v=[a-f0-9]+)?/,'patch-transition.js?v='+transitionVersion()));}
 fs.writeFileSync(versionsPath,JSON.stringify(assetVersions(),null,2)+'\n');
}
