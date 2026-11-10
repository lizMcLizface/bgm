import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=process.cwd(),crate='synth-engine/piano',out='public/piano-preparation',local=path.join(root,'.tmp/rust-tools');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),read=p=>fs.readFileSync(path.join(root,p)),text=p=>read(p).toString().replace(/\r\n/g,'\n');
const sources=[`${crate}/Cargo.toml`,`${crate}/Cargo.lock`,`${crate}/src/lib.rs`,`${crate}/src/acoustic.rs`];
const source=()=>hash(sources.map(p=>p+'\n'+text(p)).join('\n'));
if(process.argv.includes('--check')){
 const m=JSON.parse(read(`${out}/build.json`));if(m.api!==1||m.source!==source()||m.wasm!==hash(read(`${out}/piano.wasm`))||m.version!==hash(m.source+m.wasm).slice(0,16))throw Error('Piano preparation provenance stale; run npm.cmd run piano:build');
 console.log('Owned piano preparation Rust/Wasm provenance matches.');
}else{
 const env={...process.env,CARGO_HOME:path.join(local,'cargo'),RUSTUP_HOME:path.join(local,'rustup')};env.PATH=path.join(local,'cargo/bin')+path.delimiter+env.PATH;
 const r=spawnSync(path.join(local,'cargo/bin/cargo.exe'),['build','--release','--target','wasm32-unknown-unknown','--manifest-path',`${crate}/Cargo.toml`,'--offline'],{cwd:root,env,encoding:'utf8'});if(r.stderr)process.stderr.write(r.stderr);if(r.error)throw r.error;if(r.status)process.exit(r.status);
 const wasm=read(`${crate}/target/wasm32-unknown-unknown/release/calmbgm_piano.wasm`),e=new WebAssembly.Instance(new WebAssembly.Module(wasm),{}).exports;if(e.piano_api_version()!==1)throw Error('Piano ABI mismatch');
 const m={api:1,source:source(),wasm:hash(wasm),bytes:wasm.length};m.version=hash(m.source+m.wasm).slice(0,16);fs.mkdirSync(path.join(root,out),{recursive:true});fs.writeFileSync(path.join(root,out,'piano.wasm'),wasm);fs.writeFileSync(path.join(root,out,'build.json'),JSON.stringify(m,null,2)+'\n');console.log(`Built owned piano preparation ${m.version}: ${m.bytes} bytes`);
}
