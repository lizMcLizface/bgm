// Reconstruct the already committed native-proven primitive artifact locally.
// This reads Git objects only; it never changes the working tree or fetches.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync}from 'node:child_process';
const checkpoint='74244f7',directory='.tmp/tape-primitive-proven';
const wasm=execFileSync('git',['show',`${checkpoint}:public/modular-audio/tape-fx.wasm`],{maxBuffer:4*1024*1024});
const manifest=JSON.parse(execFileSync('git',['show',`${checkpoint}:public/modular-audio/tape-fx-build.json`],{encoding:'utf8'}));
if(manifest.version!=='7e3b04628555d62c'||crypto.createHash('sha256').update(wasm).digest('hex')!==manifest.wasm)throw Error('Native-proven Tape checkpoint fingerprint differs');
fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(`${directory}/tape-fx.wasm`,wasm);fs.writeFileSync(`${directory}/build.json`,JSON.stringify(manifest,null,2)+'\n');console.log(`Retained native-proven Tape primitive ${manifest.version} from ${checkpoint}.`);
