// Isolated stage attribution / rejected scalar trial. Never mutates public kernels.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {wasmCodeHash} from './wasmCodeHash.mjs';
const trial=process.argv.includes('--unused-sub');
const root=process.cwd(),out=path.join(root,trial?'.tmp/subtractive-unused-sub':'.tmp/dsp-stages'),crate=path.join(out,'crate');
const prior=JSON.parse(fs.readFileSync('.tmp/dsp-sections/builds.json','utf8'));
for(const k of ['core','fm','effects','inserts']){
 const current=JSON.parse(fs.readFileSync('public/synth-lab/'+(k==='core'?'build':k+'-build')+'.json','utf8'));
 if(current.source!==prior[k].production.source||current.wasm!==prior[k].production.wasm)throw Error('Run node tools/buildSynthProfile.mjs --sections first.');
}
fs.mkdirSync(path.join(crate,'src'),{recursive:true});fs.mkdirSync(path.join(crate,'common'),{recursive:true});
let source=fs.readFileSync('synth-engine/src/lib.rs','utf8').replace(/\r\n/g,'\n');
const originalHash=crypto.createHash('sha256').update(source).digest('hex');
// Fail closed when source structure changes; retained generated source is inspectable.
function outline(start,end,name,outputs=[]){
 const a=source.indexOf(start),b=source.indexOf(end,a);
 if(a<0||b<0||source.indexOf(start,a+start.length)!==-1)throw Error('Ambiguous/stale stage anchor: '+name);
 const body=source.slice(a,b),result=outputs.length?'('+outputs.join(',')+',)':'()';
 source=source.slice(0,a)+(outputs.length?'let '+result+' = ':'')+name+'(|| {\n'+body+'\n'+result+'\n});\n'+source.slice(b);
}
if(!trial){
outline('                    let amp = v.amp[l].next(p, 17, 59, self.sr);','                    for u in 0..unison {','profile_stage_modulation',['amp','fe','pressure','modulation','env_pitch','pitch','pwm','vel','update']);
outline('                        if update {\n                            let position','                        let [dt_a, dt_b] = lane.dt;','profile_stage_control');
outline('                        let [dt_a, dt_b] = lane.dt;','                        lane.g += (lane.target_g - lane.g)','profile_stage_oscillators',['x','raw_b']);
outline('                        lane.g += (lane.target_g - lane.g)','                        let amp = amp\n','profile_stage_filters',['filtered']);
// Preserve mutability because legacy band-pass gain correction is in the stage.
// Outputs only cross closure boundaries after all stage mutations have finished.
const helpers=['modulation','control','oscillators','filters'].map(n=>'#[inline(never)]\nfn profile_stage_'+n+'<T>(f: impl FnOnce() -> T) -> T { f() }').join('\n');
source+='\n'+helpers+'\n';
}else{
 const before='let sub = wave(4, lane.phase[2], dt_a * 0.5, 0.5, &self.sine);';if(!source.includes(before))throw Error('Stale unused-sub anchor');source=source.replace(before,'let sub = if p[7] != 0. { wave(4, lane.phase[2], dt_a * 0.5, 0.5, &self.sine) } else { 0. };');
}
fs.writeFileSync(path.join(crate,'src/lib.rs'),source);
fs.copyFileSync('synth-engine/Cargo.toml',path.join(crate,'Cargo.toml'));
for(const name of ['colour','notes','headroom','denormal'])fs.copyFileSync('synth-engine/common/'+name+'.rs',path.join(crate,'common',name+'.rs'));
const local=path.join(root,'.tmp/rust-tools'),localCargo=path.join(local,'cargo/bin',process.platform==='win32'?'cargo.exe':'cargo'),cargo=process.env.SYNTH_CARGO??(fs.existsSync(localCargo)?localCargo:'cargo');
const env=cargo===localCargo?{...process.env,CARGO_HOME:path.join(local,'cargo'),RUSTUP_HOME:path.join(local,'rustup'),PATH:path.dirname(cargo)+path.delimiter+process.env.PATH}:{...process.env};
const result=spawnSync(cargo,['build','--manifest-path',path.join(crate,'Cargo.toml'),'--release','--target','wasm32-unknown-unknown',...(trial?[]:['--features','profile-sections']),'--target-dir',path.join(out,'target'),'--offline','--config','profile.release.strip=false','--config','profile.release.debug=1'],{env,stdio:'inherit'});
if(result.error)throw result.error;if(result.status)process.exit(result.status);
const bytes=fs.readFileSync(path.join(out,'target/wasm32-unknown-unknown/release/calmbgm_synth.wasm'));
fs.writeFileSync(path.join(out,'core.wasm'),bytes);
for(const k of ['fm','effects','inserts'])fs.copyFileSync('.tmp/dsp-sections/'+k+'.wasm',path.join(out,k+'.wasm'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
prior.core={...prior.core,bytes:bytes.length,sha256:hash(bytes),codeHash:wasmCodeHash(bytes),codeIdentical:false,diagnosticStages:!trial,diagnosticSections:!trial,trial:trial?'unused-sub':null,originalSource:originalHash,generatedSource:hash(Buffer.from(source)),stages:trial?[]:['modulation','control','oscillators','filters']};
fs.writeFileSync(path.join(out,'builds.json'),JSON.stringify(prior,null,2));
console.log(trial?'Isolated unused-sub trial:':'Isolated subtractive stage artifact:',bytes.length,'bytes. Public kernels unchanged.');
