import fs from 'node:fs';
import {buildSync} from 'esbuild';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkPianoTables} from './buildPianoTables.mjs';
import {checkGraphEffectParameters} from './buildGraphEffectParameters.mjs';
checkPianoTables();
checkGraphEffectParameters();
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const crate='synth-engine/graph', out='public/modular-audio';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(path.join(root,p));
const text=p=>read(p).toString().replace(/\r\n/g,'\n');
const runtimeText=()=>buildSync({absWorkingDir:root,entryPoints:['src/modular-audio/runtime.js'],bundle:true,format:'esm',platform:'browser',write:false}).outputFiles[0].text;
const workerEntries=[['graph-worker.js','graphWorker.js'],['worker-output-processor.js','workerOutputProcessor.js'],['pool-output-processor.js','poolOutputProcessor.js']];
const workerText=entry=>buildSync({absWorkingDir:root,entryPoints:['src/modular-audio/'+entry],bundle:true,external:['./runtime.js'],format:'esm',platform:'browser',write:false}).outputFiles[0].text.replace(/\.\/runtime\.js/,`./runtime.js?v=${hash(runtimeText()).slice(0,16)}`);
function sources(dir) { return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?e.name==='target'?[]:sources(`${dir}/${e.name}`): /\.(rs|toml|lock)$/.test(e.name)?[`${dir}/${e.name}`]:[]).sort(); }
const sourceHash=()=>hash([...sources(crate),...sources('synth-engine/piano'),...sources('synth-engine/iowa'),...sources('synth-engine/inserts'),...sources('synth-engine/mixer'),...sources('synth-engine/rack-fx'),...sources('synth-engine/voice-fx'),...sources('synth-engine/motion-fx'),...sources('synth-engine/plucked-string'),...sources('synth-engine/plucked-voice'),...sources('synth-engine/tape-fx'),...sources('synth-engine/native-compressor'),...sources('synth-engine/native-compressor-automation'),...sources('synth-engine/classics'),...sources('synth-engine/effects'),...sources('synth-engine/percussion'),...sources('synth-engine/fm'),'synth-engine/native-compressor-automation/CHROMIUM_PROFILE.json','synth-engine/native-compressor-automation/CHROMIUM_NOTICES.txt','synth-engine/native-compressor/CHROMIUM_PROFILE.json','synth-engine/native-compressor/CHROMIUM_NOTICES.txt','synth-engine/tape-fx/resources/manifest.json','synth-engine/tape-fx/CHROMIUM_PROFILE.json','synth-engine/tape-fx/CHROMIUM_NOTICES.txt','synth-engine/Cargo.toml','synth-engine/Cargo.lock',...sources('synth-engine/src'),...['colour','notes','headroom','denormal','native_target'].map(n=>'synth-engine/common/'+n+'.rs')].map(p=>p+'\n'+text(p)).join('\n')+'\n'+fs.readdirSync(path.join(root,'synth-engine/tape-fx/resources')).filter(p=>p.endsWith('.f32')).sort().map(p=>p+'\n'+hash(read('synth-engine/tape-fx/resources/'+p))).join('\n'));
const processors=['processor.js','ensemble-bridge-processor.js','dag-sources-processor.js',...workerEntries.map(([out])=>out)];
const runtimeHash=()=>hash([...processors,'owned-core-processor.js','owned-core.js','owned-fm-processor.js','owned-fm.js','legacyPatchTransition.js','runtime.js','contracts.json','reference-patch.json','sidechain-patch.json','six-role-fixture.json'].map(f=>f+'\n'+text(`${out}/${f}`)).join('\n')+'\nlegacy-transition\n'+text('public/synth-lab/patch-transition.js'));
const manifestPath=path.join(root,out,'build.json');
const local=path.join(root,'.tmp/rust-tools'), env={...process.env,CARGO_HOME:path.join(local,'cargo'),RUSTUP_HOME:path.join(local,'rustup')};
env.PATH=path.join(local,'cargo/bin')+path.delimiter+env.PATH;
const cargo=path.join(local,'cargo/bin',process.platform==='win32'?'cargo.exe':'cargo');
function run(args) { const r=spawnSync(cargo,[...args,'--manifest-path',`${crate}/Cargo.toml`,'--offline'],{cwd:root,env,encoding:'utf8'}); if(r.stderr) process.stderr.write(r.stderr); if(r.error) throw r.error; if(r.status) { if(r.stdout)process.stdout.write(r.stdout); process.exit(r.status); } return r.stdout; }
if(process.argv.includes('--test')) { process.stdout.write(run(['test'])); }
else if(process.argv.includes('--check')) {
 if(workerEntries.some(([file,entry])=>text(`public/modular-audio/${file}`)!==workerText(entry)))throw Error('Worker assets stale; run graph:build');
 if(text('src/modular-audio/ownedCore.js')!==text(`${out}/owned-core.js`)||!text(`${out}/owned-core-processor.js`).includes(`./owned-core.js?v=${hash(text(`${out}/owned-core.js`)).slice(0,16)}`))throw Error('Owned core assets stale; run graph:build');
 if(text('src/modular-audio/ownedFm.js')!==text(`${out}/owned-fm.js`)||text('public/synth-lab/patch-transition.js')!==text(`${out}/legacyPatchTransition.js`)||!text(`${out}/owned-fm-processor.js`).includes(`./owned-fm.js?v=${hash(text(`${out}/owned-fm.js`)).slice(0,16)}`))throw Error('Owned FM assets stale; run graph:build');
 if(text('src/modular-audio/legacyPatchTransition.js')!==text('public/synth-lab/patch-transition.js'))throw Error('Legacy host transition copy stale; run graph:build');
 const m=JSON.parse(read(`${out}/build.json`));
 if(runtimeText()!==text(`${out}/runtime.js`)||m.source!==sourceHash()||m.wasm!==hash(read(`${out}/graph.wasm`))||m.runtime!==runtimeHash()||m.version!==hash(m.wasm+m.runtime).slice(0,16)||processors.some(f=>!text(`${out}/${f}`).includes(`./runtime.js?v=${hash(text(`${out}/runtime.js`)).slice(0,16)}`))) throw Error('Reference graph assets stale; run npm.cmd run graph:build');
 console.log('Reference graph Rust, contracts, fixture, worklet and cache provenance match.');
} else {
 fs.writeFileSync(path.join(root,'src/modular-audio/legacyPatchTransition.js'),text('public/synth-lab/patch-transition.js'));
 fs.writeFileSync(path.join(root,out,'legacyPatchTransition.js'),text('public/synth-lab/patch-transition.js'));
 fs.writeFileSync(path.join(root,out,'owned-core.js'),text('src/modular-audio/ownedCore.js'));
 fs.writeFileSync(path.join(root,out,'owned-core-processor.js'),text(`${out}/owned-core-processor.js`).replace(/\.\/owned-core\.js(?:\?v=[a-f0-9]+)?/,`./owned-core.js?v=${hash(text(`${out}/owned-core.js`)).slice(0,16)}`));
 fs.writeFileSync(path.join(root,out,'owned-fm.js'),text('src/modular-audio/ownedFm.js'));
 fs.writeFileSync(path.join(root,out,'owned-fm-processor.js'),text(`${out}/owned-fm-processor.js`).replace(/\.\/owned-fm\.js(?:\?v=[a-f0-9]+)?/,`./owned-fm.js?v=${hash(text(`${out}/owned-fm.js`)).slice(0,16)}`));
 run(['build','--release','--target','wasm32-unknown-unknown']);
 const wasm=read(`${crate}/target/wasm32-unknown-unknown/release/calmbgm_graph.wasm`);
 const engine=new WebAssembly.Instance(new WebAssembly.Module(wasm),{}).exports;
 const descriptor=engine.graph_contracts_new();
 let contracts;
 try { contracts=new TextDecoder().decode(new Uint8Array(engine.memory.buffer,engine.graph_contracts_ptr(descriptor),engine.graph_contracts_len(descriptor))); }
 finally { engine.graph_contracts_free(descriptor); }
 fs.mkdirSync(path.join(root,out),{recursive:true});
 fs.writeFileSync(path.join(root,out,'runtime.js'),runtimeText());
 for(const [file,entry]of workerEntries)fs.writeFileSync(path.join(root,out,file),workerText(entry));
 fs.writeFileSync(path.join(root,out,'contracts.json'),JSON.stringify(JSON.parse(contracts),null,2)+'\n');
 fs.writeFileSync(path.join(root,out,'graph.wasm'),wasm);
 for(const f of processors)fs.writeFileSync(path.join(root,out,f),text(`${out}/${f}`).replace(/\.\/runtime\.js(?:\?v=[a-f0-9]+)?/,`./runtime.js?v=${hash(text(`${out}/runtime.js`)).slice(0,16)}`));
 const compiler=spawnSync(path.join(local,'cargo/bin',process.platform==='win32'?'rustc.exe':'rustc'),['--version'],{env,encoding:'utf8'}).stdout.trim();
 const m={api:1,source:sourceHash(),wasm:hash(wasm),runtime:runtimeHash(),bytes:wasm.length,compiler};
 m.version=hash(m.wasm+m.runtime).slice(0,16);
 fs.writeFileSync(manifestPath,JSON.stringify(m,null,2)+'\n');
 console.log(`Built reference graph: ${m.bytes} bytes, ${compiler}, ${m.version}`);
}
