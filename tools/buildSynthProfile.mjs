// Separate release-optimized builds with names/line tables for CPU sampling.
// Never overwrites public/synth-lab or changes the normal Cargo profiles.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {wasmCodeHash} from './wasmCodeHash.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sections=process.argv.includes('--sections');
const uncachedColour=process.argv.includes('--uncached-colour');
const simd=process.argv.includes('--simd');
const noAutoVectorize=process.argv.includes('--no-auto-vectorize');
if(noAutoVectorize&&!simd)throw Error('--no-auto-vectorize requires --simd.');
const optLevel=process.argv.find(s=>s.startsWith('--opt-level='))?.slice(12);
if(uncachedColour&&(sections||optLevel!==undefined))throw Error('--uncached-colour is a separate reference build; do not combine with compiler/attribution variants.');
if(simd&&(uncachedColour||sections||optLevel!==undefined))throw Error('--simd is a separate experimental build; do not combine with other variants.');
if(optLevel!==undefined&&(!['2','s'].includes(optLevel)||sections))throw Error('Experimental --opt-level=2|s cannot be combined with --sections.');
const output=path.join(root,simd?(noAutoVectorize?'.tmp/dsp-simd-noauto':'.tmp/dsp-simd'):uncachedColour?'.tmp/dsp-colour-reference':optLevel?'.tmp/dsp-opt-'+optLevel:sections?'.tmp/dsp-sections':'.tmp/dsp-profile'),local=path.join(root,'.tmp/rust-tools');
const localCargo=path.join(local,'cargo/bin',process.platform==='win32'?'cargo.exe':'cargo');
const cargo=process.env.SYNTH_CARGO||(fs.existsSync(localCargo)?localCargo:'cargo'),env={...process.env};
if(cargo===localCargo){env.CARGO_HOME=path.join(local,'cargo');env.RUSTUP_HOME=path.join(local,'rustup');env.PATH=path.dirname(cargo)+path.delimiter+env.PATH;}
const kernels=[['core','synth-engine','calmbgm_synth'],['fm','synth-engine/fm','calmbgm_fm'],['effects','synth-engine/effects','calmbgm_effects'],['inserts','synth-engine/inserts','calmbgm_inserts']];
const checked=spawnSync(process.execPath,['tools/buildSynth.mjs','--check'],{cwd:root,stdio:'inherit'});if(checked.error)throw checked.error;if(checked.status)process.exit(checked.status);
fs.mkdirSync(output,{recursive:true});const manifests={};
for(const [name,crate,binary]of kernels){
 const target=path.join(output,name+'-target'),args=['build','--manifest-path',crate+'/Cargo.toml','--release','--target','wasm32-unknown-unknown','--target-dir',target,'--offline','--locked','--config','profile.release.strip=false','--config','profile.release.debug=1'];
 if(uncachedColour&&name==='fm')args.push('--no-default-features');
 if(sections&&['core','fm'].includes(name))args.push('--features','profile-sections');
 if(simd&&['core','fm'].includes(name))args.push('--features','simd-voices');
 if(optLevel)args.push('--config','profile.release.opt-level='+JSON.stringify(optLevel==='2'?2:optLevel));
 const buildEnv=simd&&['core','fm'].includes(name)?{...env,RUSTFLAGS:(env.RUSTFLAGS??'')+' -C target-feature=+simd128'+(noAutoVectorize?' -C no-vectorize-loops -C no-vectorize-slp':'')}:env;
 const result=spawnSync(cargo,args,{cwd:root,env:buildEnv,stdio:'inherit'});if(result.error)throw result.error;if(result.status)process.exit(result.status);
 const buffer=fs.readFileSync(path.join(target,'wasm32-unknown-unknown/release',binary+'.wasm'));fs.writeFileSync(path.join(output,name+'.wasm'),buffer);
 const codeHash=wasmCodeHash(buffer),productionCodeHash=wasmCodeHash(fs.readFileSync(path.join(root,'public/synth-lab',name+'.wasm')));
 manifests[name]={simd:simd&&['core','fm'].includes(name),automaticVectorization:!(noAutoVectorize&&['core','fm'].includes(name)),uncachedColour:uncachedColour&&name==='fm',optLevel:optLevel??3,diagnosticSections:sections&&['core','fm'].includes(name),profile:'release',strip:false,debug:1,bytes:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),codeHash,productionCodeHash,codeIdentical:codeHash===productionCodeHash,production:JSON.parse(fs.readFileSync(path.join(root,'public/synth-lab',name==='core'?'build.json':name+'-build.json')))};
 console.log(`Named ${name}: ${buffer.length} bytes; production artifact untouched.`);
}
fs.writeFileSync(path.join(output,'builds.json'),JSON.stringify(manifests,null,2));
