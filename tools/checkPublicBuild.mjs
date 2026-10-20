// Guard for deploys: the public build must not contain the /synths sandbox (pages,
// engine, worklet or code) or any local factory bank (local-banks/, .syx). Exits non-zero, which stops `npm run deploy`.
import fs from 'node:fs';
import path from 'node:path';

const root='dist-public';
if(!fs.existsSync(root)){console.error(`${root}/ is missing: run npm run build:public.`);process.exit(1);}
const problems=[];
const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,e.name),rel=path.relative(root,file).split(path.sep).join('/');
 if(e.isDirectory()){if(rel==='synths'||rel==='local-banks')problems.push(`${rel}/`);else walk(file);continue;}
 if(/\.syx$/i.test(e.name))problems.push(rel);
 if(/classics/i.test(e.name))problems.push(rel);
 else if(/\.(js|html|css|json)$/.test(e.name)&&/calmbgm-classics|classics\.wasm|syn_note_on/.test(fs.readFileSync(file,'utf8')))problems.push(`${rel} (synth code)`);
}};
walk(root);
if(problems.length){console.error(`Refusing to deploy: the public build contains the private synths:\n  ${problems.join('\n  ')}`);process.exit(1);}
console.log(`${root}/ is clean of the synths sandbox.`);
