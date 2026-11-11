import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),text=f=>fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n'),out=process.argv.includes('--publish')?'public/modular-audio':'.tmp/owned-voice-fx',manifestName=process.argv.includes('--publish')?'voice-fx-build.json':'build.json';
const source=()=>hash(['synth-engine/voice-fx/Cargo.toml','synth-engine/voice-fx/Cargo.lock','synth-engine/voice-fx/src/lib.rs'].map(f=>f+'\n'+text(f)).join('\n')),runtime=()=>hash(text('src/modular-audio/ownedVoiceFx.js'));
if(process.argv.includes('--check')){const m=JSON.parse(fs.readFileSync(`${out}/${manifestName}`));if(m.source!==source()||m.runtime!==runtime()||m.wasm!==hash(fs.readFileSync(`${out}/voice-fx.wasm`)))throw Error('Owned voice FX build is stale');console.log('Owned voice FX Rust, runtime and Wasm provenance match.');}
else{
 const local=path.resolve('.tmp/rust-tools'),env={...process.env,CARGO_HOME:path.join(local,'cargo'),RUSTUP_HOME:path.join(local,'rustup')};env.PATH=path.join(local,'cargo/bin')+path.delimiter+env.PATH;
 const args=['build','--offline','--release','--target','wasm32-unknown-unknown','--manifest-path','synth-engine/voice-fx/Cargo.toml','--target-dir','.tmp/owned-voice-fx-target',...(process.argv.includes('--audit')?['--features','allocation-audit']:[])],r=spawnSync(path.join(local,'cargo/bin',process.platform==='win32'?'cargo.exe':'cargo'),args,{env,stdio:'inherit'});if(r.error)throw r.error;if(r.status)process.exit(r.status);
 fs.mkdirSync(out,{recursive:true});const wasm=fs.readFileSync('.tmp/owned-voice-fx-target/wasm32-unknown-unknown/release/calmbgm_voice_fx.wasm'),m={api:1,source:source(),runtime:runtime(),wasm:hash(wasm),bytes:wasm.length,audited:process.argv.includes('--audit')};m.version=hash(m.wasm+m.runtime).slice(0,16);fs.writeFileSync(`${out}/voice-fx.wasm`,wasm);fs.writeFileSync(`${out}/${manifestName}`,JSON.stringify(m,null,2)+'\n');console.log(`Built owned voice FX ${m.version}: ${m.bytes} bytes.`);
}
