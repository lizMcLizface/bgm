// Separate release-optimized builds with names/line tables for CPU sampling.
// Never overwrites public/synth-lab or changes the normal Cargo profiles.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {wasmCodeHash} from './wasmCodeHash.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'.tmp/dsp-profile'),local=path.join(root,'.tmp/rust-tools');
const localCargo=path.join(local,'cargo/bin',process.platform==='win32'?'cargo.exe':'cargo');
const cargo=process.env.SYNTH_CARGO||(fs.existsSync(localCargo)?localCargo:'cargo'),env={...process.env};
if(cargo===localCargo){env.CARGO_HOME=path.join(local,'cargo');env.RUSTUP_HOME=path.join(local,'rustup');env.PATH=path.dirname(cargo)+path.delimiter+env.PATH;}
const kernels=[['core','synth-engine','calmbgm_synth'],['fm','synth-engine/fm','calmbgm_fm'],['effects','synth-engine/effects','calmbgm_effects'],['inserts','synth-engine/inserts','calmbgm_inserts']];
const checked=spawnSync(process.execPath,['tools/buildSynth.mjs','--check'],{cwd:root,stdio:'inherit'});if(checked.error)throw checked.error;if(checked.status)process.exit(checked.status);
fs.mkdirSync(output,{recursive:true});const manifests={};
for(const [name,crate,binary]of kernels){
 const target=path.join(output,name+'-target'),args=['build','--manifest-path',crate+'/Cargo.toml','--release','--target','wasm32-unknown-unknown','--target-dir',target,'--offline','--locked','--config','profile.release.strip=false','--config','profile.release.debug=1'];
 const result=spawnSync(cargo,args,{cwd:root,env,stdio:'inherit'});if(result.error)throw result.error;if(result.status)process.exit(result.status);
 const buffer=fs.readFileSync(path.join(target,'wasm32-unknown-unknown/release',binary+'.wasm'));fs.writeFileSync(path.join(output,name+'.wasm'),buffer);
 const codeHash=wasmCodeHash(buffer),productionCodeHash=wasmCodeHash(fs.readFileSync(path.join(root,'public/synth-lab',name+'.wasm')));
 manifests[name]={profile:'release',strip:false,debug:1,bytes:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),codeHash,productionCodeHash,codeIdentical:codeHash===productionCodeHash,production:JSON.parse(fs.readFileSync(path.join(root,'public/synth-lab',name==='core'?'build.json':name+'-build.json')))};
 console.log(`Named ${name}: ${buffer.length} bytes; production artifact untouched.`);
}
fs.writeFileSync(path.join(output,'builds.json'),JSON.stringify(manifests,null,2));
