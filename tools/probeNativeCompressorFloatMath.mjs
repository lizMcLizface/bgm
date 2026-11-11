import fs from 'node:fs';import path from 'node:path';import {spawnSync}from 'node:child_process';
const root='.tmp/native-compressor-math-probe';fs.mkdirSync(`${root}/src`,{recursive:true});fs.writeFileSync(`${root}/Cargo.toml`,'[package]\nname="native_compressor_math_probe"\nversion="0.1.0"\nedition="2021"\n[lib]\ncrate-type=["cdylib"]\n[profile.release]\nopt-level=3\npanic="abort"\n');
fs.copyFileSync('synth-engine/native-compressor/CHROMIUM_NOTICES.txt',`${root}/CHROMIUM_NOTICES.txt`);
fs.writeFileSync(`${root}/src/lib.rs`,String.raw`
//! Diagnostic source-derived static curve. Original Google/Apple BSD notices
//! are retained in ../CHROMIUM_NOTICES.txt. Not part of production DSP.
fn db(x:f32,mode:u32)->f32{20f32*if mode&1!=0{x.log10()}else{(x as f64).log10()as f32}}
fn lin(x:f32,mode:u32)->f32{let exponent=0.05f32*x;if mode&2!=0{10f32.powf(exponent)}else{10f64.powf(exponent as f64)as f32}}
fn curve(x:f32,k:f32,t:f32)->f32{if x<t{x}else{t+(1.-((-k*(x-t))as f64).exp()as f32)/k}}
#[no_mangle]pub extern "C" fn math_log(mode:u32,x:f32)->f32{if mode&1!=0{x.log10()}else{(x as f64).log10()as f32}}
#[no_mangle]pub extern "C" fn curve_field(td:f32,kd:f32,ratio:f32,mode:u32,field:usize)->f32{
 let t=lin(td,mode);let dx=td+kd;let x=lin(dx,mode);let x2=(x as f64*1.001f64)as f32;let dx2=db(x2,mode);let mut min=0.1f32;let mut max=10000f32;let mut k=5f32;let mut trace=[[0f32;6];15];
 for i in 0..15{let y1=curve(x,k,t);let y2=curve(x2,k,t);let d1=db(y1,mode);let d2=db(y2,mode);let slope=if x<t{1.}else{(d2-d1)/(dx2-dx)};trace[i]=[k,y1,y2,d1,d2,slope];if slope<1./ratio{max=k;}else{min=k;}k=(min*max).sqrt();}
 let y=db(curve(x,k,t),mode);let sat=if 1.<x{curve(1.,k,t)}else{lin(y+(1./ratio)*(0.-dx),mode)};let post=((1f32/sat)as f64).powf(0.6f32 as f64)as f32;
 match field{0=>k,1=>t,2=>x,3=>y,4=>post,5=>sat,6=>dx2,7=>dx,n if n<98=>trace[(n-8)/6][(n-8)%6],_=>0.}
}
`);
const local=path.resolve('.tmp/rust-tools'),env={...process.env,CARGO_HOME:path.join(local,'cargo'),RUSTUP_HOME:path.join(local,'rustup')};env.PATH=path.join(local,'cargo/bin')+path.delimiter+env.PATH;const build=spawnSync(path.join(local,'cargo/bin',process.platform==='win32'?'cargo.exe':'cargo'),['build','--offline','--release','--target','wasm32-unknown-unknown','--manifest-path',`${root}/Cargo.toml`,'--target-dir',`${root}/target`],{env,stdio:'inherit'});if(build.error)throw build.error;if(build.status)process.exit(build.status);
const e=new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(`${root}/target/wasm32-unknown-unknown/release/native_compressor_math_probe.wasm`)),{}).exports,input=JSON.parse(fs.readFileSync('reports/modular_audio/voice-compressor-quantum-curve.json')),crt=JSON.parse(fs.readFileSync('reports/modular_audio/voice-compressor-quantum-ucrt.json')),trials=[];
for(const row of input.probes){const reference=crt.trials.find(t=>t.frame===row.frame).crt,modes=[];for(let mode=0;mode<4;mode++){const fields=Array.from({length:8},(_,i)=>e.curve_field(...row.parameters.slice(0,3),mode,i)),trace=Array.from({length:15},(_,i)=>Array.from({length:6},(_,j)=>e.curve_field(...row.parameters.slice(0,3),mode,8+i*6+j)));modes.push({mode,floatLog:!!(mode&1),floatPow:!!(mode&2),fields,trace,crtFieldsRawExact:fields.slice(0,6).every((v,i)=>v===reference[i]),crtDelta:fields.slice(0,6).map((v,i)=>v-reference[i])});}trials.push({frame:row.frame,parameters:row.parameters,crt:reference,modes});}
const report={kind:'native-compressor.primitive-math-diagnostic',version:1,createdAtUtc:new Date().toISOString(),scope:'Private Wasm arithmetic variants only; production cores are unchanged. Compares global unqualified float log10f/powf versus rounded-binary64 primitives using exact failing-quantum coefficients and an independent read-only system CRT curve. No fitted gain, alignment or acceptance-bound changes.',trials};fs.writeFileSync('reports/modular_audio/native-compressor-primitive-math.json',JSON.stringify(report,null,2)+'\n');console.log(trials.map(t=>({frame:t.frame,modes:t.modes.map(m=>({mode:m.mode,crtExact:m.crtFieldsRawExact,delta:m.crtDelta}))})));
