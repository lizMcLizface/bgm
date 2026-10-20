// Builds (or with --check, verifies) the /synths classic-synth kernel. Kept apart
// from buildSynth.mjs so the synths sub-project never rebuilds the generator's kernels.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const crate='synth-engine/classics';
const output=path.join(root,'public/synths');
const manifestPath=path.join(output,'classics-build.json');
const versionPath=path.join(root,'src/synths/engine/kernelVersion.json');
const text=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
export function sourceFiles(){
 const dir=path.join(root,crate,'src');
 return [`${crate}/Cargo.toml`,...fs.readdirSync(dir).filter(f=>f.endsWith('.rs')).sort().map(f=>`${crate}/src/${f}`)];
}
export const sourceHash=()=>hash(sourceFiles().map(f=>f+'\n'+text(f)).join('\n'));
const kernelVersion=()=>hash(Buffer.concat([fs.readFileSync(path.join(output,'classics.wasm')),Buffer.from(text('public/synths/classics-processor.js'))])).slice(0,16);

if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv.includes('--check')){
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if(manifest.source!==sourceHash()||manifest.wasm!==hash(fs.readFileSync(path.join(output,'classics.wasm'))))throw Error('Classic-synth Wasm is stale; run npm run synths:build.');
  if(JSON.parse(fs.readFileSync(versionPath,'utf8')).kernel!==kernelVersion())throw Error('Stale classic-synth cache version; run npm run synths:build.');
  console.log('Classic-synth Wasm matches its Rust sources.');
 } else {
  const local=path.join(root,'.tmp/rust-tools'),cargoHome=path.join(local,'cargo');
  const localCargo=path.join(cargoHome,'bin',process.platform==='win32'?'cargo.exe':'cargo');
  const cargo=process.env.SYNTH_CARGO||(fs.existsSync(localCargo)?localCargo:'cargo');
  const env={...process.env};
  if(cargo===localCargo){env.CARGO_HOME=cargoHome;env.RUSTUP_HOME=path.join(local,'rustup');env.PATH=path.dirname(cargo)+path.delimiter+env.PATH;}
  const result=spawnSync(cargo,['build','--manifest-path',`${crate}/Cargo.toml`,'--release','--target','wasm32-unknown-unknown'],{cwd:root,env,stdio:'inherit'});
  if(result.error)throw Error('Install Rust and rustup target add wasm32-unknown-unknown, or set SYNTH_CARGO. '+result.error.message);
  if(result.status)process.exit(result.status);
  const binary=fs.readFileSync(path.join(root,crate,'target/wasm32-unknown-unknown/release/calmbgm_classics.wasm'));
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'classics.wasm'),binary);
  const compiler=spawnSync('rustc',['--version'],{env,encoding:'utf8'}).stdout?.trim();
  fs.writeFileSync(manifestPath,JSON.stringify({api:1,source:sourceHash(),wasm:hash(binary),bytes:binary.length,compiler},null,2)+'\n');
  fs.writeFileSync(versionPath,JSON.stringify({kernel:kernelVersion()},null,2)+'\n');
  console.log(`Built ${binary.length} byte classic-synth kernel.`);
 }
}
