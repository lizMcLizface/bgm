// Isolated prototype artifacts. Normal site kernels are not overwritten.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=process.cwd(),out=path.join(root,'.tmp/fm-bank'),local=path.join(root,'.tmp/rust-tools'),localCargo=path.join(local,'cargo/bin',process.platform==='win32'?'cargo.exe':'cargo'),cargo=process.env.SYNTH_CARGO??(fs.existsSync(localCargo)?localCargo:'cargo');
const env=cargo===localCargo?{...process.env,CARGO_HOME:path.join(local,'cargo'),RUSTUP_HOME:path.join(local,'rustup'),PATH:path.dirname(cargo)+path.delimiter+process.env.PATH}:{...process.env};
const baseline=path.join(root,'.tmp/bank-baseline');fs.mkdirSync(baseline,{recursive:true});
// Retain an existing preceding reference. A fresh checkout uses its checked-in
// scalar/SIMD modules, so the dedicated validation command is reproducible.
for(const file of ['fm.wasm','fm-simd.wasm','fm-build.json','fm-simd-build.json'])if(!fs.existsSync(path.join(baseline,file)))fs.copyFileSync(path.join(root,'public/synth-lab',file),path.join(baseline,file));
fs.mkdirSync(out,{recursive:true});const builds={};
for(const [name,feature]of [['scalar',null],['simd','simd-voices'],['bank','multitimbral']]){
 const args=['build','--manifest-path','synth-engine/fm/Cargo.toml','--release','--target','wasm32-unknown-unknown','--offline','--locked','--target-dir',path.join(out,name+'-target'),...(feature?['--features',feature]:[])];
 const p=spawnSync(cargo,args,{env:{...env,...(feature?{RUSTFLAGS:'-C target-feature=+simd128'}:{})},stdio:'inherit'});if(p.error)throw p.error;if(p.status)process.exit(p.status);
 const bytes=fs.readFileSync(path.join(out,name+'-target/wasm32-unknown-unknown/release/calmbgm_fm.wasm'));fs.writeFileSync(path.join(out,name+'.wasm'),bytes);
 builds[name]={bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
const files=['synth-engine/fm/Cargo.toml',...fs.readdirSync('synth-engine/fm/src').filter(f=>f.endsWith('.rs')).map(f=>'synth-engine/fm/src/'+f),...['colour','notes','headroom','simd','denormal'].map(f=>'synth-engine/common/'+f+'.rs')];
builds.source=crypto.createHash('sha256').update(files.map(f=>fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n')).join('\n')).digest('hex');
fs.writeFileSync(path.join(out,'builds.json'),JSON.stringify(builds,null,2));console.log(builds);
