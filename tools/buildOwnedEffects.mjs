// Local audit build only. Parent owns publishing legacy binaries/cache manifests.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const local=path.resolve('.tmp/rust-tools'),env={...process.env,CARGO_HOME:path.join(local,'cargo'),RUSTUP_HOME:path.join(local,'rustup')};env.PATH=path.join(local,'cargo/bin')+path.delimiter+env.PATH;
const cargo=path.join(local,'cargo/bin',process.platform==='win32'?'cargo.exe':'cargo');
for(const name of ['inserts','effects'])for(const legacy of [true,false]){
 const target=`.tmp/owned-effects-${legacy?'legacy':'isolated'}-target`,args=['build','--offline','--release','--target','wasm32-unknown-unknown','--manifest-path',`synth-engine/${name}/Cargo.toml`,'--features','allocation-audit','--target-dir',target,...(legacy?[]:['--no-default-features'])],r=spawnSync(cargo,args,{env,stdio:'inherit'});if(r.error)throw r.error;if(r.status)process.exit(r.status);
 fs.mkdirSync('.tmp/owned-effects',{recursive:true});fs.copyFileSync(`${target}/wasm32-unknown-unknown/release/calmbgm_${name}.wasm`,`.tmp/owned-effects/${name}${legacy?'-legacy':''}.wasm`);
}
console.log('Built audited owned effects and preserved-ABI variants under .tmp/owned-effects.');
