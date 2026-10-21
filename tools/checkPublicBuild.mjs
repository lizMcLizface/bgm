// Verify the public synth pages and curated YAML banks. Raw banks stay local.
import fs from 'node:fs';
import path from 'node:path';
import {parse} from 'yaml';

const root='dist-public';
if(!fs.existsSync(root)){console.error(`${root}/ is missing: run npm run build:public.`);process.exit(1);}
const problems=[];
const synths=['poly','fm','cs80','juno','prophet5','jupiter8','minimoog','dx7','obxa','vs','tr808','tr909','tr606','tb303'];
for(const file of ['core.wasm','processor.js','fm.wasm','fm-processor.js','effects.wasm','effects-processor.js','inserts.wasm','inserts-processor.js','patch-transition.js'])if(!fs.existsSync(path.join(root,'synth-lab',file)))problems.push(`Missing synth-lab/${file}`);
for(const file of ['synths/index.html','synths/effects/index.html','synths/classics.wasm','synths/classics-processor.js','synths/output-scope.js',...synths.map(s=>`synths/${s}/index.html`)])if(!fs.existsSync(path.join(root,file)))problems.push(`Missing ${file}`);
const indexFile=path.join(root,'synth-presets/index.json');
if(!fs.existsSync(indexFile))problems.push('Missing comparison bank index');
const allowed=new Set(['synth-presets/index.json']),ids=new Set(),covered=new Set();
if(fs.existsSync(indexFile)){
 const index=JSON.parse(fs.readFileSync(indexFile,'utf8'));
 if(index.schema!==1||!index.banks?.length)problems.push('Invalid comparison bank index');
 for(const entry of index.banks??[]){
  if(!/^synth-presets\/[a-z0-9-]+\.yaml$/.test(entry.url)||ids.has(entry.id)||!synths.includes(entry.synth)){problems.push(`Invalid bank entry ${entry.id}`);continue;}
  ids.add(entry.id);covered.add(entry.synth);allowed.add(entry.url);
  const file=path.join(root,entry.url);
  if(!fs.existsSync(file)){problems.push(`Missing ${entry.url}`);continue;}
  const bank=parse(fs.readFileSync(file,'utf8'),{maxAliasCount:0});
  if(bank.schema!==1||bank.id!==entry.id||bank.synth!==entry.synth||bank.programs?.length!==entry.count)problems.push(`Invalid YAML bank ${entry.id}`);
 }
 for(const synth of synths)if(!covered.has(synth))problems.push(`No YAML bank for ${synth}`);
}
const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,e.name),rel=path.relative(root,file).split(path.sep).join('/');
 if(e.isDirectory()){if(['local-banks','banks','patches','refs'].includes(e.name))problems.push(`${rel}/`);else walk(file);continue;}
 if(/\.syx$/i.test(e.name))problems.push(`Raw SysEx: ${rel}`);
 if(rel.startsWith('synth-presets/')&&!allowed.has(rel))problems.push(`Unlisted comparison asset: ${rel}`);
 if(/^(synth-presets|synths)\//.test(rel)&&/\.(wav|mp3|pdf|pem)$/i.test(e.name))problems.push(`Raw/reference file: ${rel}`);
}};
walk(root);
if(problems.length){console.error(`Refusing to deploy:\n  ${problems.join('\n  ')}`);process.exit(1);}
console.log(`${root}/ includes all synth pages and ${ids.size} YAML banks; raw local banks and recordings are excluded.`);
