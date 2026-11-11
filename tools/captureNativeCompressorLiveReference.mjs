import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const profile=JSON.parse(fs.readFileSync('synth-engine/native-compressor-live/CHROMIUM_PROFILE.json'));
const revision=profile.nativeCoreProfile.revision;
const root='.tmp/native-compressor-live-reference';
const local=process.argv.includes('--check-local');
const sources=[];
for(const source of [...profile.propertySources,...(profile.silenceSources??[])]){
 const destination=path.join(root,source.file);
 let bytes;
 if(local)bytes=fs.readFileSync(destination);
 else{
  const response=await fetch(source.url);
  if(!response.ok)throw Error(`${response.status} ${source.file}`);
  bytes=Buffer.from(await response.arrayBuffer());
 }
 const digest=crypto.createHash('sha256').update(bytes).digest('hex');
 if(bytes.length!==source.bytes||digest!==source.sha256)throw Error(`Pinned compressor property source differs: ${source.file}`);
 if(!local){fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes);}
 sources.push({...source});
}
if(!local){
 fs.mkdirSync('reports/modular_audio',{recursive:true});
 fs.writeFileSync('reports/modular_audio/native-compressor-live-property-sources.json',JSON.stringify({version:1,revision,sources},null,2)+'\n');
}
console.log(`Verified ${sources.length} pinned public property/lifecycle sources at ${revision}.`);
