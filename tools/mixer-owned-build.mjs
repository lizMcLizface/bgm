import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const local=path.resolve('.tmp/rust-tools'),env={...process.env,CARGO_HOME:path.join(local,'cargo'),RUSTUP_HOME:path.join(local,'rustup')};env.PATH=path.join(local,'cargo/bin')+path.delimiter+env.PATH;
const audit=process.argv.includes('--allocation-audit'),target=audit?'.tmp/mixer-owned-allocation-target':'.tmp/mixer-owned-target',out=audit?'.tmp/mixer-owned-allocation':'.tmp/mixer-owned';
const run=spawnSync(path.join(local,'cargo/bin',process.platform==='win32'?'cargo.exe':'cargo'),['build','--offline','--release','--target','wasm32-unknown-unknown','--manifest-path','synth-engine/mixer/Cargo.toml','--target-dir',target,...(audit?['--features','allocation-audit']:[])],{env,stdio:'inherit'});if(run.error)throw run.error;if(run.status)process.exit(run.status);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),wasm=fs.readFileSync(`${target}/wasm32-unknown-unknown/release/calmbgm_mixer.wasm`),files=['synth-engine/mixer/Cargo.toml','synth-engine/mixer/Cargo.lock',...fs.readdirSync('synth-engine/mixer/src').filter(f=>f.endsWith('.rs')).sort().map(f=>`synth-engine/mixer/src/${f}`)],manifest={kind:'mixer.owned-primitives',version:1,allocationAudit:audit,wasm:hash(wasm),bytes:wasm.length,source:hash(files.map(f=>f+'\n'+fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n')).join('\n'))};
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(`${out}/mixer.wasm`,wasm);fs.writeFileSync(`${out}/build.json`,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest));
